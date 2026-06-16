import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/wf-api': {
        target: 'https://api.webflow.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wf-api/, ''),
      },
    },
  },
})
