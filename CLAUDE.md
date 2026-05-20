# Kantahan.app — Follow-up Brief (Session 2)

This brief covers five targeted improvements to the existing working app.
Do not restructure or refactor existing working code unless directly required by one of these changes.
Work through each item in order — each is independently testable.

---

## 1. YouTube Embedding Check During Indexing

**Problem:** Some YouTube videos have embedding disabled. They are currently added to the library but fail silently on playback.

**Fix:** During channel indexing, filter out non-embeddable videos before inserting into the `songs` table.

### Implementation

The YouTube Data API `videos` endpoint returns an `embeddable` boolean in the `status` object. This is already available during indexing — it just needs to be checked.

When fetching video details during indexing, include `status` in the `part` parameter:
```
part=snippet,contentDetails,status
```

Before upserting each video into `songs`, check:
```javascript
if (!video.status.embeddable) {
  skippedCount++;
  continue;
}
```

At the end of indexing, include skipped count in the progress broadcast:
```json
{
  "type": "indexing_complete",
  "channel_id": "...",
  "indexed": 342,
  "skipped_non_embeddable": 18
}
```

Show this on the DJ screen indexing progress UI: `"Indexed 342 songs, skipped 18 (embedding disabled)"`

Also add an `embeddable` column to the `songs` table (boolean, default true) for any existing records, and backfill on next re-index.

---

## 2. H.265/HEVC Local File Detection and Skip

**Problem:** Local `.mkv` files encoded with H.265/HEVC are added to the library but won't play in Chromium (Electron). They should be detected and excluded during scanning.

**Fix:** Use `ffprobe` to detect video codec during local file scanning. Skip H.265 files and log them.

### Implementation

During local file scanning in `server/services/localFiles.js`, for each `.mkv` or `.mp4` file, run ffprobe before adding to the library:

```javascript
const { execSync } = require('child_process');

function getVideoCodec(filePath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
      { timeout: 5000 }
    ).toString().trim();
    return result; // e.g. 'hevc', 'h264', 'vp9'
  } catch (e) {
    return null; // ffprobe not available or file unreadable
  }
}
```

Skip logic:
```javascript
const codec = getVideoCodec(filePath);
if (codec === 'hevc' || codec === 'h265') {
  skippedFiles.push({ path: filePath, reason: 'H.265/HEVC not supported' });
  continue;
}
if (codec === null) {
  // ffprobe unavailable — skip all MKV files with a warning
  skippedFiles.push({ path: filePath, reason: 'Could not detect codec (ffprobe unavailable)' });
  continue;
}
```

After scanning, broadcast skipped file list to DJ screen:
```json
{
  "type": "scan_complete",
  "indexed": 145,
  "skipped": [
    { "path": "/media/song.mkv", "reason": "H.265/HEVC not supported" }
  ]
}
```

DJ screen should show a collapsible "Skipped files" section after scanning so the DJ knows what's missing and why.

**ffprobe availability:** Use the `fluent-ffmpeg` + `ffprobe-static` npm packages instead of shelling out to a system ffprobe binary. `ffprobe-static` bundles a prebuilt ffprobe binary and exposes its path; `fluent-ffmpeg` provides the Node.js API wrapper. This means users do not need ffmpeg installed on their machine — the binary is shipped with the app.

```javascript
const ffprobe = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
ffprobe.setFfprobePath(ffprobeStatic.path);
```

Remove the `execSync` approach and the startup warning about missing ffprobe — it will always be available.

---

## 3. MP3+CDG in ZIP Support

**Problem:** Many karaoke packs are distributed as ZIP files containing a matching `.mp3` and `.cdg` file pair. These are currently ignored during local file scanning.

**Fix:** During scanning, detect ZIP files containing a valid MP3+CDG pair and treat them as a single song entry.

### Implementation

Use the `adm-zip` npm package.

During local file scanning, when a `.zip` file is encountered:

```javascript
const AdmZip = require('adm-zip');

function extractCdgPairFromZip(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries().map(e => e.entryName.toLowerCase());
    
    const mp3 = entries.find(e => e.endsWith('.mp3'));
    const cdg = entries.find(e => e.endsWith('.cdg'));
    
    if (!mp3 || !cdg) return null;
    
    // Check they have matching base names
    const mp3Base = mp3.replace('.mp3', '');
    const cdgBase = cdg.replace('.cdg', '');
    if (mp3Base !== cdgBase) return null;
    
    return { mp3EntryName: mp3, cdgEntryName: cdg };
  } catch (e) {
    return null;
  }
}
```

