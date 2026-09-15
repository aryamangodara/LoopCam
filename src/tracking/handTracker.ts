import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Stage } from '../core/stage'
import type { Hand, Handedness, Point } from '../core/types'
import { HandFilter } from '../core/oneEuro'
import { buildFeatures } from './features'

const WASM_DIR = '/mediapipe/wasm'
const MODEL = '/models/hand_landmarker.task'

interface RawHand {
  handedness: Handedness
  score: number
  lm: { x: number; y: number; z: number }[]
}

/** One persistent slot per handedness so ids, filters and velocities survive across frames. */
class Slot {
  filter = new HandFilter()
  pts: Point[] = []
  lastPalm = { x: 0, y: 0 }
  vel = { x: 0, y: 0 }
  present = false
  missingFor = 0

  constructor(readonly id: number, readonly handedness: Handedness) {}
}

export class HandTracker {
  private landmarker!: HandLandmarker
  private slots: Record<Handedness, Slot> = {
    Left: new Slot(0, 'Left'),
    Right: new Slot(1, 'Right'),
  }
  private raw: Partial<Record<Handedness, RawHand>> = {}
  private lastTs = -1
  private detachFrameCb: (() => void) | null = null

  /** Rolling cost of the model call, shown in diagnostics. */
  detectMs = 0
  delegate: 'GPU' | 'CPU' = 'GPU'
  /** Detections per second. The governor lowers this first when frames get tight. */
  detectHz = 24
  private lastDetect = 0

  constructor(private stage: Stage) {}

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR)
    const opts = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU'))
    } catch {
      // Some integrated GPUs / remote desktops refuse the WebGL delegate.
      this.delegate = 'CPU'
      this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU'))
    }
  }

  /**
   * Detection runs on real camera frames (~30fps), not on rAF (~60fps). The One Euro
   * filters are still ticked every render frame, so repeatedly feeding the latest raw
   * value smoothly closes the gap between detections — no explicit interpolation needed.
   */
  start() {
    if (this.detachFrameCb) return
    const video = this.stage.video
    const anyVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
      cancelVideoFrameCallback?: (h: number) => void
    }

    if (typeof anyVideo.requestVideoFrameCallback === 'function') {
      let handle = 0
      let alive = true
      const onFrame = () => {
        if (!alive) return
        this.detect()
        handle = anyVideo.requestVideoFrameCallback!(onFrame)
      }
      handle = anyVideo.requestVideoFrameCallback(onFrame)
      this.detachFrameCb = () => {
        alive = false
        anyVideo.cancelVideoFrameCallback?.(handle)
      }
    } else {
      const id = setInterval(() => this.detect(), 33)
      this.detachFrameCb = () => clearInterval(id)
    }
  }

  stop() {
    this.detachFrameCb?.()
    this.detachFrameCb = null
  }

  private detect() {
    const video = this.stage.video
    if (!video.videoWidth || video.paused) return

    const now = performance.now()
    if (now - this.lastDetect < 1000 / this.detectHz) return
    this.lastDetect = now

    // detectForVideo demands strictly increasing timestamps.
    const ts = Math.max(now, this.lastTs + 1)
    this.lastTs = ts

    let res: HandLandmarkerResult
    const t0 = now
    try {
      res = this.landmarker.detectForVideo(video, ts)
    } catch {
      return
    }
    this.detectMs = this.detectMs * 0.8 + (performance.now() - t0) * 0.2

    const next: Partial<Record<Handedness, RawHand>> = {}
    for (let i = 0; i < res.landmarks.length; i++) {
      const cat = res.handednesses[i]?.[0]
      // Do NOT flip this. MediaPipe's handedness is already stated in selfie terms —
      // it answers "which of the operator's hands is this", not "which side of the raw
      // sensor image is it on" — and the operator is looking at a mirrored view, so the
      // label already matches the hand they think they are holding up. Swapping it here
      // (as this did) inverted both labels.
      const label: Handedness = cat?.categoryName === 'Left' ? 'Left' : 'Right'
      // Two detections can carry the same label when the model is unsure; park the
      // second one on the free slot rather than dropping it.
      const key: Handedness = next[label] ? (label === 'Left' ? 'Right' : 'Left') : label
      if (next[key]) continue
      next[key] = { handedness: key, score: cat?.score ?? 0, lm: res.landmarks[i] as RawHand['lm'] }
    }
    this.raw = next
  }

  /** Called once per render frame. Returns the smoothed, projected, feature-rich hands. */
  sample(t: number, dt: number): Hand[] {
    const out: Hand[] = []

    for (const key of ['Left', 'Right'] as Handedness[]) {
      const slot = this.slots[key]
      const raw = this.raw[key]

      if (!raw) {
        // Grace period: a one-frame dropout shouldn't kill an active gesture.
        slot.missingFor += dt
        if (slot.missingFor > 0.25) {
          if (slot.present) slot.filter.reset()
          slot.present = false
          slot.pts = []
        }
        if (!slot.present) continue
      } else {
        slot.missingFor = 0
        slot.present = true
        const pts: Point[] = new Array(raw.lm.length)
        for (let i = 0; i < raw.lm.length; i++) {
          const l = raw.lm[i]
          const p = this.stage.project(l.x, l.y)
          const s = slot.filter.apply(i, p.x, p.y, l.z, t)
          pts[i] = s
        }
        slot.pts = pts
      }

      if (!slot.pts.length) continue

      const f = buildFeatures(slot.pts)
      // Velocity from the smoothed palm, in px/sec.
      if (dt > 0) {
        const vx = (f.palm.x - slot.lastPalm.x) / dt
        const vy = (f.palm.y - slot.lastPalm.y) / dt
        slot.vel.x += (vx - slot.vel.x) * 0.35
        slot.vel.y += (vy - slot.vel.y) * 0.35
      }
      slot.lastPalm = { ...f.palm }
      f.vel = { ...slot.vel }
      f.speed = Math.hypot(slot.vel.x, slot.vel.y)

      out.push({
        id: slot.id,
        handedness: key,
        score: raw?.score ?? 0.5,
        pts: slot.pts,
        f,
      })
    }

    return out
  }
}
