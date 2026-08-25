import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Label } from '@/components/ui';
import { joinRollByCode } from '@/lib/api';
import { posthog } from '@/lib/posthog';
import { colors, fonts, radius, space } from '@/theme';

export default function JoinRoll() {
  const router = useRouter();
  const qc = useQueryClient();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);

    try {
      const roll = await joinRollByCode(code);
      posthog?.capture('roll_joined', {
        max_frames: roll.max_frames,
        filter: roll.filter,
      });
      await qc.invalidateQueries({ queryKey: ['active-rolls'] });
      router.replace(`/viewfinder/${roll.id}`);
    } catch (e: any) {
      const message = e?.message ?? 'Please try again.';

      // The server answers every bad code with one message on purpose, so a
      // distinct reason cannot tell anyone whether a code was real. `reason`
      // classifies from what the client already knows rather than asking for
      // more, and the code itself is never sent.
      posthog?.capture('roll_join_failed', {
        reason: message.includes("doesn't match")
          ? 'no_such_roll'
          : message.includes('Too many tries')
            ? 'rate_limited'
            : message.includes('maximum of')
              ? 'roll_cap_reached'
              : 'other',
      });

      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.nav}>
          <Pressable onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.navTitle}>Join a roll</Text>
          <Text style={[styles.cancel, styles.invisible]}>Cancel</Text>
        </View>

        <View style={styles.body}>
          <Label>Share code</Label>
          <TextInput
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={6}
            placeholder="ABC123"
            placeholderTextColor={colors.muted}
            style={[styles.input, error && styles.inputBad]}
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Text style={styles.hint}>Six characters, from whoever started the roll.</Text>
          )}
        </View>

        <Button
          title="Join roll"
          onPress={submit}
          disabled={code.length !== 6}
          loading={busy}
          style={{ marginBottom: space.lg }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl },
  flex: { flex: 1 },
  body: { flex: 1, marginTop: space.xxl },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  navTitle: { fontFamily: fonts.serifSemi, fontSize: 17, color: colors.ink },
  // A way out, not a peer of the title: grey, so the eye reaches the
  // forward action first.
  cancel: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted },
  invisible: { opacity: 0 },

  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 68,
    marginTop: space.xs,
    fontFamily: fonts.monoBold,
    fontSize: 30,
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.ink,
  },
  inputBad: { borderColor: colors.danger },
  hint: { fontFamily: fonts.serif, fontSize: 13, color: colors.muted, marginTop: space.sm },
  error: { fontFamily: fonts.serif, fontSize: 13, color: colors.danger, marginTop: space.sm },
});
