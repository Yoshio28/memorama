'use strict';
/*
 * Actualizaciones desde las releases de GitHub.
 *
 * Memomancer solo se conecta a internet cuando el usuario pulsa «Buscar actualizaciones».
 * El resto de la app sigue sin red: las peticiones de la interfaz están bloqueadas en la
 * sesión por defecto, y el actualizador usa una sesión aparte que solo se abre aquí.
 *
 * Flujo: check() consulta la última release → install() descarga el instalador, comprueba
 * tamaño y SHA-256 publicados por GitHub y lo ejecuta en modo silencioso (/S); el instalador
 * cierra Memomancer, actualiza los archivos y vuelve a abrirla (/RELAUNCH).
 */
const { app, net, session, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO = 'Yoshio28/memorama';
const API = process.env.MEMORA_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const ASSET_RE = /^Memomancer-Setup-(\d+\.\d+\.\d+)\.exe$/;
// Solo para pruebas automáticas: no ejecuta el instalador, deja constancia en un archivo.
const TEST_MODE = process.env.MEMORA_UPDATE_TEST === '1';

let updaterSession = null;
let pending = null; // última release encontrada: { version, url, size, sha256, name, page }

function netSession() {
  if (!updaterSession) updaterSession = session.fromPartition('memora-updater', { cache: false });
  return updaterSession;
}

/** Compara versiones x.y.z: >0 si a es mayor que b. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

/** ¿Está instalada con el instalador? (la versión portable no puede actualizarse sola) */
function isInstalled() {
  if (TEST_MODE) return true;
  return process.platform === 'win32' && fs.existsSync(path.join(path.dirname(process.execPath), 'Desinstalar Memomancer.exe'));
}

function request(url, onResponse) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, session: netSession(), redirect: 'follow', useSessionCookies: false });
    req.setHeader('User-Agent', `Memomancer/${app.getVersion()}`);
    req.setHeader('Accept', url === API ? 'application/vnd.github+json' : 'application/octet-stream');
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        res.resume?.();
        reject(new Error(res.statusCode === 403 || res.statusCode === 429
          ? 'GitHub ha limitado las consultas por ahora. Inténtalo de nuevo en un rato.'
          : `GitHub respondió con el código ${res.statusCode}.`));
        return;
      }
      onResponse(res, resolve, reject);
    });
    req.on('error', (err) => reject(new Error('No se pudo conectar con GitHub. Revisa tu conexión a internet. (' + err.message + ')')));
    req.end();
  });
}

async function fetchJson(url) {
  const body = await request(url, (res, resolve, reject) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
  return JSON.parse(body.toString('utf8'));
}

function download(url, dest, size, sha256, onProgress) {
  return request(url, (res, resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(dest);
    let received = 0;
    let last = 0;
    res.on('data', (chunk) => {
      received += chunk.length;
      hash.update(chunk);
      out.write(chunk);
      const t = Date.now();
      if (t - last > 150) { last = t; onProgress(received, size); }
    });
    res.on('error', (err) => { out.destroy(); reject(err); });
    res.on('end', () => {
      out.end(() => {
        onProgress(received, size);
        if (size && received !== size) return reject(new Error(`La descarga está incompleta (${received} de ${size} bytes).`));
        const got = hash.digest('hex');
        if (sha256 && got !== sha256) return reject(new Error('La descarga no coincide con la huella SHA-256 publicada en GitHub. No se instalará.'));
        resolve(dest);
      });
    });
  });
}

/** Consulta la última release. */
async function check() {
  const current = app.getVersion();
  const rel = await fetchJson(API);
  const latest = String(rel.tag_name || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error('No se encontró ninguna versión publicada.');
  const asset = (rel.assets || []).find((a) => ASSET_RE.test(a.name) && a.name.includes(latest));
  const page = typeof rel.html_url === 'string' && rel.html_url.startsWith(`https://github.com/${REPO}/`) ? rel.html_url : RELEASES_PAGE;
  const newer = compareVersions(latest, current) > 0;
  const digest = asset && typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7).toLowerCase() : null;
  pending = newer && asset ? { version: latest, url: asset.browser_download_url, size: asset.size, sha256: digest, name: asset.name, page } : null;
  return {
    current, latest, newer, page,
    notes: String(rel.body || '').slice(0, 6000),
    size: asset ? asset.size : 0,
    canInstall: newer && !!asset && isInstalled(),
  };
}

/** Descarga e instala la versión encontrada por check(). */
async function install(onProgress) {
  if (!pending) throw new Error('Primero busca actualizaciones.');
  const dir = path.join(app.getPath('temp'), 'memora-update');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, pending.name);
  await download(pending.url, dest, pending.size, pending.sha256, onProgress);
  const args = ['/S', '/RELAUNCH'];
  if (TEST_MODE) {
    fs.writeFileSync(path.join(app.getPath('userData'), 'update-test.json'), JSON.stringify({ file: dest, args, bytes: fs.statSync(dest).size }));
    return { ok: true, test: true };
  }
  const child = spawn(dest, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  // El instalador cierra Memomancer; salimos antes por si acaso, dando tiempo a que arranque.
  setTimeout(() => app.quit(), 800);
  return { ok: true };
}

function openPage() {
  return shell.openExternal(pending?.page || RELEASES_PAGE);
}

module.exports = { check, install, openPage, compareVersions };
