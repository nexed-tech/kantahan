// Uses Node.js built-in sqlite (v22.5+) — no native compilation needed.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'karaoke.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode=WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    source TEXT NOT NULL,
    channel_id TEXT,
    channel_name TEXT,
    duration_seconds INTEGER,
    thumbnail_url TEXT,
    file_path TEXT,
    file_type TEXT,
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    last_indexed DATETIME,
    video_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT NOT NULL,
    singer_name TEXT NOT NULL,
    position INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id TEXT NOT NULL,
    singer_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Column migrations — wrapped in try/catch since ADD COLUMN fails if column exists
try { db.exec('ALTER TABLE songs ADD COLUMN embeddable INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE songs ADD COLUMN zip_mp3_entry TEXT'); } catch {}
try { db.exec('ALTER TABLE songs ADD COLUMN zip_cdg_entry TEXT'); } catch {}

const defaultSettings = {
  auto_approve: 'false',
  singer_rotation: 'true',
  auto_play: 'true',
  auto_queue: 'true',
  auto_start: 'false',
  countdown_seconds: '10',
  background_music_source: 'youtube',
  background_music_url: '',
  background_music_local_path: '',
  local_media_path: '',
  youtube_api_key: '',
  host_url: '',
  mdns_name: 'kantahan',
  display_message: '',
  display_message_active: 'false',
  display_message_position: 'bottom',
  display_message_scroll: 'false',
};

const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertDefault.run(key, value);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// Seed default karaoke channels on first install (pending_ prefix = not yet resolved via API)
const DEFAULT_CHANNELS = [
  { url: 'https://www.youtube.com/@youtubekaraokechannel', name: '@youtubekaraokechannel' },
  { url: 'https://www.youtube.com/@ZoomKaraokeOfficial',   name: '@ZoomKaraokeOfficial'   },
  { url: 'https://www.youtube.com/@CCKaraoke',             name: '@CCKaraoke'             },
  { url: 'https://www.youtube.com/@KaraokeOnVEVO',         name: '@KaraokeOnVEVO'         },
  { url: 'https://www.youtube.com/@karaokeytv0618',        name: '@karaokeytv0618'        },
  { url: 'https://www.youtube.com/@StingrayKaraoke',       name: '@StingrayKaraoke'       },
  { url: 'https://www.youtube.com/@OneOPMKaraoke',         name: '@OneOPMKaraoke'         },
  { url: 'https://www.youtube.com/@AtomicKaraoke',         name: '@AtomicKaraoke'         },
  { url: 'https://www.youtube.com/@karaOcraze',            name: '@karaOcraze'            },
];

const seedChannel = db.prepare(
  'INSERT INTO channels (id, name, url) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM channels WHERE url = ?)'
);
for (const ch of DEFAULT_CHANNELS) {
  const tempId = `pending_${crypto.createHash('sha1').update(ch.url).digest('hex').slice(0, 12)}`;
  seedChannel.run(tempId, ch.name, ch.url, ch.url);
}

module.exports = { db, getSetting, setSetting, getAllSettings };
