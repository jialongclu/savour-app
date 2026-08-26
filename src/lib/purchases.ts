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
export const ENTITLEMENT = 'savour_pro';

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
  await Purchases.logOut().catch(() => { });
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
      .catch(() => { })
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
        if (!alive) return;
        if (o.current) setPackages(o.current.availablePackages);

        /**
         * Three different failures used to look identical on screen, and all
         * three end with an empty paywall: no offering marked Current, an
         * offering holding no packages, or packages whose products the store
         * would not sell us. Only the last is common, and only this can tell
         * them apart.
         *
         * Development only — a release build has nobody reading the console,
         * and the offering names are not worth printing on a customer's device.
         */
        if (__DEV__) {
          const named = Object.keys(o.all);
          if (!o.current) {
            console.warn(
              `[purchases] ${named.length} offering(s) exist (${named.join(', ')}) but none is ` +
              'set as Current. Mark one as the Default offering in RevenueCat.',
            );
          } else if (o.current.availablePackages.length === 0) {
            console.warn(
              `[purchases] Offering "${o.current.identifier}" came back with no packages. ` +
              'Either it holds none, or the store refused every product in it — on iOS that ' +
              'means the products do not exist in App Store Connect, are not yet Ready to ' +
              'Submit, or the Paid Apps agreement is not Active.',
            );
          } else {
            console.log(
              `[purchases] Offering "${o.current.identifier}": ` +
              o.current.availablePackages
                .map((p) => `${p.identifier} → ${p.product.identifier} ${p.product.priceString}`)
                .join(', '),
            );
          }
        }
      })
      .catch((e: any) => {
        // Swallowed for the UI's sake — the paywall degrades to its empty
        // state rather than throwing — but never swallowed silently in dev,
        // because this is where a misconfigured key or bundle ID announces
        // itself and the screen alone cannot say so.
        //
        // `message` is close to useless on a RevenueCat error: the top-level
        // text for a configuration fault is the same sentence whatever caused
        // it, and it ends by telling you to go and read the underlying error.
        // That underlying error is the one that names the actual problem, so
        // it is printed here rather than left for someone to dig out of a
        // debugger.
        if (__DEV__) {
          console.warn(
            '[purchases] getOfferings failed\n' +
              `  code:       ${e?.code} ${e?.readableErrorCode ?? ''}\n` +
              `  message:    ${e?.message ?? e}\n` +
              `  underlying: ${e?.underlyingErrorMessage ?? '(none given)'}\n` +
              `  key:        ${apiKey()?.slice(0, 12)}…`,
          );
        }
      })
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
