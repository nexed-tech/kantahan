const { db, getSetting } = require('../db');
const { getState, setState } = require('../ws');
const { getQueue, syncQueue } = require('./queueService');

let countdownTimer = null;

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function playerCmd(action, videoId = null) {
  setState({
    player_command: { action, video_id: videoId, timestamp: Date.now() },
  });
}

function goIdle() {
  stopCountdown();
  setState({
    mode: 'idle',
    now_playing: null,
    countdown: { active: false, seconds_remaining: 0, next_singer: null, next_song: null },
    player_command: { action: 'stop', timestamp: Date.now() },
  });
}

function startNextSong() {
  stopCountdown();
  const queue = getQueue();

  if (queue.length === 0) {
    goIdle();
    return;
  }

  const next = queue[0];
  db.prepare("UPDATE queue SET status = 'playing' WHERE id = ?").run(next.id);
  const updatedQueue = getQueue();

  setState({
    mode: 'playing',
    now_playing: {
      song: next.song,
      singer: next.singer,
      started_at: new Date().toISOString(),
    },
    countdown: { active: false, seconds_remaining: 0, next_singer: null, next_song: null },
    queue: updatedQueue,
    player_command: { action: 'load', video_id: next.song.id, timestamp: Date.now() },
  });
}

function beginCountdown() {
  stopCountdown();
  const queue = getQueue();

  if (queue.length === 0) {
    goIdle();
    return;
  }

  const next = queue[0];
  const seconds = parseInt(getSetting('countdown_seconds')) || 10;

  setState({
    mode: 'between',
    now_playing: null,
    countdown: {
      active: true,
      seconds_remaining: seconds,
      next_singer: next.singer,
      next_song: next.song,
    },
    player_command: { action: 'stop', timestamp: Date.now() },
  });

  countdownTimer = setInterval(() => {
    const s = getState();
    if (s.mode !== 'between' || !s.countdown.active) {
      stopCountdown();
      return;
    }

    const remaining = s.countdown.seconds_remaining;
    if (remaining <= 1) {
      stopCountdown();
      if (getSetting('auto_play') === 'true') {
        startNextSong();
      } else {
        setState({
          countdown: { ...s.countdown, active: false, seconds_remaining: 0 },
        });
      }
    } else {
      setState({
        countdown: { ...s.countdown, seconds_remaining: remaining - 1 },
      });
    }
  }, 1000);
}

function handleSongEnded() {
  const playingItem = db.prepare("SELECT id FROM queue WHERE status = 'playing'").get();
  if (playingItem) {
    db.prepare("UPDATE queue SET status = 'done' WHERE id = ?").run(playingItem.id);
  }
  beginCountdown();
}

function skipSong() {
  stopCountdown();
  const s = getState();

  if (s.mode === 'playing') {
    const item = db.prepare("SELECT id FROM queue WHERE status = 'playing'").get();
    if (item) db.prepare("UPDATE queue SET status = 'skipped' WHERE id = ?").run(item.id);
  } else if (s.mode === 'between') {
    const queue = getQueue();
    if (queue.length > 0) {
      db.prepare("UPDATE queue SET status = 'skipped' WHERE id = ?").run(queue[0].id);
    }
  }

  syncQueue();
  beginCountdown();
}

function pausePlayback() {
  playerCmd('pause');
}

function resumePlayback() {
  const s = getState();
  if (s.mode === 'idle' || s.mode === 'between') {
    startNextSong();
  } else if (s.mode === 'playing') {
    playerCmd('play');
  }
}

module.exports = {
  startNextSong,
  beginCountdown,
  handleSongEnded,
  skipSong,
  pausePlayback,
  resumePlayback,
  goIdle,
};
