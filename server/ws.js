const { WebSocketServer } = require('ws');

let wss;

let appState = {
  mode: 'idle',
  now_playing: null,
  countdown: {
    active: false,
    seconds_remaining: 10,
    next_singer: null,
    next_song: null,
  },
  queue: [],
  requests: [],
  requests_pending: 0,
  settings: {
    auto_approve: false,
    singer_rotation: true,
    auto_play: true,
    auto_queue: true,
    countdown_seconds: 10,
  },
  background_music: {
    playing: false,
    volume: 0.4,
    url: '',
    source: 'youtube',
  },
  player_command: null,
  indexing: {
    active: false,
    channel_name: null,
    processed: 0,
    total: null,
    error: null,
  },
};

function createWsServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', state: appState }));
    ws.on('error', () => {});
  });
}

function broadcast(state) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'STATE_UPDATE', state });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

function getState() {
  return appState;
}

function setState(partial) {
  appState = { ...appState, ...partial };
  broadcast(appState);
  return appState;
}

module.exports = { createWsServer, getState, setState };
