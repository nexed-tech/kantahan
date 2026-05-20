const { Router } = require('express');
const { db, getSetting } = require('../db');
const { setState, getState } = require('../ws');
const { resolveChannelId } = require('../services/youtube');
const { indexChannel } = require('../services/indexer');

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

router.post('/:id/reindex', (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const apiKey = getSetting('youtube_api_key');
  if (!apiKey) return res.status(400).json({ error: 'YouTube API key not configured' });

  res.json({ ok: true });
  runIndexing(channel.id, channel.name);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM songs WHERE channel_id = ?').run(req.params.id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
