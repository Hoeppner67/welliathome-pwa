import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { precacheWorker } from './build/precacheWorker.mjs'

export default defineConfig({
  plugins: [react(), precacheWorker()],
  base: '/',
})