If a valid pair is found, add the song to the library with `file_type = 'mp3cdg_zip'` and `file_path` pointing to the ZIP file. Store the internal entry names in a new `zip_mp3_entry` and `zip_cdg_entry` column on the `songs` table.

### Playback

On playback of a `mp3cdg_zip` song, extract both files to a temp directory on demand:

```javascript
const os = require('os');
const path = require('path');

function extractZipPairToTemp(zipPath, mp3Entry, cdgEntry) {
  const zip = new AdmZip(zipPath);
  const tempDir = path.join(os.tmpdir(), 'karaoke-' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });
  
  zip.extractEntryTo(mp3Entry, tempDir, false, true);
  zip.extractEntryTo(cdgEntry, tempDir, false, true);
  
  return {
    mp3Path: path.join(tempDir, path.basename(mp3Entry)),
    cdgPath: path.join(tempDir, path.basename(cdgEntry)),
    tempDir
  };
}
```

Serve the extracted files via Express for the duration of playback. Clean up the temp directory on song end or app exit.

Add `zip_mp3_entry` and `zip_cdg_entry` columns to the `songs` table migration.

---

## 4. Singer Request Screen — Browse + Search UI

**Problem:** The request screen currently only has a search field. Singers land on an empty screen with no discovery.

**Fix:** Redesign the request screen with a random song selection visible by default, transitioning smoothly to search results as the singer types.

### Layout

```
┌─────────────────────────────┐
│  Your name                  │  ← name field (persisted in localStorage)
│  [                        ] │
│                             │
│  Song request               │  ← search/filter field
│  [                        ] │
│                             │
│  ── Suggested songs ──      │  ← label changes to "Results" when searching
│                             │
│  [thumbnail] Title          │
│             Artist · Channel│
│                             │
│  [thumbnail] Title          │
│             Artist · Channel│
│  ...                        │
└─────────────────────────────┘
```

### Behaviour

**Default state (no search text):**
- Show a random selection of songs from the library (20-30 songs)
- Label above list: "Suggested songs"
- Randomised fresh on each page load — not cached between visits
- Fetch via: `GET /api/library/random?limit=25`

**Typing state (2+ characters in search field):**
- Debounce 300ms before firing search
- Replace list with search results
- Label above list: "Results"
- Smooth crossfade transition between random list and results (150ms opacity fade)
- Show "No results found" state if empty

**Clear field:**
- Return to random selection
- Same crossfade transition back

**Tap a song (either state):**
- Show confirm sheet/modal: singer name + song title
- "Request this song" button
- On submit: POST to `/api/requests`, show confirmation, clear song field, return to random browse state

### API endpoints needed

```
GET /api/library/random?limit=25
  → Returns 25 randomly selected songs from songs table
  → ORDER BY RANDOM() LIMIT 25

GET /api/library/search?q=term&limit=50
  → Full text search on title, artist columns
  → Min 2 characters
  → Returns max 50 results
```

### Component notes

- Use virtual scrolling if list exceeds 100 items (react-virtual or similar)
- Song rows must be large touch targets — minimum 64px height
- Thumbnail 48x48, rounded corners
- Show channel name in muted text below artist
- No hover states needed — this is a touch screen

---

## 5. DJ Screen — Song Library Browser

**Problem:** The DJ has no way to browse the full song library or add songs to the queue directly without going through the request flow.

**Fix:** Add a "Library" tab to the DJ remote with a full browsable song list and direct queue-add capability.

### Layout

New tab in DJ remote navigation: **Library**

```
┌─────────────────────────────────────────────────┐
│  [Search...              ]  Source ▾  Channel ▾ │  ← filter bar
│  Sort: Title · Artist · Recently added          │  ← sort pills
│                                                 │
│  [thumb] Title                    [+ Queue]     │
│          Artist · Channel · YT                  │
│                                                 │
│  [thumb] Title                    [+ Queue]     │
│          Artist · Channel · Local               │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

### Features

**Search:** Same debounced search as request screen, no minimum character limit for DJ (they know what they're looking for)

**Filters:**
- Source: All / YouTube / Local
- Channel: All / [list of indexed channels]

**Sort options:**
- Title (A–Z)
- Artist (A–Z)
- Recently added (default)

**Add to queue:**
- Each row has `[+ Queue]` button
- Tapping opens a small inline input: "Singer name?" with a confirm button
- On confirm: adds directly to queue (bypasses request/approval flow entirely)
- Shows brief success state on the row ("Added ✓") then resets

**Shared component:**
Build a shared `SongList` React component in `client/shared/SongList.jsx` used by both screens.
Accept a `mode` prop: `'request'` | `'dj'`
- `'request'` mode: tap row → confirm sheet → submit request
- `'dj'` mode: tap row or `[+ Queue]` button → singer name prompt → add to queue directly

### API endpoints needed

```
GET /api/library?q=&source=&channel_id=&sort=recent&limit=50&offset=0
  → Paginated, filterable, sortable library query
  → All params optional

