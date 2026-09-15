/** rAF driver with a clamped dt and a rolling fps meter. */

export class Loop {
  private raf = 0
  private last = 0
  private start = 0
  private samples: number[] = []
  fps = 0
  /** ms spent inside the last tick callback — surfaced in the diagnostics panel. */
  cost = 0

  constructor(private tick: (t: number, dt: number) => void) {}

  run() {
    this.start = performance.now()
    this.last = this.start
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame)
      // Clamp: a backgrounded tab returns a multi-second dt that would teleport every particle.
      const dt = Math.min((now - this.last) / 1000, 1 / 20)
      this.last = now

      const t0 = performance.now()
      this.tick((now - this.start) / 1000, dt)
      this.cost = performance.now() - t0

      this.samples.push(dt)
      if (this.samples.length > 40) this.samples.shift()
      const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length
      this.fps = mean > 0 ? 1 / mean : 0
    }
    this.raf = requestAnimationFrame(frame)
  }

  stop() {
    cancelAnimationFrame(this.raf)
  }
}
