/**
 * Owns canvas sizing. The video uses object-fit: cover, so the visible region of the
 * camera frame is a centre crop — landmarks must be mapped through that same crop or
 * the overlay drifts off the fingers on any non-16:9 window.
 */

export interface Layers {
  fx: CanvasRenderingContext2D
  hud: CanvasRenderingContext2D
}

export class Stage {
  readonly video: HTMLVideoElement
  readonly fxCanvas: HTMLCanvasElement
  readonly hudCanvas: HTMLCanvasElement
  readonly fx: CanvasRenderingContext2D
  readonly hud: CanvasRenderingContext2D

  /** CSS pixel size of the stage. All game logic works in these units. */
  w = 0
  h = 0
  /** Device pixel ratio used for the HUD (text needs the resolution). */
  dpr = 1
  /** The fx layer is all soft-edged glow — device pixels there buy nothing and cost 4x fill. */
  fxDpr = 1

  /** cover-fit mapping from normalized video coords -> stage px. */
  private scale = 1
  private offX = 0
  private offY = 0

  constructor() {
    this.video = document.getElementById('feed') as HTMLVideoElement
    this.fxCanvas = document.getElementById('fx') as HTMLCanvasElement
    this.hudCanvas = document.getElementById('hud') as HTMLCanvasElement
    this.fx = this.fxCanvas.getContext('2d', { alpha: true })!
    this.hud = this.hudCanvas.getContext('2d', { alpha: true })!

    this.resize()
    window.addEventListener('resize', () => this.resize())
    // Safari fires no resize on rotate in some cases
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120))
  }

  resize() {
    const raw = window.devicePixelRatio || 1
    this.dpr = Math.min(raw, 2)
    // Hard cap the fx backing store at ~2.1M device pixels (roughly 1080p). Beyond that
    // the additive fills dominate the frame regardless of how few particles are alive.
    this.w = window.innerWidth
    this.h = window.innerHeight
    const budget = 2_100_000
    this.fxDpr = Math.min(1, Math.sqrt(budget / Math.max(1, this.w * this.h)))

    this.fxCanvas.width = Math.round(this.w * this.fxDpr)
    this.fxCanvas.height = Math.round(this.h * this.fxDpr)
    this.hudCanvas.width = Math.round(this.w * this.dpr)
    this.hudCanvas.height = Math.round(this.h * this.dpr)
    for (const c of [this.fxCanvas, this.hudCanvas]) {
      c.style.width = `${this.w}px`
      c.style.height = `${this.h}px`
    }

    this.fx.setTransform(this.fxDpr, 0, 0, this.fxDpr, 0, 0)
    this.hud.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.computeCover()
  }

  /** Recompute the cover-crop mapping. Call after metadata loads and on resize. */
  computeCover() {
    const vw = this.video.videoWidth || 1280
    const vh = this.video.videoHeight || 720
    this.scale = Math.max(this.w / vw, this.h / vh)
    this.offX = (this.w - vw * this.scale) / 2
    this.offY = (this.h - vh * this.scale) / 2
  }

  /**
   * Normalized MediaPipe coords -> stage pixels, mirrored to match the CSS-flipped video.
   * This is the ONLY place mirroring happens.
   */
  project(nx: number, ny: number): { x: number; y: number } {
    const vw = this.video.videoWidth || 1280
    const vh = this.video.videoHeight || 720
    return {
      x: this.offX + (1 - nx) * vw * this.scale,
      y: this.offY + ny * vh * this.scale,
    }
  }

  /** Inverse of project(): stage pixels -> source video pixels (mirror undone). */
  toVideo(x: number, y: number): { x: number; y: number } {
    const vw = this.video.videoWidth || 1280
    return {
      x: vw - (x - this.offX) / this.scale,
      y: (y - this.offY) / this.scale,
    }
  }

  clear() {
    this.fx.clearRect(0, 0, this.w, this.h)
    this.hud.clearRect(0, 0, this.w, this.h)
  }

  /** Fade the fx layer instead of clearing it — gives every effect motion trails for free. */
  fade(amount: number) {
    this.fx.save()
    this.fx.globalCompositeOperation = 'destination-out'
    this.fx.fillStyle = `rgba(0,0,0,${amount})`
    this.fx.fillRect(0, 0, this.w, this.h)
    this.fx.restore()
  }
}
