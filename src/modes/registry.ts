import type { Frame, GestureId, Mode } from '../core/types'
import { Latch } from '../tracking/recognizer'

/**
 * Arbitration: ambient modes always update; exactly one *power* holds the floor.
 *
 * Priority only decides who wins a contested frame. Once a mode is active it keeps the
 * floor until its own gesture stops matching — otherwise a momentarily-misread frame
 * would let a higher-priority power steal mid-stroke.
 */
export class ModeRegistry {
  private latches = new Map<GestureId, Latch>()
  active: Mode | null = null

  constructor(readonly modes: Mode[]) {
    for (const m of modes) {
      if (!m.ambient) this.latches.set(m.id, new Latch())
    }
  }

  get activeId(): GestureId {
    return this.active?.id ?? 'idle'
  }

  /** How long the current power has been held, in seconds. */
  get heldFor(): number {
    if (!this.active) return 0
    return this.latches.get(this.active.id)?.heldFor ?? 0
  }

  isMatching(id: GestureId) {
    return this.latches.get(id)?.active ?? false
  }

  update(frame: Frame) {
    // 1. Tick every latch so enter/exit debouncing stays warm even for inactive modes.
    const matching: Mode[] = []
    for (const m of this.modes) {
      if (m.ambient) continue
      const latch = this.latches.get(m.id)!
      const raw = m.matches?.(frame) ?? false
      latch.update(raw, frame.dt)
      if (latch.active) matching.push(m)
    }

    // 2. Pick the floor holder: incumbent keeps it if still matching, else highest priority.
    let next: Mode | null = null
    if (this.active && matching.includes(this.active)) {
      next = this.active
    } else if (matching.length) {
      next = matching.reduce((best, m) => (m.priority > best.priority ? m : best))
    }

    if (next !== this.active) {
      this.active?.exit?.(frame)
      this.active = next
      this.active?.enter?.(frame)
    }

    // 3. Update everyone. Inactive powers still get a tick so their effects can decay
    //    gracefully (trails fading, a portal collapsing) instead of vanishing.
    for (const m of this.modes) {
      m.update(frame, m.ambient === true || m === this.active)
    }
  }

  /** Drop the floor — used when all hands leave the frame. */
  release(frame: Frame) {
    if (!this.active) return
    this.latches.get(this.active.id)?.forceOff()
    this.active.exit?.(frame)
    this.active = null
  }
}
