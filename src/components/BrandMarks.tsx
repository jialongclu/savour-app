import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * Third-party sign-in marks.
 *
 * These live apart from `Aperture.tsx` because they are not Savour's drawings
 * and are not ours to restyle: both Google and Apple specify how their mark may
 * appear on a sign-in button, so neither takes a `color` prop.
 */

interface MarkProps {
  size?: number;
}

/**
 * Google's four-colour G, at the proportions Google's brand guidelines require.
 *
 * This is the one piece of colour in an otherwise black-and-white interface, and
 * it is deliberate: a grey or blackened G is not a permitted rendering of the
 * mark on a light button.
 */
export function GoogleMark({ size = 20 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </Svg>
  );
}

/** Apple's mark, solid black for a light button as their guidelines require. */
export function AppleMark({ size = 20 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#000000"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}
