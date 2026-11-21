/*
 * Comunidad: mazos públicos en Firebase (Firestore + sesión anónima), sin SDK.
 *
 * Este módulo tiene toda la lógica y no depende de la plataforma. Cada plataforma le da:
 *   request(method, url, { headers, body }) → { status, text }   (lanza Error si no hay red)
 *   loadAuth() / saveAuth(obj)                                    (dónde guardar la sesión anónima)
 *   config() → { apiKey, projectId, emulator }                    (emulator: host del emulador o '')
 *   version() → versión de la app
 * Escritorio: community.js (proceso principal de Electron). Android: mobile/bridge.js.
 *
 * La sesión anónima (uid + refreshToken) identifica al dueño de los mazos publicados; si se
 * pierde (reinstalar, otro equipo), los mazos siguen publicados pero ya no se pueden editar
 * ni retirar desde la app.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CommunityCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIST_FIELDS = ['title', 'description', 'authorName', 'ownerUid', 'cardCount', 'sectionNames', 'createdAt', 'updatedAt'];
  const LIMITS = { title: 80, description: 500, authorName: 40, cards: 2000, sections: 50, field: 4000, bytes: 900 * 1024 };
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

  function friendly(http, status, message) {
    if (http === 403 || status === 'PERMISSION_DENIED') return 'La comunidad rechazó la operación (no tienes permiso o los datos no son válidos).';
    if (http === 404 || status === 'NOT_FOUND') return 'Ese mazo ya no existe en la comunidad.';
    if (http === 429 || status === 'RESOURCE_EXHAUSTED') return 'La comunidad ha alcanzado su límite de uso por hoy. Inténtalo más tarde.';
    if (/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/.test(message)) return 'El inicio de sesión anónimo no está activado en el proyecto de Firebase.';
    if (/API key not valid|API_KEY_INVALID/.test(message)) return 'La clave de Firebase no es válida (revisa firebase-config.json).';
    return `Error de la comunidad (${http}${status ? ' ' + status : ''})${message ? ': ' + message : ''}`;
  }

  // ---------------------------------------------------------------- conversión Firestore <-> JS
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

  /** Identificador aleatorio de 20 caracteres (base64url). */
  function newId() {
    const bytes = new Uint8Array(15);
    globalThis.crypto.getRandomValues(bytes);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 20);
  }

  function cleanStr(s, max) {
    return String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max);
  }

  /** Valida y normaliza el mazo que llega de la interfaz. */
  function sanitizeDeck(d, appVersion) {
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
    const out = { title, description, authorName, cards, cardCount: cards.length, sectionNames, appVersion: String(appVersion || '').slice(0, 20) };
    if (new TextEncoder().encode(JSON.stringify(out)).length > LIMITS.bytes) throw new Error('El mazo es demasiado grande para publicarlo (máximo ~900 KB de texto).');
    return out;
  }

  function create(platform) {
    let token = null; // { idToken, expiresAt }
    let authCache;    // undefined = sin leer todavía

    async function readAuth() {
      if (authCache === undefined) {
        try { authCache = (await platform.loadAuth()) || null; } catch { authCache = null; }
      }
      return authCache;
    }
    async function writeAuth(a) {
      authCache = a;
      await platform.saveAuth(a);
    }

    async function config() {
      const c = (await platform.config()) || {};
      return { apiKey: c.apiKey || '', projectId: c.projectId || '', emulator: c.emulator || '' };
    }

    async function urls() {
      const { apiKey, projectId, emulator } = await config();
      const auth = emulator ? `http://${emulator}:9099/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
      const secure = emulator ? `http://${emulator}:9099/securetoken.googleapis.com/v1` : 'https://securetoken.googleapis.com/v1';
      const fsBase = emulator ? `http://${emulator}:8080/v1` : 'https://firestore.googleapis.com/v1';
      const db = `projects/${projectId}/databases/(default)/documents`;
      return {
        signUp: `${auth}/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
        refresh: `${secure}/token?key=${encodeURIComponent(apiKey)}`,
        dbName: db,
        docs: `${fsBase}/${db}`,
      };
    }

    /** Petición con cuerpo JSON (o formulario). Devuelve el JSON de respuesta o lanza un error legible. */
    async function call(method, url, { body, idToken, form } = {}) {
      const headers = {};
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      let payload;
      if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
      else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      let res;
      try {
        res = await platform.request(method, url, { headers, body: payload });
      } catch (e) {
        throw new Error('No se pudo conectar con la comunidad. Revisa tu conexión a internet. (' + (e && e.message ? e.message : e) + ')');
      }
      let json = null;
      try { json = res.text ? JSON.parse(res.text) : {}; } catch { json = null; }
      if (res.status >= 200 && res.status < 300) return json;
      const status = json?.error?.status || json?.[0]?.error?.status || '';
      const message = json?.error?.message || '';
      const err = new Error(friendly(res.status, status, message));
      err.status = res.status;
      err.code = status || message;
      throw err;
    }

    // -------------------------------------------------------------- sesión anónima
    async function signUp() {
      const r = await call('POST', (await urls()).signUp, { body: { returnSecureToken: true } });
      await writeAuth({ uid: r.localId, refreshToken: r.refreshToken });
      token = { idToken: r.idToken, expiresAt: Date.now() + (Number(r.expiresIn) || 3600) * 1000 };
      return r.localId;
    }

    /** idToken válido; crea la sesión anónima la primera vez que hace falta. */
    async function idToken() {
      if (token && token.expiresAt - 60000 > Date.now()) return token.idToken;
      const saved = await readAuth();
      if (!saved?.refreshToken) { await signUp(); return token.idToken; }
      try {
        const r = await call('POST', (await urls()).refresh, { form: { grant_type: 'refresh_token', refresh_token: saved.refreshToken } });
        await writeAuth({ uid: r.user_id || saved.uid, refreshToken: r.refresh_token || saved.refreshToken });
        token = { idToken: r.id_token, expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        return token.idToken;
      } catch (err) {
        // La sesión guardada ya no es válida (usuario borrado o token revocado): se empieza otra.
        if (err.status === 400) { await signUp(); return token.idToken; }
        throw err;
      }
    }

    // -------------------------------------------------------------- operaciones
    async function status() {
      const c = await config();
      if (!(c.apiKey && c.projectId)) return { configured: false };
      const saved = await readAuth();
      return { configured: true, uid: saved?.uid || null };
    }

    /** Lista de mazos públicos (solo metadatos, sin tarjetas). mine = solo los míos. */
    async function list({ mine = false } = {}) {
      const u = await urls();
      const structuredQuery = {
        from: [{ collectionId: 'decks' }],
        select: { fields: LIST_FIELDS.map((fieldPath) => ({ fieldPath })) },
      };
      let uid = null;
      if (mine) {
        await idToken();
        uid = (await readAuth())?.uid;
        structuredQuery.where = { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: uid } } };
        structuredQuery.limit = 500;
      } else {
        structuredQuery.orderBy = [{ field: { fieldPath: 'updatedAt' }, direction: 'DESCENDING' }];
        structuredQuery.limit = 300;
      }
      const res = await call('POST', `${u.docs}:runQuery`, { body: { structuredQuery } });
      const me = uid || (await readAuth())?.uid || null;
      const decks = (res || []).filter((r) => r.document).map((r) => {
        const d = fromFields(r.document.fields);
        return { id: docId(r.document.name), ...d, mine: !!me && d.ownerUid === me, ownerUid: undefined };
      });
      if (mine) decks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return decks;
    }

    /** Mazo completo, con sus tarjetas. */
    async function get(id) {
      id = String(id);
      if (!ID_RE.test(id)) throw new Error('Identificador de mazo no válido.');
      const doc = await call('GET', `${(await urls()).docs}/decks/${id}`);
      const d = fromFields(doc.fields);
      const me = (await readAuth())?.uid || null;
      return { id, ...d, mine: !!me && d.ownerUid === me, ownerUid: undefined };
    }

    /** Publica un mazo nuevo o actualiza uno propio (remoteId). Devuelve el id público. */
    async function publish(deck, remoteId) {
      remoteId = remoteId ? String(remoteId) : null;
      const data = sanitizeDeck(deck, await platform.version());
      const tok = await idToken();
      const uid = (await readAuth()).uid;
      const u = await urls();
      const id = remoteId && ID_RE.test(remoteId) ? remoteId : newId();
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
      id = String(id);
      if (!ID_RE.test(id)) throw new Error('Identificador de mazo no válido.');
      const tok = await idToken();
      await call('DELETE', `${(await urls()).docs}/decks/${id}`, { idToken: tok });
      return { ok: true };
    }

    async function report(id, reason) {
      const r = cleanStr(reason, 500);
      if (!r) throw new Error('Indica el motivo de la denuncia.');
      const tok = await idToken();
      const uid = (await readAuth()).uid;
      const u = await urls();
      const write = {
        update: { name: `${u.dbName}/reports/${newId()}`, fields: toFields({ deckId: String(id).slice(0, 40), reason: r, reporterUid: uid }) },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      };
      await call('POST', `${u.docs}:commit`, { body: { writes: [write] }, idToken: tok });
      return { ok: true };
    }

    return { status, list, get, publish, remove, report };
  }

  return { create, _test: { toFields, fromFields, sanitizeDeck, newId } };
});
