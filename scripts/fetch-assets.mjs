/**
 * Vendors the two MediaPipe assets LoopCam needs so the app works offline:
 *   1. the tasks-vision wasm runtime  -> public/mediapipe/wasm
 *   2. the hand_landmarker .task model -> public/models
 * Idempotent: anything already present is left alone.
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const WASM_SRC = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const WASM_DEST = resolve(root, 'public/mediapipe/wasm')

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const MODEL_DEST = resolve(root, 'public/models/hand_landmarker.task')

const exists = async (p) => !!(await stat(p).catch(() => null))

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    console.warn('[assets] tasks-vision wasm not found — run npm install first.')
    return
  }
  if (await exists(resolve(WASM_DEST, 'vision_wasm_internal.js'))) {
    console.log('[assets] wasm runtime already vendored.')
    return
  }
  await mkdir(WASM_DEST, { recursive: true })
  await cp(WASM_SRC, WASM_DEST, { recursive: true })
  console.log('[assets] copied wasm runtime -> public/mediapipe/wasm')
}

async function fetchModel() {
  if (await exists(MODEL_DEST)) {
    console.log('[assets] hand_landmarker.task already vendored.')
    return
  }
  await mkdir(dirname(MODEL_DEST), { recursive: true })
  console.log('[assets] downloading hand_landmarker.task (~7MB)…')
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`model download failed: ${res.status} ${res.statusText}`)
  await writeFile(MODEL_DEST, Buffer.from(await res.arrayBuffer()))
  console.log('[assets] saved -> public/models/hand_landmarker.task')
}

try {
  await copyWasm()
  await fetchModel()
} catch (err) {
  console.error('[assets] ' + err.message)
  console.error('[assets] LoopCam needs these files to run. Re-run: npm run assets')
  process.exitCode = 1
}
