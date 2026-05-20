const { db, getSetting } = require('../db');
const { fetchChannelVideos } = require('./youtube');

async function indexChannel(channelId, channelName, onProgress) {
  const apiKey = getSetting('youtube_api_key');
  if (!apiKey) throw new Error('No YouTube API key configured');

  const upsert = db.prepare(`
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
  `);

  let processed = 0;
  let skipped = 0;

  for await (const video of fetchChannelVideos(channelId, apiKey)) {
    if (!video.embeddable) {
      skipped++;
      onProgress(processed, skipped);
      continue;
    }

    upsert.run(
      video.id,
      video.title,
      video.artist,
      channelId,
      channelName,
      video.duration_seconds,
      video.thumbnail_url,
      1
    );
    processed++;
    onProgress(processed, skipped);
  }

  db.prepare(
    'UPDATE channels SET last_indexed = CURRENT_TIMESTAMP, video_count = ? WHERE id = ?'
  ).run(processed, channelId);

  return { processed, skipped };
}

module.exports = { indexChannel };
