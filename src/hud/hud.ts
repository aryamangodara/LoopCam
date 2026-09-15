import type { Frame, GestureId, Hand, Mode } from '../core/types'
import { BONES, LM } from '../core/types'
import { hsla } from '../core/palette'
import { clamp, TAU } from '../core/math'
import { dashRing, drawFrameFurniture } from '../fx/grid'

/**
 * The always-on interface layer: per-hand lock-on reticles, a mode rail down the left
 * edge, and a telemetry block. None of it is interactive — it exists to make the machine
 * feel like it is watching and thinking.
 */

export interface HudState {
  fps: number
  detectMs: number
  renderMs: number
  delegate: string
  activeId: GestureId
  activeLabel: string
  heldFor: number
  soundOn: boolean
}

/** Per-hand animation state that has to persist between frames. */
const spin = new Map<number, number>()

export function drawHud(frame: Frame, modes: Mode[], state: HudState) {
  drawFrameFurniture(frame.hud, frame.w, frame.h, frame.t)

  for (const hand of frame.hands) {
    const s = (spin.get(hand.id) ?? 0) + frame.dt * 0.6
    spin.set(hand.id, s)
    drawSkeleton(frame.fx, hand, state.activeId)
    drawReticle(frame.hud, frame, hand, s, state)
  }

  drawModeRail(frame, modes, state)
  drawTelemetry(frame, state)
}

/** A faint bone overlay so the hand reads as "acquired" even when idle. */
function drawSkeleton(ctx: CanvasRenderingContext2D, hand: Hand, active: GestureId) {
  const hue = active === 'idle' ? 188 : 196
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = hsla(hue, 100, 70, 0.2)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (const [a, b] of BONES) {
    ctx.moveTo(hand.pts[a].x, hand.pts[a].y)
    ctx.lineTo(hand.pts[b].x, hand.pts[b].y)
  }
  ctx.stroke()

  ctx.fillStyle = hsla(hue, 100, 92, 0.45)
  for (const i of [LM.THUMB_TIP, LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP]) {
    ctx.beginPath()
    ctx.arc(hand.pts[i].x, hand.pts[i].y, 2.2, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/** Bracket + rotating ring + a small label stack, sized to the hand. */
function drawReticle(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  hand: Hand,
  spinPhase: number,
  state: HudState,
) {
  const { palm, span } = hand.f
  const r = span * 2.1
  const engaged = state.activeId !== 'idle'
  const hue = engaged ? 44 : 188

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // Corner brackets around the hand.
  const k = r * 0.78
  const arm = r * 0.34
  ctx.strokeStyle = hsla(hue, 100, 80, 0.55)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = palm.x + sx * k
    const cy = palm.y + sy * k
    ctx.moveTo(cx, cy - sy * arm)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx - sx * arm, cy)
  }
  ctx.stroke()

  // Rotating dashed ring — faster when a power is live.
  ctx.strokeStyle = hsla(hue, 100, 72, 0.32)
  ctx.lineWidth = 1.4
  dashRing(ctx, palm.x, palm.y, r * 0.62, 9, 0.62, spinPhase * (engaged ? 3 : 1))
  ctx.stroke()

  // Label stack, flipped to the inside edge when the hand nears the viewport border.
  const flip = palm.x > frame.w - 190
  const lx = flip ? palm.x - k - 12 : palm.x + k + 12
  ctx.textAlign = flip ? 'right' : 'left'
  ctx.font = '700 10px Orbitron, monospace'
  ctx.fillStyle = hsla(hue, 100, 88, 0.92)
  ctx.fillText(`${hand.handedness.toUpperCase()} HAND`, lx, palm.y - 14)

  ctx.font = '9.5px "Share Tech Mono", monospace'
  ctx.fillStyle = hsla(hue, 100, 80, 0.62)
  const rows = [
    `CONF ${(hand.score * 100).toFixed(0)}%`,
    `OPEN ${(hand.f.openness * 100).toFixed(0)}%  PINCH ${hand.f.pinch.toFixed(2)}`,
    `FACE ${(hand.f.facing * 100).toFixed(0)}%  V ${Math.round(hand.f.speed)}`,
  ]
  rows.forEach((t, i) => ctx.fillText(t, lx, palm.y + 2 + i * 12))

  // Extended-finger pips.
  const px = flip ? lx - 52 : lx
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = hand.f.extended[i] ? hsla(hue, 100, 88, 0.9) : hsla(hue, 40, 60, 0.22)
    ctx.fillRect(px + i * 11, palm.y + 42, 7, 3)
  }

  ctx.restore()
}

