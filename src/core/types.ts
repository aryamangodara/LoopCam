/** Shared vocabulary for the whole app. */

export interface Vec2 {
  x: number
  y: number
}

/** A landmark in stage pixel space, with MediaPipe's relative depth kept around. */
export interface Point extends Vec2 {
  z: number
}

/** MediaPipe hand landmark indices, named so the gesture code reads like English. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const

/** Bone pairs for drawing the skeleton. */
export const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

export type Handedness = 'Left' | 'Right'

/** Per-hand scalars derived once per frame by tracking/features.ts. */
export interface HandFeatures {
  /** dist(wrist, middle MCP) in px — every threshold is a multiple of this. */
  span: number
  /** thumb-tip↔index-tip distance / span. ~0.25 = pinched, ~1.4 = spread. */
  pinch: number
  /** thumb-tip↔middle-tip distance / span. */
  pinchMiddle: number
  /** 0 = fist, 1 = fully splayed. */
  openness: number
  /** [thumb, index, middle, ring, pinky] — is each finger extended? */
  extended: [boolean, boolean, boolean, boolean, boolean]
  /** how many of the four fingers (not thumb) are extended. */
  fingerCount: number
  /** palm centre (mean of wrist + the four MCPs). */
  palm: Vec2
  /** unit vector along wrist → middle MCP. */
  dir: Vec2
  /** how square-on the palm faces the lens, 0..1 (from palm triangle area vs span²). */
  facing: number
  /** palm velocity in px/sec. */
  vel: Vec2
  speed: number
}

export interface Hand {
  id: number
  handedness: Handedness
  score: number
  /** 21 smoothed landmarks in stage pixel space. */
  pts: Point[]
  f: HandFeatures
}

/** Everything a mode needs to render one frame. */
export interface Frame {
  /** seconds since boot. */
  t: number
  /** seconds since last frame, clamped. */
  dt: number
  hands: Hand[]
  w: number
  h: number
  fx: CanvasRenderingContext2D
  hud: CanvasRenderingContext2D
}

export type GestureId =
  | 'frame'
  | 'paint'
  | 'push'
  | 'vortex'
  | 'portal'
  | 'scan'
  | 'field'
  | 'idle'

/** A mode is one "power". Exactly one non-ambient mode is active at a time. */
export interface Mode {
  id: GestureId
  label: string
  /** Higher wins when two gestures match at once. Two-handed powers sit above one-handed. */
  priority: number
  /** Ambient modes always update (e.g. the particle field) and never claim the lock. */
  ambient?: boolean
  /** Does the current frame satisfy this gesture? Only called for non-ambient modes. */
  matches?(frame: Frame): boolean
  enter?(frame: Frame): void
  exit?(frame: Frame): void
  update(frame: Frame, active: boolean): void
}
