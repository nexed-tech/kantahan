const { Router } = require('express');
const { getAllSettings, getSetting, setSetting } = require('../db');
const { setState, getState } = require('../ws');
const { requireDjAuth } = require('../middleware/auth');

const router = Router();

router.get('/', requireDjAuth, (_req, res) => {
  const settings = getAllSettings();
  const safe = { ...settings };
  delete safe.dj_pin_hash;
  res.json(safe);
});

router.put('/', requireDjAuth, (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
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
      qr_enabled: dbSettings.qr_enabled !== 'false',
    },
  });

  const bgKeys = ['background_music_url', 'background_music_source', 'background_music_volume', 'background_music_local_path'];
  if (bgKeys.some((k) => k in updates)) {
    const current = getState().background_music;
    setState({
      background_music: {
        ...current,
        url: dbSettings.background_music_url || '',
        source: dbSettings.background_music_source || 'local',
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
