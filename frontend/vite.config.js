import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api/* is forwarded to the Python backend, so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
