const { db, getSetting } = require('../db');
const { fetchChannelVideos } = require('./youtube');

const UPSERT_SQL = `
  INSERT INTO songs (id, title, artist, source, channel_id, channel_name, duration_seconds, thumbnail_url, embeddable)
  VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    artist = excluded.artist,
    channel_name = excluded.channel_name,
    duration_seconds = excluded.duration_seconds,
    thumbnail_url = excluded.thumbnail_url,
    embeddable = excluded.embeddable,
    indexed_at = CURRENT_TIMESTAMP
`;

async function indexChannel(channelId, channelName, onProgress) {
  const apiKey = getSetting('youtube_api_key');
  if (!apiKey) throw new Error('No YouTube API key configured');

  // Collect all embeddable videos first, then write them in one transaction.
  // A long-lived prepared statement kept alive across multiple `await` points
  // can have its sql.js handle invalidated; fetching first avoids that entirely.
  const videos = [];
  let skipped = 0;

  for await (const video of fetchChannelVideos(channelId, apiKey)) {
    if (!video.embeddable) {
      skipped++;
      onProgress(videos.length, skipped);
      continue;
    }
    videos.push(video);
    onProgress(videos.length, skipped);
  }

  // Write inside a transaction — one disk flush instead of one per video.
  db.exec('BEGIN');
  try {
    for (const video of videos) {
      db.run(
        UPSERT_SQL,
        video.id,
        video.title,
        video.artist,
        channelId,
        channelName,
        video.duration_seconds,
        video.thumbnail_url,
        1
      );
    }
    db.run(
      'UPDATE channels SET last_indexed = CURRENT_TIMESTAMP, video_count = ? WHERE id = ?',
      videos.length,
      channelId
    );
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }

  return { processed: videos.length, skipped };
}

module.exports = { indexChannel };
