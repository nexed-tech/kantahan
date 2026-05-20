const { db } = require('../db');

// Returns the position to use when inserting a new queue entry.
// With rotation: each singer gets one slot per round — new song goes
// immediately after the last person who came after this singer's
// previous entry (i.e. at lastOccurrence.position + 1).
function insertWithRotation(singerName) {
  const queue = db
    .prepare(
      "SELECT id, singer_name, position FROM queue WHERE status = 'pending' ORDER BY position"
    )
    .all();

  if (queue.length === 0) return 1;

  const lastOccurrence = [...queue].reverse().find((r) => r.singer_name === singerName);

  if (!lastOccurrence) {
    return queue[queue.length - 1].position + 1;
  }

  const insertPosition = lastOccurrence.position + 1;
  db.prepare(
    "UPDATE queue SET position = position + 1 WHERE status = 'pending' AND position >= ?"
  ).run(insertPosition);

  return insertPosition;
}

module.exports = { insertWithRotation };
