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
  account: {
    status: () => ipcRenderer.invoke('account:status'),
    signInWithGoogle: () => ipcRenderer.invoke('account:google'),
    cancel: () => ipcRenderer.invoke('account:cancel'),
    signOut: () => ipcRenderer.invoke('account:signOut'),
    googlePhoto: (url) => ipcRenderer.invoke('account:photo', url),
  },
  cloud: {
    pull: (known) => ipcRenderer.invoke('cloud:pull', known),
    push: (json, expected) => ipcRenderer.invoke('cloud:push', json, expected),
  },
  aux: {
    read: (name) => ipcRenderer.invoke('aux:read', name),
    write: (name, text) => ipcRenderer.invoke('aux:write', name, text),
  },
  onBeforeClose: (cb) => ipcRenderer.on('app:before-close', () => cb()),
  closeReady: () => ipcRenderer.send('app:close-ready'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleasePage: () => ipcRenderer.invoke('update:openPage'),
  onUpdateProgress: (cb) => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('update:progress', fn);
    return () => ipcRenderer.removeListener('update:progress', fn);
  },
});
