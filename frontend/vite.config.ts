import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Listen on all interfaces so the tunnel can reach it
    proxy: {
      '/api': {
        target: 'http://backend-dev:8000', // Point to the docker container
        changeOrigin: true,
      },
    },
  },
})
