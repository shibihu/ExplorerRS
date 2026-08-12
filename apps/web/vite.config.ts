import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Bind to 0.0.0.0 so GitHub Codespaces port forwarding can reach the dev server
    host: true,
    // Keep a stable port so the forwarded port always matches (5173)
    port: 5173,
    strictPort: true,
    // Allow GitHub Codespaces forwarded hostnames, e.g. yourname-5173.app.github.dev
    allowedHosts: [".app.github.dev"],
  },
})
