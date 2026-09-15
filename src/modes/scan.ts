import type { Frame, Mode } from '../core/types'
import { LM } from '../core/types'
import type { Stage } from '../core/stage'
import { isFingerGun } from '../tracking/features'
import { hsla } from '../core/palette'
import { clamp } from '../core/math'
import { blips } from '../fx/audio'

/**
 * Finger-gun scan sweep.
 *
 * Point index + thumb and a scan bar sweeps down the frame. As it passes each row it
 * samples the live video and paints back only the high-contrast edges, so the sweep looks
 * like it is reading the scene rather than just being a gradient drawn over it.
 *
 * The edge pass runs on a small offscreen copy (160 wide) — at full resolution the
 * per-pixel loop would eat the frame budget on its own.
 */

const SW = 160
const SH = 90
const SWEEP_TIME = 1.1

export function createScan(stage: Stage): Mode {
  let armed = false
  let sweep = -1
  let barrel = 0

  const off = document.createElement('canvas')
  off.width = SW
  off.height = SH
  const octx = off.getContext('2d', { willReadFrequently: true })!

  const edge = document.createElement('canvas')
  edge.width = SW
  edge.height = SH
  const ectx = edge.getContext('2d')!
  let edgeReady = false

  return {
    id: 'scan',
    label: 'SCAN',
    priority: 30,

    matches(frame) {
      return frame.hands.some((h) => isFingerGun(h.f) && (armed ? h.f.extended[1] : h.f.fingerCount === 1))
    },

    enter() {
      armed = true
      sweep = 0
      edgeReady = buildEdges(stage, octx, ectx)
      blips.blip(1200, 0.07, 'square', 0.05)
    },

    exit() { armed = false },

    update(frame, active) {
      if (active) {
        // Muzzle flare at the index fingertip.
        const gun = frame.hands.find((h) => isFingerGun(h.f))
        if (gun) {
          barrel = clamp(barrel + frame.dt * 4, 0, 1)
          drawMuzzle(frame, gun.pts[LM.INDEX_TIP], gun.pts[LM.INDEX_PIP], barrel)
        }
        if (sweep >= 0) {
          sweep += frame.dt / SWEEP_TIME
          // Loop the sweep for as long as the gesture is held.
          if (sweep > 1.25) {
            sweep = 0
            edgeReady = buildEdges(stage, octx, ectx)
            blips.blip(1000, 0.05, 'square', 0.035)
          }
        }
      } else {
        barrel = Math.max(0, barrel - frame.dt * 3)
        if (sweep >= 0) {
          sweep += frame.dt / SWEEP_TIME
          if (sweep > 1.25) sweep = -1
        }
      }

      if (sweep >= 0 && sweep <= 1.25) drawSweep(frame, sweep, edge, edgeReady)
    },
  }
}

/** Sobel-ish edge pass over a downscaled video frame, drawn as cyan on transparent. */
function buildEdges(
  stage: Stage,
  octx: CanvasRenderingContext2D,
  ectx: CanvasRenderingContext2D,
): boolean {
  const v = stage.video
  if (!v.videoWidth) return false

  octx.save()
  octx.translate(SW, 0)
  octx.scale(-1, 1) // match the mirrored on-screen view
  octx.drawImage(v, 0, 0, SW, SH)
  octx.restore()

  const src = octx.getImageData(0, 0, SW, SH)
  const s = src.data
  const out = ectx.createImageData(SW, SH)
  const o = out.data

  const lum = (i: number) => s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114

  for (let y = 1; y < SH - 1; y++) {
    for (let x = 1; x < SW - 1; x++) {
      const i = (y * SW + x) * 4
      const gx = lum(i + 4) - lum(i - 4)
      const gy = lum(i + SW * 4) - lum(i - SW * 4)
      const g = Math.min(255, Math.hypot(gx, gy) * 2.4)
      o[i] = 120
      o[i + 1] = 245
      o[i + 2] = 255
      o[i + 3] = g > 40 ? g : 0
    }
  }
  ectx.putImageData(out, 0, 0)
  return true
}

function drawSweep(frame: Frame, p: number, edge: HTMLCanvasElement, ready: boolean) {
  const fx = frame.fx
  const y = p * frame.h
  const band = 150
  const fade = clamp(1 - (p - 1) * 4, 0, 1) // taper off past the bottom

  fx.save()
  fx.globalCompositeOperation = 'lighter'

  // Everything already swept keeps a faint edge trace that decays with distance.
  if (ready) {
    fx.globalAlpha = 0.34 * fade
    fx.save()
    fx.beginPath()
    fx.rect(0, Math.max(0, y - frame.h), frame.w, Math.min(y, frame.h))
    fx.clip()
    fx.imageSmoothingEnabled = true
    fx.drawImage(edge, 0, 0, frame.w, frame.h)
    fx.restore()
    fx.globalAlpha = 1
  }

  // The bar itself.
  const g = fx.createLinearGradient(0, y - band, 0, y + 12)
  g.addColorStop(0, hsla(188, 100, 60, 0))
  g.addColorStop(0.82, hsla(188, 100, 62, 0.14 * fade))
  g.addColorStop(1, hsla(188, 100, 88, 0.42 * fade))
  fx.fillStyle = g
  fx.fillRect(0, y - band, frame.w, band + 12)

  fx.strokeStyle = hsla(188, 100, 95, 0.85 * fade)
  fx.lineWidth = 1.6
  fx.beginPath()
  fx.moveTo(0, y)
  fx.lineTo(frame.w, y)
  fx.stroke()
  fx.restore()

  const hud = frame.hud
  hud.save()
  hud.font = '10px "Share Tech Mono", monospace'
  hud.fillStyle = hsla(188, 100, 90, 0.75 * fade)
  hud.textAlign = 'left'
  hud.fillText(`SCAN ${Math.round(clamp(p, 0, 1) * 100)}%  ROW ${Math.round(y)}`, 34, y - 8)
  hud.restore()
}

function drawMuzzle(
  frame: Frame,
  tip: { x: number; y: number },
  pip: { x: number; y: number },
  k: number,
) {
  const fx = frame.fx
  const dx = tip.x - pip.x
  const dy = tip.y - pip.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len

  fx.save()
  fx.globalCompositeOperation = 'lighter'
  const reach = 90 + Math.sin(frame.t * 22) * 14
  const g = fx.createLinearGradient(tip.x, tip.y, tip.x + ux * reach, tip.y + uy * reach)
  g.addColorStop(0, hsla(188, 100, 95, 0.8 * k))
  g.addColorStop(1, hsla(188, 100, 60, 0))
  fx.strokeStyle = g
  fx.lineWidth = 3
  fx.lineCap = 'round'
  fx.beginPath()
  fx.moveTo(tip.x, tip.y)
  fx.lineTo(tip.x + ux * reach, tip.y + uy * reach)
  fx.stroke()
  fx.restore()
}
