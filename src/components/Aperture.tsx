import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color: ColorValue;
  strokeWidth?: number;
}

/** The app's mark, and the Camera tab's icon. */
export function Aperture({ size = 24, color, strokeWidth = 1.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Circle cx="20" cy="20" r="15" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M20 5 L28.5 24 M35 20 L15 26 M27.5 33 L12 20 M12.5 33 L20 14 M5 20 L25 14"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * A 35mm cartridge with its leader pulled out — the thing that isn't in the
 * camera when there's no roll to shoot into.
 */
export function FilmCartridge({ size = 24, color, strokeWidth = 1.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3"
        y="6.5"
        width="9.5"
        height="13"
        rx="2"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M7.75 6.5V3.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M12.5 9.5H21v7h-8.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A mop and the dust it has kicked up — nothing here, and swept.
 *
 * Stroked rather than solid, like the other empty-state marks: it belongs to
 * the quiet register of the app, not to the tab bar's family of filled glyphs.
 */
export function DustMop({ size = 24, color, strokeWidth = 1.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.5 3.2 V10.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M6.4 10.8 H14.6 L13.5 15.6 Q13.2 17.2 11.6 17.2 H9.4 Q7.8 17.2 7.5 15.6 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Filled, and fading as they drift — stroked rings this small read as
          bubbles rather than as dust. */}
      <Circle cx="17.7" cy="14.9" r="1.5" fill={color} opacity={0.85} />
      <Circle cx="20.3" cy="16.8" r="1" fill={color} opacity={0.6} />
      <Circle cx="17.9" cy="18.9" r="0.8" fill={color} opacity={0.4} />
    </Svg>
  );
}

/**
 * A house cut as one solid silhouette, with the door notched up out of the
 * bottom edge rather than floating inside as a hole.
 *
 * The corners are real curves in the path. An earlier cut rounded them by
 * stroking the shape in its own fill colour, which is cheaper to write but
 * grows the silhouette by half the stroke in every direction — the glyph
 * fattens and its openings narrow by the same amount at once.
 */
export function HomeGlyph({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill={color}
        d={
          'M3.2 11.6 Q3.2 10.7 3.9 10.1 L11 3.9 Q12 3.1 13 3.9 L20.1 10.1 ' +
          'Q20.8 10.7 20.8 11.6 V18.4 Q20.8 20 19.2 20 H16.4 Q15.4 20 15.4 19 ' +
          'V15.6 Q15.4 14.6 14.4 14.6 H9.6 Q8.6 14.6 8.6 15.6 V19 Q8.6 20 7.6 20 ' +
          'H4.8 Q3.2 20 3.2 18.4 Z'
        }
      />
    </Svg>
  );
}

/**
 * The Camera tab's mark, cut to match `HomeGlyph`: one solid body with the lens
 * knocked out of it, so the pair read as a set rather than as two icons that
 * happen to sit together. The lens is a true hole, and shows whatever is behind
 * the glyph exactly the way the house's door does.
 */
export function CameraGlyph({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill={color}
        fillRule="evenodd"
        d={
          // Body, with the viewfinder housing stepped up out of its top edge...
          'M4.9 7.3 H8.5 L9.5 5.1 Q9.8 4.5 10.5 4.5 H13.5 Q14.2 4.5 14.5 5.1 ' +
          'L15.5 7.3 H19.1 Q21 7.3 21 9.2 V17.9 Q21 19.8 19.1 19.8 H4.9 ' +
          'Q3 19.8 3 17.9 V9.2 Q3 7.3 4.9 7.3 Z ' +
          // ...then the lens as a second subpath, held open by evenodd.
          'M12 9.8 a3.7 3.7 0 0 1 0 7.4 a3.7 3.7 0 0 1 0 -7.4 Z'
        }
      />
    </Svg>
  );
}

/**
 * Developed rolls. A print with the sun and the hill knocked out of it, so the
 * detail shows whatever sits behind the glyph — the black bar or the white
 * thumb — exactly as `CameraGlyph`'s lens does.
 */
export function AlbumGlyph({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill={color}
        fillRule="evenodd"
        d={
          'M4.4 4.2 H19.6 Q21 4.2 21 5.6 V18.4 Q21 19.8 19.6 19.8 H4.4 ' +
          'Q3 19.8 3 18.4 V5.6 Q3 4.2 4.4 4.2 Z ' +
          'M16.1 7.9 a2 2 0 0 1 0 4 a2 2 0 0 1 0 -4 Z ' +
          'M5.4 17.1 L10.3 10.5 L14.7 17.1 Z'
        }
      />
    </Svg>
  );
}

/** Rolls in progress. A length of strip with its sprockets punched through. */
export function FilmGlyph({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill={color}
        fillRule="evenodd"
        d={
          'M4.2 5 H19.8 Q21 5 21 6.2 V17.8 Q21 19 19.8 19 H4.2 Q3 19 3 17.8 V6.2 Q3 5 4.2 5 Z ' +
          'M4.9 6.8 h1.9 v1.9 h-1.9 Z M8.5 6.8 h1.9 v1.9 h-1.9 Z ' +
          'M12.1 6.8 h1.9 v1.9 h-1.9 Z M15.7 6.8 h1.9 v1.9 h-1.9 Z ' +
          'M4.9 15.3 h1.9 v1.9 h-1.9 Z M8.5 15.3 h1.9 v1.9 h-1.9 Z ' +
          'M12.1 15.3 h1.9 v1.9 h-1.9 Z M15.7 15.3 h1.9 v1.9 h-1.9 Z'
        }
      />
    </Svg>
  );
}

/**
 * You. A head and shoulders, solid, in the same weight as its neighbours on
 * the bar — an outlined figure beside three filled ones reads as disabled.
 */
export function ProfileGlyph({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill={color}
        fillRule="evenodd"
        d={
          'M12 3.6 a4.1 4.1 0 0 1 0 8.2 a4.1 4.1 0 0 1 0 -8.2 Z ' +
          'M12 13.4 c4.2 0 7.4 2.3 7.4 5.2 V20.4 H4.6 V18.6 C4.6 15.7 7.8 13.4 12 13.4 Z'
        }
      />
    </Svg>
  );
}

/**
 * A roll with other people on it.
 *
 * The avatar stack reduced to its shape. At the sizes this is used — beside a
 * frame count, inside a cartridge tab — real avatars are unreadable, so this is
 * the same idea abstracted rather than a new symbol: two discs, one in front.
 *
 * Not a link or a chain: those say a thing *can* be shared. This says it is.
 */
export function SharedGlyph({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* The one behind, with a gap bitten out of it where the front disc
          overlaps — otherwise the two merge into a single blob. */}
      <Path
        fill={color}
        fillRule="evenodd"
        d={
          'M14.8 7 a5 5 0 0 1 0 10 a5 5 0 0 1 0 -10 Z ' +
          'M9.2 5.6 a6.4 6.4 0 0 1 0 12.8 a6.4 6.4 0 0 1 0 -12.8 Z'
        }
      />
      <Circle cx="9.2" cy="12" r="5" fill={color} />
    </Svg>
  );
}

/**
 * Settings.
 *
 * Drawn as a lobed cog rather than the more usual ring-with-radial-ticks,
 * because that construction is what `Aperture` already is — at header size the
 * two would be hard to tell apart, and one of them is the app's own mark.
 */
export function Gear({ size = 24, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d={
          'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 ' +
          '1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06 ' +
          'a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09 ' +
          'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 ' +
          'H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 ' +
          'a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09 ' +
          'a1.65 1.65 0 0 0-1.51 1z'
        }
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** More actions. Three dots, the one place a menu is the honest answer. */
export function MoreGlyph({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="5" cy="12" r="1.9" fill={color} />
      <Circle cx="12" cy="12" r="1.9" fill={color} />
      <Circle cx="19" cy="12" r="1.9" fill={color} />
    </Svg>
  );
}

/** Dismiss. Used where a screen is left rather than navigated back from. */
export function Close({ size = 24, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6L6 18"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Turn the camera around.
 *
 * Two arcs rather than a closed ring, because the breaks are what the
 * arrowheads sit in — a complete circle with heads stuck on it reads as a
 * refresh control. The lens in the middle is what makes it a camera turning
 * rather than anything else turning.
 */
export function FlipGlyph({ size = 24, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 11.2a7 7 0 0 1 11.6-4.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M19 12.8a7 7 0 0 1-11.6 4.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Corner heads, their elbows landing on the arc ends. */}
      <Path
        d="M16.8 3.4v3.6h-3.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7.2 20.6V17h3.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="2.4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ChevronLeft({ size = 24, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5l-7 7 7 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
