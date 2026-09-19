import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Vite PWA désactivé - on utilise un Service Worker manuel dans public/sw.js
    // VitePWA({
    //   strategies: 'injectManifest',
    //   srcDir: 'src',
    //   filename: 'sw.js',
    //   registerType: 'autoUpdate',
    // })
  ],
})
