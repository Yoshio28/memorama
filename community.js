'use strict';
/*
 * Comunidad: mazos públicos en Firebase (Firestore + sesión anónima).
 *
 * Se usa la API REST de Firebase desde el proceso principal, con una sesión de red propia:
 * la interfaz sigue sin acceso a internet y Memomancer solo se conecta cuando el usuario abre
 * «Comunidad», publica, descarga o denuncia un mazo.
 *
 * La sesión anónima (uid + refreshToken) se guarda en userData/community-auth.json. El uid
 * identifica al dueño de los mazos publicados; si se pierde (reinstalar, otro equipo), los
 * mazos siguen publicados pero ya no se pueden editar ni retirar desde la app.
 */
const { app, net, session } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'firebase-config.json');
// Para pruebas con el emulador de Firebase: MEMORA_FIREBASE_EMULATOR=127.0.0.1 (auth :9099, firestore :8080)
const EMULATOR = process.env.MEMORA_FIREBASE_EMULATOR || '';

const LIST_FIELDS = ['title', 'description', 'authorName', 'ownerUid', 'cardCount', 'sectionNames', 'createdAt', 'updatedAt'];
const LIMITS = { title: 80, description: 500, authorName: 40, cards: 2000, sections: 50, field: 4000, bytes: 900 * 1024 };

let netSess = null;
let token = null; // { idToken, expiresAt }

function config() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* sin configurar */ }
  if (process.env.MEMORA_FIREBASE_PROJECT) cfg = { apiKey: cfg.apiKey || 'demo-key', projectId: process.env.MEMORA_FIREBASE_PROJECT };
  return cfg;
}
const configured = () => { const c = config(); return !!(c.apiKey && c.projectId); };

