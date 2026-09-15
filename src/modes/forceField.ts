import type { Mode } from '../core/types'
import type { ParticleField } from '../fx/particles'
import { isFist, isOpenPalm } from '../tracking/features'
import { glowDot, hsla } from '../core/palette'
import { clamp, TAU, rand } from '../core/math'
import { dashRing } from '../fx/grid'
import { blips } from '../fx/audio'

/**
 * POWER 3 — telekinesis.
 *
 * Open palm shoves the ambient particle field away from you; a closed fist pulls it into
 * a spiral. Two fists at once arc lightning between them. All three share the one
 * ParticleField instance, which the ambient `createFieldAmbient` mode steps and draws.
 */

interface Wave {
  x: number
  y: number
  r: number
  life: number
  hue: number
}

export function createPush(field: ParticleField): Mode {
  let armed = false
  const waves: Wave[] = []

  return {
    id: 'push',
    label: 'FORCE PUSH',
    priority: 25,

    matches(frame) {
      // Facing gate is looser once engaged, so a slight hand tilt doesn't drop the push.
      const face = armed ? 0.35 : 0.5
      return frame.hands.some((h) => isOpenPalm(h.f) && h.f.facing > face)
    },

    enter(frame) {
      armed = true
      blips.up()
      for (const h of frame.hands) {
        if (isOpenPalm(h.f)) waves.push({ x: h.f.palm.x, y: h.f.palm.y, r: 10, life: 1, hue: 38 })
      }
    },

    exit() {
      armed = false
      blips.down()
    },

    update(frame, active) {
      // Waves outlive the gesture so the release still reads as an impact.
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]
        w.r += frame.dt * 780
        w.life -= frame.dt * 1.5
        if (w.life <= 0) { waves.splice(i, 1); continue }
        field.shockwave(w.x, w.y, w.r, 26 * w.life)
        drawWave(frame.fx, w)
      }

      if (!active) return

      field.energy = Math.min(1, field.energy + frame.dt * 2.5)

      for (const h of frame.hands) {
        if (!isOpenPalm(h.f) || h.f.facing < 0.35) continue
        const radius = h.f.span * 7.5
        const strength = 2400 * h.f.openness * clamp(h.f.facing, 0, 1)
        field.repel(h.f.palm.x, h.f.palm.y, strength * frame.dt, radius)
        drawPalmAura(frame.fx, h.f.palm.x, h.f.palm.y, radius, frame.t, h.f.openness)
      }
    },
  }
}

export function createVortex(field: ParticleField): Mode {
  let armed = false
  let spin = 0

  return {
    id: 'vortex',
    label: 'VORTEX',
    priority: 26,

    matches(frame) {
      const gate = armed ? 0.3 : 0.18
      return frame.hands.some((h) => h.f.fingerCount === 0 && h.f.openness < gate)
    },

    enter() { armed = true; blips.up() },
    exit() { armed = false; blips.down() },

    update(frame, active) {
      if (!active) return
      spin += frame.dt * 2.4
      field.energy = Math.min(1, field.energy + frame.dt * 2.5)

      const fists = frame.hands.filter((h) => isFist(h.f))
      for (const h of fists) {
        const radius = h.f.span * 9
        field.attract(h.f.palm.x, h.f.palm.y, 2600 * frame.dt, radius, 1.5)
        drawVortexRings(frame.fx, h.f.palm.x, h.f.palm.y, h.f.span, spin)
      }

      // Both fists: chain lightning between them.
      if (fists.length === 2) {
        drawArc(frame.fx, fists[0].f.palm, fists[1].f.palm)
      }
    },
  }
}

/** The always-on half: steps the simulation and draws it, whatever else is happening. */
export function createFieldAmbient(field: ParticleField): Mode {
  return {
    id: 'field',
    label: 'FIELD',
    priority: 0,
    ambient: true,
    update(frame) {
      field.energy = Math.max(0.22, field.energy - frame.dt * 0.7)
      field.step(frame.dt, frame.w, frame.h, frame.t)
      field.draw(frame.fx)
    },
  }
}

function drawWave(ctx: CanvasRenderingContext2D, w: Wave) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = hsla(w.hue, 100, 70, 0.34 * w.life)
  ctx.lineWidth = 2.5 * w.life
  ctx.beginPath()
  ctx.arc(w.x, w.y, w.r, 0, TAU)
  ctx.stroke()
  ctx.strokeStyle = hsla(w.hue + 20, 100, 84, 0.18 * w.life)
  ctx.lineWidth = 8 * w.life
  ctx.stroke()
  ctx.restore()
}

function drawPalmAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  power: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius)
  g.addColorStop(0, hsla(38, 100, 70, 0.16 * power))
  g.addColorStop(0.6, hsla(22, 100, 60, 0.06 * power))
  g.addColorStop(1, hsla(22, 100, 60, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()

  // Three pressure rings pushing outward on a loop.
  for (let i = 0; i < 3; i++) {
    const f = ((t * 0.9 + i / 3) % 1)
    ctx.strokeStyle = hsla(38, 100, 78, 0.3 * (1 - f) * power)
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(x, y, radius * (0.2 + f * 0.8), 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
}

function drawVortexRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  span: number,
  spin: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    const r = span * (1.6 + i * 1.5)
    const dir = i % 2 === 0 ? 1 : -1
    ctx.strokeStyle = hsla(288 - i * 18, 100, 74, 0.34 - i * 0.07)
    ctx.lineWidth = 1.8
    dashRing(ctx, x, y, r, 5 + i * 3, 0.55, spin * dir + i)
    ctx.stroke()
  }
  glowDot(ctx, x, y, span * 1.5, 292, 0.7)
  ctx.restore()
}

/** Midpoint-displacement lightning, rebuilt every frame so it crackles. */
function drawArc(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }) {
  const pts: { x: number; y: number }[] = [a, b]
  for (let pass = 0; pass < 5; pass++) {
    const next: { x: number; y: number }[] = [pts[0]]
    const amp = 46 / (pass + 1)
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]
      const q = pts[i]
      next.push({
        x: (p.x + q.x) / 2 + rand(-amp, amp),
        y: (p.y + q.y) / 2 + rand(-amp, amp),
      })
      next.push(q)
    }
    pts.length = 0
    pts.push(...next)
  }

  const path = () => {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  }

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.strokeStyle = hsla(282, 100, 60, 0.18)
  ctx.lineWidth = 12
  path(); ctx.stroke()
  ctx.strokeStyle = hsla(288, 100, 74, 0.5)
  ctx.lineWidth = 4
  path(); ctx.stroke()
  ctx.strokeStyle = hsla(300, 100, 96, 0.95)
  ctx.lineWidth = 1.4
  path(); ctx.stroke()
  ctx.restore()
}
