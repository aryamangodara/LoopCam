/**
 * Tiny WebAudio blip bank. Synthesised, so there are no audio assets to ship.
 * Starts muted and silent until the user opts in with M — autoplaying sound on a page
 * that just grabbed the camera is a hostile first impression.
 */
export class Blips {
  private ctx: AudioContext | null = null
  enabled = false

  private ensure(): AudioContext | null {
    if (!this.enabled) return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    if (this.enabled) this.ensure()
    return this.enabled
  }

  /** A short tone with an exponential tail. */
  blip(freq: number, dur = 0.12, type: OscillatorType = 'sine', gain = 0.06) {
    const ctx = this.ensure()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    amp.gain.setValueAtTime(0, now)
    amp.gain.linearRampToValueAtTime(gain, now + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(amp).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  }

  /** Rising chirp — mode engaged. */
  up() { this.sweep(420, 980, 0.16) }
  /** Falling chirp — mode released. */
  down() { this.sweep(760, 320, 0.13) }
  /** Camera shutter-ish tick. */
  snap() { this.blip(1650, 0.05, 'square', 0.05); setTimeout(() => this.blip(880, 0.08, 'triangle', 0.04), 45) }

  private sweep(from: number, to: number, dur: number) {
    const ctx = this.ensure()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(from, now)
    osc.frequency.exponentialRampToValueAtTime(to, now + dur)
    amp.gain.setValueAtTime(0, now)
    amp.gain.linearRampToValueAtTime(0.05, now + 0.01)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(amp).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  }
}

export const blips = new Blips()
