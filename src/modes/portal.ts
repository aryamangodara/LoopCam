import type { Frame, Mode } from '../core/types'
import type { ParticleField } from '../fx/particles'
import { isOpenPalm } from '../tracking/features'
import { glowDot, hsla } from '../core/palette'
import { clamp, dist, mid, TAU, rand } from '../core/math'
import { dashRing } from '../fx/grid'
import { blips } from '../fx/audio'

/**
 * POWER 4 — tear open a portal.
 *
 * Both palms open and facing each other, pulled apart past ~1.6 hand-spans: a ring opens
 * at the midpoint with its radius tracking the gap. Hold it steady for two seconds and it
 * locks — brighter, slower, with a text ring. Close either hand and it implodes.
 */

const OPEN_GAP = 1.6   // multiples of mean hand span
const KEEP_GAP = 1.15  // hysteresis: easier to hold open than to open
const LOCK_TIME = 2.0

const RUNES = 'ΔΣΦΨΩЖЯЛЩЮ¥∮∯∰⟁⟒⌬⌖⍚⎔'

export function createPortal(field: ParticleField): Mode {
  let armed = false
  let radius = 0
  let spin = 0
  let lock = 0
  let implode = 0
  let ix = 0
  let iy = 0

  return {
    id: 'portal',
    label: 'PORTAL',
    priority: 70,

    matches(frame) {
      if (frame.hands.length < 2) return false
      const [a, b] = frame.hands
      if (!isOpenPalm(a.f) || !isOpenPalm(b.f)) return false
      const span = (a.f.span + b.f.span) / 2
      const gap = dist(a.f.palm, b.f.palm) / span
      return gap > (armed ? KEEP_GAP : OPEN_GAP)
    },

    enter() { armed = true; lock = 0; blips.up() },

    exit() {
      armed = false
      lock = 0
      // Remember where it died so the implosion plays out in the right place.
      if (radius > 20) implode = 1
      blips.down()
    },

    update(frame, active) {
      spin += frame.dt * (lock >= 1 ? 0.35 : 0.9)

      if (implode > 0) {
        implode = Math.max(0, implode - frame.dt * 2.4)
        const r = radius * implode
        field.shockwave(ix, iy, r, 30 * (1 - implode))
        drawImplosion(frame.fx, ix, iy, r, implode)
        if (implode === 0) radius = 0
      }

      if (!active || frame.hands.length < 2) {
        radius *= Math.exp(-6 * frame.dt)
        return
      }

      const [a, b] = frame.hands
      const c = mid(a.f.palm, b.f.palm)
      ix = c.x
      iy = c.y
      const gap = dist(a.f.palm, b.f.palm)
      const target = gap * 0.46

      radius += (target - radius) * (1 - Math.exp(-9 * frame.dt))
      implode = 0

      // Lock builds while the hands hold still.
      const jitter = a.f.speed + b.f.speed
      lock = jitter < 500 ? Math.min(1, lock + frame.dt / LOCK_TIME) : Math.max(0, lock - frame.dt)

      field.energy = Math.min(1, field.energy + frame.dt * 3)
      field.attract(c.x, c.y, 900 * frame.dt, radius * 4.5, 0.9)
      field.shockwave(c.x, c.y, radius, 12)

      drawPortal(frame, c.x, c.y, radius, spin, lock)
      drawTethers(frame, c, a.f.palm, b.f.palm, radius, lock)
    },
  }
}

