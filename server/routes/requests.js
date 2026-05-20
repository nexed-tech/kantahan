const { Router } = require('express');
const { db, getSetting } = require('../db');
const { setState } = require('../ws');
const { addToQueue } = require('../services/queueService');

const router = Router();

function getRequests() {
  return db
    .prepare(
      `SELECT r.id, r.singer_name, r.status, r.submitted_at,
              s.id AS song_id, s.title, s.artist, s.source, s.thumbnail_url, s.channel_name
       FROM requests r
       JOIN songs s ON s.id = r.song_id
       WHERE r.status = 'pending'
       ORDER BY r.submitted_at`
    )
    .all()
    .map((r) => ({
      id: r.id,
      singer: r.singer_name,
      status: r.status,
      submitted_at: r.submitted_at,
      song: {
        id: r.song_id,
        title: r.title,
        artist: r.artist,
        source: r.source,
        thumbnail_url: r.thumbnail_url,
        channel_name: r.channel_name,
      },
    }));
}

function syncRequestsState() {
  const requests = getRequests();
  setState({ requests, requests_pending: requests.length });
}

router.get('/', (_req, res) => res.json(getRequests()));

router.post('/', (req, res) => {
  const { song_id, singer_name } = req.body;
  if (!song_id || !singer_name)
    return res.status(400).json({ error: 'song_id and singer_name required' });

  const song = db.prepare('SELECT id FROM songs WHERE id = ?').get(song_id);
  if (!song) return res.status(404).json({ error: 'Song not found' });

  const result = db
    .prepare("INSERT INTO requests (song_id, singer_name, status) VALUES (?, ?, 'pending')")
    .run(song_id, singer_name);

  const autoApprove = getSetting('auto_approve') === 'true';
  const autoQueue = getSetting('auto_queue') === 'true';

  let queued = false;
  let queue_position = null;

  if (autoApprove) {
    db.prepare("UPDATE requests SET status = 'approved' WHERE id = ?").run(
      result.lastInsertRowid
    );
    if (autoQueue) {
      const qr = addToQueue(song_id, singer_name);
      queued = true;
      queue_position = qr.position;
    }
  }

  syncRequestsState();
  res.json({ id: Number(result.lastInsertRowid), queued, queue_position });
});

router.put('/:id', (req, res) => {
  const { singer_name } = req.body;
  if (!singer_name) return res.status(400).json({ error: 'singer_name required' });
  db.prepare(
    "UPDATE requests SET singer_name = ? WHERE id = ? AND status = 'pending'"
  ).run(singer_name, req.params.id);
  syncRequestsState();
  res.json({ ok: true });
});

router.post('/:id/approve', (req, res) => {
  const request = db
    .prepare("SELECT * FROM requests WHERE id = ? AND status = 'pending'")
    .get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Not found' });

  db.prepare("UPDATE requests SET status = 'approved' WHERE id = ?").run(request.id);

  let queue_position = null;
  if (getSetting('auto_queue') === 'true') {
    const qr = addToQueue(request.song_id, request.singer_name);
    queue_position = qr.position;
  }

  syncRequestsState();
  res.json({ ok: true, queue_position });
});

router.post('/:id/reject', (req, res) => {
  db.prepare("UPDATE requests SET status = 'rejected' WHERE id = ?").run(req.params.id);
  syncRequestsState();
  res.json({ ok: true });
});

module.exports = router;
