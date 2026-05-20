const { Router } = require('express');
const path = require('path');
const { db, getSetting } = require('../db');
const { scanLocalMedia } = require('../services/localFiles');

const router = Router();

router.post('/scan', (req, res) => {
  const folderPath = getSetting('local_media_path');
  if (!folderPath) return res.status(400).json({ error: 'local_media_path not configured' });

  let songs;
  try {
    songs = scanLocalMedia(folderPath);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const upsert = db.prepare(`
    INSERT INTO songs (id, title, artist, source, file_path, file_type, duration_seconds, thumbnail_url)
    VALUES (?, ?, ?, 'local', ?, ?, NULL, NULL)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      file_path = excluded.file_path,
      file_type = excluded.file_type,
      indexed_at = CURRENT_TIMESTAMP
  `);

  for (const song of songs) {
    upsert.run(song.id, song.title, song.artist, song.file_path, song.file_type);
  }

  res.json({ count: songs.length });
});

router.get('/file/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song || !song.file_path) return res.status(404).json({ error: 'Not found' });

  res.sendFile(path.resolve(song.file_path), (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'File read error' });
  });
});

router.get('/cdg/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song || !song.file_path) return res.status(404).json({ error: 'Not found' });

  const cdgPath = song.file_path.replace(/\.[^.]+$/, '.cdg');
  res.sendFile(path.resolve(cdgPath), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'CDG file not found' });
  });
});

module.exports = router;
