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

// ── Songbook helpers ──────────────────────────────────────────────────────────

// Returns the normalised sort key for a title: strips leading The / A / An.
const SORT_KEY_TITLE = `
  CASE
    WHEN UPPER(title) LIKE 'THE %' THEN UPPER(SUBSTR(title, 5))
    WHEN UPPER(title) LIKE 'AN %'  THEN UPPER(SUBSTR(title, 4))
    WHEN UPPER(title) LIKE 'A %'   THEN UPPER(SUBSTR(title, 3))
    ELSE UPPER(title)
  END`;

// First letter of the normalised title sort key.
const FIRST_LETTER_TITLE = `
  CASE
    WHEN UPPER(title) LIKE 'THE %' THEN UPPER(SUBSTR(title, 5, 1))
    WHEN UPPER(title) LIKE 'AN %'  THEN UPPER(SUBSTR(title, 4, 1))
    WHEN UPPER(title) LIKE 'A %'   THEN UPPER(SUBSTR(title, 3, 1))
    ELSE UPPER(SUBSTR(title, 1, 1))
  END`;

// For artist mode: fall back to title when artist is NULL/empty.
const SORT_KEY_ARTIST  = `UPPER(COALESCE(NULLIF(TRIM(artist),''), title))`;
const FIRST_LETTER_ARTIST = `UPPER(SUBSTR(COALESCE(NULLIF(TRIM(artist),''), title), 1, 1))`;

// Map letter param → SQL WHERE clause fragment + params.
function letterFilter(letter, firstLetterExpr) {
  if (letter === '#') {
    // Anything whose first letter is not A–Z
    return { clause: `(${firstLetterExpr}) NOT BETWEEN 'A' AND 'Z'`, params: [] };
  }
  const l = (letter || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (l.length !== 1) return null;
  return { clause: `(${firstLetterExpr}) = ?`, params: [l] };
}

// GET /api/library/letters?mode=song|artist
// Returns array of letters that have at least one song, e.g. ["#","A","B",...]
// Also returns count per letter.
router.get('/letters', (req, res) => {
  const mode = req.query.mode === 'artist' ? 'artist' : 'song';
  const firstLetterExpr = mode === 'artist' ? FIRST_LETTER_ARTIST : FIRST_LETTER_TITLE;

  const rows = db
    .prepare(
      `SELECT
         CASE WHEN (${firstLetterExpr}) BETWEEN 'A' AND 'Z' THEN (${firstLetterExpr}) ELSE '#' END AS letter,
         COUNT(*) AS count
       FROM songs
       GROUP BY letter
       ORDER BY
         CASE WHEN letter = '#' THEN 1 ELSE 0 END,
         letter`
    )
    .all();

  res.json(rows); // [{ letter, count }, ...]
});

// GET /api/library/browse?mode=song|artist&letter=A&limit=50&offset=0
// Returns songs for a given first letter, sorted and paginated.
router.get('/browse', (req, res) => {
  const mode   = req.query.mode === 'artist' ? 'artist' : 'song';
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);
  const letter = (req.query.letter || '').toUpperCase() || null;

  const firstLetterExpr = mode === 'artist' ? FIRST_LETTER_ARTIST : FIRST_LETTER_TITLE;
  const sortKeyExpr     = mode === 'artist' ? SORT_KEY_ARTIST      : SORT_KEY_TITLE;

  if (!letter) return res.status(400).json({ error: 'letter param required' });

  const filter = letterFilter(letter, firstLetterExpr);
  if (!filter) return res.status(400).json({ error: 'invalid letter' });

  const results = db
    .prepare(
      `SELECT id, title, artist, source, channel_name, thumbnail_url, duration_seconds
       FROM songs
       WHERE ${filter.clause}
       ORDER BY ${sortKeyExpr}, UPPER(title)
       LIMIT ? OFFSET ?`
    )
    .all(...filter.params, limit, offset);

  res.json(results);
});

router.get('/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Not found' });
  res.json(song);
});

module.exports = router;
