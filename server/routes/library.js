const { Router } = require('express');
const { db } = require('../db');

const router = Router();

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
