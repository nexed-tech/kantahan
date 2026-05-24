const { Router } = require('express');
const { getSetting } = require('../db');
const { searchYouTube, getVideoDetails } = require('../services/youtube');

const router = Router();

function requireApiKey(res) {
  const key = getSetting('youtube_api_key');
  if (!key) { res.status(400).json({ error: 'YouTube API key not configured' }); return null; }
  return key;
}

// GET /api/youtube/search?q=...
// Returns up to 10 YouTube search results in song shape (non-embeddable filtered out).
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const apiKey = requireApiKey(res);
  if (!apiKey) return;
  try {
    const results = await searchYouTube(q, apiKey);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/youtube/video/:id
// Returns song-shaped details for a single video (used by the URL-paste flow).
router.get('/video/:id', async (req, res) => {
  const apiKey = requireApiKey(res);
  if (!apiKey) return;
  try {
    const video = await getVideoDetails(req.params.id, apiKey);
    res.json(video);
  } catch (err) {
    res.status(err.message === 'Video not found' ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