POST /api/queue/add-direct
  Body: { song_id, singer_name }
  → Adds directly to queue, respects singer_rotation setting
  → Returns updated queue state
  → Broadcasts queue update via WebSocket
```

### Notes

- Pagination: load 50 at a time, infinite scroll to load more
- Virtual scrolling required — library could be thousands of songs
- Filter/sort state persisted in component state (not URL) — DJ doesn't need to share or bookmark library views
- The singer name prompt when adding to queue should remember the last name entered (useful when DJ is adding multiple songs for one singer)

---

---

## 6. mDNS Discovery + Custom Host URL Override

**Problem:** The server auto-detects the local IP via `os.networkInterfaces()` but picks up whichever interface comes first — this grabbed the Tailscale IP (100.x.x.x range) instead of the LAN IP. IP addresses also change with DHCP, making QR codes stale.

**Fix:** Use mDNS (Bonjour) as the default so the app is reachable at `http://kantahan.local:3000` regardless of IP. Keep a manual `host_url` override for edge cases.

### mDNS (default)

Use the `bonjour-service` npm package (pure JS, no native deps) to advertise the KTV service on the local network:

```javascript
const Bonjour = require('bonjour-service');
const bonjour = new Bonjour();
bonjour.publish({ name: 'Kantahan', type: 'http', port: PORT });
```

This makes the server reachable at `http://kantahan.local:3000` on any device with mDNS support:
- ✅ macOS, iOS — native Bonjour
- ✅ Windows 10 1903+ — built-in mDNS
- ✅ Android 12+ — native mDNS
- ⚠️ Older Android / Linux — may need Avahi or manual IP fallback

`GET /api/info` should return `http://kantahan.local:3000` as the default base URL when no `host_url` override is set, instead of the raw IP. The mDNS hostname is also configurable (default: `kantahan`) via a `mdns_name` setting — changing it re-publishes the Bonjour service under the new name.

### Fallback: IP auto-detection improvement

Keep IP detection as a fallback for devices that don't support mDNS. Improve it to skip known VPN/tunnel ranges:

```javascript
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('100.')) continue; // Tailscale CGNAT range
      if (net.address.startsWith('172.')) continue; // Docker bridge ranges
      return net.address;
    }
  }
  return 'localhost';
}
```

### Manual override

Add a `host_url` setting (e.g. `http://192.168.1.50:3000`). When set, `GET /api/info` uses it instead of mDNS or auto-detection. Useful for Docker deployments or networks that block mDNS.

- Add `host_url: ''` and `mdns_name: 'kantahan'` to default settings in `server/db.js`
- Update `GET /api/info` priority: `host_url` → mDNS hostname → IP auto-detect
- Add a "Host URL override" field in DJ Settings under the Network section with a note: "Leave blank to use kantahan.local (recommended)"

---

## 7. Local File Scan — Progress Feedback

**Problem:** The local file scan runs synchronously and returns only a count when done. With ffprobe calls per video file (item 2), this will take noticeable time with no feedback.

**Fix:** Mirror the YouTube indexing pattern — add a `scanning` object to WS state and broadcast progress.

### WS state addition

```javascript
scanning: {
  active: false,
  processed: 0,
  total: null,       // null = unknown until walk completes
  skipped: [],       // [{ path, reason }] — populated by ffprobe skips (item 2)
  error: null,
}
```

### Implementation

- `POST /api/media/scan` becomes async: respond immediately with `{ ok: true }`, run scan in background
- Broadcast `scanning.active = true` at start; update `scanning.processed` periodically (every 10 files or so to avoid flooding)
- On completion broadcast `scanning.active = false` with final counts and skipped list
- In DJ Settings, replace the current "Found N files" label with a live progress indicator matching the YouTube indexing progress bar style
- Show collapsible "Skipped files" list after scan if `skipped.length > 0` (each entry shows filename + reason)

---

## 8. Docker Support

