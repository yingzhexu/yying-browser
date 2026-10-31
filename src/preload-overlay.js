const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onRender: (cb) => ipcRenderer.on('render', (_e, data) => cb(data)),
  pick: (i) => ipcRenderer.invoke('overlay:pick', i),
});
