import { Stage } from './core/stage'
import { Loop } from './core/loop'
import type { Frame, Mode } from './core/types'
import { CameraError, startCamera } from './camera'
import { HandTracker } from './tracking/handTracker'
import { ParticleField } from './fx/particles'
import { TrailField } from './fx/trails'
import { drawAmbient } from './fx/grid'
import { blips } from './fx/audio'
import { ModeRegistry } from './modes/registry'
import { createLightPaint } from './modes/lightPaint'
import { createPush, createVortex, createFieldAmbient } from './modes/forceField'
import { createFrameField } from './modes/frameField'
import { createPortal } from './modes/portal'
import { createScan } from './modes/scan'
import { drawHud, type HudState } from './hud/hud'
import { drawDebug } from './hud/debug'
import { fillCodex, runBootSequence } from './hud/boot'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const stageEl = $('stage')
const overlay = $('overlay')
const bootPane = $('boot')
const bootLog = $('boot-log')
const bootStart = $<HTMLButtonElement>('boot-start')
const faultPane = $('fault')
const faultMsg = $('fault-msg')
const faultRetry = $<HTMLButtonElement>('fault-retry')
const cheats = $('cheats')

let debugOn = false

fillCodex($('cheats-list'))

runBootSequence(bootLog, () => {
  bootStart.hidden = false
  bootStart.focus()
})

bootStart.addEventListener('click', () => void ignite())
faultRetry.addEventListener('click', () => void ignite())

function fault(title: string, detail: string) {
  bootPane.hidden = true
  faultPane.hidden = false
  faultPane.querySelector('h1')!.textContent = title
  faultMsg.textContent = detail
  overlay.hidden = false
  overlay.classList.remove('dissolve')
}

async function ignite() {
  bootStart.disabled = true
  faultPane.hidden = true
  bootPane.hidden = false
  bootStart.querySelector('span')!.textContent = '… ESTABLISHING LINK'

  const stage = new Stage()
  const tracker = new HandTracker(stage)

  try {
    await startCamera(stage.video)
    stage.computeCover()
  } catch (err) {
    bootStart.disabled = false
    bootStart.querySelector('span')!.textContent = '▶ INITIALIZE OPTICS'
    if (err instanceof CameraError) fault('OPTICAL LINK SEVERED', `${err.message}\n\n${err.hint}`)
    else fault('OPTICAL LINK SEVERED', (err as Error).message)
    return
  }

  try {
    await tracker.init()
  } catch (err) {
    fault(
      'GESTURE LATTICE OFFLINE',
      `The hand-tracking model failed to load.\n\n${(err as Error).message}\n\nRun "npm run assets" to re-fetch it, then reload.`,
    )
    return
  }

  tracker.start()
  overlay.classList.add('dissolve')
  stageEl.classList.add('live')
  setTimeout(() => { overlay.hidden = true }, 800)

  run(stage, tracker)
}

function run(stage: Stage, tracker: HandTracker) {
  const field = new ParticleField(2000, stage.w, stage.h)
  const trails = new TrailField()

  // Order matters twice over: `priority` decides who wins a contested frame, and array
  // order decides draw order. The ambient particle pass goes last so every force applied
  // by the modes above it lands in the same frame it was computed.
  const modes: Mode[] = [
    createPortal(field),
    createFrameField(stage),
    createScan(stage),
    createVortex(field),
    createPush(field),
    createLightPaint(trails),
    createFieldAmbient(field),
  ]
  const registry = new ModeRegistry(modes)

  bindKeys(trails)

  const loop = new Loop((t, dt) => {
    stage.clear()
    const hands = tracker.sample(t, dt)

    const frame: Frame = {
      t, dt, hands,
      w: stage.w,
      h: stage.h,
      fx: stage.fx,
      hud: stage.hud,
    }

    drawAmbient(stage.fx, stage.w, stage.h, t)

    if (!hands.length) registry.release(frame)
    registry.update(frame)

    const state: HudState = {
      fps: loop.fps,
      detectMs: tracker.detectMs,
      renderMs: loop.cost,
      delegate: tracker.delegate,
      activeId: registry.activeId,
      activeLabel: registry.active?.label ?? 'STANDBY',
      heldFor: registry.heldFor,
      soundOn: blips.enabled,
    }
    drawHud(frame, modes, state)
    if (debugOn) drawDebug(frame, registry, modes)
  })

  loop.run()

  // Pause detection in a hidden tab — a background tab with a live model pegs a core.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) tracker.stop()
    else tracker.start()
  })
}

function bindKeys(trails: TrailField) {
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key.toLowerCase()) {
      case 'd':
        debugOn = !debugOn
        break
      case '?':
      case '/':
        cheats.hidden = !cheats.hidden
        break
      case 'c':
        trails.clear()
        break
      case 'm':
        blips.toggle()
        blips.blip(880, 0.1)
        break
      case 'f':
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen().catch(() => {})
        break
      case 'escape':
        cheats.hidden = true
        break
    }
  })

  // The cursor is hidden for the sci-fi look; bring it back whenever the mouse moves
  // so the page never feels broken, then hide it again once things settle.
  let idle = 0
  window.addEventListener('mousemove', () => {
    document.body.classList.add('show-cursor')
    clearTimeout(idle)
    idle = window.setTimeout(() => document.body.classList.remove('show-cursor'), 2000)
  })
}
