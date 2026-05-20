# Kantahan.app — Design Exports

A self-hosted karaoke app for home parties. Vibe: warm, celebratory, 80s neon
meets a Tokyo/Amsterdam karaoke bar wall — deep purple-black with hot pink,
electric purple, and amber gold accents.

## What's in here

```
exports/
├─ logos/      Seven logo direction explorations
│  ├─ 01-marquee-primary.png    ← Primary mark. Use this.
│  ├─ 02-eq-baseline.png
│  ├─ 03-cli-lockup.png
│  ├─ 04-neon-tube.png
│  ├─ 05-vinyl-badge.png
│  ├─ 06-inline-eq.png
│  └─ 07-cassette-pill.png      ← Secondary mark / badge / app icon
├─ context/    Logo in applied contexts
│  ├─ 01-favicon-set.png
│  ├─ 02-browser-header.png
│  ├─ 03-reversed-on-color.png
│  └─ 04-matchbook-print.png
└─ screens/    The three product surfaces + landing page
   ├─ 01-tv-display.png          1280×720 — what plays on the TV
   ├─ 02-dj-remote.png           1200×780 — host control panel
   ├─ 03-phone-request.png       360×780 — guest QR request flow
   └─ 04-landing-page.png        1280×2640 — kantahan.app marketing site
```

## Brand tokens

| Token            | Value     |
|------------------|-----------|
| `--bg`           | `#0a0612` |
| `--ink`          | `#f5ecff` |
| `--ink-dim`      | `#b9a5d4` |
| `--c1` hot pink  | `#ff2d92` |
| `--c2` purple    | `#a855f7` |
| `--c3` amber     | `#ffb627` |

## Type system

- **Display** — Big Shoulders Display, weights 700–900, font-stretch 125%
  (wide condensed). Used for wordmarks, page headlines, song titles.
- **Mono** — JetBrains Mono, 500–700. Used for the `.app` chip, room codes,
  metadata labels ("NOW SINGING", "UP NEXT"), terminal/CLI accents.
- **Body** — Inter 400–600. Everything else.

## Notes for handoff

- The primary lockup ("kantahan" + round `.app` sticker + horizontal VU meter
  before the K + "A B-SIDE · TRACK 01 · HOME KARAOKE" subtext) is the
  workhorse. The cassette-pill mark is the secondary — use it for app icons,
  merch, footers.
- The TV display background is the deep purple base with subtle stage-light
  haze + a faint grid overlay; it works behind video without competing.
- All glow/neon effects scale with a `--glow` variable so they can be turned
  up or down per surface.

The original HTML source for everything (with live tweaks for palette,
intensity, and font) is at `Kantahan Logo Exploration.html` in the project.
