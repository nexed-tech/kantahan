const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

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

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startServer();
});

app.on('window-all-closed', () => { app.quit(); });

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});

// macOS: re-open the window when clicking the dock icon
app.on('activate', () => {
  if (!mainWindow && serverProcess) createWindow();
});
