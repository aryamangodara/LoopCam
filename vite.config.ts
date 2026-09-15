import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
  // The MediaPipe wasm + .task model are vendored into public/ by scripts/fetch-assets.mjs
  // so the app runs with no network connection.
})
