const { Router } = require('express');
const { getAllSettings, getSetting, setSetting } = require('../db');
const { setState, getState } = require('../ws');
const { requireDjAuth } = require('../middleware/auth');

const router = Router();

router.get('/', requireDjAuth, (_req, res) => {
  const settings = getAllSettings();
  // Never expose the raw API key or PIN hash
  const safe = {
    ...settings,
    youtube_api_key: settings.youtube_api_key ? '***' : '',
    dj_pin_hash: undefined,
  };
  delete safe.dj_pin_hash;
  res.json(safe);
});

router.put('/', requireDjAuth, (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    // Never allow overwriting the PIN hash via this endpoint
    if (key === 'dj_pin_hash') continue;
    setSetting(key, value);
  }

  const dbSettings = getAllSettings();
  setState({
    settings: {
      auto_approve: dbSettings.auto_approve === 'true',
      singer_rotation: dbSettings.singer_rotation === 'true',
      auto_play: dbSettings.auto_play === 'true',
      auto_queue: dbSettings.auto_queue === 'true',
      auto_start: dbSettings.auto_start === 'true',
      countdown_seconds: parseInt(dbSettings.countdown_seconds) || 10,
    },
  });

  const bgKeys = ['background_music_url', 'background_music_source', 'background_music_volume', 'background_music_local_path'];
  if (bgKeys.some((k) => k in updates)) {
    const current = getState().background_music;
    setState({
      background_music: {
        ...current,
        url: dbSettings.background_music_url || '',
        source: dbSettings.background_music_source || 'youtube',
        volume: parseFloat(dbSettings.background_music_volume || String(current.volume)),
        local_path: dbSettings.background_music_local_path || '',
      },
    });
  }

  const msgKeys = ['display_message', 'display_message_active', 'display_message_position', 'display_message_scroll'];
  if (msgKeys.some((k) => k in updates)) {
    setState({
      display_message: {
        active: dbSettings.display_message_active === 'true',
        text: dbSettings.display_message || '',
        position: dbSettings.display_message_position || 'bottom',
        scroll: dbSettings.display_message_scroll === 'true',
      },
    });
  }

  res.json({ ok: true });
});

// Dedicated endpoint so we never accidentally log or expose the key
router.put('/youtube-api-key', requireDjAuth, (req, res) => {
  const { key } = req.body;
  if (typeof key !== 'string') return res.status(400).json({ error: 'key required' });
  setSetting('youtube_api_key', key.trim());
  res.json({ ok: true, set: key.trim().length > 0 });
});

router.get('/youtube-api-key/status', (_req, res) => {
  const key = getSetting('youtube_api_key');
  res.json({ set: !!(key && key.length > 0) });
});

// DJ PIN management
router.put('/dj-pin', requireDjAuth, async (req, res) => {
  const { pin } = req.body;
  if (typeof pin !== 'string') return res.status(400).json({ error: 'pin required' });
  const bcrypt = require('bcryptjs');
  if (pin === '') {
    setSetting('dj_pin_hash', '');
    return res.json({ ok: true, set: false });
  }
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  const hash = await bcrypt.hash(pin, 10);
  setSetting('dj_pin_hash', hash);
  res.json({ ok: true, set: true });
});

router.get('/dj-pin/status', (_req, res) => {
  const hash = getSetting('dj_pin_hash');
  res.json({ set: !!(hash && hash.length > 0) });
});

module.exports = router;
