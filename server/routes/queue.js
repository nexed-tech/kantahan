const { Router } = require('express');
const { db } = require('../db');
const { getQueue, syncQueue, addToQueue, disableRotation } = require('../services/queueService');
const { requireDjAuth } = require('../middleware/auth');

const router = Router();

router.get('/', (_req, res) => res.json(getQueue()));

router.post('/', requireDjAuth, (req, res) => {
  const { song_id, singer_name } = req.body;
  if (!song_id || !singer_name)
    return res.status(400).json({ error: 'song_id and singer_name required' });
  res.json(addToQueue(song_id, singer_name));
});

router.post('/add-direct', requireDjAuth, (req, res) => {
  const { song_id, singer_name } = req.body;
  if (!song_id || !singer_name)
    return res.status(400).json({ error: 'song_id and singer_name required' });
  const song = db.prepare('SELECT id FROM songs WHERE id = ?').get(song_id);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json(addToQueue(song_id, singer_name));
});

router.delete('/:id', requireDjAuth, (req, res) => {
  db.prepare("UPDATE queue SET status = 'skipped' WHERE id = ?").run(req.params.id);
  syncQueue();
  res.json({ ok: true });
});

router.post('/:id/bump', requireDjAuth, (req, res) => {
  const item = db
    .prepare("SELECT * FROM queue WHERE id = ? AND status = 'pending'")
    .get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    "UPDATE queue SET position = position + 1 WHERE status = 'pending' AND id != ?"
  ).run(req.params.id);
  db.prepare('UPDATE queue SET position = 1 WHERE id = ?').run(req.params.id);

  syncQueue();
  disableRotation();
  res.json({ ok: true });
});

router.put('/reorder', requireDjAuth, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

  const update = db.prepare('UPDATE queue SET position = ? WHERE id = ?');
  db.exec('BEGIN');
  order.forEach((id, idx) => update.run(idx + 1, id));
  db.exec('COMMIT');

  syncQueue();
  disableRotation();
  res.json({ ok: true });
});

module.exports = { router };
