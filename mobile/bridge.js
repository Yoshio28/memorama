/*
 * Memomancer para Android: implementa window.memora (lo mismo que preload.js + main.js en
 * escritorio) con los plugins nativos de Capacitor. La interfaz (src/app.js) es la misma.
 *
 * - Datos: memora-data.json en la carpeta privada de la app, con copias diarias (14 días).
 * - Exportar: se comparte el archivo (Drive, correo, Archivos…). Importar: selector de archivos.
 * - Comunidad: src/community-core.js con fetch.
 * - Actualizaciones: se consulta la última release de GitHub y se abre la descarga del APK.
 * - Cuenta de Google: se abre la página de Google en una pestaña del navegador; la página
 *   puente (docs/auth/) vuelve a la app con app.memomancer://auth?id_token=…
 */
(function () {
  'use strict';
  const Cap = window.Capacitor;
  const Filesystem = Cap.registerPlugin('Filesystem');
  const App = Cap.registerPlugin('App');
  const Share = Cap.registerPlugin('Share');
  const Browser = Cap.registerPlugin('Browser');

  const DATA = 'Data';     // Directory.Data: carpeta privada de la app
  const CACHE = 'Cache';
  const FILE = 'memora-data.json';
  const TMP = 'memora-data.json.tmp';
  const AUTH = 'community-auth.json';
  const MAX_BACKUPS = 14;

  const REPO = 'Yoshio28/memorama';
  const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
  const APK_RE = /^Memomancer-(\d+\.\d+\.\d+)\.apk$/;

  // ---------------------------------------------------------------- archivos
  async function readText(path, directory = DATA) {
    try {
      const r = await Filesystem.readFile({ path, directory, encoding: 'utf8' });
      return typeof r.data === 'string' ? r.data : null;
    } catch { return null; }
  }
  const writeText = (path, data, directory = DATA) =>
    Filesystem.writeFile({ path, directory, data, encoding: 'utf8', recursive: true });
  const remove = (path, directory = DATA) => Filesystem.deleteFile({ path, directory }).catch(() => {});

  // Las escrituras van en cola para que nunca se pisen entre sí.
  let queue = Promise.resolve();
  const enqueue = (fn) => (queue = queue.then(fn, fn));

  /** Escritura segura: primero un temporal y luego se sustituye el archivo bueno. */
  function saveData(json) {
    return enqueue(async () => {
      await writeText(TMP, json);
      await remove(FILE);
      await Filesystem.rename({ from: TMP, to: FILE, directory: DATA, toDirectory: DATA });
      return true;
    });
  }

  async function dailyBackup(raw) {
    if (!raw) return;
    const day = new Date().toISOString().slice(0, 10);
    const target = `backups/memora-${day}.json`;
    try {
      const { files } = await Filesystem.readdir({ path: 'backups', directory: DATA }).catch(() => ({ files: [] }));
      const names = files.map((f) => (typeof f === 'string' ? f : f.name)).filter((n) => /^memora-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
      if (!names.includes(`memora-${day}.json`)) { await writeText(target, raw); names.push(`memora-${day}.json`); }
      for (const old of names.slice(0, Math.max(0, names.length - MAX_BACKUPS))) await remove(`backups/${old}`);
    } catch (err) { console.error('Copia diaria', err); }
  }

  // ---------------------------------------------------------------- importar / exportar
  function pickFile(filters) {
    return new Promise((resolve) => {
      const exts = (filters || []).flatMap((f) => f.extensions || []).filter((e) => e !== '*');
      const all = (filters || []).some((f) => (f.extensions || []).includes('*'));
      const input = document.createElement('input');
      input.type = 'file';
      if (exts.length && !all) input.accept = exts.map((e) => '.' + e).join(',');
      input.style.display = 'none';
      let done = false;
      const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
      input.addEventListener('change', async () => {
        const f = input.files && input.files[0];
        if (!f) return finish(null);
        try { finish({ name: f.name, content: await f.text() }); } catch { finish(null); }
      });
      input.addEventListener('cancel', () => finish(null));
      document.body.appendChild(input);
      input.click();
    });
  }

  async function shareFile({ defaultName, content }) {
    const name = String(defaultName || 'memomancer.txt').replace(/[\\/:*?"<>|]/g, '_');
    const { uri } = await writeText(`export/${name}`, content, CACHE);
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'Guardar o enviar ' + name });
      return name;
    } catch (err) {
      if (/cancel/i.test(String(err && err.message))) return null;
      throw err;
    }
  }

  // ---------------------------------------------------------------- comunidad
  async function fetchText(method, url, { headers, body, binary } = {}) {
    const res = await fetch(url, { method, headers, body, cache: 'no-store', credentials: 'omit' });
    if (binary) {
      const type = (res.headers.get('content-type') || '').split(';')[0];
      if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return { status: res.status, base64: '', type };
      const bytes = new Uint8Array(await res.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { status: res.status, base64: btoa(s), type };
    }
    return { status: res.status, text: await res.text() };
  }
  let firebaseCfg = null;
  const community = window.CommunityCore.create({
    request: fetchText,
    async loadAuth() { const t = await readText(AUTH); return t ? JSON.parse(t) : null; },
    async saveAuth(a) { await writeText(AUTH, JSON.stringify(a)); },
    async config() {
      if (!firebaseCfg) {
        try { firebaseCfg = await (await fetch('firebase-config.json')).json(); } catch { firebaseCfg = {}; }
      }
      return firebaseCfg;
    },
    version: () => versionP,
  });

  // ---------------------------------------------------------------- cuenta de Google
  const rand = () => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  let pendingGoogle = null;
  function finishGoogle(fn) {
    const p = pendingGoogle;
    pendingGoogle = null;
    if (p) fn(p);
  }
  async function signInWithGoogle() {
    if (pendingGoogle) finishGoogle((p) => p.reject(Object.assign(new Error('Inicio de sesión cancelado.'), { code: 'CANCELLED' })));
    const nonce = rand();
    const secret = rand();
    const state = btoa(JSON.stringify({ p: 'a', s: secret })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = await community.account.googleAuthUrl({ nonce, state });
    const tokenP = new Promise((resolve, reject) => { pendingGoogle = { secret, resolve, reject }; });
    await Browser.open({ url });
    const idToken = await tokenP;
    return community.account.signInWithGoogle(idToken, { nonce });
  }
  // La página puente devuelve el control a la app con app.memomancer://auth?id_token=…&state=…
  App.addListener('appUrlOpen', ({ url }) => {
    if (!/^app\.memomancer:\/\/auth\b/.test(url || '')) return;
    const q = new URL(url.replace(/^app\.memomancer:\/\//, 'https://app/')).searchParams;
    let state = null;
    try { state = JSON.parse(atob(String(q.get('state') || '').replace(/-/g, '+').replace(/_/g, '/'))); } catch { state = null; }
    finishGoogle((p) => {
      if (!state || state.s !== p.secret) return p.reject(new Error('La respuesta no corresponde a este inicio de sesión. Inténtalo de nuevo.'));
      if (q.get('error') || !q.get('id_token')) return p.reject(Object.assign(new Error(q.get('error') === 'access_denied' ? 'Has cancelado el inicio de sesión.' : 'Google no completó el inicio de sesión.'), { code: 'CANCELLED' }));
      p.resolve(q.get('id_token'));
    });
    Browser.close().catch(() => {});
  });
  // Si el usuario cierra la pestaña de Google sin terminar, se cancela (con margen por si el
  // enlace de vuelta llega justo después).
  Browser.addListener('browserFinished', () => setTimeout(() => {
    finishGoogle((p) => p.reject(Object.assign(new Error('Inicio de sesión cancelado.'), { code: 'CANCELLED' })));
  }, 2500));

  // ---------------------------------------------------------------- actualizaciones
  function compareVersions(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
  }
  let pendingUrl = null;
  async function checkUpdate() {
    const current = await versionP;
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    } catch {
      throw new Error('No se pudo conectar con GitHub. Revisa tu conexión a internet.');
    }
    if (res.status === 403 || res.status === 429) throw new Error('GitHub ha limitado las consultas por ahora. Inténtalo de nuevo en un rato.');
    if (!res.ok) throw new Error(`GitHub respondió con el código ${res.status}.`);
    const rel = await res.json();
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error('No se encontró ninguna versión publicada.');
    const asset = (rel.assets || []).find((a) => APK_RE.test(a.name) && a.name.includes(latest));
    const newer = compareVersions(latest, current) > 0 && !!asset;
    pendingUrl = asset ? asset.browser_download_url : null;
    return { current, latest, newer, page: RELEASES_PAGE, notes: String(rel.body || '').slice(0, 6000), size: asset ? asset.size : 0, canInstall: false };
  }

  // ---------------------------------------------------------------- API para app.js
  const versionP = App.getInfo().then((i) => i.version).catch(() => '');

  window.memora = {
    platform: 'android',
    load: async () => { const raw = (await readText(FILE)) ?? (await readText(TMP)); await dailyBackup(raw); return raw; },
    save: saveData,
    // No hay guardado síncrono en Android; app.js guarda al pausar la app (ver abajo).
    saveSync: (json) => { saveData(json); return true; },
    saveFile: shareFile,
    openFile: ({ filters } = {}) => pickFile(filters),
    openDataFolder: async () => false,
    clearBackups: () => enqueue(() => Filesystem.rmdir({ path: 'backups', directory: DATA, recursive: true }).catch(() => {})),
    version: () => versionP,
    community,
    account: {
      status: () => community.account.status(),
      signInWithGoogle,
      cancel: async () => finishGoogle((p) => p.reject(Object.assign(new Error('Inicio de sesión cancelado.'), { code: 'CANCELLED' }))),
      signOut: () => community.account.signOut(),
      googlePhoto: (url) => community.account.googlePhoto(url).catch(() => null),
    },
    cloud: {
      pull: (known) => community.cloud.pull(known || null),
      push: (json, expected) => community.cloud.push(json, expected || null, 'Android'),
    },
    aux: {
      read: (name) => readText(name),
      write: (name, text) => (text === null ? remove(name) : enqueue(() => writeText(name, text))),
    },
    checkUpdate,
    installUpdate: async () => { throw new Error('En Android la actualización se instala desde el APK descargado.'); },
    openReleasePage: () => Browser.open({ url: pendingUrl || RELEASES_PAGE }),
    onUpdateProgress: () => () => {},
    openUrl: (url) => Browser.open({ url }),
  };

  // Guarda en cuanto la app pasa a segundo plano (Android puede cerrarla sin avisar después).
  App.addListener('pause', () => { if (typeof window.flush === 'function') window.flush(); });
  // Botón «Atrás» de Android: cierra diálogos y vuelve atrás; en Inicio, minimiza la app.
  App.addListener('backButton', () => {
    if (typeof window.handleBack === 'function' && window.handleBack()) return;
    App.minimizeApp();
  });
})();
