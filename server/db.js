const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'karaoke.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let _sqlDb = null;
let _suppressSave = true; // suppressed during init, then cleared
let _saveTimer = null;

function save() {
  if (!_sqlDb || _suppressSave) return;
  if (_saveTimer) return; // already scheduled — don't write on every insert in a loop
  _saveTimer = setImmediate(() => {
    _saveTimer = null;
    if (_sqlDb) {
      try { fs.writeFileSync(dbPath, Buffer.from(_sqlDb.export())); } catch {}
    }
  });
}

// sql.js Statement → better-sqlite3-compatible wrapper
// sql.js throws plain strings (e.g. "Statement closed") instead of Error objects in some
// failure cases. Normalise them so callers always see a proper Error with .message set.
function normaliseSqlError(e) {
  if (e instanceof Error) return e;
  return new Error(typeof e === 'string' ? e : String(e));
}

class Stmt {
  constructor(s) { this._s = s; }

  get(...args) {
    try {
      this._s.reset();
      if (args.length) this._s.bind(args);
      const row = this._s.step() ? this._s.getAsObject() : undefined;
      this._s.reset();
      return row;
    } catch (e) { throw normaliseSqlError(e); }
  }

  all(...args) {
    try {
      this._s.reset();
      if (args.length) this._s.bind(args);
      const rows = [];
      while (this._s.step()) rows.push(this._s.getAsObject());
      this._s.reset();
      return rows;
    } catch (e) { throw normaliseSqlError(e); }
  }

  run(...args) {
    try {
      this._s.reset();
      if (args.length) this._s.bind(args);
      this._s.step();
      this._s.reset();
    } catch (e) { throw normaliseSqlError(e); }
    const changes = _sqlDb.getRowsModified();
    // Prepare a fresh statement each call so there is no shared mutable state to go stale.
    // sql.js can mark a long-lived prepared statement as closed when many statements accumulate
    // in its internal registry; a per-call statement that is freed immediately avoids this.
    let rowid = 0;
    const s = _sqlDb.prepare('SELECT last_insert_rowid()');
    try {
      s.step();
      rowid = Number(s.get()?.[0] ?? 0);
    } finally {
      try { s.free(); } catch {}
    }
    save();
    return { changes, lastInsertRowid: rowid };
  }
}

// sql.js Database → better-sqlite3-compatible proxy
const db = {
  exec(sql) { _sqlDb.exec(sql); save(); return db; },
  prepare(sql) { return new Stmt(_sqlDb.prepare(sql)); },
  // One-shot parameterised write: prepare → bind → step → free in one call.
  // Use this instead of prepare().run() whenever the statement is NOT reused,
  // especially across async boundaries where a long-lived Stmt can go stale.
  run(sql, ...args) {
    const s = _sqlDb.prepare(sql);
    try {
      if (args.length) s.bind(args);
      s.step();
    } finally {
      try { s.free(); } catch {}
    }
    const changes = _sqlDb.getRowsModified();
    let rowid = 0;
    const r = _sqlDb.prepare('SELECT last_insert_rowid()');
    try {
      r.step();
      rowid = Number(r.get()?.[0] ?? 0);
    } finally {
      try { r.free(); } catch {}
    }
    save();
    return { changes, lastInsertRowid: rowid };
  },
};

// ─── Settings ───────────────────────────────────────────────────────────────

const defaultSettings = {
  auto_approve: 'false',
  singer_rotation: 'true',
  auto_play: 'true',
  auto_queue: 'true',
  auto_start: 'false',
  countdown_seconds: '10',
  background_music_source: 'local',
  background_music_url: '',
  background_music_local_path: '',
  local_media_path: '',
  host_url: '',
  mdns_name: 'kantahan',
  display_message: '',
  display_message_active: 'false',
  display_message_position: 'bottom',
  display_message_scroll: 'false',
  qr_enabled: 'true',
};

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

// ─── Init ────────────────────────────────────────────────────────────────────

let _readyResolve;
const ready = new Promise((r) => { _readyResolve = r; });

(async () => {
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });

  let fileData;
  try { fileData = fs.readFileSync(dbPath); } catch {}
  _sqlDb = fileData ? new SQL.Database(fileData) : new SQL.Database();

  _sqlDb.exec(`
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

  // Column migrations — ADD COLUMN throws if already present; catch and continue
  try { _sqlDb.exec('ALTER TABLE songs ADD COLUMN embeddable INTEGER DEFAULT 1'); } catch {}
  try { _sqlDb.exec('ALTER TABLE songs ADD COLUMN zip_mp3_entry TEXT'); } catch {}
  try { _sqlDb.exec('ALTER TABLE songs ADD COLUMN zip_cdg_entry TEXT'); } catch {}
  try { _sqlDb.exec('ALTER TABLE songs ADD COLUMN ephemeral INTEGER DEFAULT 0'); } catch {}

  // Clean up ephemeral songs from previous sessions that are no longer in the queue
  _sqlDb.exec(`
    DELETE FROM songs
    WHERE ephemeral = 1
    AND id NOT IN (SELECT song_id FROM queue WHERE status = 'pending')
  `);

  // Remove any previously indexed YouTube songs (no longer playable)
  _sqlDb.exec(`DELETE FROM songs WHERE source = 'youtube'`);

  // Seed default settings
  const insertDefault = _sqlDb.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertDefault.bind([key, value]);
    insertDefault.step();
    insertDefault.reset();
  }
  insertDefault.free();

  // Save initial state and enable writes
  _suppressSave = false;
  fs.writeFileSync(dbPath, Buffer.from(_sqlDb.export()));

  // Flush to disk on clean exit
  process.on('exit', () => {
    try { fs.writeFileSync(dbPath, Buffer.from(_sqlDb.export())); } catch {}
  });

  _readyResolve();
})().catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});

module.exports = { db, ready, getSetting, setSetting, getAllSettings };
