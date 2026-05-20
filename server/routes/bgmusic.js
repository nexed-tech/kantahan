const { Router } = require('express');
const { getState, setState } = require('../ws');
const { setSetting } = require('../db');

const router = Router();

router.post('/play', (_req, res) => {
  const bm = getState().background_music;
  setState({ background_music: { ...bm, playing: true } });
  res.json({ ok: true });
});

router.post('/pause', (_req, res) => {
  const bm = getState().background_music;
  setState({ background_music: { ...bm, playing: false } });
  res.json({ ok: true });
});

router.put('/volume', (req, res) => {
  const { volume } = req.body;
  if (typeof volume !== 'number' || volume < 0 || volume > 1)
    return res.status(400).json({ error: 'volume must be 0–1' });
  const bm = getState().background_music;
  setState({ background_music: { ...bm, volume } });
  setSetting('background_music_volume', String(volume));
  res.json({ ok: true });
});

module.exports = router;
