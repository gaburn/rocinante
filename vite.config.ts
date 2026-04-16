import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-web-links',
      'd3-force',
      '@tanstack/react-virtual',
      'js-yaml',
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws/terminal': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      }
    }
  }
})
