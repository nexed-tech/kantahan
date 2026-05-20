require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const os = require('os');
const QRCode = require('qrcode');

const { createWsServer, setState } = require('./ws');
const { getAllSettings } = require('./db');

const settingsRouter = require('./routes/api');
const { router: queueRouter } = require('./routes/queue');
const requestsRouter = require('./routes/requests');
const libraryRouter = require('./routes/library');
const channelsRouter = require('./routes/channels');
const playbackRouter = require('./routes/playback');
const mediaRouter = require('./routes/media');
const bgMusicRouter = require('./routes/bgmusic');

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
app.use('/api/playback', playbackRouter);
app.use('/api/media', mediaRouter);
app.use('/api/bgmusic', bgMusicRouter);

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

app.get('/api/info', (_req, res) => {
  const ip = getLocalIP();
  const dev = process.env.NODE_ENV !== 'production';
  res.json({
    localIP: ip,
    port: PORT,
    dev,
    urls: {
      display: dev ? `http://${ip}:3001`          : `http://${ip}:${PORT}/display`,
      dj:      dev ? `http://${ip}:3002`          : `http://${ip}:${PORT}/dj`,
      request: dev ? `http://${ip}:3003`          : `http://${ip}:${PORT}/request`,
    },
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

const dbSettings = getAllSettings();
setState({
  settings: {
    auto_approve: dbSettings.auto_approve === 'true',
    singer_rotation: dbSettings.singer_rotation === 'true',
    auto_play: dbSettings.auto_play === 'true',
    auto_queue: dbSettings.auto_queue === 'true',
    countdown_seconds: parseInt(dbSettings.countdown_seconds) || 10,
  },
  background_music: {
    playing: false,
    volume: parseFloat(dbSettings.background_music_volume || '0.4'),
    url: dbSettings.background_music_url || '',
    source: dbSettings.background_music_source || 'youtube',
  },
});

server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`Kantahan server → http://localhost:${PORT}`);
  console.log(`  Display : http://${ip}:${PORT}/display`);
  console.log(`  DJ      : http://${ip}:${PORT}/dj`);
  console.log(`  Request : http://${ip}:${PORT}/request`);
  if (process.send) process.send('ready');
});
