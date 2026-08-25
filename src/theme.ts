/**
 * Design tokens from the PRD's screen designs (§8).
 * The app commits to one black-and-white look rather than following the system
 * theme — a camera body doesn't repaint itself at sunset. Photographs are the
 * only colour on screen, so the chrome around them stays neutral.
 */
export const colors = {
  paper: '#FFFFFF',
  surface: '#FFFFFF',
  ink: '#000000',
  muted: '#8A8A8E',
  accent: '#000000',
  line: '#E4E4E4',
  dark: '#000000',

  /** Viewfinder body: painted metal, not app chrome (§9.7). */
  plateTop: '#1C1C1C',
  plateBottom: '#111111',
  bodyBlack: '#000000',

  /** Frame counter dial. */
  dialFace: '#EDEDED',
  dialInk: '#000000',
  dialIndex: '#000000',

  /**
   * The viewfinder is a length of 35mm film, so these are film, not chrome.
   *
   * `filmSpent` and `filmBase` are the two halves of §9.2 made visible: frames
   * already exposed go opaque black — taken, but not viewable until the roll
   * fills — while everything ahead of the shutter is still clear base. The
   * boundary between them travels down the strip as the roll is used, which is
   * why the viewfinder needs no progress bar to say how far along it is.
   */
  filmEdge: '#0A0A09',
  filmSpent: '#0E0E0D',
  filmBase: '#D6D3CC',
  filmBaseInk: '#16150F',
  // Light grey rather than white. At white the sprocket holes were the
  // brightest thing on screen and pulled the eye to the edges, away from the
  // frame they exist to carry.
  perf: '#B8B8B6',

  onDark: '#FFFFFF',

  /**
   * The one hue in the interface, and it is spent on failure.
   *
   * A monochrome palette can express hierarchy through weight and fill, but it
   * cannot express *wrongness* — black on white is what every other word on
   * screen already looks like, so an error set in ink reads as a caption. This
   * red is the deliberate exception to "photographs are the only colour", and
   * it earns it by being the one signal a person must not miss.
   */
  danger: '#B4342A',
  /** Settled states stay grey; only failure gets to speak up. */
  ok: '#8A8A8E',
} as const;

/**
 * Two families, and the division between them is the whole system.
 *
 * The serif is the human voice: anything that is language — titles, body,
 * buttons, hints, errors, actions. The mono is the machine's: anything the
 * camera or the lab prints — frame numbers, share codes, edge codes, docket
 * figures, and the uppercase micro-labels below.
 *
 * There used to be a third face. Inter was brought in to replace the raw OS
 * default, which was the right instinct, but the serif then took over its most
 * visible work — buttons, tab labels, stamps — and what was left was not a role
 * so much as a residue: a Cancel link here, a hint there. A whole family for
 * seven scattered labels, and two faces colliding on the same row in three
 * places. It is gone, and nothing sits between the two voices now.
 */
export const fonts = {
  serif: 'SourceSerif',
  serifSemi: 'SourceSerifSemi',
  serifBold: 'SourceSerifBold',
  mono: 'SpaceMono',
  monoBold: 'SpaceMonoBold',
} as const;

/**
 * The wordmark: the app's own name, engraved rather than merely typeset.
 * Caps and wide tracking are what separate it from a roll name set in the
 * same face — and they are the voice the app already uses for its stamps.
 */
export const wordmark = {
  fontFamily: fonts.serifSemi,
  textTransform: 'uppercase' as const,
  letterSpacing: 4.2,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 9,
  lg: 14,
  /** Cards: album covers and roll cards share this so they read as one family. */
  card: 20,
  pill: 999,
} as const;

/** Uppercase micro-label used for section heads and metadata stamps. */
export const label = {
  fontFamily: fonts.mono,
  fontSize: 10,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
  color: colors.muted,
};
