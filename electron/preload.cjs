const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('livrotoApp', {
  platform: process.platform,
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
