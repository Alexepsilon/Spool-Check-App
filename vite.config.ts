import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
//
// `base` is set so the build works correctly when hosted under
// /Spool-Check-App/ on GitHub Pages. Override with `--base=/` if
// hosting at a domain root.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Spool-Check-App/' : '/',
  plugins: [
    react(),
    // Self-signed cert in dev so camera works on LAN URLs (Chrome on Android
    // blocks camera over plain HTTP). Phone will prompt "this site isn't
    // secure" — accept once and proceed.
    ...(mode === 'development' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Spool Check',
        short_name: 'Spool Check',
        description:
          'QC scanner for verifying pipe spool deliveries against transport lists.',
        theme_color: '#1e5f8e',
        background_color: '#f5f7fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Big chunks (xlsx, tesseract) need to be allowed in the precache.
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Tesseract loads its WASM and language data lazily from a CDN at
        // runtime; cache those responses on first hit so OCR works offline
        // after the first online OCR.
        runtimeCaching: [
          // Tesseract WASM + traineddata.
          //
          // NetworkFirst (not CacheFirst): try the network, fall back
          // to cache only when offline. Avoids the trap where a broken
          // or partial first download is cached forever.
          {
            urlPattern: /tesseract|tessdata|traineddata/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tesseract-cdn-v2',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
        // Force a clean activation so old service workers don't keep
        // serving stale Tesseract bundles after a deploy.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false, // PWA features only in production build
      },
    }),
  ],
  server: {
    host: true, // listen on 0.0.0.0 so phones on LAN can connect
    port: 5173,
  },
  build: {
    sourcemap: false,
    target: 'es2020',
  },
}));
