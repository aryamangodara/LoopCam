import { LM, type HandFeatures, type Point, type Vec2 } from '../core/types'
import { clamp, dist, triArea } from '../core/math'

/**
 * Every scalar a gesture could want, computed once per hand per frame.
 *
 * The important idea here is `span`: the wrist→middle-MCP distance. Every other
 * measurement is divided by it, so a pinch reads the same whether the hand is at the
 * lens or across the room. No gesture threshold anywhere in the app is in raw pixels.
 */

const FINGER_TIPS = [LM.THUMB_TIP, LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP]
const FINGER_PIPS = [LM.THUMB_IP, LM.INDEX_PIP, LM.MIDDLE_PIP, LM.RING_PIP, LM.PINKY_PIP]

export function buildFeatures(p: Point[]): HandFeatures {
  const wrist = p[LM.WRIST]
  const span = Math.max(dist(wrist, p[LM.MIDDLE_MCP]), 1e-3)

  const palm: Vec2 = {
    x: (wrist.x + p[LM.INDEX_MCP].x + p[LM.MIDDLE_MCP].x + p[LM.RING_MCP].x + p[LM.PINKY_MCP].x) / 5,
    y: (wrist.y + p[LM.INDEX_MCP].y + p[LM.MIDDLE_MCP].y + p[LM.RING_MCP].y + p[LM.PINKY_MCP].y) / 5,
  }

  const dx = p[LM.MIDDLE_MCP].x - wrist.x
  const dy = p[LM.MIDDLE_MCP].y - wrist.y
  const dlen = Math.hypot(dx, dy) || 1
  const dir: Vec2 = { x: dx / dlen, y: dy / dlen }

  // A finger counts as extended when its tip is further from the wrist than its PIP joint.
  // That test is rotation-invariant, unlike comparing raw y coordinates.
  const extended = [false, false, false, false, false] as HandFeatures['extended']
  for (let i = 0; i < 5; i++) {
    const tip = dist(wrist, p[FINGER_TIPS[i]])
    const pip = dist(wrist, p[FINGER_PIPS[i]])
    // The thumb folds sideways rather than curling, so it needs a looser margin.
    const margin = i === 0 ? 1.02 : 1.06
    extended[i] = tip > pip * margin
  }
  const fingerCount = (extended[1] ? 1 : 0) + (extended[2] ? 1 : 0) + (extended[3] ? 1 : 0) + (extended[4] ? 1 : 0)

  // Openness: mean tip-to-palm distance over span, remapped so a fist ≈ 0 and a splay ≈ 1.
  let sum = 0
  for (const tip of FINGER_TIPS) sum += dist(palm, p[tip])
  const meanTip = sum / FINGER_TIPS.length / span
  const openness = clamp((meanTip - 0.75) / 0.85, 0, 1)

  const pinch = dist(p[LM.THUMB_TIP], p[LM.INDEX_TIP]) / span
  const pinchMiddle = dist(p[LM.THUMB_TIP], p[LM.MIDDLE_TIP]) / span

  // Facing: the palm triangle's area collapses as the hand turns edge-on to the lens.
  const area = Math.abs(triArea(wrist, p[LM.INDEX_MCP], p[LM.PINKY_MCP]))
  const facing = clamp(area / (span * span * 0.42), 0, 1)

  return {
    span,
    pinch,
    pinchMiddle,
    openness,
    extended,
    fingerCount,
    palm,
    dir,
    facing,
    vel: { x: 0, y: 0 },
    speed: 0,
  }
}

/** Is this hand an "L" — thumb and index out, the rest curled? Used by the frame gesture. */
export function isCorner(f: HandFeatures): boolean {
  return f.extended[0] && f.extended[1] && !f.extended[2] && !f.extended[3] && f.pinch > 0.75
}

/** Finger gun: index out, thumb out, middle/ring/pinky curled, and the thumb roughly upright. */
export function isFingerGun(f: HandFeatures): boolean {
  return f.extended[0] && f.extended[1] && f.fingerCount === 1
}

export function isFist(f: HandFeatures): boolean {
  return f.openness < 0.18 && f.fingerCount === 0
}

export function isOpenPalm(f: HandFeatures): boolean {
  return f.openness > 0.62 && f.fingerCount >= 4
}

export function isPinching(f: HandFeatures): boolean {
  return f.pinch < 0.38
}

/** Landmark helper used by several modes: the point midway between thumb and index tips. */
export function pinchPoint(p: Point[]): Vec2 {
  return {
    x: (p[LM.THUMB_TIP].x + p[LM.INDEX_TIP].x) / 2,
    y: (p[LM.THUMB_TIP].y + p[LM.INDEX_TIP].y) / 2,
  }
}
