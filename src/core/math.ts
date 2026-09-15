import type { Vec2 } from './types'

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a))
export const smoothstep = (edge0: number, edge1: number, v: number) => {
  const t = clamp(invLerp(edge0, edge1, v), 0, 1)
  return t * t * (3 - 2 * t)
}
/** Frame-rate independent exponential approach. `rate` ≈ how much of the gap closes per second. */
export const damp = (a: number, b: number, rate: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-rate * dt))

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
export const dist2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const angle = (a: Vec2, b: Vec2) => Math.atan2(b.y - a.y, b.x - a.x)

export const TAU = Math.PI * 2

/** Deterministic-ish jitter helper; fine for visual noise. */
export const rand = (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a))
export const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0]

/** Signed area of a triangle — used to read palm facing. */
export const triArea = (a: Vec2, b: Vec2, c: Vec2) =>
  ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2
