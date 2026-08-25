import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

interface Props {
  /** Cap height, roughly. The mark is set, so any size stays crisp. */
  size?: number;
  color?: TextStyle['color'];
}

/**
 * Savour's mark: an S in the wordmark's own face.
 *
 * Set as type rather than shipped as an image. The app icon is this same glyph
 * out of this same TTF — `scripts/render-logomark.swift` renders it straight
 * from the font file — so drawing it here as text keeps the two from drifting
 * apart and keeps it sharp at any size.
 */
export function Logomark({ size = 32, color = colors.ink }: Props) {
  return (
    <Text
      accessibilityLabel="Savour"
      style={[styles.mark, { fontSize: size, lineHeight: Math.round(size * 1.08), color }]}
    >
      S
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: {
    fontFamily: fonts.serifBold,
    // Left to the default, the leading adds a band of empty space under the
    // glyph and throws off anything centred or baseline-aligned beside it.
    includeFontPadding: false,
  },
});
