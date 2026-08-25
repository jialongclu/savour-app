import { BlendMode, ImageFormat, Skia } from '@shopify/react-native-skia';
import type { ImageSourcePropType } from 'react-native';

/**
 * A roll's filter is its film stock: chosen when the roll is created, and
 * baked into each frame at the moment of exposure rather than applied when
 * the photo is looked at. That keeps the album, the viewer and anything
 * shared in agreement without each of them having to re-apply anything, and
 * costs nothing to scroll past.
 */
/** How much of the swatch photograph a tile keeps, and which part. */
export interface SwatchCrop {
  zoom: number;
  x: number;
  y: number;
}

export interface FilterDef {
  id: string;
  label: string;
  /** Framing for this stock's tile. Omitted means the whole frame. */
  crop?: SwatchCrop;
  /** 4x5 row-major colour matrix, or null for a stock that changes nothing. */
  matrix: number[] | null;
  /**
   * Grain, 0 to 1. Roughly 0.1 is texture and 0.3 is weather.
   *
   * Silver, not sensor noise: the shader is desaturated before it lands, and it
   * is composited in soft light so it works through the midtones and leaves
   * blown highlights and blocked shadows alone — which is how grain behaves.
   */
  grain?: number;
  /** A real photograph shown in the picker, as this stock would render it. */
  swatch: ImageSourcePropType;
}

/**
 * Rec. 709 luminance weights, not a flat third each. Averaging the channels
 * treats a saturated blue sky as though it were as bright as foliage, which
 * comes out muddy; these are the weights the eye actually uses.
 */
