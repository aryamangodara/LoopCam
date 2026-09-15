/**
 * Fake terminal boot sequence.
 *
 * It is set dressing, but it also does real work: it fills the moment between page load
 * and the camera prompt, and it puts the "nothing leaves this machine" line in front of
 * the user *before* the browser asks for the camera.
 */

interface Line {
  text: string
  /** ms to pause after printing this line. */
  wait?: number
  cls?: 'ok' | 'warn'
}

const SCRIPT: Line[] = [
  { text: 'LOOPCAM BIOS 0.1.0 — cold start', wait: 220 },
  { text: 'mounting /dev/optics ................. ', cls: 'ok', wait: 180 },
  { text: 'loading hand_landmarker.task ......... ', cls: 'ok', wait: 260 },
  { text: 'calibrating gesture lattice .......... ', cls: 'ok', wait: 200 },
  { text: 'particle substrate: adaptive ......... ', cls: 'ok', wait: 180 },
  { text: 'uplink: none. all processing is local. ', cls: 'warn', wait: 320 },
  { text: '', wait: 120 },
  { text: 'OPTICAL SENSOR REQUIRES OPERATOR CONSENT.', wait: 0 },
]

export function runBootSequence(el: HTMLElement, onDone: () => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    el.innerHTML = SCRIPT.map(render).join('\n')
    onDone()
    return
  }

  let i = 0
  let out = ''

  const nextLine = () => {
    if (i >= SCRIPT.length) {
      onDone()
      return
    }
    const line = SCRIPT[i++]
    typeLine(line, () => {
      out += render(line) + '\n'
      el.innerHTML = out
      setTimeout(nextLine, line.wait ?? 140)
    })
  }

  const typeLine = (line: Line, done: () => void) => {
    let c = 0
    const step = () => {
      c += 3
      el.innerHTML = out + render({ ...line, text: line.text.slice(0, c) }) + '<b>_</b>'
      if (c < line.text.length) setTimeout(step, 8)
      else done()
    }
    step()
  }

  nextLine()
}

function render(line: Line): string {
  const t = escapeHtml(line.text)
  if (!t) return ''
  if (line.cls === 'ok') return `${t}<b>[ OK ]</b>`
  if (line.cls === 'warn') return `<i>${t}</i>`
  return `<b>${t}</b>`
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)
}

export const CODEX: ReadonlyArray<{ name: string; how: string }> = [
  { name: 'FRAME FIELD', how: 'Both hands make an L. Frame a rectangle — the inside fills with living colour. Hold steady 1.5s to capture it.' },
  { name: 'LIGHT PAINT', how: 'Pinch thumb to index and move. Pinch harder for a heavier stroke. Thumb-to-middle cycles the palette; a fast open-palm swipe wipes.' },
  { name: 'FORCE PUSH', how: 'Open palm toward the lens to shove the particle field away from you.' },
  { name: 'VORTEX', how: 'Make a fist to pull the field into a spiral. Two fists arc lightning between them.' },
  { name: 'PORTAL', how: 'Both palms open, facing each other, pulled apart. Hold still 2s to stabilise it.' },
  { name: 'SCAN', how: 'Finger gun — index out, thumb up. Sweeps the frame and traces its edges.' },
]

export function fillCodex(list: HTMLElement) {
  list.innerHTML = CODEX.map((c) => `<li><strong>${c.name}</strong>${escapeHtml(c.how)}</li>`).join('')
}
