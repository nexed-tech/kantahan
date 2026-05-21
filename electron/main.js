const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;
let tray;

const PORT = parseInt(process.env.PORT) || 3000;

// In a packaged app, ffprobe-static's binary is unpacked outside the ASAR archive.
// The module's __dirname still points inside the ASAR, so fix the path manually.
function getFfprobePath() {
  try {
    const { path: p } = require('ffprobe-static');
    return app.isPackaged ? p.replace('app.asar', 'app.asar.unpacked') : p;
  } catch {
    return '';
  }
}

function startServer() {
  const serverPath = path.join(__dirname, '../server/index.js');

  serverProcess = fork(serverPath, [], {
    silent: true, // pipe stdio so we can capture errors
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      DB_PATH: path.join(app.getPath('userData'), 'karaoke.db'),
      FFPROBE_PATH: getFfprobePath(),
    },
  });

  let stderrBuf = '';
  serverProcess.stderr.on('data', (d) => { stderrBuf += d; });
  serverProcess.stdout.on('data', () => {}); // drain stdout

  serverProcess.on('message', (msg) => {
    if (msg === 'ready') {
      createWindow();
      setupTray();
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
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}/dj`);

  // Hide to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function setupTray() {
  // Use bundled icon if present, otherwise fall back to a 1×1 placeholder
  const iconPath = path.join(__dirname, 'icon.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Minimal valid 1×1 PNG — replace electron/icon.png with a proper 256×256 icon
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
  }

  try {
    tray = new Tray(icon);
  } catch (e) {
    console.warn('Tray unavailable:', e.message);
    return;
  }

  tray.setToolTip(`Kantahan  (port ${PORT})`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show DJ Screen',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: 'separator' },
    {
      label: `Display  →  localhost:${PORT}/display`,
      click: () => shell.openExternal(`http://localhost:${PORT}/display`),
    },
    {
      label: `Requests  →  localhost:${PORT}/request`,
      click: () => shell.openExternal(`http://localhost:${PORT}/request`),
    },
    { type: 'separator' },
    {
      label: 'Quit Kantahan',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]));

  // Double-click tray icon to bring window back
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startServer();
});

// Keep the process alive in the tray — do not auto-quit when the window is hidden
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});

// macOS: clicking the dock icon brings the window back
app.on('activate', () => {
  if (mainWindow) mainWindow.show();
  else if (serverProcess) createWindow();
});
