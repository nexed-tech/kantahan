const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const { getState, setState } = require('../ws');
const { getSetting, setSetting } = require('../db');
const { requireDjAuth } = require('../middleware/auth');

const router = Router();

const LOCAL_AUDIO_EXTS = new Set(['.mp3', '.mp4', '.m4a', '.ogg', '.wav', '.flac']);

function scanBgTracks(folder) {
  const tracks = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (LOCAL_AUDIO_EXTS.has(ext)) {
        tracks.push({ name: path.basename(e.name, ext), filePath: full });
      }
    }
  }
  walk(folder);
  return tracks.sort((a, b) => a.name.localeCompare(b.name));
}

router.get('/tracks', (_req, res) => {
  const folder = getSetting('background_music_local_path');
  if (!folder || !fs.existsSync(folder)) return res.json([]);
  const tracks = scanBgTracks(folder).map((t, i) => ({ name: t.name, idx: i }));
  res.json(tracks);
});

router.get('/file/:idx', (req, res) => {
  const folder = getSetting('background_music_local_path');
  if (!folder || !fs.existsSync(folder)) return res.status(404).json({ error: 'Not configured' });

  const idx = parseInt(req.params.idx, 10);
  const tracks = scanBgTracks(folder);
  if (isNaN(idx) || idx < 0 || idx >= tracks.length) {
    return res.status(404).json({ error: 'Track not found' });
  }

  const filePath = path.resolve(tracks[idx].filePath);
  if (!filePath.startsWith(path.resolve(folder))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'File error' });
  });
});

router.post('/play', requireDjAuth, (_req, res) => {
  const bm = getState().background_music;
  setState({ background_music: { ...bm, playing: true } });
  res.json({ ok: true });
});

router.post('/pause', requireDjAuth, (_req, res) => {
  const bm = getState().background_music;
  setState({ background_music: { ...bm, playing: false } });
  res.json({ ok: true });
});

router.put('/volume', requireDjAuth, (req, res) => {
  const { volume } = req.body;
  if (typeof volume !== 'number' || volume < 0 || volume > 1)
    return res.status(400).json({ error: 'volume must be 0–1' });
  const bm = getState().background_music;
  setState({ background_music: { ...bm, volume } });
  setSetting('background_music_volume', String(volume));
  res.json({ ok: true });
});

module.exports = router;
