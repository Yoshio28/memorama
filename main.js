'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');
const community = require('./community');

if (process.env.MEMORA_DATA_DIR) app.setPath('userData', path.resolve(process.env.MEMORA_DATA_DIR));

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'memora-data.json');
const backupDir = () => path.join(dataDir(), 'backups');
const MAX_BACKUPS = 14;

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

/** Copia de seguridad diaria del archivo de datos (se conservan las últimas MAX_BACKUPS). */
function dailyBackup() {
  try {
    if (!fs.existsSync(dataFile())) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(backupDir(), `memora-${day}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(dataFile(), target);
    const files = fs.readdirSync(backupDir()).filter((f) => /^memora-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) fs.unlinkSync(path.join(backupDir(), f));
  } catch (err) {
    console.error('No se pudo crear la copia de seguridad:', err);
  }
}

function readData() {
  try {
    if (!fs.existsSync(dataFile())) return null;
    return fs.readFileSync(dataFile(), 'utf8');
  } catch (err) {
    console.error('No se pudo leer el archivo de datos:', err);
    return null;
  }
}

ipcMain.handle('db:load', () => {
  dailyBackup();
  return readData();
});

ipcMain.handle('db:save', (_e, json) => {
  atomicWrite(dataFile(), json);
  return true;
});

ipcMain.on('db:saveSync', (e, json) => {
  try {
    atomicWrite(dataFile(), json);
    e.returnValue = true;
  } catch (err) {
    console.error(err);
    e.returnValue = false;
  }
});

ipcMain.handle('file:save', async (e, { defaultName, content, filters }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, content, 'utf8');
  return res.filePath;
});

ipcMain.handle('file:open', async (e, { filters }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (res.canceled || !res.filePaths.length) return null;
  const file = res.filePaths[0];
  return { name: path.basename(file), content: fs.readFileSync(file, 'utf8') };
});

ipcMain.handle('app:openDataFolder', () => shell.openPath(dataDir()));
ipcMain.handle('app:version', () => app.getVersion());

// Actualizaciones (solo se conecta a internet cuando el usuario lo pide)
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:install', (e) => updater.install((received, total) => {
  if (!e.sender.isDestroyed()) e.sender.send('update:progress', { received, total });
}));
ipcMain.handle('update:openPage', () => updater.openPage());

// Comunidad (Firebase): solo se conecta cuando el usuario abre la sección o publica
ipcMain.handle('community:status', () => community.status());
ipcMain.handle('community:list', (_e, opts) => community.list(opts || {}));
ipcMain.handle('community:get', (_e, id) => community.get(String(id)));
ipcMain.handle('community:publish', (_e, deck, remoteId) => community.publish(deck, remoteId ? String(remoteId) : null));
ipcMain.handle('community:remove', (_e, id) => community.remove(String(id)));
ipcMain.handle('community:report', (_e, id, reason) => community.report(String(id), String(reason || '')));

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Memora',
    backgroundColor: '#f6f5f2',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', (ev) => ev.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  // Aplicación 100 % local: se bloquea cualquier petición que no sea a archivos de la propia app.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const local = /^(file|devtools|data|blob|chrome-extension):/i.test(details.url);
    if (!local) console.warn('Petición de red bloqueada:', details.url);
    callback({ cancel: !local });
  });
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' }] : []),
      { label: 'Archivo', submenu: [isMac ? { role: 'close', label: 'Cerrar' } : { role: 'quit', label: 'Salir' }] },
      {
        label: 'Editar',
        submenu: [
          { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' },
          { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
          { role: 'selectAll', label: 'Seleccionar todo' },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload', label: 'Recargar' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
          { type: 'separator' }, { role: 'resetZoom', label: 'Tamaño real' }, { role: 'zoomIn', label: 'Acercar' },
          { role: 'zoomOut', label: 'Alejar' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' },
        ],
      },
    ]),
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
