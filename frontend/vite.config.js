import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Proxying /api to Django in dev means the browser sees same-origin
// requests, so no CORS setup is needed on the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    globals: true,
  },
})