/** Left-edge rail listing every power, with the live one lit. */
function drawModeRail(frame: Frame, modes: Mode[], state: HudState) {
  const ctx = frame.hud
  const powers = modes.filter((m) => !m.ambient)
  const x = 34
  const top = frame.h / 2 - (powers.length * 30) / 2

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  powers.forEach((m, i) => {
    const y = top + i * 30
    const on = m.id === state.activeId
    const hue = on ? 44 : 188
    const alpha = on ? 1 : 0.32

    ctx.fillStyle = hsla(hue, 100, on ? 86 : 70, alpha)
    ctx.fillRect(x, y - 6, on ? 4 : 2, 12)

    ctx.font = on ? '700 11px Orbitron, monospace' : '10px "Share Tech Mono", monospace'
    ctx.fillStyle = hsla(hue, 100, on ? 92 : 72, alpha)
    ctx.fillText(m.label, x + 14, y)

    if (on) {
      ctx.font = '9px "Share Tech Mono", monospace'
      ctx.fillStyle = hsla(44, 100, 80, 0.7)
      ctx.fillText(`${state.heldFor.toFixed(1)}s`, x + 14 + ctx.measureText(m.label).width + 12, y)
    }
  })
  ctx.restore()
}

/** Top-left title block and bottom-left performance readout. */
function drawTelemetry(frame: Frame, state: HudState) {
  const ctx = frame.hud
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.font = '900 15px Orbitron, monospace'
  ctx.fillStyle = hsla(188, 100, 88, 0.9)
  ctx.fillText('LOOPCAM', 62, 44)

  ctx.font = '9px "Share Tech Mono", monospace'
  ctx.fillStyle = hsla(188, 100, 74, 0.45)
  ctx.fillText('GESTURE INTERFACE v0.1 // LOCAL ONLY', 62, 58)

  // Health bar: green while there is headroom, amber as the frame budget tightens.
  const load = clamp(state.renderMs / 16.7, 0, 1)
  const hue = load < 0.65 ? 150 : load < 0.9 ? 44 : 352
  const bx = 62
  const by = frame.h - 44
  ctx.fillStyle = hsla(hue, 100, 60, 0.18)
  ctx.fillRect(bx, by, 120, 4)
  ctx.fillStyle = hsla(hue, 100, 72, 0.85)
  ctx.fillRect(bx, by, 120 * load, 4)

  ctx.font = '9.5px "Share Tech Mono", monospace'
  ctx.fillStyle = hsla(188, 100, 78, 0.55)
  ctx.fillText(
    `${state.fps.toFixed(0)} FPS · DETECT ${state.detectMs.toFixed(1)}ms · DRAW ${state.renderMs.toFixed(1)}ms · ${state.delegate}`,
    bx,
    by - 8,
  )
  ctx.fillText(
    `${frame.hands.length} HAND${frame.hands.length === 1 ? '' : 'S'} TRACKED · ${state.activeLabel}${state.soundOn ? ' · AUDIO ON' : ''}`,
    bx,
    by + 18,
  )

  ctx.textAlign = 'right'
  ctx.fillStyle = hsla(188, 100, 70, 0.35)
  ctx.fillText('? CODEX   D DIAG   C CLEAR   M SOUND   F FULL', frame.w - 62, frame.h - 26)
  ctx.restore()
}
