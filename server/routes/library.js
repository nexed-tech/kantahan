const { Router } = require('express');
const { db } = require('../db');

const router = Router();

const SORT_MAP = {
  recent: 'indexed_at DESC, id DESC',
  title:  'title ASC',
  artist: 'artist ASC, title ASC',
};

router.get('/', (req, res) => {
  const q         = (req.query.q || '').trim();
  const source    = ['youtube', 'local'].includes(req.query.source) ? req.query.source : '';
  const channelId = req.query.channel_id || '';
  const sort      = SORT_MAP[req.query.sort] || SORT_MAP.recent;
  const limit     = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset    = Math.max(parseInt(req.query.offset) || 0, 0);

  const conditions = [];
  const params = [];

  if (q) {
    conditions.push('(title LIKE ? OR artist LIKE ? OR channel_name LIKE ?)');
    const term = `%${q}%`;
    params.push(term, term, term);
  }
  if (source) { conditions.push('source = ?'); params.push(source); }
  if (channelId) { conditions.push('channel_id = ?'); params.push(channelId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const results = db
    .prepare(
      `SELECT id, title, artist, source, channel_id, channel_name, thumbnail_url, duration_seconds, file_type
       FROM songs
       ${where}
       ORDER BY ${sort}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  res.json(results);
});

router.get('/random', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const results = db
    .prepare(
      `SELECT id, title, artist, source, channel_name, thumbnail_url, duration_seconds
       FROM songs
       ORDER BY RANDOM()
       LIMIT ?`
    )
    .all(limit);
  res.json(results);
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const term = `%${q}%`;
  const results = db
    .prepare(
      `SELECT id, title, artist, source, channel_name, thumbnail_url, duration_seconds
       FROM songs
       WHERE title LIKE ? OR artist LIKE ? OR channel_name LIKE ?
       ORDER BY
         CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
         title
       LIMIT 50`
    )
    .all(term, term, term, `${q}%`);

  res.json(results);
});

router.get('/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Not found' });
  res.json(song);
});

module.exports = router;
