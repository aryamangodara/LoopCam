/**
 * Debounce + cooldown gate.
 *
 * Raw per-frame gesture tests flicker at their threshold boundary — the hand sits right
 * on the edge and the effect strobes. A Latch requires N consecutive agreeing frames
 * before it changes state, and refuses to re-fire for `cooldown` seconds after release.
 * (Hysteresis proper — different enter/exit thresholds — lives in each mode's `matches`.)
 */
export class Latch {
  private on = false
  private streak = 0
  private cooling = 0
  /** seconds the latch has been continuously on. */
  heldFor = 0

  constructor(
    private enterFrames = 3,
    private exitFrames = 5,
    private cooldown = 0.25,
  ) {}

  get active() {
    return this.on
  }

  /** Returns 'enter' | 'exit' | null for this frame. */
  update(raw: boolean, dt: number): 'enter' | 'exit' | null {
    if (this.cooling > 0) this.cooling = Math.max(0, this.cooling - dt)
    if (this.on) this.heldFor += dt

    const want = raw
    if (want === this.on) {
      this.streak = 0
      return null
    }

    this.streak++

    if (!this.on) {
      if (this.cooling > 0) return null
      if (this.streak >= this.enterFrames) {
        this.on = true
        this.streak = 0
        this.heldFor = 0
        return 'enter'
      }
    } else if (this.streak >= this.exitFrames) {
      this.on = false
      this.streak = 0
      this.cooling = this.cooldown
      this.heldFor = 0
      return 'exit'
    }

    return null
  }

  forceOff() {
    if (this.on) this.cooling = this.cooldown
    this.on = false
    this.streak = 0
    this.heldFor = 0
  }
}
