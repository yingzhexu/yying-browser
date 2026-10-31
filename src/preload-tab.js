// 只给内置页面（新标签页、错误页）开放接口，普通网页拿不到任何东西
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:' && /\/(newtab|error)\.html$/.test(location.pathname)) {
  contextBridge.exposeInMainWorld('yyInternal', {
    topSites: () => ipcRenderer.invoke('internal:topsites'),
    info: () => ipcRenderer.invoke('internal:info'),
    setSkin: (id) => ipcRenderer.invoke('internal:setSkin', id),
    pickWallpaper: () => ipcRenderer.invoke('internal:pickWallpaper'),
    clearWallpaper: () => ipcRenderer.invoke('internal:clearWallpaper'),
    onSkin: (cb) => ipcRenderer.on('skin', (_e, k) => cb(k)),
  });
}