function urls() {
  const { apiKey, projectId } = config();
  const auth = EMULATOR ? `http://${EMULATOR}:9099/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
  const secure = EMULATOR ? `http://${EMULATOR}:9099/securetoken.googleapis.com/v1` : 'https://securetoken.googleapis.com/v1';
  const fsBase = EMULATOR ? `http://${EMULATOR}:8080/v1` : 'https://firestore.googleapis.com/v1';
  const db = `projects/${projectId}/databases/(default)/documents`;
  return {
    signUp: `${auth}/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    refresh: `${secure}/token?key=${encodeURIComponent(apiKey)}`,
    dbName: db,
    docs: `${fsBase}/${db}`,
  };
}

const authFile = () => path.join(app.getPath('userData'), 'community-auth.json');
function readAuth() {
  try { return JSON.parse(fs.readFileSync(authFile(), 'utf8')); } catch { return null; }
}
function writeAuth(a) {
  fs.mkdirSync(path.dirname(authFile()), { recursive: true });
  fs.writeFileSync(authFile(), JSON.stringify(a), 'utf8');
}

function sess() {
  if (!netSess) netSess = session.fromPartition('memora-community', { cache: false });
  return netSess;
}

/** Petición HTTP con cuerpo JSON. Devuelve el JSON de respuesta o lanza un error legible. */
function call(method, url, { body, idToken, form } = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method, url, session: sess(), useSessionCookies: false });
    req.setHeader('User-Agent', `Memomancer/${app.getVersion()}`);
    if (idToken) req.setHeader('Authorization', `Bearer ${idToken}`);
    let payload = null;
    if (form) { req.setHeader('Content-Type', 'application/x-www-form-urlencoded'); payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { req.setHeader('Content-Type', 'application/json'); payload = JSON.stringify(body); }
    req.on('response', (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : {}; } catch { json = null; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
        const status = json?.error?.status || json?.[0]?.error?.status || '';
        const message = json?.error?.message || '';
        const err = new Error(friendly(res.statusCode, status, message));
        err.status = res.statusCode;
        err.code = status || message;
        reject(err);
      });
    });
    req.on('error', (e) => reject(new Error('No se pudo conectar con la comunidad. Revisa tu conexión a internet. (' + e.message + ')')));
    if (payload) req.write(payload);
    req.end();
  });
}

function friendly(http, status, message) {
  if (http === 403 || status === 'PERMISSION_DENIED') return 'La comunidad rechazó la operación (no tienes permiso o los datos no son válidos).';
  if (http === 404 || status === 'NOT_FOUND') return 'Ese mazo ya no existe en la comunidad.';
  if (http === 429 || status === 'RESOURCE_EXHAUSTED') return 'La comunidad ha alcanzado su límite de uso por hoy. Inténtalo más tarde.';
  if (/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED/.test(message)) return 'El inicio de sesión anónimo no está activado en el proyecto de Firebase.';
  if (/API key not valid|API_KEY_INVALID/.test(message)) return 'La clave de Firebase no es válida (revisa firebase-config.json).';
  return `Error de la comunidad (${http}${status ? ' ' + status : ''})${message ? ': ' + message : ''}`;
}

// ------------------------------------------------------------------ sesión anónima
async function signUp() {
  const r = await call('POST', urls().signUp, { body: { returnSecureToken: true } });
  writeAuth({ uid: r.localId, refreshToken: r.refreshToken });
  token = { idToken: r.idToken, expiresAt: Date.now() + (Number(r.expiresIn) || 3600) * 1000 };
  return r.localId;
}

/** idToken válido; crea la sesión anónima la primera vez que hace falta. */
async function idToken() {
  if (token && token.expiresAt - 60000 > Date.now()) return token.idToken;
  const saved = readAuth();
  if (!saved?.refreshToken) { await signUp(); return token.idToken; }
  try {
    const r = await call('POST', urls().refresh, { form: { grant_type: 'refresh_token', refresh_token: saved.refreshToken } });
    writeAuth({ uid: r.user_id || saved.uid, refreshToken: r.refresh_token || saved.refreshToken });
    token = { idToken: r.id_token, expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
    return token.idToken;
  } catch (err) {
    // La sesión guardada ya no es válida (usuario borrado o token revocado): se empieza otra.
    if (err.status === 400) { await signUp(); return token.idToken; }
    throw err;
  }
}

// ------------------------------------------------------------------ conversión Firestore <-> JS
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) f[k] = toValue(v);
  return f;
}
function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) o[k] = fromValue(v);
  return o;
}
const docId = (name) => name.split('/').pop();
const newId = () => crypto.randomBytes(15).toString('base64url').slice(0, 20);

// ------------------------------------------------------------------ operaciones
function cleanStr(s, max) {
  return String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

/** Valida y normaliza el mazo que llega de la interfaz. */
function sanitizeDeck(d) {
  const title = cleanStr(d.title, LIMITS.title);
  const description = cleanStr(d.description, LIMITS.description);
  const authorName = cleanStr(d.authorName, LIMITS.authorName) || 'Anónimo';
  if (!title) throw new Error('El mazo necesita un título.');
  const cards = (Array.isArray(d.cards) ? d.cards : [])
    .map((c) => ({ f: cleanStr(c.f, LIMITS.field), b: cleanStr(c.b, LIMITS.field), s: cleanStr(c.s, 60) }))
    .filter((c) => c.f && c.b);
  if (!cards.length) throw new Error('El mazo no tiene tarjetas para publicar.');
  if (cards.length > LIMITS.cards) throw new Error(`Se pueden publicar como máximo ${LIMITS.cards} tarjetas por mazo.`);
  const sectionNames = [...new Set(cards.map((c) => c.s).filter(Boolean))];
  if (sectionNames.length > LIMITS.sections) throw new Error(`Se pueden publicar como máximo ${LIMITS.sections} secciones por mazo.`);
  const out = { title, description, authorName, cards, cardCount: cards.length, sectionNames, appVersion: app.getVersion().slice(0, 20) };
  if (Buffer.byteLength(JSON.stringify(out)) > LIMITS.bytes) throw new Error('El mazo es demasiado grande para publicarlo (máximo ~900 KB de texto).');
  return out;
}

async function status() {
  if (!configured()) return { configured: false };
  const saved = readAuth();
  return { configured: true, uid: saved?.uid || null };
}

/** Lista de mazos públicos (solo metadatos, sin tarjetas). mine = solo los míos. */
async function list({ mine = false } = {}) {
  const u = urls();
  const structuredQuery = {
    from: [{ collectionId: 'decks' }],
    select: { fields: LIST_FIELDS.map((fieldPath) => ({ fieldPath })) },
  };
  let uid = null;
  if (mine) {
    await idToken();
    uid = readAuth()?.uid;
    structuredQuery.where = { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: uid } } };
    structuredQuery.limit = 500;
  } else {
    structuredQuery.orderBy = [{ field: { fieldPath: 'updatedAt' }, direction: 'DESCENDING' }];
    structuredQuery.limit = 300;
  }
  const res = await call('POST', `${u.docs}:runQuery`, { body: { structuredQuery } });
  const me = uid || readAuth()?.uid || null;
  const decks = (res || []).filter((r) => r.document).map((r) => {
    const d = fromFields(r.document.fields);
    return { id: docId(r.document.name), ...d, mine: !!me && d.ownerUid === me, ownerUid: undefined };
  });
  if (mine) decks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return decks;
}

/** Mazo completo, con sus tarjetas. */
async function get(id) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('Identificador de mazo no válido.');
  const doc = await call('GET', `${urls().docs}/decks/${id}`);
  const d = fromFields(doc.fields);
  const me = readAuth()?.uid || null;
  return { id, ...d, mine: !!me && d.ownerUid === me, ownerUid: undefined };
}

/** Publica un mazo nuevo o actualiza uno propio (remoteId). Devuelve el id público. */
async function publish(deck, remoteId) {
  const data = sanitizeDeck(deck);
  const tok = await idToken();
  const uid = readAuth().uid;
  const u = urls();
  const id = remoteId && /^[A-Za-z0-9_-]{1,40}$/.test(remoteId) ? remoteId : newId();
  const fields = toFields({ ...data, ownerUid: uid });
  const now = [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }];
  const write = remoteId
    ? { update: { name: `${u.dbName}/decks/${id}`, fields }, updateMask: { fieldPaths: Object.keys(fields) }, updateTransforms: now, currentDocument: { exists: true } }
    : { update: { name: `${u.dbName}/decks/${id}`, fields }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, ...now], currentDocument: { exists: false } };
  try {
    await call('POST', `${u.docs}:commit`, { body: { writes: [write] }, idToken: tok });
  } catch (err) {
    if (remoteId && (err.status === 404 || err.status === 403 || err.code === 'NOT_FOUND')) {
      const e = new Error('No se pudo actualizar: el mazo publicado ya no existe o pertenece a otra sesión. Puedes publicarlo de nuevo como mazo nuevo.');
      e.code = 'GONE';
      throw e;
    }
    throw err;
  }
  return { id };
}

async function remove(id) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('Identificador de mazo no válido.');
  const tok = await idToken();
  await call('DELETE', `${urls().docs}/decks/${id}`, { idToken: tok });
  return { ok: true };
}

async function report(id, reason) {
  const r = cleanStr(reason, 500);
  if (!r) throw new Error('Indica el motivo de la denuncia.');
  const tok = await idToken();
  const uid = readAuth().uid;
  const u = urls();
  const write = {
    update: { name: `${u.dbName}/reports/${newId()}`, fields: toFields({ deckId: String(id).slice(0, 40), reason: r, reporterUid: uid }) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  };
  await call('POST', `${u.docs}:commit`, { body: { writes: [write] }, idToken: tok });
  return { ok: true };
}

module.exports = { status, list, get, publish, remove, report, _test: { toFields, fromFields, sanitizeDeck } };
