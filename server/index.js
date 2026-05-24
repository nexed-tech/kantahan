require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const os = require('os');
const QRCode = require('qrcode');
const { Bonjour } = require('bonjour-service');

const { createWsServer, setState } = require('./ws');
const { getAllSettings, getSetting, ready: dbReady } = require('./db');
const { issueToken, requireDjAuth } = require('./middleware/auth');

const settingsRouter = require('./routes/api');
const { router: queueRouter } = require('./routes/queue');
const requestsRouter = require('./routes/requests');
const libraryRouter = require('./routes/library');
const channelsRouter = require('./routes/channels');
const playbackRouter = require('./routes/playback');
const mediaRouter = require('./routes/media');
const bgMusicRouter  = require('./routes/bgmusic');
const youtubeRouter  = require('./routes/youtube');

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/settings', settingsRouter);
app.use('/api/queue', queueRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/playback', requireDjAuth, playbackRouter);
app.use('/api/media', mediaRouter);
app.use('/api/bgmusic',  bgMusicRouter);
app.use('/api/youtube', requireDjAuth, youtubeRouter);

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('100.')) continue; // Tailscale CGNAT range
      if (net.address.startsWith('172.')) continue; // Docker bridge ranges
      return net.address;
    }
  }
  return 'localhost';
}

function getBaseUrl() {
  const hostUrl = getSetting('host_url');
  if (hostUrl && hostUrl.trim()) return hostUrl.trim();
  const mdnsName = getSetting('mdns_name') || 'kantahan';
  return `http://${mdnsName}.local:${PORT}`;
}

function buildUrls(base) {
  const dev = process.env.NODE_ENV !== 'production';
  if (dev) {
    const ip = getLocalIP();
    return {
      display: `http://${ip}:3001`,
      dj:      `http://${ip}:3002`,
      request: `http://${ip}:3003`,
    };
  }
  return {
    display: `${base}/display`,
    dj:      `${base}/dj`,
    request: `${base}/request`,
  };
}

app.get('/api/info', (_req, res) => {
  const base = getBaseUrl();
  const ip   = getLocalIP();
  res.json({
    localIP: ip,
    port: PORT,
    dev: process.env.NODE_ENV !== 'production',
    electron: process.env.ELECTRON === '1',
    baseUrl: base,
    urls: buildUrls(base),
  });
});

app.get('/api/qr', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('url required');
  try {
    const svg = await QRCode.toString(url, { type: 'svg', width: 256, margin: 1 });
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(svg);
  } catch {
    res.status(500).send('QR generation failed');
  }
});

// PIN verification — on success issues a session token the DJ client must send
// on all protected requests as "Authorization: Bearer <token>".
app.post('/api/auth/verify-pin', async (req, res) => {
  const { pin } = req.body;
  if (typeof pin !== 'string') return res.status(400).json({ ok: false });
  const bcrypt = require('bcryptjs');
  const hash = getSetting('dj_pin_hash');
  if (!hash) return res.json({ ok: true, token: issueToken() }); // no PIN set — grant immediately
  const ok = await bcrypt.compare(pin, hash);
  if (!ok) return res.json({ ok: false });
  res.json({ ok: true, token: issueToken() });
});

if (process.env.NODE_ENV === 'production') {
  const distRoot = path.join(__dirname, '../dist');
  for (const screen of ['display', 'dj', 'request']) {
    app.use(`/${screen}`, express.static(path.join(distRoot, screen)));
    app.get(`/${screen}/*`, (_req, res) =>
      res.sendFile(path.join(distRoot, screen, 'index.html'))
    );
  }
}

createWsServer(server);

dbReady.then(() => {
  const dbSettings = getAllSettings();
  setState({
    settings: {
      auto_approve: dbSettings.auto_approve === 'true',
      singer_rotation: dbSettings.singer_rotation === 'true',
      auto_play: dbSettings.auto_play === 'true',
      auto_queue: dbSettings.auto_queue === 'true',
      auto_start: dbSettings.auto_start === 'true',
      countdown_seconds: parseInt(dbSettings.countdown_seconds) || 10,
    },
    background_music: {
      playing: false,
      volume: parseFloat(dbSettings.background_music_volume || '0.4'),
      url: dbSettings.background_music_url || '',
      source: dbSettings.background_music_source || 'youtube',
      local_path: dbSettings.background_music_local_path || '',
    },
    display_message: {
      active: dbSettings.display_message_active === 'true',
      text: dbSettings.display_message || '',
      position: dbSettings.display_message_position || 'bottom',
      scroll: dbSettings.display_message_scroll === 'true',
    },
  });

  server.listen(PORT, () => {
    const ip = getLocalIP();
    const mdnsName = dbSettings.mdns_name || 'kantahan';

    console.log(`Kantahan server → http://localhost:${PORT}`);
    console.log(`  Display : http://${ip}:${PORT}/display`);
    console.log(`  DJ      : http://${ip}:${PORT}/dj`);
    console.log(`  Request : http://${ip}:${PORT}/request`);
    console.log(`  mDNS    : http://${mdnsName}.local:${PORT}`);

    try {
      const bonjour = new Bonjour();
      const svc = bonjour.publish({ name: 'Kantahan', type: 'http', port: PORT });
      svc.on('error', (err) => console.warn('mDNS:', err.message));
    } catch (err) {
      console.warn('mDNS publish failed (non-fatal):', err.message);
    }

    if (process.send) process.send('ready');
  });
});
