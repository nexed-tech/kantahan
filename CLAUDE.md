# Kantahan.app — Pending Work

Release 1.6 — Settings: Close Behaviour ✓ DONE
Add a "When closing the window" option to the DJ app settings screen.

Options:
  • Quit Kantahan (default) — current behaviour; closes window and kills the server
  • Minimise to tray — hides the window, keeps the server running, adds a system tray icon with "Show DJ Screen" / "Quit Kantahan" menu items and a one-time balloon hint on first hide

Implementation notes:
- Store the preference in Electron's `app.getPath('userData')/settings.json` (same pattern as other settings, or create it if none exists yet)
- The main process reads the setting at startup; the renderer can update it via an `ipcRenderer.invoke('set-setting', key, value)` / `ipcMain.handle` pair
- Tray setup (icon, context menu, double-click to restore) lives in `electron/main.js` and is only initialised when the setting is active
- Default value: `'quit'`

Testing checklist:
[ ] Default: closing window quits the app fully (no processes left in Task Manager)
[ ] Switch to "minimise to tray": closing window hides it; tray icon appears in system tray
[ ] Tray icon right-click → "Show DJ Screen" restores the window
[ ] Tray icon right-click → "Quit Kantahan" exits fully
[ ] First hide shows a balloon notification; subsequent hides do not
[ ] Switching back to "quit" and closing the window exits fully; tray icon is gone
[ ] Setting persists across app restarts

---

Release 1.7 — Settings: Collapse Configured Sections ✓ DONE
Once a setting block has been fully configured, collapse it to a single summary line so the Settings screen doesn't grow endlessly. Start with the YouTube API key block.

YouTube API key block
- When no key is set: show the current full UI (label, input, save button, status message) — no change
- When a key IS set: collapse to a single row:
  `● YouTube API key  ·  configured    [⚙]`
  Clicking the ⚙ cog icon expands the block back to the full UI (input pre-cleared for security, same save/clear flow as today)
- Collapsed state re-evaluates on mount based on the API key status fetched from `GET /api/settings/youtube-api-key/status`
- Expanding the cog also shows a "Remove key" / clear button so the user can revoke without having to type anything

Apply the same collapsible pattern to any other setting block that benefits from it (DJ PIN, local media folder once scanned, etc.) — use the same `⚙` toggle convention throughout so the UI is consistent.

Testing checklist:
[ ] Settings opens with key set → YouTube block shows single summary line
[ ] Settings opens with no key → YouTube block shows full input UI
[ ] Clicking ⚙ with key set → block expands to full input UI
[ ] Saving a new key via the expanded UI → block collapses back to summary line
[ ] "Remove key" in expanded UI clears the key → block returns to full input UI
[ ] Same collapsed/expand behaviour works for DJ PIN once a PIN is set

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
