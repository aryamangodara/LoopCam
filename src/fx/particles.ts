import { hsla } from '../core/palette'
import { clamp, rand, TAU } from '../core/math'

/**
 * Ambient particle field.
 *
 * Stored in flat Float32Arrays and drawn as velocity streaks batched into a handful of
 * hue buckets — one Path2D build + one stroke per bucket, rather than 2000 individual
 * arc() calls. That difference is the whole frame budget at this particle count.
 */

const BUCKETS = 6

export class ParticleField {
  readonly n: number
  private x: Float32Array
  private y: Float32Array
  private vx: Float32Array
  private vy: Float32Array
  private hue: Float32Array
  private life: Float32Array
  private seed: Float32Array

  /** Global brightness — modes raise it while they're doing something with the field. */
  energy = 0.25

  constructor(count = 2000, w = 1920, h = 1080) {
    this.n = count
    this.x = new Float32Array(count)
    this.y = new Float32Array(count)
    this.vx = new Float32Array(count)
    this.vy = new Float32Array(count)
    this.hue = new Float32Array(count)
    this.life = new Float32Array(count)
    this.seed = new Float32Array(count)
    for (let i = 0; i < count; i++) this.spawn(i, w, h, true)
  }

  private spawn(i: number, w: number, h: number, anywhere = false) {
    this.x[i] = rand(0, w)
    this.y[i] = anywhere ? rand(0, h) : rand(0, h)
    const a = rand(0, TAU)
    const s = rand(4, 22)
    this.vx[i] = Math.cos(a) * s
    this.vy[i] = Math.sin(a) * s
    this.hue[i] = rand(176, 212)
    this.life[i] = rand(0.4, 1)
    this.seed[i] = rand(0, 1000)
  }

  /** Radial push away from (px, py). Falls off smoothly to nothing at `radius`. */
  repel(px: number, py: number, strength: number, radius: number) {
    const r2 = radius * radius
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - px
      const dy = this.y[i] - py
      const d2 = dx * dx + dy * dy
      if (d2 > r2 || d2 < 1) continue
      const d = Math.sqrt(d2)
      const fall = 1 - d / radius
      const f = (strength * fall * fall) / d
      this.vx[i] += dx * f
      this.vy[i] += dy * f
      this.hue[i] += (34 - this.hue[i]) * 0.04 * fall
      this.life[i] = Math.min(1, this.life[i] + fall * 0.06)
    }
  }

  /** Pull toward (px, py) with a tangential component, so particles spiral instead of collapsing. */
  attract(px: number, py: number, strength: number, radius: number, swirl = 1) {
    const r2 = radius * radius
    for (let i = 0; i < this.n; i++) {
      const dx = px - this.x[i]
      const dy = py - this.y[i]
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const d = Math.max(Math.sqrt(d2), 8)
      const fall = 1 - d / radius
      const f = (strength * fall) / d
      this.vx[i] += dx * f - dy * f * swirl
      this.vy[i] += dy * f + dx * f * swirl
      this.hue[i] += (296 - this.hue[i]) * 0.05 * fall
      this.life[i] = Math.min(1, this.life[i] + fall * 0.08)
    }
  }

  /** Push everything out of a ring's interior — the portal's pressure wave. */
  shockwave(px: number, py: number, radius: number, strength: number) {
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - px
      const dy = this.y[i] - py
      const d = Math.hypot(dx, dy) || 1
      const band = Math.abs(d - radius)
      if (band > 70) continue
      const f = (strength * (1 - band / 70)) / d
      this.vx[i] += dx * f
      this.vy[i] += dy * f
      this.life[i] = 1
    }
  }

  step(dt: number, w: number, h: number, t: number) {
    const drag = Math.exp(-1.35 * dt)
    for (let i = 0; i < this.n; i++) {
      // A slow curl keeps the idle field alive instead of settling into stillness.
      const s = this.seed[i]
      this.vx[i] += Math.sin(this.y[i] * 0.004 + t * 0.35 + s) * 5 * dt
      this.vy[i] += Math.cos(this.x[i] * 0.004 + t * 0.29 + s) * 5 * dt

      this.vx[i] *= drag
      this.vy[i] *= drag
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt

      // Wrap rather than bounce: no pile-up along the edges.
      if (this.x[i] < -20) this.x[i] += w + 40
      else if (this.x[i] > w + 20) this.x[i] -= w + 40
      if (this.y[i] < -20) this.y[i] += h + 40
      else if (this.y[i] > h + 20) this.y[i] -= h + 40

      this.life[i] += (0.45 - this.life[i]) * 0.9 * dt
      this.hue[i] += (194 - this.hue[i]) * 0.25 * dt
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'

    for (let b = 0; b < BUCKETS; b++) {
      ctx.beginPath()
      let drew = false
      for (let i = b; i < this.n; i += BUCKETS) {
        const l = this.life[i]
        if (l < 0.06) continue
        const sx = this.x[i]
        const sy = this.y[i]
        // Streak length follows speed — fast particles read as light trails.
        const k = clamp(0.045 + l * 0.02, 0, 0.09)
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - this.vx[i] * k, sy - this.vy[i] * k)
        drew = true
      }
      if (!drew) continue
      // One representative hue per bucket keeps this to a single stroke call.
      const h = this.hue[b * ((this.n / BUCKETS) | 0)] ?? 194
      ctx.strokeStyle = hsla(h, 100, 72, clamp(0.16 + this.energy * 0.5, 0, 0.8))
      ctx.lineWidth = 1.35
      ctx.stroke()
    }

    ctx.restore()
  }
}
