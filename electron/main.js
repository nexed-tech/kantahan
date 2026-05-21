const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function startServer() {
  const serverPath = path.join(__dirname, '../server/index.js');
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: process.env.PORT || 3000,
      NODE_ENV: 'production',
      DB_PATH: path.join(app.getPath('userData'), 'karaoke.db'),
    },
  });

  serverProcess.on('message', (msg) => {
    if (msg === 'ready') createWindow();
  });

  serverProcess.on('error', (err) => {
    console.error('Server process error:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  const port = process.env.PORT || 3000;
  mainWindow.loadURL(`http://localhost:${port}/display`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(startServer);

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow && serverProcess) createWindow();
});