**Problem:** Currently requires Node.js 22+ and manual setup on the host machine.

**Fix:** Add a `Dockerfile` and `docker-compose.yml` so the server can run containerised on any machine with Docker.

### Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --workspace=server --omit=dev
COPY server ./server
EXPOSE 3000
ENV NODE_OPTIONS=--experimental-sqlite
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
```

The React clients are pre-built and served as static files — add a build step or document that `dist/` must be built first and copied in.

### docker-compose.yml

```yaml
services:
  kantahan:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data          # SQLite DB persistence
      - ${MEDIA_PATH:-/media}:/media/karaoke  # local karaoke files
    environment:
      - PORT=3000
      - NODE_ENV=production
    restart: unless-stopped
```

### Security note

All three screens (`/display`, `/dj`, `/request`) are served on the same port with no authentication. Anyone who knows the URL can open the DJ remote. For a private home network this is acceptable, but consider adding a simple 4-digit PIN to the `/dj` route in a future session. See also item 10 for display screen registration.

### Notes

- The `host_url` override (item 6) is essential here — the container's internal IP is meaningless for QR codes; users must set `host_url` to the host machine's LAN IP
- `LOCAL_MEDIA_PATH` in the DB should be set to `/media/karaoke` (the mount point) after container start
- Electron shell does not run in Docker — document that the Docker path is server-only; open `http://<host-ip>:3000/display` in a browser on the TV machine

---

## 9. Display Screen — QR Visibility Fix + Configurable Message Overlay

### Part A: QR always visible during background video

**Problem:** The request QR code is missing from the display when the background video is playing. The large central QR in `IdleScreen` is present but gets visually lost. Add a persistent corner QR (matching the style used during `mode === 'playing'`) that shows during `idle` and `between` modes regardless of whether background video is active.

**Fix:** In `client/display/src/App.jsx`, add a corner QR that renders whenever `mode !== 'playing'`:

```jsx
{mode !== 'playing' && requestUrl && (
  <div className="absolute bottom-6 right-6 bg-white rounded-xl p-2 opacity-80 z-10">
    <QrImg url={requestUrl} size={100} />
  </div>
)}
```

Keep the large centre QR in `IdleScreen` as-is. The corner QR is the always-present fallback.

---

### Part B: Configurable message overlay

**Problem:** During idle/between/background-video modes, the display shows no venue-specific messaging.

**Fix:** DJ-configurable text overlay shown on the display. Supports static or scrolling text, configurable position, and quick-select predefined messages.

#### New settings (DB + WS state)

```
display_message         TEXT    — the message text (empty = hidden)
display_message_active  TEXT    — 'true'/'false'
display_message_position TEXT   — 'top' | 'center' | 'bottom'  (default: 'bottom')
display_message_scroll  TEXT    — 'true'/'false' (default: 'false')
```

Broadcast in WS state under `display_message: { active, text, position, scroll }`.

#### Display rendering

