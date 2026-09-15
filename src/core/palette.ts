/** Neon palette helpers. Everything is HSL so hue cycling is one addition. */

export const NEON = {
  cyan: 186,
  ice: 200,
  violet: 274,
  magenta: 324,
  amber: 36,
  lime: 104,
} as const

export type NeonName = keyof typeof NEON

/** Ordered ramps the light-painter cycles through. */
export const RAMPS: ReadonlyArray<{ name: string; hues: readonly number[] }> = [
  { name: 'ION', hues: [186, 200, 224] },
  { name: 'FLUX', hues: [324, 288, 264] },
  { name: 'SOLAR', hues: [36, 18, 54] },
  { name: 'VIRID', hues: [104, 150, 172] },
  { name: 'PRISM', hues: [0, 60, 120, 180, 240, 300] },
]

export const hsla = (h: number, s: number, l: number, a = 1) =>
  `hsla(${((h % 360) + 360) % 360} ${s}% ${l}% / ${a})`

/** Sample a ramp continuously; t wraps. */
export const rampHue = (ramp: readonly number[], t: number) => {
  const n = ramp.length
  const f = ((t % 1) + 1) % 1
  const i = Math.floor(f * n)
  const j = (i + 1) % n
  const k = f * n - i
  let a = ramp[i]
  let b = ramp[j]
  // take the short way around the wheel
  if (b - a > 180) b -= 360
  if (a - b > 180) b += 360
  return a + (b - a) * k
}

/** A hue that drifts forever — the app's ambient "alive" signal. */
export const drift = (t: number, speed = 8, offset = 0) => NEON.cyan + offset + t * speed

/**
 * Additive glow stroke. Calling this instead of setting shadowBlur per-shape keeps the
 * expensive blur confined to one place, and layering two passes (wide+dim, tight+bright)
 * reads as bloom without a WebGL pass.
 */
export function glowStroke(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  hue: number,
  width: number,
  alpha = 1,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = hsla(hue, 100, 58, 0.16 * alpha)
  ctx.lineWidth = width * 4
  path()
  ctx.stroke()

  ctx.strokeStyle = hsla(hue, 100, 64, 0.4 * alpha)
  ctx.lineWidth = width * 2
  path()
  ctx.stroke()

  ctx.strokeStyle = hsla(hue, 100, 92, 0.95 * alpha)
  ctx.lineWidth = width
  path()
  ctx.stroke()

  ctx.restore()
}

export function glowDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hue: number,
  alpha = 1,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, hsla(hue, 100, 96, 0.95 * alpha))
  g.addColorStop(0.35, hsla(hue, 100, 64, 0.5 * alpha))
  g.addColorStop(1, hsla(hue, 100, 50, 0))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
