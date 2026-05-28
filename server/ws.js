const { WebSocketServer } = require('ws');

let wss;
let activeDisplayClient = null;

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
    auto_start: false,
    countdown_seconds: 10,
    qr_enabled: true,
  },
  background_music: {
    playing: false,
    volume: 0.4,
    url: '',
    source: 'local',
    local_path: '',
  },
  player_command: null,
  playback_position: { elapsed_seconds: 0, duration_seconds: 0 },
  scanning: {
    active: false,
    processed: 0,
    total: null,
    skipped: [],
    error: null,
  },
  display_message: {
    active: false,
    text: '',
    position: 'bottom',
    scroll: false,
  },
  display_connected: false,
};

function createWsServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.role = null;
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', state: buildStateFor(ws) }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'IDENTIFY' && msg.role) {
          ws.role = msg.role;
          if (msg.role === 'display' && !activeDisplayClient) {
            activeDisplayClient = ws;
            broadcastDisplayStatus();
          }
        }
        if (msg.type === 'CLAIM_DISPLAY' && ws.role === 'dj') {
          activeDisplayClient = findOldestDisplay() || activeDisplayClient;
          broadcastDisplayStatus();
        }
      } catch {}
    });

    ws.on('close', () => {
      if (ws === activeDisplayClient) {
        activeDisplayClient = null;
        const next = findOldestDisplay();
        if (next) activeDisplayClient = next;
        broadcastDisplayStatus();
      }
    });

    ws.on('error', () => {});
  });
}

function findOldestDisplay() {
  if (!wss) return null;
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.role === 'display') return client;
  }
  return null;
}

function broadcastDisplayStatus() {
  const connected = activeDisplayClient !== null && activeDisplayClient.readyState === 1;
  appState = { ...appState, display_connected: connected };
  broadcast(appState);
}

function buildStateFor(ws) {
  if (ws === activeDisplayClient) return appState;
  // Non-active-display clients: strip player_command
  return { ...appState, player_command: null };
}

function broadcast(state) {
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;
    const msg = JSON.stringify({ type: 'STATE_UPDATE', state: buildStateFor(client) });
    client.send(msg);
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
