const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCloseBehaviour: ()      => ipcRenderer.invoke('get-close-behaviour'),
  setCloseBehaviour: (value) => ipcRenderer.invoke('set-close-behaviour', value),
});
