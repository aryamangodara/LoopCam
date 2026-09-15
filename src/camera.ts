/** Camera acquisition with error messages written in-world rather than as stack traces. */

export class CameraError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message)
    this.name = 'CameraError'
  }
}

const DIAGNOSIS: Record<string, { message: string; hint: string }> = {
  NotAllowedError: {
    message: 'Camera access was denied.',
    hint: 'Click the camera icon in the address bar and allow access, then retry. LoopCam never uploads or records anything — the feed stays in this tab.',
  },
  NotFoundError: {
    message: 'No camera was detected on this machine.',
    hint: 'Connect a webcam and retry.',
  },
  NotReadableError: {
    message: 'The camera is held by another application.',
    hint: 'Close Zoom, Teams, OBS or any other tab using the camera, then retry.',
  },
  OverconstrainedError: {
    message: 'The camera cannot supply the requested video format.',
    hint: 'Retry — LoopCam will fall back to whatever resolution the device offers.',
  },
  SecurityError: {
    message: 'The browser blocked camera access on this origin.',
    hint: 'Cameras require https:// or localhost. Open the dev server URL directly.',
  },
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      'This browser has no camera API.',
      'Use a current Chrome, Edge, Firefox or Safari.',
    )
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })
  } catch (err) {
    const name = (err as DOMException)?.name ?? ''
    if (name === 'OverconstrainedError') {
      // Second chance with no constraints at all before giving up.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        return await attach(video, stream)
      } catch { /* fall through to the diagnosis below */ }
    }
    const d = DIAGNOSIS[name] ?? {
      message: 'The camera could not be opened.',
      hint: (err as Error)?.message ?? 'Unknown device error.',
    }
    throw new CameraError(d.message, d.hint)
  }

  return attach(video, stream)
}

async function attach(video: HTMLVideoElement, stream: MediaStream): Promise<MediaStream> {
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()

  // videoWidth is 0 until metadata lands; everything downstream needs real dimensions.
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      const done = () => { video.removeEventListener('loadedmetadata', done); resolve() }
      video.addEventListener('loadedmetadata', done)
      setTimeout(done, 3000)
    })
  }
  return stream
}