const MONOCHROME = [
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * The two stocks that ship, each previewed on a real photograph.
 *
 * The black-and-white tile was not tinted by hand: it is its source frame put
 * through the same MONOCHROME matrix above, applied to the gamma-encoded sRGB
 * exactly as Skia does at capture. What the picker shows is what the stock
 * actually produces.
 */
export const FILTERS: FilterDef[] = [
  {
    id: 'none',
    label: 'Default',
    matrix: null,
    // No crop. The tight corner framing was chosen when a tile was 109pt wide;
    // at 345 it is both a worse composition and a 4x upscale of a 450px file —
    // it draws from only 250 source pixels. The whole frame is sharper and
    // reads better at this size.
    swatch: require('../../assets/filters/swatch-none.jpg'),
  },
  {
    id: 'warm',
    label: 'Vintage',
    // Red up six percent, blue down eight, blacks lifted two. A sunlit
    // consumer negative — a cast, not a costume.
    matrix: [
      1.06, 0.06, -0.02, 0, 0.02,
      0.02, 1.0, -0.02, 0, 0.01,
      -0.02, 0.02, 0.92, 0, 0.0,
      0, 0, 0, 1, 0,
    ],
    grain: 0.1,
    swatch: require('../../assets/filters/swatch-vintage.jpg'),
  },
  {
    id: 'bw',
    label: 'Black & White',
    matrix: MONOCHROME,
    // No crop: the whole frame, as it was.
    swatch: require('../../assets/filters/swatch-bw.jpg'),
  },
];

/**
 * The shape of the picker tile, matched to the swatch files themselves
 * (450×336). Because the tile and the photograph agree, `zoom: 1` below shows
 * the **whole frame** with nothing cropped off any edge — the same rule the
 * album covers follow.
 */
export const SWATCH_ASPECT = 450 / 336;

/**
 * The framing a stock gets when it does not name its own.
 *
 * This is a crop rectangle, not a nudge: `zoom` chooses how much of the
 * photograph you keep, and `x`/`y` choose which part of it once there is
 * something to pan over.
 *
 * - `zoom`  1 keeps the whole frame. 1.5 keeps the middle two-thirds, 2 the
 *           middle half. Below 1 does nothing — the tile cannot show more
 *           picture than exists.
 * - `x`     Horizontal pan, only meaningful above zoom 1. `-1` pins the left
 *           edge, `0` centres, `1` pins the right edge.
 * - `y`     Vertical pan on the same scale: `-1` top, `0` centre, `1` bottom.
 *
 * So `{ zoom: 1.6, x: 0, y: -1 }` reads as "crop to the middle 62% and take it
 * from the top of the frame".
 *
 * The shipped values pin the frame to the bottom-right corner of the source:
 * the grass, the shore and the people sitting at the headland. That is the part
 * of the photograph carrying skin, foliage and shadow, which is where a stock
 * actually shows what it does — the sky it gives up was mostly flat highlight.
 *
 * NOTE: tiles may now set their own `crop`, which §9.3 warns against — the
 * picker exists to compare stocks, and two tiles framed differently are harder
 * to compare than two framed the same. Worth keeping deliberate rather than
 * letting every new stock arrive with its own framing.
 */
export const SWATCH_CROP: SwatchCrop = { zoom: 1, x: 0, y: 0 };

export function filterById(id: string | undefined): FilterDef {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

/** JPEG quality for a baked frame. Matches the capture quality (0.85). */
/**
 * The bake's JPEG quality.
 *
 * A filtered frame is decoded and written again, and that second pass is where
 * generation loss lives — 85 on top of 85 is not 85. At 100 the re-encode is
 * effectively transparent, which is what makes a downloaded Vintage frame the
 * equal of a downloaded Default one, where no second pass happens at all.
 *
 * It costs real storage. That is the trade the download feature asks for.
 */
const QUALITY = 100;

/**
 * Grain cells across the width of a frame, whatever its resolution.
 *
 * Frame-relative rather than a fixed frequency in pixels. Absolute grain is
 * correct for a scan and wrong for this app: baked at sensor resolution it
 * would be invisible in the album grid and coarse in the full-bleed viewer, and
 * the picker's swatch — a 450px tile — would promise a texture the capture
 * never delivers. Tied to the width, the swatch and the frame agree.
 */
const GRAIN_CELLS = 315;

/**
 * Desaturate the noise and pull it toward mid-grey in one matrix.
 *
 * Soft light leaves 0.5 untouched, so how far the noise spreads either side of
 * it *is* the grain amount. Alpha is forced to 1 — turbulence varies alpha too,
 * and letting that through would punch holes in the frame.
 */
function grainMatrix(amount: number): number[] {
  const a = amount / 3;
  const mid = 0.5 * (1 - amount);
  return [a, a, a, 0, mid, a, a, a, 0, mid, a, a, a, 0, mid, 0, 0, 0, 0, 1];
}

/**
 * Bakes a roll's filter into an exposed frame, returning JPEG bytes ready to
 * upload. Returns null when the stock is a no-op, so the caller can upload the
 * original untouched rather than pay a decode/re-encode for nothing.
 *
 * Throws if the image cannot be decoded — a frame that silently uploaded in
 * colour on a black-and-white roll would be worse than a failed shutter, since
 * the roll can't be re-shot.
 */
export async function bakeFilter(uri: string, filterId: string): Promise<Uint8Array | null> {
  const { matrix, grain } = filterById(filterId);
  if (!matrix && !grain) return null;

  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('That frame could not be read back for developing.');

  const width = image.width();
  const height = image.height();

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('There was no room to develop that frame.');

  const paint = Skia.Paint();
  if (matrix) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(matrix));

  const canvas = surface.getCanvas();
  canvas.drawImage(image, 0, 0, paint);

  if (grain) {
    const freq = GRAIN_CELLS / width;
    const grainPaint = Skia.Paint();
    // Fractal noise rather than turbulence: turbulence is absolute-valued, so
    // it only ever darkens. Grain has to work in both directions.
    grainPaint.setShader(Skia.Shader.MakeFractalNoise(freq, freq, 1, 0, 0, 0));
    grainPaint.setColorFilter(Skia.ColorFilter.MakeMatrix(grainMatrix(grain)));
    grainPaint.setBlendMode(BlendMode.SoftLight);
    canvas.drawPaint(grainPaint);
  }

  surface.flush();

  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, QUALITY);

  // Skia holds native memory that GC won't reclaim on its own schedule, and a
  // full-resolution frame is large enough that a roll's worth would show.
  image.dispose();
  surface.dispose();

  return bytes;
}
