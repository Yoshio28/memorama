'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('memora', {
  load: () => ipcRenderer.invoke('db:load'),
  save: (json) => ipcRenderer.invoke('db:save', json),
  saveSync: (json) => ipcRenderer.sendSync('db:saveSync', json),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  version: () => ipcRenderer.invoke('app:version'),
  community: {
    status: () => ipcRenderer.invoke('community:status'),
    list: (opts) => ipcRenderer.invoke('community:list', opts),
    get: (id) => ipcRenderer.invoke('community:get', id),
    publish: (deck, remoteId) => ipcRenderer.invoke('community:publish', deck, remoteId),
    remove: (id) => ipcRenderer.invoke('community:remove', id),
    report: (id, reason) => ipcRenderer.invoke('community:report', id, reason),
  },
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleasePage: () => ipcRenderer.invoke('update:openPage'),
  onUpdateProgress: (cb) => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('update:progress', fn);
    return () => ipcRenderer.removeListener('update:progress', fn);
  },
});
