import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * The mark an editor makes on a contact sheet: a chinagraph loop thrown around
 * the frame worth keeping.
 *
 * This was a `View` with four different border radii, which got the idea across
 * and gave it away at the same time — it was the *same* wonky rectangle every
 * time, so the wonkiness read as a style rather than as a hand. A real one is
 * different on every sheet: it starts somewhere arbitrary, it is not round, and
 * it overshoots where it closes because nobody stops the pencil exactly where
 * they began.
 *
 * So the loop is generated instead, from a seed the caller changes whenever a
 * choice is made. Same pencil, never the same circle.
 */

/** Anchors around the loop. Few enough to stay a loop, enough to wander. */
const POINTS = 9;

/**
 * How far a point may sit from the true ellipse, as a share of the radius.
 *
 * Small. Past about a tenth this stops reading as an unsteady hand and starts
 * reading as a flower.
 */
const WOBBLE = 0.075;

/** How far past the start the pencil carries on, in radians. */
const OVERSHOOT = 0.85;

/**
 * Deterministic noise from a seed.
 *
 * mulberry32 — small, fast, and good enough for a drawing. Determinism is the
 * point: the ring must not re-roll on every render, only when the caller says a
 * new mark has been made.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A closed-ish loop through jittered points, smoothed.
 *
 * Catmull-Rom converted to cubic Bézier, which is what turns a ring of points
 * into a continuous line rather than a polygon. The tail carries on past the
 * first point so the stroke crosses itself, which is the detail that makes it
 * look drawn rather than computed.
 */
function loop(w: number, h: number, seed: number): string {
  const rand = rng(seed);

  const cx = w / 2;
  const cy = h / 2;
  // Inside the box by the stroke's own width, so the line is never clipped.
  const rx = w / 2 - 3;
  const ry = h / 2 - 3;

  // Where the pencil goes down. Anywhere, which is half of why no two are alike.
  const start = rand() * Math.PI * 2;
  // A loop thrown by hand is never square to the frame.
  const tilt = (rand() - 0.5) * 0.14;

  const steps = POINTS + Math.round(OVERSHOOT / ((Math.PI * 2) / POINTS));
  const pts: { x: number; y: number }[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = start + (i * Math.PI * 2) / POINTS;
    const jx = 1 + (rand() - 0.5) * 2 * WOBBLE;
    const jy = 1 + (rand() - 0.5) * 2 * WOBBLE;

    const ex = Math.cos(t) * rx * jx;
    const ey = Math.sin(t) * ry * jy;

    pts.push({
      x: cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
      y: cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
    });
  }

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;

  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;

    // Catmull-Rom to Bézier, at the usual 1/6 tension.
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d +=
      ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)},` +
      ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return d;
}

interface Props {
  /** Change this to draw a new mark. Same seed, same ring. */
  seed: number;
}

export function GreaseRing({ seed }: Props) {
  // Measured rather than given a viewBox to stretch, because a stretched
  // viewBox thins the stroke on whichever axis it squeezed — and an even line
  // is the one thing a grease pencil does reliably.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {box && box.w > 0 && box.h > 0 ? (
        <Svg width={box.w} height={box.h}>
          <Path
            d={loop(box.w, box.h, seed)}
            stroke={colors.danger}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.9}
          />
        </Svg>
      ) : null}
    </View>
  );
}
