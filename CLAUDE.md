# Kantahan.app — Pending Work

Kantahan — Follow-up Brief (Session 2 + Release 1.5)
This brief covers five targeted improvements to the existing working app.
Do not restructure or refactor existing working code unless directly required by one of these changes.
Work through each item in order — each is independently testable.
---

Release 1.5 — Songbook Browse View
1. Songbook Browse on Request Screen
Context: Filipino karaoke culture is built around physical songbooks — thick indexed books where people browse by song title or artist name before picking. Users will expect to browse the full library, not just search. This feature adds a classic songbook-style browse experience to the request screen.
Layout
Add a "Songbook" button/tab on the request screen alongside the existing search/random view. Tapping it opens the songbook view.
Two tabs within songbook view:
By Song — full library sorted alphabetically by song title
By Artist — full library sorted alphabetically by artist name
Letter Index (the key feature)
Down the right side of the screen: a vertical strip of letter buttons A–Z plus # (for numbers/symbols).
Tapping a letter jumps the list instantly to that section
Each section has a sticky header showing the letter
Familiar to anyone who has used a physical karaoke songbook
```
┌─────────────────────────────┐
│ [By Song] [By Artist]       │  A
│                             │  B
│ ── A ──────────────────     │  C
│ A Thousand Years            │  D
│   Christina Perri · VEVO    │  E
│ Anak                        │  F
│   Freddie Aguilar · OPM     │  G
│                             │  H
│ ── B ──────────────────     │  ...
│ Baby                        │  Z
│   Justin Bieber · Zoom      │  #
└─────────────────────────────┘
```
Behaviour
By Song tab: sorted by `title`, grouped by first letter of title. Ignore leading "The", "A", "An" for sorting purposes (e.g. "The Beatles" sorts under B).
By Artist tab: sorted by `artist`, grouped by first letter of artist name. Songs with no parsed artist go under #.
Tapping a song: same confirm flow as search — singer name + song confirm sheet → submit request
Letter jump: smooth scroll to section, no full page reload
Performance: virtual scrolling required — 36k songs cannot all be in the DOM. Use `react-virtual` or `react-window`. Load sections on demand as user scrolls.
Back button: returns to main request screen (random browse + search)
API endpoint needed
```
GET /api/library/browse?mode=song|artist&letter=A&limit=50&offset=0
  → Returns songs filtered by first letter of title or artist
  → Sorted alphabetically
  → Paginated

GET /api/library/letters?mode=song|artist
  → Returns array of available first letters in the library
  → e.g. ["#", "A", "B", "C", ...]
  → Used to build the letter index strip (grey out letters with no songs)
```
Notes
Grey out letters in the index strip that have no songs (e.g. X or Z may be empty)
On By Artist tab, if artist field is null/empty for a song, show it under #
The letter strip should always be visible while scrolling — position fixed on the right edge
This is a touch-first UI — letter buttons minimum 32px height, song rows minimum 56px
Consider showing song count per letter in a tiny badge on the letter button (optional but nice)
---
Testing Checklist
After implementing session 2 items, verify:
[ ] Re-index a YouTube channel — non-embeddable videos absent from library, count shown in UI
[ ] Scan local folder with H.265 MKV — file absent from library, shown in skipped list
[ ] Scan local folder with ZIP containing MP3+CDG — appears in library, plays correctly
[ ] Request screen: loads with random songs, search filters list, clear returns to random
[ ] Request screen: tap song → confirm → submitted, confirmation shown
[ ] DJ library tab: search, filter by source, filter by channel, sort all work
[ ] DJ library tab: add to queue with singer name → appears in queue → WebSocket broadcast received by display and request screens
After implementing release 1.5 items, verify:
[ ] Songbook button appears on request screen
[ ] By Song tab: full library visible, sorted A-Z, sticky letter headers
[ ] By Artist tab: full library visible, sorted A-Z by artist, sticky letter headers
[ ] Letter index strip: tapping a letter jumps to correct section instantly
[ ] Letters with no songs are greyed out in the index strip
[ ] Virtual scrolling: 36k songs scroll smoothly without performance issues
[ ] Tapping a song opens confirm sheet → submit request works normally
[ ] Songs with no artist appear under # in By Artist tab
[ ] Leading "The/A/An" ignored for sort order in By Song tab
