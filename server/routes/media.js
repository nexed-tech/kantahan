const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');
const { db, getSetting } = require('../db');
const { scanLocalMedia } = require('../services/localFiles');

const router = Router();

// In-memory cache: songId → { mp3Path, cdgPath }
const extractCache = new Map();

function ensureZipExtracted(song) {
  if (extractCache.has(song.id)) return extractCache.get(song.id);

  const zip = new AdmZip(song.file_path);
  const tempDir = path.join(os.tmpdir(), `kantahan-${song.id}`);
  fs.mkdirSync(tempDir, { recursive: true });

  zip.extractEntryTo(song.zip_mp3_entry, tempDir, false, true);
  zip.extractEntryTo(song.zip_cdg_entry, tempDir, false, true);

  const result = {
    mp3Path: path.join(tempDir, path.basename(song.zip_mp3_entry)),
    cdgPath: path.join(tempDir, path.basename(song.zip_cdg_entry)),
  };
  extractCache.set(song.id, result);
  return result;
}

router.post('/scan', async (req, res) => {
  const folderPath = getSetting('local_media_path');
  if (!folderPath) return res.status(400).json({ error: 'local_media_path not configured' });

  let results, skipped;
  try {
    ({ results, skipped } = await scanLocalMedia(folderPath));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const upsert = db.prepare(`
    INSERT INTO songs (id, title, artist, source, file_path, file_type, duration_seconds, thumbnail_url, zip_mp3_entry, zip_cdg_entry)
    VALUES (?, ?, ?, 'local', ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      file_path = excluded.file_path,
      file_type = excluded.file_type,
      zip_mp3_entry = excluded.zip_mp3_entry,
      zip_cdg_entry = excluded.zip_cdg_entry,
      indexed_at = CURRENT_TIMESTAMP
  `);

  for (const song of results) {
    upsert.run(
      song.id, song.title, song.artist,
      song.file_path, song.file_type,
      song.zip_mp3_entry || null,
      song.zip_cdg_entry || null
    );
  }

  // Evict stale zip cache entries after a rescan
  extractCache.clear();

  res.json({ count: results.length, skipped });
});

router.get('/file/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song || !song.file_path) return res.status(404).json({ error: 'Not found' });

  if (song.file_type === 'mp3cdg_zip') {
    try {
      const { mp3Path } = ensureZipExtracted(song);
      return res.sendFile(path.resolve(mp3Path), (err) => {
        if (err && !res.headersSent) res.status(500).json({ error: 'File read error' });
      });
    } catch (err) {
      return res.status(500).json({ error: `ZIP extraction failed: ${err.message}` });
    }
  }

  res.sendFile(path.resolve(song.file_path), (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'File read error' });
  });
});

router.get('/cdg/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song || !song.file_path) return res.status(404).json({ error: 'Not found' });

  if (song.file_type === 'mp3cdg_zip') {
    try {
      const { cdgPath } = ensureZipExtracted(song);
      return res.sendFile(path.resolve(cdgPath), (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'CDG file not found' });
      });
    } catch (err) {
      return res.status(500).json({ error: `ZIP extraction failed: ${err.message}` });
    }
  }

  const cdgPath = song.file_path.replace(/\.[^.]+$/, '.cdg');
  res.sendFile(path.resolve(cdgPath), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'CDG file not found' });
  });
});

module.exports = router;
