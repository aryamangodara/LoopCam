/**
 * Adaptive quality governor.
 *
 * Hardware for this app varies wildly — an integrated GPU on a high-DPI laptop has
 * roughly a tenth the fill rate of a discrete card, and the hand model may land on the
 * CPU delegate on either. Rather than pick constants for a machine we cannot see, watch
 * the frame rate and spend the budget we actually have.
 *
 * Degrade fast, recover slowly: a sudden stall should shed load immediately, but creeping
 * back up must not oscillate, so recovery steps are half the size and need a longer run
 * of good frames.
 */

const MIN_PARTICLES = 380
const MAX_PARTICLES = 1400

export class Quality {
  /** Smoothed frame rate. */
  fps = 60
  /** 1 = everything on, 0 = stripped to essentials. */
  level = 1

  private since = 0
  private good = 0

  /** True for one tick after the level changed, so the caller can resize buffers. */
  changed = false

  update(dt: number, fps: number) {
    this.changed = false
    if (fps > 0) this.fps += (fps - this.fps) * Math.min(1, dt * 2.5)
    this.since += dt

    // Hold a floor of ~46fps: below that, hand tracking starts to feel detached.
    if (this.fps < 46) {
      this.good = 0
      if (this.since > 1.2 && this.level > 0) {
        this.level = Math.max(0, this.level - 0.34)
        this.since = 0
        this.changed = true
      }
      return
    }

    this.good = this.fps > 57 ? this.good + dt : 0
    if (this.good > 4 && this.level < 1) {
      this.level = Math.min(1, this.level + 0.17)
      this.good = 0
      this.since = 0
      this.changed = true
    }
  }

  get particles() {
    return Math.round(MIN_PARTICLES + this.level * (MAX_PARTICLES - MIN_PARTICLES))
  }

  /** The ambient horizon grid is pure decoration; it is the first thing to go. */
  get ambientGrid() {
    return this.level > 0.4
  }

  /** Detection rate in Hz. Dropping this frees main-thread time for everything else. */
  get detectHz() {
    return this.level > 0.3 ? 24 : 15
  }

  get label() {
    return this.level > 0.8 ? 'HIGH' : this.level > 0.4 ? 'MED' : 'LOW'
  }
}
