const { db } = require('../db');

// Maximum number of consecutive songs a singer can hold in any one group.
const GROUP_SIZE = 2;

/**
 * Returns the queue position to use when inserting a new entry for singerName.
 *
 * Rule — trailing-group approach:
 *   Look at the queue sorted by position. Find this singer's LAST entry, then
 *   walk backwards counting how many consecutive entries (no other singer in
 *   between, by sorted order) belong to this singer — that is the "trailing
 *   group size".
 *
 *   trailingCount < GROUP_SIZE  → extend the group: insert right after their
 *                                  last song (shifting everyone behind them).
 *   trailingCount >= GROUP_SIZE → group is full: append to the end of the
 *                                  queue, starting a fresh group of 1.
 *
 * Examples (GROUP_SIZE = 2)
 *
 *   Queue: [A1, A2, B1, C1, C2, A3]
 *   Bob adds 2nd song:
 *     Bob's last is index 2. Trailing: B1 (count=1). 1 < 2 → insert after B1.
 *     → [A1, A2, B1, B2, C1, C2, A3]
 *
 *   Bob then adds 3rd song:
 *     Trailing: B2, B1 (count=2). 2 ≥ 2 → append to end.
 *     → [A1, A2, B1, B2, C1, C2, A3, B3]
 *
 *   Bob then adds 4th song:
 *     Trailing: B3 (count=1, A3 is before it). 1 < 2 → insert after B3.
 *     → [A1, A2, B1, B2, C1, C2, A3, B3, B4]
 *
 * New singer (never queued before) → append to end.
 */
function insertWithRotation(singerName) {
  const queue = db
    .prepare(
      "SELECT singer_name, position FROM queue WHERE status = 'pending' ORDER BY position ASC"
    )
    .all();

  if (queue.length === 0) return 1;

  // Find the index of this singer's last entry (scanning from the end).
  let lastIdx = -1;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].singer_name === singerName) { lastIdx = i; break; }
  }

  // Singer not in queue yet — append to end.
  if (lastIdx === -1) {
    return queue[queue.length - 1].position + 1;
  }

  // Count the trailing run of consecutive same-singer entries ending at lastIdx.
  let trailingCount = 0;
  for (let i = lastIdx; i >= 0; i--) {
    if (queue[i].singer_name === singerName) trailingCount++;
    else break;
  }

  const lastPos = queue[lastIdx].position;

  if (trailingCount < GROUP_SIZE) {
    // Extend the current group — insert immediately after their last song.
    const insertPosition = lastPos + 1;
    db.prepare(
      "UPDATE queue SET position = position + 1 WHERE status = 'pending' AND position >= ?"
    ).run(insertPosition);
    return insertPosition;
  } else {
    // Group is full — start a new group at the end of the queue.
    return queue[queue.length - 1].position + 1;
  }
}

module.exports = { insertWithRotation };
