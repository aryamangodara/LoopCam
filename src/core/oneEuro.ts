/**
 * One Euro filter — Casiez et al. 2012.
 * Low-pass with a cutoff that rises with speed: steady hands stop jittering,
 * fast hands don't lag. This single component is most of why the overlay feels
 * attached to the fingers rather than floating behind them.
 */

class LowPass {
  private y = 0
  private primed = false

  filter(x: number, alpha: number): number {
    if (!this.primed) {
      this.primed = true
      this.y = x
      return x
    }
    this.y = alpha * x + (1 - alpha) * this.y
    return this.y
  }

  get value() {
    return this.y
  }

  reset() {
    this.primed = false
  }
}

export class OneEuro {
  private x = new LowPass()
  private dx = new LowPass()
  private lastTime = -1
  private lastRaw = 0
  private primed = false

  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(value: number, timestamp: number): number {
    if (!this.primed) {
      this.primed = true
      this.lastTime = timestamp
      this.lastRaw = value
      return this.x.filter(value, 1)
    }
    const dt = Math.max(1e-3, timestamp - this.lastTime)
    this.lastTime = timestamp

    const rawDeriv = (value - this.lastRaw) / dt
    this.lastRaw = value
    const deriv = this.dx.filter(rawDeriv, this.alpha(this.dCutoff, dt))

    const cutoff = this.minCutoff + this.beta * Math.abs(deriv)
    return this.x.filter(value, this.alpha(cutoff, dt))
  }

  reset() {
    this.x.reset()
    this.dx.reset()
    this.primed = false
    this.lastTime = -1
  }
}

/** A filter bank for the 21 landmarks (x, y, z) of one tracked hand. */
export class HandFilter {
  private fx: OneEuro[] = []
  private fy: OneEuro[] = []
  private fz: OneEuro[] = []

  constructor(count = 21) {
    for (let i = 0; i < count; i++) {
      this.fx.push(new OneEuro(1.2, 0.02))
      this.fy.push(new OneEuro(1.2, 0.02))
      this.fz.push(new OneEuro(0.6, 0.01))
    }
  }

  apply(i: number, x: number, y: number, z: number, t: number) {
    return {
      x: this.fx[i].filter(x, t),
      y: this.fy[i].filter(y, t),
      z: this.fz[i].filter(z, t),
    }
  }

  reset() {
    for (let i = 0; i < this.fx.length; i++) {
      this.fx[i].reset()
      this.fy[i].reset()
      this.fz[i].reset()
    }
  }
}
