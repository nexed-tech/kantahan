const { Router } = require('express');
const { getAllSettings, setSetting } = require('../db');
const { setState, getState } = require('../ws');

const router = Router();

router.get('/', (_req, res) => {
  const settings = getAllSettings();
  // Never expose the raw API key — return a boolean so the UI knows if it's set
  const safe = { ...settings, youtube_api_key: settings.youtube_api_key ? '***' : '' };
  res.json(safe);
});

router.put('/', (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    setSetting(key, value);
  }

  const dbSettings = getAllSettings();
  setState({
    settings: {
      auto_approve: dbSettings.auto_approve === 'true',
      singer_rotation: dbSettings.singer_rotation === 'true',
      auto_play: dbSettings.auto_play === 'true',
      auto_queue: dbSettings.auto_queue === 'true',
      countdown_seconds: parseInt(dbSettings.countdown_seconds) || 10,
    },
  });

  const bgKeys = ['background_music_url', 'background_music_source', 'background_music_volume'];
  if (bgKeys.some((k) => k in updates)) {
    const current = getState().background_music;
    setState({
      background_music: {
        ...current,
        url: dbSettings.background_music_url || '',
        source: dbSettings.background_music_source || 'youtube',
        volume: parseFloat(dbSettings.background_music_volume || String(current.volume)),
      },
    });
  }

  res.json({ ok: true });
});

// Dedicated endpoint so we never accidentally log or expose the key
router.put('/youtube-api-key', (req, res) => {
  const { key } = req.body;
  if (typeof key !== 'string') return res.status(400).json({ error: 'key required' });
  setSetting('youtube_api_key', key.trim());
  res.json({ ok: true, set: key.trim().length > 0 });
});

router.get('/youtube-api-key/status', (_req, res) => {
  const { getSetting } = require('../db');
  const key = getSetting('youtube_api_key');
  res.json({ set: !!(key && key.length > 0) });
});

module.exports = router;
