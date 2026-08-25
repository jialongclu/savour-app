import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * Savour Plus, through RevenueCat.
 *
 * Three rolls are free. After that, opening one needs a subscription — which
 * pays for the storage every finished album goes on occupying, and puts a small
 * price on a photograph again, which was the point of the app to begin with.
 *
 * RevenueCat is a wrapper around StoreKit and Play Billing rather than a
 * payment processor of its own: products are defined in App Store Connect, then
 * grouped into an *offering* whose *packages* this screen lists, and a purchase
 * grants an *entitlement* whose name is the only string the app checks.
 */

/** The entitlement configured in RevenueCat. Everything else is presentation. */
export const ENTITLEMENT = 'plus';

/** Rolls before the wall. Mirrors `free_roll_allowance()` on the server. */
export const FREE_ROLLS = 3;

/**
 * What Plus buys, as a number.
 *
 * A ceiling rather than "unlimited": a figure can be pictured, and it leaves
 * somewhere to go if storage ever needs a real bound. Nobody will reach it —
 * a hundred rolls is well over three thousand frames.
 */
export const PLUS_ROLL_LIMIT = 100;

const IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY;

/**
 * A key that is not tied to a store.
 *
 * RevenueCat's Test Store issues one `test_` key that works on both platforms,
 * for trying the flow before any product exists in App Store Connect. Store
 * keys (`appl_` / `goog_`) take precedence, so switching to the real thing is
 * a matter of filling those in rather than removing this.
 */
const TEST_KEY = process.env.EXPO_PUBLIC_RC_KEY;

function apiKey(): string | undefined {
  return (Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY) ?? TEST_KEY;
}

/**
 * Whether billing can work at all.
 *
 * False on a machine with no keys in `.env`. Everything below
 * degrades quietly rather than throwing, so the app stays walkable for anyone
 * who has not set RevenueCat up — the paywall simply never gates.
 */
export function billingReady(): boolean {
  return !!apiKey();
}

let configured = false;

/**
 * Called once a user is known.
 *
 * The Supabase user id is passed as RevenueCat's app user id so a subscription
 * follows the account rather than the handset — restoring on a new phone finds
 * it, and two people sharing a device do not share a subscription.
 */
export async function configurePurchases(userId: string): Promise<void> {
  if (!billingReady()) return;

  if (!configured) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: apiKey()!, appUserID: userId });
    configured = true;
    return;
  }

  // Signing in as somebody else on the same device.
  const current = await Purchases.getAppUserID();
  if (current !== userId) await Purchases.logIn(userId);
}

export async function logOutOfPurchases(): Promise<void> {
  if (!billingReady() || !configured) return;
  // Anonymous from here, so the next account starts without this one's status.
  await Purchases.logOut().catch(() => {});
}

function hasPlus(info: CustomerInfo | null): boolean {
  return !!info?.entitlements.active[ENTITLEMENT];
}

/**
 * Whether this account is subscribed, kept current.
 *
 * `addCustomerInfoUpdateListener` fires on purchase, restore, renewal and
 * expiry, so nothing else has to remember to re-check. Where billing is not
 * configured this reports `true`: an app that cannot sell anything must not
 * lock anybody out of it.
 */
export function usePlus(): { plus: boolean; loading: boolean } {
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(billingReady());

  useEffect(() => {
    if (!billingReady()) return;

    let alive = true;

    Purchases.getCustomerInfo()
      .then((i) => alive && setInfo(i))
      .catch(() => {})
      .finally(() => alive && setLoading(false));

    // `add...` returns void here; removal takes the same function back.
    const onUpdate = (i: CustomerInfo) => {
      if (alive) setInfo(i);
    };
    Purchases.addCustomerInfoUpdateListener(onUpdate);

    return () => {
      alive = false;
      Purchases.removeCustomerInfoUpdateListener(onUpdate);
    };
  }, []);

  return { plus: billingReady() ? hasPlus(info) : true, loading };
}

/** The packages on the current offering, in the order RevenueCat lists them. */
export function useOffering(): { packages: PurchasesPackage[]; loading: boolean } {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(billingReady());

  useEffect(() => {
    if (!billingReady()) return;

    let alive = true;
    Purchases.getOfferings()
      .then((o) => {
        if (alive && o.current) setPackages(o.current.availablePackages);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  return { packages, loading };
}

export interface PurchaseOutcome {
  plus: boolean;
  /** True when the sheet was dismissed rather than declined by the store. */
  cancelled: boolean;
}

export function usePurchase() {
  const [busy, setBusy] = useState(false);

  const buy = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseOutcome> => {
    setBusy(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return { plus: hasPlus(customerInfo), cancelled: false };
    } catch (e: any) {
      // Dismissing the sheet is not a failure and must not raise an alert.
      if (e?.userCancelled) return { plus: false, cancelled: true };
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const restore = useCallback(async (): Promise<PurchaseOutcome> => {
    setBusy(true);
    try {
      const info = await Purchases.restorePurchases();
      return { plus: hasPlus(info), cancelled: false };
    } finally {
      setBusy(false);
    }
  }, []);

  return { buy, restore, busy };
}
