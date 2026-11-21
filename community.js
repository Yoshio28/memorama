'use strict';
/*
 * Comunidad en escritorio: adapta src/community-core.js al proceso principal de Electron.
 *
 * Las peticiones salen desde aquí con una sesión de red propia: la interfaz sigue sin acceso a
 * internet y Memomancer solo se conecta cuando el usuario abre «Comunidad», publica, descarga
 * o denuncia un mazo. La sesión anónima se guarda en userData/community-auth.json.
 */
const { app, net, session } = require('electron');
const fs = require('fs');
const path = require('path');
const Core = require('./src/community-core.js');

const CONFIG_FILE = path.join(__dirname, 'firebase-config.json');
// Para pruebas con el emulador de Firebase: MEMORA_FIREBASE_EMULATOR=127.0.0.1 (auth :9099, firestore :8080)
const EMULATOR = process.env.MEMORA_FIREBASE_EMULATOR || '';

let netSess = null;
const sess = () => (netSess ||= session.fromPartition('memora-community', { cache: false }));
const authFile = () => path.join(app.getPath('userData'), 'community-auth.json');

function request(method, url, { headers, body, binary } = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method, url, session: sess(), useSessionCookies: false });
    req.setHeader('User-Agent', `Memomancer/${app.getVersion()}`);
    for (const [k, v] of Object.entries(headers || {})) req.setHeader(k, v);
    req.on('response', (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (binary) {
          const type = String(res.headers['content-type'] || '').split(';')[0];
          return resolve({ status: res.statusCode, base64: /^image\/(png|jpeg|webp|gif)$/.test(type) ? buf.toString('base64') : '', type });
        }
        resolve({ status: res.statusCode, text: buf.toString('utf8') });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = Core.create({
  request,
  async loadAuth() {
    try { return JSON.parse(fs.readFileSync(authFile(), 'utf8')); } catch { return null; }
  },
  async saveAuth(a) {
    fs.mkdirSync(path.dirname(authFile()), { recursive: true });
    fs.writeFileSync(authFile(), JSON.stringify(a), 'utf8');
  },
  async config() {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* sin configurar */ }
    if (process.env.MEMORA_FIREBASE_PROJECT) cfg = { apiKey: cfg.apiKey || 'demo-key', projectId: process.env.MEMORA_FIREBASE_PROJECT };
    return { ...cfg, emulator: EMULATOR, ...(process.env.MEMORA_GOOGLE_RELAY ? { googleClientId: cfg.googleClientId || 'test', authRelay: process.env.MEMORA_GOOGLE_RELAY } : {}) };
  },
  version: () => app.getVersion(),
});
