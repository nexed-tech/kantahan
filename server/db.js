// Uses Node.js built-in sqlite (v22.5+) — no native compilation needed.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

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

const defaultSettings = {
  auto_approve: 'false',
  singer_rotation: 'true',
  auto_play: 'true',
  auto_queue: 'true',
  countdown_seconds: '10',
  background_music_source: 'youtube',
  background_music_url: '',
  local_media_path: '',
  youtube_api_key: '',
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

module.exports = { db, getSetting, setSetting, getAllSettings };
