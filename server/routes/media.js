const { Router } = require('express');
const path = require('path');
const AdmZip = require('adm-zip');
const { db, getSetting } = require('../db');
const { scanLocalMedia } = require('../services/localFiles');
const { setState } = require('../ws');
const { syncQueue } = require('../services/queueService');

const router = Router();

router.post('/scan', async (req, res) => {
  const folderPath = getSetting('local_media_path');
  if (!folderPath) return res.status(400).json({ error: 'local_media_path not configured' });

  // Respond immediately; scan runs in background
  res.json({ ok: true });

  setState({ scanning: { active: true, processed: 0, total: null, skipped: [], error: null } });

  try {
    const { results, skipped } = await scanLocalMedia(folderPath, ({ processed, total }) => {
      setState({
        scanning: { active: true, processed, total, skipped: [], error: null },
      });
    });

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

    // Remove local songs that no longer exist on disk
    const newIds = results.map((s) => s.id);
    const existingLocal = db
      .prepare("SELECT id FROM songs WHERE source = 'local'")
      .all()
      .map((r) => r.id);
    const staleIds = existingLocal.filter((id) => !newIds.includes(id));
    if (staleIds.length > 0) {
      const ph = staleIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM queue WHERE song_id IN (${ph}) AND status = 'pending'`).run(...staleIds);
      db.prepare(`DELETE FROM requests WHERE song_id IN (${ph}) AND status = 'pending'`).run(...staleIds);
      db.prepare(`DELETE FROM songs WHERE id IN (${ph})`).run(...staleIds);
      syncQueue();
    }

    setState({
      scanning: {
        active: false,
        processed: results.length,
        total: results.length,
        skipped,
        error: null,
        removed: staleIds.length,
      },
    });
  } catch (err) {
    setState({
      scanning: { active: false, processed: 0, total: null, skipped: [], error: err.message },
    });
  }
});

router.get('/file/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song || !song.file_path) return res.status(404).json({ error: 'Not found' });

  if (song.file_type === 'mp3cdg_zip') {
    // Read MP3 directly from ZIP — consistent with CDG route, no temp files needed
    try {
      const zip   = new AdmZip(song.file_path);
      const entry = zip.getEntry(song.zip_mp3_entry);
      if (!entry) return res.status(404).json({ error: `MP3 entry not found in ZIP: ${song.zip_mp3_entry}` });
      const buf = entry.getData();
      if (!buf || buf.length === 0) {
        return res.status(500).json({ error: 'MP3 entry returned empty data' });
      }
      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Length', String(buf.length));
      return res.end(buf);
    } catch (err) {
      return res.status(500).json({ error: `MP3 read failed: ${err.message}` });
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
    // Read CDG bytes directly from ZIP — no temp file, avoids getData() empty-buffer bug
    try {
      const zip   = new AdmZip(song.file_path);
      const entry = zip.getEntry(song.zip_cdg_entry);
      if (!entry) return res.status(404).json({ error: `CDG entry not found in ZIP: ${song.zip_cdg_entry}` });
      const buf = entry.getData();
      if (!buf || buf.length === 0) {
        return res.status(500).json({ error: 'CDG entry returned empty data — ZIP may use an unsupported compression method' });
      }
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Length', String(buf.length));
      return res.end(buf);
    } catch (err) {
      return res.status(500).json({ error: `CDG read failed: ${err.message}` });
    }
  }

  const cdgPath = song.file_path.replace(/\.[^.]+$/, '.cdg');
  res.sendFile(path.resolve(cdgPath), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'CDG file not found' });
  });
});

module.exports = router;
