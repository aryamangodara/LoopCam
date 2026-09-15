import type { Frame, Hand, Mode } from '../core/types'
import { LM } from '../core/types'
import type { TrailField } from '../fx/trails'
import { RAMPS, glowDot, hsla, rampHue } from '../core/palette'
import { clamp, dist, invLerp } from '../core/math'
import { pinchPoint } from '../tracking/features'
import { blips } from '../fx/audio'

const ENTER = 0.34
const EXIT = 0.46

/**
 * POWER 2 — pinch to paint light in the air.
 *
 * Stroke weight and brightness come from how hard the pinch closes, so a stroke has
 * pressure the way a real brush does. Pinching thumb-to-middle instead of thumb-to-index
 * steps the palette; an open-palm swipe wipes the canvas.
 */
export function createLightPaint(trails: TrailField): Mode {
  let armed = false
  let ramp = 0
  let hueT = 0
  let swatchFlash = 0
  let cyclePrimed = true
  let painting: Hand | null = null

  const pressureOf = (pinch: number) => clamp(1 - invLerp(0.06, ENTER, pinch), 0, 1)

  return {
    id: 'paint',
    label: 'LIGHT PAINT',
    priority: 20,

    matches(frame) {
      // Hysteresis: easier to keep a stroke alive than to start one, so the line
      // doesn't break up when the pinch wobbles mid-gesture.
      const gate = armed ? EXIT : ENTER
      return frame.hands.some((h) => h.f.pinch < gate)
    },

    enter() {
      armed = true
      trails.begin()
      blips.up()
    },

    exit() {
      armed = false
      painting = null
      trails.end()
      blips.down()
    },

    update(frame, active) {
      trails.step(frame.dt)
      hueT += frame.dt * 0.12
      if (swatchFlash > 0) swatchFlash = Math.max(0, swatchFlash - frame.dt * 2.2)

      // Palette cycling works whether or not a stroke is live.
      const cycling = frame.hands.some((h) => h.f.pinchMiddle < 0.3 && h.f.pinch > 0.5)
      if (cycling && cyclePrimed) {
        ramp = (ramp + 1) % RAMPS.length
        swatchFlash = 1
        cyclePrimed = false
        blips.blip(520 + ramp * 90, 0.09, 'square', 0.045)
      } else if (!cycling) {
        cyclePrimed = true
      }

      if (active) {
        const gate = EXIT
        // Stay with the same physical hand for the whole stroke.
        if (!painting || painting.f.pinch > gate) {
          painting = frame.hands.find((h) => h.f.pinch < gate) ?? null
        } else {
          painting = frame.hands.find((h) => h.id === painting!.id) ?? null
        }

        if (painting) {
          const p = pinchPoint(painting.pts)
          const press = pressureOf(painting.f.pinch)
          trails.push(p, press, rampHue(RAMPS[ramp].hues, hueT))
        }
      }

      // Open-palm swipe wipes — but only a fast, deliberate one.
      for (const h of frame.hands) {
        if (h.f.openness > 0.7 && h.f.fingerCount >= 4 && h.f.speed > 1500 && !trails.empty) {
          trails.clear()
          blips.blip(180, 0.22, 'sawtooth', 0.05)
          break
        }
      }

      trails.draw(frame.fx)

      if (active && painting) {
        const p = pinchPoint(painting.pts)
        const press = pressureOf(painting.f.pinch)
        const hue = rampHue(RAMPS[ramp].hues, hueT)
        glowDot(frame.fx, p.x, p.y, 16 + press * 26, hue, 0.6 + press * 0.4)
        drawNib(frame.hud, painting, hue, press)
      }

      if (swatchFlash > 0) drawSwatch(frame, ramp, hueT, swatchFlash)
    },
  }
}

/** A little caliper between thumb and index showing live pressure. */
function drawNib(ctx: CanvasRenderingContext2D, hand: Hand, hue: number, press: number) {
  const a = hand.pts[LM.THUMB_TIP]
  const b = hand.pts[LM.INDEX_TIP]
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = hsla(hue, 100, 80, 0.5)
  ctx.lineWidth = 1
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.setLineDash([])

  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  ctx.font = '10px "Share Tech Mono", monospace'
  ctx.fillStyle = hsla(hue, 100, 85, 0.85)
  ctx.textAlign = 'center'
  ctx.fillText(`${Math.round(press * 100)}%`, mx, my - 14)
  ctx.fillText(`${Math.round(dist(a, b))}px`, mx, my + 22)
  ctx.restore()
}

/** Palette name + swatch, flashed on the left when the ramp changes. */
function drawSwatch(frame: Frame, ramp: number, hueT: number, alpha: number) {
  const ctx = frame.hud
  const x = frame.w / 2
  const y = frame.h - 96
  const hues = RAMPS[ramp].hues

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.textAlign = 'center'
  ctx.font = '700 13px Orbitron, monospace'
  ctx.fillStyle = hsla(rampHue(hues, hueT), 100, 82, 0.9)
  ctx.fillText(RAMPS[ramp].name, x, y)

  const wsw = 26
  const total = hues.length * wsw
  for (let i = 0; i < hues.length; i++) {
    ctx.fillStyle = hsla(hues[i], 100, 60, 0.85)
    ctx.fillRect(x - total / 2 + i * wsw, y + 10, wsw - 3, 5)
  }
  ctx.restore()
}
