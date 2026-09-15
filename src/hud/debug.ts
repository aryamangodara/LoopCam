import type { Frame, Mode } from '../core/types'
import { LM } from '../core/types'
import type { ModeRegistry } from '../modes/registry'
import { hsla } from '../core/palette'
import { clamp } from '../core/math'

/**
 * Diagnostics panel (D).
 *
 * This is the app's test surface. Gesture thresholds are judgement calls about human
 * hands, so they get tuned by watching these bars move — not by guessing constants and
 * reloading. Every scalar a `matches()` reads is shown here live, alongside which latches
 * are currently satisfied.
 */

const ROW = 15

export function drawDebug(frame: Frame, registry: ModeRegistry, modes: Mode[]) {
  const ctx = frame.hud
  const x = frame.w - 292
  let y = 96
  const w = 258

  ctx.save()
  ctx.fillStyle = 'rgba(2,8,16,0.82)'
  ctx.fillRect(x - 14, y - 26, w, 92 + frame.hands.length * 128 + modes.length * ROW)
  ctx.strokeStyle = hsla(188, 100, 60, 0.3)
  ctx.lineWidth = 1
  ctx.strokeRect(x - 14, y - 26, w, 92 + frame.hands.length * 128 + modes.length * ROW)

  ctx.textAlign = 'left'
  ctx.font = '700 10px Orbitron, monospace'
  ctx.fillStyle = hsla(188, 100, 90, 0.9)
  ctx.fillText('DIAGNOSTICS', x, y - 10)

  ctx.font = '9.5px "Share Tech Mono", monospace'

  // Latch states for every power.
  y += 6
  for (const m of modes) {
    if (m.ambient) continue
    const matching = registry.isMatching(m.id)
    const active = registry.activeId === m.id
    ctx.fillStyle = hsla(active ? 44 : matching ? 150 : 188, 100, 76, active || matching ? 0.95 : 0.3)
    ctx.fillText(
      `${active ? '▶' : matching ? '●' : '○'} ${m.label.padEnd(12)} p${m.priority}`,
      x,
      y,
    )
    y += ROW
  }

  y += 10
  for (const hand of frame.hands) {
    ctx.fillStyle = hsla(188, 100, 90, 0.85)
    ctx.font = '700 10px Orbitron, monospace'
    ctx.fillText(`${hand.handedness.toUpperCase()} · span ${hand.f.span.toFixed(0)}px`, x, y)
    y += 14

    ctx.font = '9.5px "Share Tech Mono", monospace'
    const bars: [string, number, number][] = [
      ['pinch', hand.f.pinch, 2],
      ['pinchM', hand.f.pinchMiddle, 2],
      ['open', hand.f.openness, 1],
      ['facing', hand.f.facing, 1],
      ['speed', hand.f.speed / 2000, 1],
    ]
    for (const [label, raw, scale] of bars) {
      const v = clamp(raw / scale, 0, 1)
      ctx.fillStyle = hsla(188, 100, 74, 0.5)
      ctx.fillText(label, x, y)
      ctx.fillStyle = hsla(188, 100, 60, 0.18)
      ctx.fillRect(x + 54, y - 7, 110, 7)
      ctx.fillStyle = hsla(188 - v * 100, 100, 70, 0.9)
      ctx.fillRect(x + 54, y - 7, 110 * v, 7)
      ctx.fillStyle = hsla(188, 100, 82, 0.7)
      ctx.fillText(raw.toFixed(2), x + 172, y)
      y += 13
    }

    ctx.fillStyle = hsla(188, 100, 74, 0.5)
    ctx.fillText('fingers', x, y)
    const names = ['T', 'I', 'M', 'R', 'P']
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = hand.f.extended[i] ? hsla(150, 100, 76, 0.95) : hsla(188, 40, 60, 0.25)
      ctx.fillText(names[i], x + 56 + i * 13, y)
    }
    y += 24

    drawLandmarkIds(frame.hud, hand.pts)
  }

  ctx.restore()
}

/** Numbered landmarks — only useful when a gesture test is misbehaving, hence debug-only. */
function drawLandmarkIds(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.save()
  ctx.font = '8px "Share Tech Mono", monospace'
  ctx.fillStyle = hsla(44, 100, 84, 0.55)
  ctx.textAlign = 'center'
  for (let i = 0; i < pts.length; i++) ctx.fillText(String(i), pts[i].x, pts[i].y - 5)

  // Highlight the wrist→middle-MCP segment: the span every threshold divides by.
  ctx.strokeStyle = hsla(44, 100, 80, 0.7)
  ctx.lineWidth = 1.4
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(pts[LM.WRIST].x, pts[LM.WRIST].y)
  ctx.lineTo(pts[LM.MIDDLE_MCP].x, pts[LM.MIDDLE_MCP].y)
  ctx.stroke()
  ctx.restore()
}
