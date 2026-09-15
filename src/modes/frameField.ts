import type { Frame, Mode, Vec2 } from '../core/types'
import { LM } from '../core/types'
import type { Stage } from '../core/stage'
import { isCorner } from '../tracking/features'
import { hsla } from '../core/palette'
import { clamp, TAU } from '../core/math'
import { blips } from '../fx/audio'

/**
 * POWER 1 — the director's frame.
 *
 * Both hands make an "L" (thumb + index out, other fingers curled); the two thumb/index
 * junctions become opposite corners of a rectangle, and the interior fills with a living
 * plasma whose hue speed tracks the frame's area and tilt. Hold it steady and it captures
 * — the framed slice of video peels off as a glowing card. That capture is what the name
 * LoopCam is about.
 *
 * The plasma is computed into an 80x45 ImageData buffer and upscaled with smoothing,
 * rather than as thousands of fillRect cells. Same look, a fraction of the cost.
 */

const PW = 80
const PH = 45
const HOLD_TO_CAPTURE = 1.5

interface Card {
  img: HTMLCanvasElement
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  rot: number
  vrot: number
  life: number
}

export function createFrameField(stage: Stage): Mode {
  let armed = false
  let phase = 0
  let hold = 0
  let flash = 0
  let smooth: { a: Vec2; b: Vec2 } | null = null

  const plasma = document.createElement('canvas')
  plasma.width = PW
  plasma.height = PH
  const pctx = plasma.getContext('2d', { willReadFrequently: true })!
  const buf = pctx.createImageData(PW, PH)

  const cards: Card[] = []

  /** The L's vertex: the web between thumb and index. Stable across hand rotation. */
  const cornerOf = (pts: { x: number; y: number }[]): Vec2 => ({
    x: (pts[LM.THUMB_MCP].x + pts[LM.INDEX_MCP].x) / 2,
    y: (pts[LM.THUMB_MCP].y + pts[LM.INDEX_MCP].y) / 2,
  })

  return {
    id: 'frame',
    label: 'FRAME FIELD',
    priority: 60,

    matches(frame) {
      if (frame.hands.length < 2) return false
      const [a, b] = frame.hands
      if (armed) {
        // Once framing, only demand thumb+index out — the curled fingers often
        // drift open a little while you are concentrating on the framing itself.
        return a.f.extended[1] && b.f.extended[1] && a.f.pinch > 0.6 && b.f.pinch > 0.6
      }
      return isCorner(a.f) && isCorner(b.f)
    },

    enter() { armed = true; hold = 0; smooth = null; blips.up() },
    exit() { armed = false; hold = 0; smooth = null; blips.down() },

    update(frame, active) {
      phase += frame.dt
      if (flash > 0) flash = Math.max(0, flash - frame.dt * 3.2)

      stepCards(frame, cards)

      if (!active || frame.hands.length < 2) {
        if (flash > 0) drawFlash(frame, flash)
        return
      }

      const ca = cornerOf(frame.hands[0].pts)
      const cb = cornerOf(frame.hands[1].pts)

      // Ease the corners so the rect does not twitch with the last of the tracking noise.
      if (!smooth) smooth = { a: { ...ca }, b: { ...cb } }
      const k = 1 - Math.exp(-14 * frame.dt)
      smooth.a.x += (ca.x - smooth.a.x) * k
      smooth.a.y += (ca.y - smooth.a.y) * k
      smooth.b.x += (cb.x - smooth.b.x) * k
      smooth.b.y += (cb.y - smooth.b.y) * k

      const x = Math.min(smooth.a.x, smooth.b.x)
      const y = Math.min(smooth.a.y, smooth.b.y)
      const w = Math.abs(smooth.a.x - smooth.b.x)
      const h = Math.abs(smooth.a.y - smooth.b.y)
      if (w < 40 || h < 30) return

      // Area and tilt drive how fast the colour field churns.
      const area = (w * h) / (frame.w * frame.h)
      const tilt = Math.atan2(smooth.b.y - smooth.a.y, smooth.b.x - smooth.a.x)
      const speed = 0.35 + area * 2.6
      const hueBase = 186 + tilt * 90 + phase * 14

      renderPlasma(buf, phase * speed, hueBase)
      pctx.putImageData(buf, 0, 0)

      const fx = frame.fx
      fx.save()
      fx.globalCompositeOperation = 'lighter'
      fx.imageSmoothingEnabled = true
      fx.imageSmoothingQuality = 'high'
      fx.globalAlpha = 0.72
      fx.drawImage(plasma, x, y, w, h)
      fx.restore()

      drawChrome(frame, x, y, w, h, hueBase, area)

      // Steady hold arms the shutter.
      const moving = frame.hands[0].f.speed + frame.hands[1].f.speed
      hold = moving < 420 ? hold + frame.dt : Math.max(0, hold - frame.dt * 1.6)
      drawShutterMeter(frame, x, y, w, h, clamp(hold / HOLD_TO_CAPTURE, 0, 1), hueBase)

      if (hold >= HOLD_TO_CAPTURE) {
        hold = 0
        flash = 1
        blips.snap()
        const card = capture(stage, x, y, w, h)
        if (card) cards.push(card)
      }

      if (flash > 0) drawFlash(frame, flash)
    },
  }
}

