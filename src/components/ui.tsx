import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius, space } from '@/theme';

/* ------------------------------------------------------------------ button */

/**
 * `danger` is a ghost carrying red ink, not a red button.
 *
 * A filled red pill would be the loudest thing on a screen whose whole job is
 * to be quiet, and it would sit under Sign out as though the two were a pair of
 * equal offers. Same shape and same weight as its neighbour, with the colour
 * doing the warning — the confirmation dialog is what actually guards the act.
 */
type ButtonVariant = 'accent' | 'dark' | 'ghost' | 'text' | 'danger';

/** Width reserved either side of a label so it can never reach the mark. */
const ICON_SLOT = 32;

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Sits before the label. Used for the third-party sign-in marks. */
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  variant = 'accent',
  loading,
  disabled,
  icon,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'accent' && styles.btnAccent,
        variant === 'dark' && styles.btnDark,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnGhost,
        variant === 'text' && styles.btnText,
        pressed && styles.btnPressed,
        isDisabled && styles.btnDisabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'accent' || variant === 'dark' ? colors.onDark : colors.ink} />
      ) : (
        <>
          {icon ? <View style={styles.btnIcon}>{icon}</View> : null}
          <Text
            style={[
              styles.btnLabel,
              (variant === 'accent' || variant === 'dark') && styles.btnLabelOnDark,
              variant === 'text' && styles.btnLabelQuiet,
              variant === 'danger' && styles.btnLabelDanger,
              // Symmetric, so the label stays centred on the button while still
              // being unable to run underneath the mark.
              icon != null && styles.btnLabelBesideIcon,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ avatar */

interface AvatarProps {
  username?: string | null;
  url?: string | null;
  size?: number;
  /** Ring colour, used when avatars overlap in a stack. */
  border?: string;
}

export function Avatar({ username, url, size = 24, border }: AvatarProps) {
  const initial = (username ?? '?').charAt(0).toUpperCase();
  const dim = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      style={[
        styles.avatar,
        dim,
        { backgroundColor: tintFor(username ?? '') },
        border ? { borderWidth: 1.5, borderColor: border } : null,
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={dim} contentFit="cover" transition={120} />
      ) : (
        <Text style={[styles.avatarInitial, { fontSize: size * 0.42 }]}>{initial}</Text>
      )}
    </View>
  );
}

/**
 * Stable grey per username, so a person looks the same everywhere. The theme
 * has no hue to distribute, so the steps are spread far enough apart in value
 * to still tell two people apart at avatar size.
 */
function tintFor(seed: string): string {
  const palette = ['#1C1C1C', '#3A3A3A', '#555555', '#6E6E6E', '#8A8A8A', '#A5A5A5'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function AvatarStack({
  people,
  max = 4,
  size = 22,
}: {
  people: { username: string; avatar_url: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <View style={styles.stack}>
      {shown.map((p, i) => (
        <View key={p.username} style={i > 0 ? { marginLeft: -size * 0.3 } : null}>
          <Avatar username={p.username} url={p.avatar_url} size={size} border={colors.surface} />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={[
            styles.avatar,
            styles.extra,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -size * 0.3,
              borderColor: colors.surface,
            },
          ]}
        >
          <Text style={[styles.avatarInitial, { fontSize: size * 0.34 }]}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

/* -------------------------------------------------------------- typography */

export function Label({ style, ...rest }: TextProps) {
  return <Text style={[styles.label, style]} {...rest} />;
}

export function Title({ style, ...rest }: TextProps) {
  return <Text style={[styles.title, style]} {...rest} />;
}

export function Body({ style, ...rest }: TextProps) {
  return <Text style={[styles.body, style]} {...rest} />;
}

/* ------------------------------------------------------------------ layout */

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  btn: {
    // Row, so a mark can sit beside the label. Harmless for the buttons that
    // carry no icon — a lone Text centres the same either way.
    flexDirection: 'row',
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  // Taken out of the flow and pinned to the padding edge. Laid out inline it
  // rode along with the label, so two buttons whose labels differ in width put
  // their marks at different places — "Continue with Apple" and "Continue with
  // Google" never lined up.
  btnIcon: {
    position: 'absolute',
    left: space.xl,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  btnLabelBesideIcon: { paddingHorizontal: ICON_SLOT },
  btnAccent: { backgroundColor: colors.accent },
  btnDark: { backgroundColor: colors.dark },
  btnGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnText: { backgroundColor: 'transparent', paddingVertical: 10, minHeight: 0 },
  btnLabelDanger: { color: colors.danger },
  btnPressed: { opacity: 0.82 },
  btnDisabled: { opacity: 0.4 },
  btnLabel: {
    // The serif, so a button reads as part of the sentence above it rather than
    // as interface bolted underneath. Semibold rather than the regular cut the
    // body copy uses: a label still has to carry a press, and it is the real
    // semibold file — faux-bold from a regular is visibly smeared on Android.
    fontFamily: fonts.serifSemi,
    fontSize: 16,
    color: colors.ink,
  },
  btnLabelOnDark: { color: colors.onDark },
  btnLabelQuiet: { color: colors.muted, fontSize: 15 },

  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarInitial: { color: colors.onDark, fontFamily: fonts.serifSemi },
  extra: { backgroundColor: colors.muted, borderWidth: 1.5 },
  stack: { flexDirection: 'row', alignItems: 'center' },

  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    fontFamily: fonts.serifSemi,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  divider: { height: 1, backgroundColor: colors.line },
});
