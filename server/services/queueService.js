const { db, getSetting } = require('../db');
const { setState, getState } = require('../ws');
const { insertWithRotation } = require('./rotation');

function getQueue() {
  return db
    .prepare(
      `SELECT q.id, q.singer_name, q.position, q.status, q.added_at,
              s.id AS song_id, s.title, s.artist, s.source, s.file_type,
              s.thumbnail_url, s.channel_name, s.duration_seconds
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
        file_type: r.file_type,
        thumbnail_url: r.thumbnail_url,
        channel_name: r.channel_name,
        duration_seconds: r.duration_seconds,
      },
    }));
}

function syncQueue() {
  setState({ queue: getQueue() });
}

function addToQueue(songId, singerName) {
  const useRotation = getSetting('singer_rotation') === 'true';
  let position;

  const queueWasEmpty =
    db.prepare("SELECT COUNT(*) AS cnt FROM queue WHERE status = 'pending'").get().cnt === 0;

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

  if (getSetting('auto_start') === 'true' && queueWasEmpty && getState().mode === 'idle') {
    setImmediate(() => require('./playback').beginCountdown());
  }

  return { id: result.lastInsertRowid, position };
}

module.exports = { getQueue, syncQueue, addToQueue };
