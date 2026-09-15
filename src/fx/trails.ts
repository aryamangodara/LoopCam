import type { Vec2 } from '../core/types'
import { hsla } from '../core/palette'
import { dist } from '../core/math'

interface Node extends Vec2 {
  /** 0..1 — how hard the pinch was when this node was laid down. */
  press: number
  hue: number
  age: number
}

interface Stroke {
  nodes: Node[]
  done: boolean
}

/**
 * Tapered, decaying light strokes.
 *
 * Strokes are drawn as quadratic curves through the midpoints of consecutive nodes,
 * which removes the polyline faceting you'd otherwise see on fast hand movement.
 */
export class TrailField {
  private strokes: Stroke[] = []
  private current: Stroke | null = null
  /** seconds a node takes to fade out completely. */
  lifespan = 3.2

  begin() {
    this.current = { nodes: [], done: false }
    this.strokes.push(this.current)
    // Old strokes are cheap but not free; keep the list bounded.
    if (this.strokes.length > 40) this.strokes.shift()
  }

  push(p: Vec2, press: number, hue: number) {
    if (!this.current) this.begin()
    const s = this.current!
    const last = s.nodes[s.nodes.length - 1]
    // Skip sub-pixel nodes — they cost a curve segment and change nothing visually.
    if (last && dist(last, p) < 2.2) {
      last.press = last.press * 0.7 + press * 0.3
      return
    }
    s.nodes.push({ x: p.x, y: p.y, press, hue, age: 0 })
    if (s.nodes.length > 600) s.nodes.shift()
  }

  end() {
    if (this.current) this.current.done = true
    this.current = null
  }

  clear() {
    this.strokes = []
    this.current = null
  }

  get empty() {
    return this.strokes.length === 0
  }

  step(dt: number) {
    for (const s of this.strokes) {
      for (const n of s.nodes) n.age += dt
      while (s.nodes.length && s.nodes[0].age > this.lifespan) s.nodes.shift()
    }
    this.strokes = this.strokes.filter((s) => s.nodes.length > 1 || !s.done)
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const s of this.strokes) {
      const n = s.nodes
      if (n.length < 2) continue

      for (let i = 1; i < n.length; i++) {
        const a = n[i - 1]
        const b = n[i]
        const fade = Math.max(0, 1 - b.age / this.lifespan)
        if (fade <= 0.01) continue

        // Taper toward the tail of the stroke as well as with age.
        const along = i / n.length
        const w = (1.6 + b.press * 9) * fade * (0.45 + along * 0.55)

        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const px = i > 1 ? (n[i - 2].x + a.x) / 2 : a.x
        const py = i > 1 ? (n[i - 2].y + a.y) / 2 : a.y

        const curve = () => {
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.quadraticCurveTo(a.x, a.y, mx, my)
        }

        ctx.strokeStyle = hsla(b.hue, 100, 56, 0.12 * fade)
        ctx.lineWidth = w * 3.6
        curve()
        ctx.stroke()

        ctx.strokeStyle = hsla(b.hue, 100, 68, 0.38 * fade)
        ctx.lineWidth = w * 1.8
        curve()
        ctx.stroke()

        ctx.strokeStyle = hsla(b.hue, 100, 94, 0.9 * fade)
        ctx.lineWidth = w * 0.55
        curve()
        ctx.stroke()
      }
    }

    ctx.restore()
  }
}
