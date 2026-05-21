# Kantahan

[![Support me on Ko-fi](https://storage.ko-fi.com/cdn/brandasset/v2/support_me_on_kofi_blue.png)](https://ko-fi.com/stephancraane)

**Kantahan.app** — self-hosted karaoke app. Electron desktop shell + Express backend + three React frontends.

## Quick start

```bash
npm install
npm run dev
```

Opens four processes:
- Express server → `http://localhost:3000`
- Display screen → `http://localhost:3001` (TV)
- DJ remote → `http://localhost:3002`
- Singer request → `http://localhost:3003`

In production the Express server serves all three apps. Electron opens the Display screen fullscreen.

## Setup

1. Copy `.env.example` to `.env` and adjust if needed.
2. In the DJ remote, open **Settings → YouTube → API Key** and paste your YouTube Data API v3 key.
3. Add karaoke channels via the Channels tab (step 10).

## Build & run (production)

```bash
npm run build   # Vite builds all three React apps to dist/
npm start       # Electron launcher
```

## Windows note

`better-sqlite3` is a native module. When running under Electron you need to rebuild it against Electron's Node version:

```bash
npx @electron/rebuild
```

Run this once after `npm install` if you plan to use `npm start` (Electron mode). Not needed for `npm run dev`.

## Implementation progress

- [x] Step 1 — Scaffold (Electron + Express + SQLite + WebSocket + 3 React apps)
- [ ] Step 2 — WebSocket state (connected; expanding in subsequent steps)
- [ ] Step 3 — Display screen (YouTube IFrame player + fullscreen)
- [ ] Step 4 — DJ remote playback controls
- [ ] Step 5 — DJ remote session toggles
- [ ] Step 6 — Song-end → countdown → next-song flow
- [ ] Step 7 — Singer request screen (search wired; needs song library)
- [ ] Step 8 — Request inbox on DJ remote
- [ ] Step 9 — Queue drag-reorder
- [ ] Step 10 — YouTube channel indexing
- [ ] Step 11 — Local file support (MP3+CDG, MKV/MP4)
- [ ] Step 12 — Background music
- [ ] Step 13 — Polish (QR codes, error handling, codec warnings)
