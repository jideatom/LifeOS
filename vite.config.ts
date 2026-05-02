import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/LifeOS/',
  build: {
    rollupOptions: {
      input: 'app.html',
    },
  },
  plugins: [react()],
})
