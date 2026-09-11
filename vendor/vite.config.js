import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/vendor/',
  plugins: [react()],
  server: { port: 5175 },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
