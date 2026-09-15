import { hsla } from '../core/palette'
import { TAU } from '../core/math'

/**
 * Ambient set dressing drawn under everything else: a slow horizon grid, corner
 * furniture and a drifting sweep line. Pure decoration — it exists so an empty frame
 * with no hands in it still looks like a running machine.
 */

export function drawAmbient(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // Horizon grid, bottom third, receding.
  const horizon = h * 0.72
  ctx.strokeStyle = hsla(190, 100, 60, 0.05)
  ctx.lineWidth = 1

  ctx.beginPath()
  for (let i = 0; i <= 14; i++) {
    const f = i / 14
    const y = horizon + (h - horizon) * f * f
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  const drift = (t * 24) % 90
  for (let x = -drift; x < w + 90; x += 90) {
    const k = (x - w / 2) / (w / 2)
    ctx.moveTo(w / 2 + k * (w / 2) * 0.22, horizon)
    ctx.lineTo(w / 2 + k * (w / 2) * 1.6, h)
  }
  ctx.stroke()

  // Slow vertical sweep — the "system is scanning" tell.
  const sweep = ((t * 0.09) % 1) * w
  const g = ctx.createLinearGradient(sweep - 140, 0, sweep + 140, 0)
  g.addColorStop(0, hsla(190, 100, 60, 0))
  g.addColorStop(0.5, hsla(190, 100, 70, 0.045))
  g.addColorStop(1, hsla(190, 100, 60, 0))
  ctx.fillStyle = g
  ctx.fillRect(sweep - 140, 0, 280, h)

  ctx.restore()
}

/** Corner brackets + tick marks framing the whole viewport. */
export function drawFrameFurniture(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const m = 26
  const len = 44
  const pulse = 0.28 + Math.sin(t * 1.6) * 0.06

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = hsla(188, 100, 70, pulse)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ]
  for (const [cx, cy, sx, sy] of corners) {
    ctx.moveTo(cx, cy + sy * len)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + sx * len, cy)
  }
  ctx.stroke()

  // Edge ticks along the top.
  ctx.strokeStyle = hsla(188, 100, 70, 0.14)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = m + 70; x < w - m - 70; x += 22) {
    const tall = x % 110 < 22
    ctx.moveTo(x, m)
    ctx.lineTo(x, m + (tall ? 9 : 4))
  }
  ctx.stroke()
  ctx.restore()
}

/** A ring of dashes that rotates — reused by the portal and the lock-on reticle. */
export function dashRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  segments: number,
  gap: number,
  phase: number,
) {
  const step = TAU / segments
  const arc = step * (1 - gap)
  ctx.beginPath()
  for (let i = 0; i < segments; i++) {
    const a = phase + i * step
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.arc(cx, cy, r, a, a + arc)
  }
}
