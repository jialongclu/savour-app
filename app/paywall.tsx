import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';

import { FilmGlyph, SharedGlyph } from '@/components/Aperture';
import { Button } from '@/components/ui';
import { posthog } from '@/lib/posthog';
import { PLUS_ROLL_LIMIT, useOffering, usePurchase } from '@/lib/purchases';
import { colors, fonts, radius, space } from '@/theme';

/** Sold as a number rather than "unlimited" — a promise you can picture. */
interface Perk {
  key: string;
  icon: (p: { size: number; color: string }) => React.ReactElement;
  head: string;
  body: string;
}

const PERKS: Perk[] = [
  {
    key: 'rolls',
    icon: FilmGlyph,
    head: 'A lot more rolls',
    body: `Open up to ${PLUS_ROLL_LIMIT} rolls.`,
  },
  {
    key: 'shared',
    icon: SharedGlyph,
    head: 'Keep capturing moments with others',
    body: 'Continue creating shared rolls.',
  },
];

/**
 * Months in a package's term, or null where a month is not a unit it has.
 *
 * Used to compare packages of different lengths against each other. A lifetime
 * purchase has no term, so it takes part in no comparison.
 */
function monthsIn(p: PurchasesPackage): number | null {
  switch (p.packageType) {
    case 'WEEKLY':
      return 12 / 52;
    case 'MONTHLY':
      return 1;
    case 'TWO_MONTH':
      return 2;
    case 'THREE_MONTH':
      return 3;
    case 'SIX_MONTH':
      return 6;
    case 'ANNUAL':
      return 12;
    default:
      return null;
  }
}

function perMonth(p: PurchasesPackage): number | null {
  const months = monthsIn(p);
  return months ? p.product.price / months : null;
}

/**
 * What the card calls the plan.
 *
 * A custom package has no term the app can name, so it falls back to whatever
 * the product is called in the store — which is the one string a merchant has
 * already written for exactly this purpose.
 */
function termOf(p: PurchasesPackage): string {
  switch (p.packageType) {
    case 'WEEKLY':
      return 'Pay Weekly';
    case 'MONTHLY':
      return 'Pay Monthly';
    case 'TWO_MONTH':
      return 'Every 2 Months';
    case 'THREE_MONTH':
      return 'Every 3 Months';
    case 'SIX_MONTH':
      return 'Every 6 Months';
    case 'ANNUAL':
      return 'Pay Yearly';
    case 'LIFETIME':
      return 'One Time';
    default:
      return p.product.title;
  }
}

/**
 * The wall, once the free rolls are gone.
 *
 * Everyone here has already shot three rolls, watched three develop and looked
 * through three albums, so the screen does not re-pitch the app. It says what
 * more costs, and what it costs.
 */