/** Layered sine fields — cheap, and it churns like something alive rather than a gradient. */
function renderPlasma(buf: ImageData, t: number, hueBase: number) {
  const d = buf.data
  let i = 0
  for (let py = 0; py < PH; py++) {
    const v = py / PH
    for (let px = 0; px < PW; px++) {
      const u = px / PW
      const a = Math.sin(u * 9 + t * 2.1)
      const b = Math.sin(v * 7 - t * 1.6)
      const c = Math.sin((u + v) * 6 + t * 1.2)
      const e = Math.sin(Math.hypot(u - 0.5, v - 0.5) * 16 - t * 3.4)
      const n = (a + b + c + e) / 4 // -1..1

      const hue = hueBase + n * 120
      const light = 42 + n * 26
      const rgb = hslToRgb(((hue % 360) + 360) % 360, 100, light)
      d[i++] = rgb[0]
      d[i++] = rgb[1]
      d[i++] = rgb[2]
      d[i++] = 200 + n * 40
    }
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x } else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x } else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c } else { r = c; b = x }
  const m = L - c / 2
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Corner brackets, chromatic edge and the aperture readout. */
function drawChrome(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
  area: number,
) {
  const ctx = frame.hud
  const len = Math.min(34, Math.min(w, h) * 0.3)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineWidth = 2

  // Two offset passes = cheap chromatic aberration on the border.
  const passes: ReadonlyArray<readonly [number, number, number, number]> = [
    [-1.5, 0, hue - 40, 0.45],
    [1.5, 0, hue + 40, 0.45],
    [0, 0, hue, 0.95],
  ]
  for (const [dx, dy, hx, alpha] of passes) {
    ctx.strokeStyle = hsla(hx, 100, 78, alpha)
    ctx.beginPath()
    const corners: ReadonlyArray<readonly [number, number, number, number]> = [
      [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
    ]
    for (const [cx, cy, sx, sy] of corners) {
      ctx.moveTo(cx + dx, cy + dy + sy * len)
      ctx.lineTo(cx + dx, cy + dy)
      ctx.lineTo(cx + dx + sx * len, cy + dy)
    }
    ctx.stroke()
  }

  ctx.setLineDash([4, 7])
  ctx.lineWidth = 1
  ctx.strokeStyle = hsla(hue, 100, 70, 0.3)
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])

  ctx.font = '10px "Share Tech Mono", monospace'
  ctx.fillStyle = hsla(hue, 100, 86, 0.85)
  ctx.textAlign = 'left'
  ctx.fillText(`APERTURE ${Math.round(w)}x${Math.round(h)}`, x + 2, y - 10)
  ctx.textAlign = 'right'
  ctx.fillText(`f/${(1.2 + (1 - area) * 6).toFixed(1)}  ${(area * 100).toFixed(1)}% FOV`, x + w - 2, y - 10)
  ctx.restore()
}

/** Ring of progress around the frame centre while the shutter charges. */
function drawShutterMeter(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number,
  p: number,
  hue: number,
) {
  if (p <= 0.02) return
  const ctx = frame.hud
  const cx = x + w / 2
  const cy = y + h / 2
  const r = Math.min(w, h) * 0.18 + 10

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = hsla(hue, 100, 60, 0.18)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.stroke()

  ctx.strokeStyle = hsla(hue, 100, 90, 0.9)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * p)
  ctx.stroke()

  ctx.font = '9px "Share Tech Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = hsla(hue, 100, 92, 0.8)
  ctx.fillText(p >= 1 ? 'CAPTURE' : 'HOLD STEADY', cx, cy + r + 16)
  ctx.restore()
}

function drawFlash(frame: Frame, a: number) {
  frame.fx.save()
  frame.fx.globalCompositeOperation = 'lighter'
  frame.fx.fillStyle = `rgba(200,250,255,${a * 0.5})`
  frame.fx.fillRect(0, 0, frame.w, frame.h)
  frame.fx.restore()
}

/** Copy the framed slice of live video into an offscreen canvas. */
function capture(stage: Stage, x: number, y: number, w: number, h: number): Card | null {
  const v = stage.video
  if (!v.videoWidth) return null

  // Map the stage rect back through the cover crop and the mirror.
  const p1 = stage.toVideo(x, y)
  const p2 = stage.toVideo(x + w, y + h)
  const sx = Math.min(p1.x, p2.x)
  const sy = Math.min(p1.y, p2.y)
  const sw = Math.abs(p2.x - p1.x)
  const sh = Math.abs(p2.y - p1.y)
  if (sw < 4 || sh < 4) return null

  const img = document.createElement('canvas')
  img.width = Math.round(Math.min(w, 520))
  img.height = Math.round((img.width * sh) / sw)
  const c = img.getContext('2d')!
  // Re-mirror so the card matches what the user saw on screen.
  c.translate(img.width, 0)
  c.scale(-1, 1)
  c.drawImage(v, sx, sy, sw, sh, 0, 0, img.width, img.height)

  return {
    img,
    x, y, w, h,
    vx: (Math.random() - 0.5) * 120,
    vy: -70 - Math.random() * 70,
    rot: 0,
    vrot: (Math.random() - 0.5) * 0.9,
    life: 1,
  }
}

function stepCards(frame: Frame, cards: Card[]) {
  const ctx = frame.fx
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i]
    c.life -= frame.dt * 0.42
    if (c.life <= 0) { cards.splice(i, 1); continue }
    c.vy += 130 * frame.dt
    c.x += c.vx * frame.dt
    c.y += c.vy * frame.dt
    c.rot += c.vrot * frame.dt

    ctx.save()
    ctx.globalAlpha = Math.min(1, c.life * 1.6)
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2)
    ctx.rotate(c.rot)
    ctx.scale(0.6 + c.life * 0.4, 0.6 + c.life * 0.4)
    ctx.drawImage(c.img, -c.w / 2, -c.h / 2, c.w, c.h)
    ctx.strokeStyle = hsla(188, 100, 80, 0.7 * c.life)
    ctx.lineWidth = 2
    ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h)
    ctx.restore()
  }
}