function drawPortal(
  frame: Frame,
  cx: number,
  cy: number,
  r: number,
  spin: number,
  lock: number,
) {
  if (r < 12) return
  const fx = frame.fx
  const hue = 268 + lock * 40

  fx.save()
  fx.globalCompositeOperation = 'lighter'

  // Core: a swirling gradient well.
  const g = fx.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0, hsla(hue + 40, 100, 92, 0.32 + lock * 0.3))
  g.addColorStop(0.35, hsla(hue, 100, 56, 0.24))
  g.addColorStop(0.78, hsla(hue - 30, 100, 44, 0.12))
  g.addColorStop(1, hsla(hue - 30, 100, 40, 0))
  fx.fillStyle = g
  fx.beginPath()
  fx.arc(cx, cy, r, 0, TAU)
  fx.fill()

  // Interior swirl arcs — each rotates at its own rate for a parallax churn.
  for (let i = 0; i < 6; i++) {
    const rr = r * (0.18 + i * 0.13)
    const a0 = spin * (1 + i * 0.4) * (i % 2 ? -1 : 1)
    fx.strokeStyle = hsla(hue + i * 9, 100, 74, 0.26 - i * 0.02)
    fx.lineWidth = 1.4
    fx.beginPath()
    fx.arc(cx, cy, rr, a0, a0 + TAU * 0.62)
    fx.stroke()
  }

  // Rim: a solid ring plus counter-rotating dashed rings.
  fx.strokeStyle = hsla(hue + 30, 100, 86, 0.55 + lock * 0.35)
  fx.lineWidth = 2.4
  fx.beginPath()
  fx.arc(cx, cy, r, 0, TAU)
  fx.stroke()

  fx.strokeStyle = hsla(hue + 60, 100, 78, 0.4)
  fx.lineWidth = 3
  dashRing(fx, cx, cy, r * 1.1, 14, 0.55, spin)
  fx.stroke()

  fx.strokeStyle = hsla(hue - 20, 100, 70, 0.3)
  fx.lineWidth = 1.6
  dashRing(fx, cx, cy, r * 1.22, 26, 0.6, -spin * 1.4)
  fx.stroke()

  // Sparks skittering around the rim.
  fx.fillStyle = hsla(hue + 70, 100, 96, 0.8)
  for (let i = 0; i < 10; i++) {
    const a = spin * 2.2 + (i / 10) * TAU + Math.sin(i * 3.1) * 0.4
    const rr = r * rand(0.98, 1.06)
    fx.fillRect(cx + Math.cos(a) * rr - 1, cy + Math.sin(a) * rr - 1, 2.2, 2.2)
  }

  fx.restore()

  if (lock > 0.02) drawRuneRing(frame.hud, cx, cy, r * 1.36, spin * 0.4, lock, hue)
}

/** Rotating glyph ring that fades in as the portal stabilises. */
function drawRuneRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  phase: number,
  lock: number,
  hue: number,
) {
  const n = 22
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.font = '13px "Share Tech Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = hsla(hue + 50, 100, 88, 0.22 + lock * 0.55)
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU
    ctx.save()
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.rotate(a + Math.PI / 2)
    ctx.fillText(RUNES[i % RUNES.length], 0, 0)
    ctx.restore()
  }

  if (lock >= 1) {
    ctx.font = '700 11px Orbitron, monospace'
    ctx.fillStyle = hsla(hue + 60, 100, 92, 0.9)
    ctx.fillText('STABILIZED', cx, cy - r - 20)
  }
  ctx.restore()
}

/** Energy running from each palm into the rim. */
function drawTethers(
  frame: Frame,
  c: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: number,
  lock: number,
) {
  if (r < 12) return
  const fx = frame.fx
  fx.save()
  fx.globalCompositeOperation = 'lighter'
  for (const p of [a, b]) {
    const ang = Math.atan2(c.y - p.y, c.x - p.x)
    const ex = c.x - Math.cos(ang) * r
    const ey = c.y - Math.sin(ang) * r
    fx.strokeStyle = hsla(282, 100, 82, 0.28 + lock * 0.3)
    fx.lineWidth = 1.4
    fx.beginPath()
    fx.moveTo(p.x, p.y)
    const bend = 26
    fx.quadraticCurveTo(
      (p.x + ex) / 2 + Math.sin(frame.t * 3) * bend,
      (p.y + ey) / 2 + Math.cos(frame.t * 3) * bend,
      ex,
      ey,
    )
    fx.stroke()
    glowDot(fx, p.x, p.y, 22, 284, 0.5 + lock * 0.4)
  }
  fx.restore()
}

function drawImplosion(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const a = clamp(1 - k, 0, 1)
  ctx.strokeStyle = hsla(292, 100, 90, 0.8 * k)
  ctx.lineWidth = 2 + a * 8
  ctx.beginPath()
  ctx.arc(x, y, Math.max(2, r), 0, TAU)
  ctx.stroke()
  glowDot(ctx, x, y, 60 * (1 - k) + 10, 300, k)
  ctx.restore()
}
