import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT || '5173'),
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || '8000'}`,
        changeOrigin: true,
        ws: true
      }
    }
  }
})
