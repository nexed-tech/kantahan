const { db, getSetting } = require('../db');
const { setState } = require('../ws');
const { insertWithRotation } = require('./rotation');

function getQueue() {
  return db
    .prepare(
      `SELECT q.id, q.singer_name, q.position, q.status, q.added_at,
              s.id AS song_id, s.title, s.artist, s.source, s.thumbnail_url, s.channel_name
       FROM queue q
       JOIN songs s ON s.id = q.song_id
       WHERE q.status = 'pending'
       ORDER BY q.position`
    )
    .all()
    .map((r) => ({
      id: r.id,
      singer: r.singer_name,
      position: r.position,
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

function syncQueue() {
  setState({ queue: getQueue() });
}

function addToQueue(songId, singerName) {
  const useRotation = getSetting('singer_rotation') === 'true';
  let position;

  if (useRotation) {
    position = insertWithRotation(singerName);
  } else {
    const max = db
      .prepare("SELECT MAX(position) AS m FROM queue WHERE status = 'pending'")
      .get();
    position = (max.m || 0) + 1;
  }

  const result = db
    .prepare(
      "INSERT INTO queue (song_id, singer_name, position, status) VALUES (?, ?, ?, 'pending')"
    )
    .run(songId, singerName, position);

  syncQueue();
  return { id: result.lastInsertRowid, position };
}

module.exports = { getQueue, syncQueue, addToQueue };