export default function Paywall() {
  const router = useRouter();
  const { packages, loading } = useOffering();
  const { buy, restore, busy } = usePurchase();

  /**
   * Whatever the offering holds, in the order the dashboard lists it.
   *
   * This used to look for an ANNUAL and a MONTHLY by name and render nothing
   * else, so an offering built out of anything other than exactly those two
   * drew an empty footer. The order is a merchant decision, so it is left
   * alone rather than re-sorted here.
   */
  const ordered = packages;

  /**
   * The most expensive month on offer, which is what every other package is
   * cheaper *than*. Usually the monthly plan, but derived rather than assumed
   * so an offering of, say, six-month and yearly still compares sensibly.
   */
  const dearestMonth = ordered.reduce((worst, p) => {
    const m = perMonth(p);
    return m !== null && m > worst ? m : worst;
  }, 0);

  const savingOf = useCallback(
    (p: PurchasesPackage): number => {
      const m = perMonth(p);
      if (m === null || dearestMonth <= 0) return 0;
      return Math.round((1 - m / dearestMonth) * 100);
    },
    [dearestMonth],
  );

  // Preselect the best value rather than the first card: it is the one the
  // badge is arguing for, and the one worth defaulting somebody into.
  const best = ordered.reduce<PurchasesPackage | undefined>(
    (bestSoFar, p) => (!bestSoFar || savingOf(p) > savingOf(bestSoFar) ? p : bestSoFar),
    undefined,
  );

  const [chosen, setChosen] = useState<string | null>(null);
  const pkg = ordered.find((p) => p.identifier === chosen) ?? best;

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  async function purchase(p: PurchasesPackage) {
    try {
      const { plus, cancelled } = await buy(p);
      if (cancelled) return;
      if (plus) {
        posthog?.capture('subscription_purchase_completed', {
          package_type: p.packageType,
          has_intro_price: !!p.product.introPrice,
        });
        return done();
      }
      Alert.alert('Not completed', 'The purchase did not go through. Nothing was charged.');
    } catch (e: any) {
      Alert.alert("Couldn't complete that", e?.message ?? 'Please try again.');
    }
  }

  async function recover() {
    try {
      const { plus } = await restore();
      if (plus) {
        posthog?.capture('subscription_restored');
        return done();
      }
      Alert.alert('Nothing to restore', 'No subscription was found on this account.');
    } catch (e: any) {
      Alert.alert("Couldn't restore", e?.message ?? 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.nav}>
        <View style={styles.navSide} />
        <Text style={styles.navTitle}>Pro Plan</Text>
        <Pressable
          onPress={done}
          hitSlop={12}
          accessibilityRole="button"
          style={styles.navSide}
        >
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>

      {/* Stacked down the page rather than swiped through. The carousel was
          built for three arguments and earned its dots; at two it was asking
          someone to discover half the case by guessing there was more of it
          sideways. Both now sit on the one screen, in reading order. */}
      <View style={styles.deck}>
        {PERKS.map((p) => (
          <View key={p.key} style={styles.perk}>
            <View style={styles.tile}>
              <p.icon size={38} color={colors.ink} />
            </View>
            <Text style={styles.perkHead}>{p.head}</Text>
            <Text style={styles.perkBody}>{p.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.foot}>
        {loading ? (
          <ActivityIndicator color={colors.muted} style={styles.loading} />
        ) : ordered.length === 0 ? (
          <Text style={styles.unavailable}>
            Subscriptions aren&apos;t available right now. Please try again later.
          </Text>
        ) : (
          <>
            <View style={[styles.plans, ordered.length > 2 && styles.plansStacked]}>
              {ordered.map((p) => {
                const on = p.identifier === pkg?.identifier;
                const saving = savingOf(p);
                return (
                  <Pressable
                    key={p.identifier}
                    onPress={() => setChosen(p.identifier)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.plan, on && styles.planOn]}
                  >
                    {saving > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Save {saving}%</Text>
                      </View>
                    ) : null}

                    <Text style={styles.planTerm}>{termOf(p)}</Text>
                    <Text style={styles.planPrice}>{p.product.priceString}</Text>
                    {/* Only where a month is a meaningful unit. A one-off
                        purchase has no per-month price and inventing one would
                        be a claim about a renewal that never happens. */}
                    {p.product.pricePerMonthString ? (
                      <Text style={styles.planUnit}>{p.product.pricePerMonthString}/mo</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={recover} disabled={busy} hitSlop={10} accessibilityRole="button">
              <Text style={styles.restoreAsk}>Already subscribed?</Text>
              <Text style={styles.restore}>Refresh subscription</Text>
            </Pressable>

            <Button
              title="Start pro plan"
              onPress={() => pkg && purchase(pkg)}
              loading={busy}
              disabled={!pkg}
              style={styles.cta}
            />

            {/* Apple wants the renewal terms on the screen that sells, not only
                in the sheet that follows it. */}
            <Text style={styles.terms}>
              Renews automatically until cancelled. Manage or cancel any time in your account
              settings.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    height: 48,
  },
  // Equal sides, so the title is centred on the screen rather than on what is
  // left over beside the button.
  navSide: { minWidth: 56, alignItems: 'flex-end' },
  navTitle: { fontFamily: fonts.serifSemi, fontSize: 17, color: colors.ink },
  close: { fontFamily: fonts.serifSemi, fontSize: 16, color: colors.muted },

  // Centred as a group, so two perks sit in the middle of the space the three
  // used to fill rather than stranded at the top of it.
  deck: { flex: 1, justifyContent: 'center', gap: space.xxl },
  perk: { alignItems: 'center', paddingHorizontal: space.xxl },
  tile: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: '#F1F1F1',
    alignItems: 'center',
    justifyContent: 'center',
    // Tighter than the carousel's, where the tile had a whole screen to itself.
    // Stacked, the gap between perks has to read as larger than the gap inside
    // one, or the two blocks run together into a single list of four things.
    marginBottom: space.md,
  },
  perkHead: {
    fontFamily: fonts.serifSemi,
    // Stepped down from 24: one of these headings is now a full sentence, and
    // at the old size it wrapped to three lines and dwarfed its own body copy.
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.4,
    color: colors.ink,
    textAlign: 'center',
  },
  perkBody: {
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.xs,
  },

  foot: { paddingHorizontal: space.xl, paddingBottom: space.lg },
  loading: { paddingVertical: space.xxl },
  unavailable: {
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: space.xl,
  },

  // Room above for the badge, which sits over the card's top edge.
  plans: { flexDirection: 'row', gap: space.md, paddingTop: space.md },
  // Three or more will not fit across a phone, so they become rows instead.
  plansStacked: { flexDirection: 'column' },
  plan: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    alignItems: 'center',
  },
  planOn: { borderWidth: 2, borderColor: colors.ink },
  badge: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: fonts.serifSemi,
    fontSize: 12,
    color: colors.onDark,
  },
  planTerm: { fontFamily: fonts.serifSemi, fontSize: 15, color: colors.ink },
  planPrice: {
    fontFamily: fonts.serifBold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: colors.ink,
    marginTop: space.xs,
  },
  planUnit: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 2 },

  restoreAsk: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.lg,
  },
  restore: {
    fontFamily: fonts.serifSemi,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 2,
  },

  cta: { marginTop: space.lg },
  terms: {
    fontFamily: fonts.serif,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.md,
  },
});
