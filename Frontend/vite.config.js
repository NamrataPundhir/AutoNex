// Frontend/vite.config.js
// Fixes: Speech recognition "network" error on localhost
// Fixes: WebSocket proxy so /ws/* routes hit the backend

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // ── Proxy API + WebSocket calls to FastAPI backend ─────────────
    proxy: {
      '/api': {
        target:    'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target:    'ws://localhost:8000',
        ws:        true,          // ← critical for WebSocket proxy
        changeOrigin: true,
      },
    },
  },
})