# Spool Check

Field-ready PWA for QC engineers to verify pipe spool deliveries against transport lists. Scan fabricator tags with the camera (or a still photo); the app finds the matching row in the imported master list and ticks it. Every scan that doesn't match goes onto an Uncharted list with one-tap disposition. Fully offline-capable after first install.

## Stack

- Vite + React + TypeScript + Tailwind CSS
- IndexedDB (via `idb`) for offline persistence
- SheetJS for Excel/CSV import
- Tesseract.js for OCR (Latin + Dutch)
- vite-plugin-pwa for service worker, manifest, install-to-home-screen
- HashRouter for routing (works on GitHub Pages without rewrites)

## Run locally

```sh
npm install
npm run dev -- --host
```

The dev server uses self-signed HTTPS so the camera works from a phone on the same wifi. Open the `Network:` URL on your phone in Chrome, accept the certificate warning, and the app loads.

## Build & deploy

`git push origin main` triggers `.github/workflows/deploy.yml` which builds and publishes to GitHub Pages. After the first push, the app is live at:

> https://Alexepsilon.github.io/Spool-Check-App/

One-time repo setup (Settings → Pages): set Source to **GitHub Actions**.

## Reliability notes

- Every confirmed scan is appended to the `scans` store BEFORE the corresponding `master_items` row is updated. If the app crashes mid-scan we still have a record.
- Persistent storage is requested at boot so the browser doesn't evict our IndexedDB under low-disk pressure.
- Settings → Backup exports the entire database as JSON for safekeeping.
- Frame consensus: 3 consecutive OCR frames must agree on the same `(drawing, spool)` before a scan is committed.
- Partial-match dialog: when only the drawing reads cleanly, user picks the spool letter from a small list — never silently dropped.