Show the message when `display_message.active` is true and `mode !== 'playing'` (don't overlay over karaoke):

```jsx
{display_message.active && display_message.text && mode !== 'playing' && (
  <MessageOverlay message={display_message} />
)}
```

**Static:** Large semi-transparent white text with drop-shadow, positioned at top/center/bottom of the screen.

**Scrolling:** CSS `marquee`-style horizontal scroll using a keyframe animation (`translateX(100vw)` → `translateX(-100%)`) — no JS needed. Speed should be proportional to text length so short and long messages take the same time to cross.

Position mapping:
- `top` → `absolute top-8 inset-x-0`
- `center` → `absolute inset-0 flex items-center`
- `bottom` → `absolute bottom-8 inset-x-0` (above the corner QR)

Text style: `text-3xl font-bold text-white/90 drop-shadow-xl px-8`

#### DJ controls (new card in main DJ view, below BgMusicCard)

```
┌─────────────────────────────────────┐
│ Display message              [ON/OFF]│
│                                     │
│ [Get a drink! 🍺] [Request a song!] │  ← predefined quick-select chips
│ [Taking a break] [Karaoke night! 🎤]│
│                                     │
│ [Custom text input field          ] │
│                                     │
│ Position: [Top] [Center] [Bottom▪] │
│ [_] Scrolling                       │
└─────────────────────────────────────┘
```

Predefined messages (hardcoded chips — selecting one fills the text field):
- "Get a drink! 🍺"
- "Request a song! 📱"
- "Taking a short break ☕"
- "Karaoke night! 🎤"
- "Sign up at the bar!"

Selecting a chip immediately activates the message (sets `display_message_active = true` and broadcasts). Editing the custom field updates live (debounced 500ms). Toggling off hides without clearing the text.

---

---

## 10. Display Screen Registration + DJ PIN

### Part A: Active display registration

**Problem:** Nothing prevents multiple devices from opening `/display` simultaneously. If two YouTube players both receive the same `player_command`, they both try to load/play the video — duplicate audio, race conditions, chaos.

**Fix:** The server tracks which WebSocket client is the registered "active display". Only that client receives `player_command` messages. All other clients receive full state updates (queue, mode, etc.) but `player_command` is stripped out — they render as passive viewers.

### Implementation

When a WebSocket connection opens, the client sends an identify message:
```json
{ "type": "IDENTIFY", "role": "display" | "dj" | "request" }
```

The server tracks connected clients with their role. When `setState` broadcasts a `player_command`, only the active display client receives it:

```javascript
// In ws.js broadcast:
wss.clients.forEach((client) => {
  if (client.readyState !== 1) return;
  if (msg includes player_command && client !== activeDisplayClient) {
    // Strip player_command before sending to non-display clients
    const stripped = { ...state, player_command: null };
    client.send(JSON.stringify({ type: 'STATE_UPDATE', state: stripped }));
  } else {
    client.send(JSON.stringify({ type: 'STATE_UPDATE', state }));
  }
});
```

Registration is first-connect-wins: the first WebSocket connection that identifies as `display` becomes the active display. If it disconnects, the next one that connects and identifies takes over.

The DJ remote shows a "Display" indicator in the header:
- 🟢 Display connected (active)
- 🔴 No display connected
- 🟡 Display connected (passive — a second `/display` tab is open)

The DJ can manually reassign the active display (useful if the TV browser was refreshed and a second connection took over incorrectly).

### Part B: DJ screen PIN

**Problem:** Anyone on the network who knows (or guesses) the `/dj` URL has full DJ control.

**Fix:** Simple 4-digit PIN stored as a hashed setting. The DJ screen shows a PIN entry overlay on first load (and after inactivity timeout). PIN is set in the DJ Settings panel.

- Default: no PIN set (open access — maintains current behaviour until DJ sets one)
- PIN stored as bcrypt hash in the `settings` table under key `dj_pin_hash`
- On correct entry: store a session token in `localStorage`, valid for 8 hours
- On incorrect entry: 3-second lockout, max 5 attempts then 60-second cooldown
- Settings panel shows "Set DJ PIN" / "Change PIN" / "Remove PIN"
- The PIN overlay is client-side only — the API endpoints themselves are not additionally protected (they're on a private LAN; this is UX protection not security hardening)

---

## Database Migrations

Add these columns to existing tables (use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`):

```sql
-- songs table additions
ALTER TABLE songs ADD COLUMN IF NOT EXISTS embeddable INTEGER DEFAULT 1;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS zip_mp3_entry TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS zip_cdg_entry TEXT;

-- Update file_type enum to include 'mp3cdg_zip'
-- (no migration needed, it's a text field)
```

New default settings to seed in `server/db.js`:

```javascript
host_url: '',
display_message: '',
display_message_active: 'false',
display_message_position: 'bottom',
display_message_scroll: 'false',
```

Run all migrations on app startup in `server/db.js` before anything else.

---

## Testing Checklist

After implementing, verify:

- [ ] Re-index a YouTube channel — non-embeddable videos absent from library, count shown in UI
- [ ] Scan local folder with H.265 MKV — file absent from library, shown in skipped list
- [ ] Scan local folder with ZIP containing MP3+CDG — appears in library, plays correctly
- [ ] Request screen: loads with random songs, search filters list, clear returns to random
- [ ] Request screen: tap song → confirm → submitted, confirmation shown
- [ ] DJ library tab: search, filter by source, filter by channel, sort all work
- [ ] DJ library tab: add to queue with singer name → appears in queue → WebSocket broadcast received by display and request screens
- [ ] Tailscale IP no longer selected by auto-detect; LAN IP used instead
- [ ] host_url override set in Settings → QR codes and URLs update immediately via WS
- [ ] Local scan shows live progress; skipped files listed after completion
- [ ] Docker: container starts, DB persists across restarts, media volume accessible
- [ ] QR visible in display corner during background video playback
- [ ] Display message: chip select activates message instantly; custom text debounces 500ms; position and scroll toggles work; message hidden during karaoke playback
