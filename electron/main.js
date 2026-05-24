const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;
let tray;
let hasShownTrayHint = false;

const PORT          = parseInt(process.env.PORT) || 3000;
const SETTINGS_PATH = path.join(app.getPath('userData'), 'app-settings.json');

// ── Persisted app settings (close behaviour, etc.) ────────────────────────────

function readAppSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return {}; }
}

function writeAppSettings(updates) {
  const current = readAppSettings();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ ...current, ...updates }, null, 2));
}

// ── ffprobe path fix for packaged app ─────────────────────────────────────────

function getFfprobePath() {
  try {
    const { path: p } = require('ffprobe-static');
    return app.isPackaged ? p.replace('app.asar', 'app.asar.unpacked') : p;
  } catch { return ''; }
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function setupTray() {
  if (tray) return; // already running

  const iconPath = path.join(__dirname, 'icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      );

  try {
    tray = new Tray(icon);
  } catch (e) {
    console.warn('Tray unavailable:', e.message);
    tray = null;
    return;
  }

  tray.setToolTip(`Kantahan  (port ${PORT})`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show DJ Screen', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: `Display  →  localhost:${PORT}/display`, click: () => shell.openExternal(`http://localhost:${PORT}/display`) },
    { label: `Requests  →  localhost:${PORT}/request`, click: () => shell.openExternal(`http://localhost:${PORT}/request`) },
    { type: 'separator' },
    { label: 'Quit Kantahan', click: () => { app.isQuitting = true; app.quit(); } },
  ]));

  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function teardownTray() {
  if (tray) { tray.destroy(); tray = null; }
  hasShownTrayHint = false;
}

// ── Server ────────────────────────────────────────────────────────────────────

function startServer() {
  const serverPath = path.join(__dirname, '../server/index.js');

  serverProcess = fork(serverPath, [], {
    silent: true,
    env: {
      ...process.env,
      PORT:       String(PORT),
      NODE_ENV:   'production',
      DB_PATH:    path.join(app.getPath('userData'), 'karaoke.db'),
      FFPROBE_PATH: getFfprobePath(),
      ELECTRON:   '1',   // tells the server (and therefore the UI) it's inside Electron
    },
  });

  let stderrBuf = '';
  serverProcess.stderr.on('data', (d) => { stderrBuf += d; });
  serverProcess.stdout.on('data', () => {});

  serverProcess.on('message', (msg) => {
    if (msg === 'ready') {
      createWindow();
      // Restore tray if the user had it enabled last session
      if (readAppSettings().closeBehaviour === 'tray') setupTray();
    }
  });

  serverProcess.on('error', (err) => {
    dialog.showErrorBox('Kantahan — Server Error', err.message);
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        'Kantahan failed to start',
        `Server exited with code ${code}.\n\n${stderrBuf.slice(-2000)}`
      );
      app.quit();
    }
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0a0612',
    title: 'Kantahan',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}/dj`);

  mainWindow.on('close', (e) => {
    if (app.isQuitting) return;
    const { closeBehaviour } = readAppSettings();
    if (closeBehaviour === 'tray' && tray) {
      e.preventDefault();
      mainWindow.hide();
      if (!hasShownTrayHint) {
        hasShownTrayHint = true;
        tray.displayBalloon({
          iconType: 'info',
          title: 'Kantahan is still running',
          content: 'The server is active in the background. Right-click the tray icon to quit.',
        });
      }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('get-close-behaviour', () => {
  return readAppSettings().closeBehaviour || 'quit';
});

ipcMain.handle('set-close-behaviour', (_, value) => {
  if (value !== 'quit' && value !== 'tray') return { ok: false };
  writeAppSettings({ closeBehaviour: value });
  if (value === 'tray') setupTray();
  else teardownTray();
  return { ok: true };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startServer();
});

app.on('window-all-closed', () => { app.quit(); });

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});

// macOS: re-open the window when clicking the dock icon
app.on('activate', () => {
  if (!mainWindow && serverProcess) createWindow();
});
