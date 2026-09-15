# LOOPCAM

A webcam page where your hands are the interface.

Open it, grant the camera, and the feed becomes a sci-fi control surface: frame a rectangle
with both hands and the inside fills with living colour, pinch to paint light in the air,
shove a particle field around with your palm, tear a portal open between your hands.

Everything runs in the browser on your machine. No frames are uploaded, recorded or stored —
the hand-tracking model and its runtime are vendored into `public/`, so the whole thing works
with the network unplugged.

## Run it

```bash
npm install
npm run dev
```

Then open <http://localhost:5173> and click **INITIALIZE OPTICS**.

`npm install` also runs `scripts/fetch-assets.mjs`, which copies the MediaPipe wasm runtime out
of `node_modules` and downloads `hand_landmarker.task` (~7 MB) into `public/`. That download is
the one moment the project touches the network; re-run it any time with `npm run assets`.

Needs a current Chrome, Edge, Firefox or Safari and a webcam. Cameras require a secure context,
so use the dev-server URL (`localhost` counts) rather than opening `index.html` off disk.

## Gestures

| Gesture | What happens |
|---|---|
| **Both hands in an "L"**, framing a rectangle | The interior fills with a churning colour field. Hold steady 1.5 s to capture that slice of video as a card that peels off and drifts away. |
| **Pinch** thumb to index | Paint glowing light trails. Pinch harder for a heavier, brighter stroke. |
| Thumb to **middle finger** | Cycle the palette (ION → FLUX → SOLAR → VIRID → PRISM). |
| **Open palm**, swiped fast | Wipe the painted trails. |
| **Open palm** toward the lens | Force push — shoves the particle field away from you. |
| **Fist** | Vortex — pulls the field into a spiral. Two fists arc lightning between them. |
| **Both palms open, pulled apart** | Opens a portal. Hold still 2 s to stabilise it; close a hand to implode it. |
| **Finger gun** (index out, thumb up) | Sweeps a scan bar down the frame, tracing the scene's edges. |

Only one power runs at a time. Two-handed gestures outrank one-handed ones, and whichever
power is already running keeps the floor until its own gesture stops matching — so a misread
frame can't steal a stroke mid-air.

## Keys

| Key | |
|---|---|
| `?` | gesture codex |
| `D` | diagnostics panel |
| `C` | clear painted trails |
| `M` | toggle sound (off by default) |
| `F` | fullscreen |

## How it works

```
camera → HandLandmarker (30fps) → One Euro filter → features → latches → mode registry → canvas
```

A few decisions carry most of the feel:

- **Detection is decoupled from rendering.** The model runs on real camera frames via
  `requestVideoFrameCallback` (~30 fps) while the render loop runs at rAF (~60 fps). The One
  Euro filters are ticked every render frame, so repeatedly feeding them the latest detection
  smoothly closes the gap — interpolation for free, and no stutter against the video.
- **Mirroring happens in exactly one place** (`Stage.project`). The video is CSS-flipped;
  landmarks arrive un-flipped. Doing that correction twice is the classic bug in this kind of app.
- **No threshold is in pixels.** Everything is a multiple of `span` — the wrist-to-middle-knuckle
  distance — so a pinch reads the same at arm's length and up against the lens.
- **Latches, not raw tests.** `Latch` requires several agreeing frames before it flips and
  refuses to re-fire immediately, and each mode widens its own threshold once engaged. Without
  both, effects strobe when your hand sits on a boundary.

## Tuning

Press `D`. The diagnostics panel shows every scalar the gesture tests read — pinch, openness,
facing, speed, per-finger extension — as live bars, plus which latches are currently satisfied.
Thresholds are judgement calls about human hands; tune them by watching those bars move, not by
guessing constants and reloading.

## Layout

```
src/core/        stage sizing + projection, rAF loop, One Euro filter, palette, math
src/camera.ts    getUserMedia with in-world error messages
src/tracking/    HandLandmarker wrapper, feature extraction, the debounce latch
src/modes/       one file per power + the arbitration registry
src/fx/          particle field, light trails, ambient grid, audio blips
src/hud/         reticles and telemetry, boot sequence, diagnostics
```
