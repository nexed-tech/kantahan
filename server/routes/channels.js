const { Router } = require('express');
const { db, getSetting } = require('../db');
const { setState, getState } = require('../ws');
const { resolveChannelId } = require('../services/youtube');
const { indexChannel } = require('../services/indexer');
const { syncQueue } = require('../services/queueService');

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM channels ORDER BY name').all());
});

async function runIndexing(channelId, channelName) {
  setState({
    indexing: {
      active: true,
      channel_name: channelName,
      processed: 0,
      skipped: 0,
      total: null,
      error: null,
    },
  });

  try {
    const { processed, skipped } = await indexChannel(channelId, channelName, (p, s) => {
      setState({
        indexing: { ...getState().indexing, processed: p, skipped: s },
      });
    });

    setState({
      indexing: {
        active: false,
        channel_name: channelName,
        processed,
        skipped,
        total: processed,
        error: null,
      },
    });
  } catch (err) {
    setState({
      indexing: {
        active: false,
        channel_name: null,
        processed: 0,
        skipped: 0,
        total: null,
        error: err.message,
      },
    });
  }
}

router.post('/', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const apiKey = getSetting('youtube_api_key');
  if (!apiKey) return res.status(400).json({ error: 'YouTube API key not configured' });

  let channel;
  try {
    channel = await resolveChannelId(url, apiKey);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  db.prepare('INSERT OR IGNORE INTO channels (id, name, url) VALUES (?, ?, ?)').run(
    channel.id,
    channel.name,
    url
  );

  res.json({ id: channel.id, name: channel.name });
  runIndexing(channel.id, channel.name);
});

async function resolveAndIndex(channel) {
  let { id, name, url } = channel;

  if (id.startsWith('pending_')) {
    const apiKey = getSetting('youtube_api_key');
    setState({
      indexing: { active: true, channel_name: name, processed: 0, skipped: 0, total: null, error: null },
    });
    try {
      const resolved = await resolveChannelId(url, apiKey);
      db.prepare('DELETE FROM channels WHERE id = ?').run(id);
      db.prepare('INSERT OR IGNORE INTO channels (id, name, url) VALUES (?, ?, ?)').run(resolved.id, resolved.name, url);
      id = resolved.id;
      name = resolved.name;
    } catch (err) {
      setState({
        indexing: { active: false, channel_name: name, processed: 0, skipped: 0, total: null, error: `Could not resolve ${name}: ${err.message}` },
      });
      return;
    }
  }

  await runIndexing(id, name);
}

router.post('/reindex-all', async (req, res) => {
  const channels = db.prepare('SELECT * FROM channels ORDER BY name').all();
  if (!channels.length) return res.json({ ok: true, count: 0 });

  const apiKey = getSetting('youtube_api_key');
  if (!apiKey) return res.status(400).json({ error: 'YouTube API key not configured' });

  res.json({ ok: true, count: channels.length });
  for (const ch of channels) {
    await resolveAndIndex(ch);
  }
});

router.post('/:id/reindex', (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const apiKey = getSetting('youtube_api_key');
  if (!apiKey) return res.status(400).json({ error: 'YouTube API key not configured' });

  res.json({ ok: true });
  resolveAndIndex(channel);
});

router.delete('/:id', (req, res) => {
  const songIds = db
    .prepare('SELECT id FROM songs WHERE channel_id = ?')
    .all(req.params.id)
    .map((r) => r.id);

  if (songIds.length > 0) {
    const ph = songIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM queue WHERE song_id IN (${ph}) AND status = 'pending'`).run(...songIds);
    db.prepare(`DELETE FROM requests WHERE song_id IN (${ph}) AND status = 'pending'`).run(...songIds);
  }

  db.prepare('DELETE FROM songs WHERE channel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);

  syncQueue();
  const pending = db
    .prepare("SELECT r.id, r.singer_name, r.status, r.submitted_at, s.id AS song_id, s.title, s.artist, s.source, s.thumbnail_url, s.channel_name FROM requests r JOIN songs s ON s.id = r.song_id WHERE r.status = 'pending' ORDER BY r.submitted_at")
    .all()
    .map((r) => ({ id: r.id, singer: r.singer_name, status: r.status, submitted_at: r.submitted_at, song: { id: r.song_id, title: r.title, artist: r.artist, source: r.source, thumbnail_url: r.thumbnail_url, channel_name: r.channel_name } }));
  setState({ requests: pending, requests_pending: pending.length });

  res.json({ ok: true });
});

module.exports = router;
