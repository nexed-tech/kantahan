const { Router } = require('express');
const {
  handleSongEnded,
  skipSong,
  pausePlayback,
  resumePlayback,
  startNextSong,
} = require('../services/playback');

const router = Router();

router.post('/play', (_req, res) => {
  resumePlayback();
  res.json({ ok: true });
});

router.post('/pause', (_req, res) => {
  pausePlayback();
  res.json({ ok: true });
});

router.post('/skip', (_req, res) => {
  skipSong();
  res.json({ ok: true });
});

router.post('/ended', (_req, res) => {
  handleSongEnded();
  res.json({ ok: true });
});

router.post('/next', (_req, res) => {
  startNextSong();
  res.json({ ok: true });
});

module.exports = router;
