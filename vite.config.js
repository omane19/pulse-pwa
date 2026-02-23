import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base path: '/' for local dev, '/pulse-pwa/' for GitHub Pages
// Change 'pulse-pwa' to match your actual GitHub repo name
const base = process.env.GITHUB_ACTIONS ? '/pulse-pwa/' : '/'

export default defineConfig({
  base,
  server: {
    open: true,
    port: 5173,
    host: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'PULSE · Market Intelligence',
        short_name: 'PULSE',
        description: 'Real-time market signals, 6-factor scoring, credibility-weighted news',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/finnhub\.io\/api/,
            handler: 'NetworkFirst',
            options: { cacheName: 'finnhub-cache', expiration: { maxAgeSeconds: 60 } }
          },
          {
            urlPattern: /^https:\/\/www\.alphavantage\.co\/query/,
            handler: 'NetworkFirst',
            options: { cacheName: 'av-cache', expiration: { maxAgeSeconds: 3600 } }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxAgeSeconds: 86400 * 30 } }
          }
        ]
      }
    })
  ]
})
