import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { createProfile, isUsernameAvailable } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { posthog } from '@/lib/posthog';
import { colors, fonts, radius, space } from '@/theme';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'unknown';

export default function SetupProfile() {
  const { session, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [state, setState] = useState<Availability>('idle');
  const [checkError, setCheckError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live availability check (§7.1a), debounced so we aren't querying per keypress.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);

    if (username.length === 0) {
      setState('idle');
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setState('invalid');
      return;
    }

    setState('checking');
    setCheckError(null);
    debounce.current = setTimeout(async () => {
      try {
        setState((await isUsernameAvailable(username)) ? 'free' : 'taken');
      } catch (e: any) {
        // The lookup is a courtesy; profiles.username has a unique constraint,
        // so the server is the real arbiter. Failing to reach it must not trap
        // the user on this screen — let them submit and find out for certain.
        setCheckError(e?.message ?? 'Could not check that name right now.');
        setState('unknown');
      }
    }, 350);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [username]);

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to choose a picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  }

  const canSubmit = state === 'free' || state === 'unknown';

  async function submit() {
    if (!session?.user || !canSubmit) return;
    setSaving(true);
    try {
      await createProfile({ userId: session.user.id, username, avatarUri });
      posthog?.capture('profile_created', { has_avatar: !!avatarUri });
      await refreshProfile();
    } catch (e: any) {
      const duplicate = /duplicate|unique|already exists/i.test(e?.message ?? '');
      if (duplicate) {
        setState('taken');
        Alert.alert('That username is taken', 'Try another one.');
      } else {
        Alert.alert("Couldn't save your profile", e?.message ?? 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.heading}>Set up profile</Text>

        <Pressable
          onPress={pickAvatar}
          style={styles.avatarDrop}
          accessibilityRole="button"
          accessibilityLabel="Add a profile photo, optional"
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.plus}>+</Text>
          )}
        </Pressable>
        <Text style={styles.optional}>Add a photo — optional</Text>

        <Label style={{ marginTop: space.xl }}>Username</Label>
        <View style={[styles.field, state === 'free' && styles.fieldOk, state === 'taken' && styles.fieldBad]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            placeholder="username"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {state === 'checking' && <ActivityIndicator size="small" color={colors.muted} />}
          {state === 'free' && <Text style={styles.ok}>✓ available</Text>}
        </View>

        <Text style={[styles.hint, state === 'unknown' && styles.hintWarn]}>
          {state === 'unknown' && checkError
            ? `Couldn't check availability: ${checkError}`
            : hintFor(state, username)}
        </Text>

        <View style={styles.flex} />
        <Button
          title="Continue"
          onPress={submit}
          loading={saving}
          disabled={!canSubmit}
          style={{ marginBottom: space.lg }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function hintFor(state: Availability, username: string): string {
  switch (state) {
    case 'invalid':
      // Name the actual problem — "invalid" with a rule restated underneath
      // makes people re-read the rule rather than see what they typed.
      if (/\s/.test(username)) {
        return `No spaces in a username. Try ${username.trim().replace(/\s+/g, '_').toLowerCase()}`;
      }
      if (username.length < 3) return 'A bit longer — at least 3 characters.';
      if (username.length > 20) return 'A bit shorter — 20 characters at most.';
      return 'Letters, numbers and underscores only.';
    case 'taken':
      return 'That one is taken. Try another.';
    case 'unknown':
      return 'Could not check that name. You can still continue.';
    default:
      return '3–20 characters. This is how friends find you on a shared roll.';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.xl },
  flex: { flex: 1 },
  heading: {
    fontFamily: fonts.serifSemi,
    fontSize: 22,
    color: colors.ink,
    textAlign: 'center',
    marginTop: space.md,
  },
  avatarDrop: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
    overflow: 'hidden',
  },
  avatarImg: { width: 96, height: 96 },
  plus: { fontSize: 28, color: colors.muted, fontFamily: fonts.serif },
  optional: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    height: 48,
    marginTop: space.xs,
  },
  fieldOk: { borderColor: colors.ok },
  fieldBad: { borderColor: colors.danger },
  at: { fontFamily: fonts.mono, fontSize: 16, color: colors.muted },
  input: { flex: 1, fontFamily: fonts.mono, fontSize: 16, color: colors.ink },
  ok: { fontFamily: fonts.serif, fontSize: 13, color: colors.ok },
  hintWarn: { color: colors.danger },
  hint: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: colors.muted,
    marginTop: space.sm,
    lineHeight: 18,
  },
});
