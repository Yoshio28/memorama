'use strict';
/*
 * Inicio de sesión con Google en escritorio.
 *
 * 1. Se abre un servidor local temporal en 127.0.0.1 (puerto libre al azar).
 * 2. Se abre el navegador del sistema con la página de Google. Al terminar, Google envía a la
 *    página puente (docs/auth/ en GitHub Pages) el id_token en el fragmento (#) de la URL; la
 *    página lo reenvía a http://127.0.0.1:<puerto>/auth y este servidor lo recoge.
 * 3. Se comprueban `state` y `nonce`, y el id_token se canjea en Firebase (community-core).
 *
 * La contraseña de Google nunca pasa por la app: se escribe en la página de Google.
 */
const { shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');

const TIMEOUT = 5 * 60 * 1000;
let pending = null;

const rand = () => crypto.randomBytes(16).toString('base64url');

const page = (title, text) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#1a1240;color:#f0efec;display:grid;place-items:center;height:100vh;margin:0}
main{text-align:center;max-width:420px;padding:24px}h1{font-size:22px}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

function cancel() {
  if (pending) pending.fail(Object.assign(new Error('Inicio de sesión cancelado.'), { code: 'CANCELLED' }));
}

/** Devuelve { uid, email, name, photoUrl, idMap } o lanza un error legible. */
async function signIn(community, win) {
  cancel();
  const nonce = rand();
  const secret = rand();
  let resolveTok, rejectTok;
  const tokenP = new Promise((res, rej) => { resolveTok = res; rejectTok = rej; });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/auth') { res.writeHead(404); return res.end(); }
    const state = url.searchParams.get('state') || '';
    let ok = false;
    try { ok = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')).s === secret; } catch { ok = false; }
    if (!ok) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page('No se pudo iniciar sesión', 'La respuesta no corresponde a este inicio de sesión. Vuelve a Memomancer e inténtalo de nuevo.'));
    }
    const error = url.searchParams.get('error');
    const idToken = url.searchParams.get('id_token');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (error || !idToken) {
      res.end(page('Inicio de sesión cancelado', 'Puedes cerrar esta pestaña y volver a Memomancer.'));
      return rejectTok(Object.assign(new Error(error === 'access_denied' ? 'Has cancelado el inicio de sesión.' : 'Google no completó el inicio de sesión.'), { code: 'CANCELLED' }));
    }
    res.end(page('¡Listo! 🐈‍⬛🪄', 'Has iniciado sesión con Google. Ya puedes cerrar esta pestaña y volver a Memomancer.'));
    resolveTok(idToken);
  });
  await new Promise((res, rej) => server.once('error', rej).listen(0, '127.0.0.1', res));
  const timer = setTimeout(() => rejectTok(Object.assign(new Error('Se agotó el tiempo para iniciar sesión. Inténtalo de nuevo.'), { code: 'TIMEOUT' })), TIMEOUT);
  const me = { fail: rejectTok };
  pending = me;

  try {
    const state = Buffer.from(JSON.stringify({ p: 'd', port: server.address().port, s: secret })).toString('base64url');
    const url = await community.account.googleAuthUrl({ nonce, state });
    // Solo para pruebas automáticas: en vez de abrir el navegador, deja la URL en un archivo.
    if (process.env.MEMORA_GOOGLE_TEST_URLFILE) fs.writeFileSync(process.env.MEMORA_GOOGLE_TEST_URLFILE, url);
    else await shell.openExternal(url);
    const idToken = await tokenP;
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); }
    return await community.account.signInWithGoogle(idToken, { nonce });
  } finally {
    clearTimeout(timer);
    server.close();
    if (pending === me) pending = null;
  }
}

module.exports = { signIn, cancel };
