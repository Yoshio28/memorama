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
  const SYNC_CHUNK = 900 * 1024;  // bytes por documento (Firestore admite ~1 MB)
  const SYNC_MAX_CHUNKS = 10;      // ~9 MB comprimidos como máximo
  const GOOGLE_PHOTO_RE = /^https:\/\/lh\d\.googleusercontent\.com\//;

  // ---------------------------------------------------------------- binario, base64 y gzip
  function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromBase64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function gzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  /** Contenido (sin verificar) de un JWT: lo usamos solo para comprobar el nonce. */
  function jwtPayload(jwt) {
    try {
      const part = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(new TextDecoder().decode(fromBase64(part + '='.repeat((4 - (part.length % 4)) % 4))));
    } catch { return null; }
  }

  function friendly(http, status, message) {
    if (http === 403 || status === 'PERMISSION_DENIED') return 'La comunidad rechazó la operación (no tienes permiso o los datos no son válidos).';
    if (http === 404 || status === 'NOT_FOUND') return 'Ese mazo ya no existe en la comunidad.';
    if (http === 429 || status === 'RESOURCE_EXHAUSTED') return 'La comunidad ha alcanzado su límite de uso por hoy. Inténtalo más tarde.';
    if (/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/.test(message)) return 'El inicio de sesión anónimo no está activado en el proyecto de Firebase.';
    if (/API key not valid|API_KEY_INVALID/.test(message)) return 'La clave de Firebase no es válida (revisa firebase-config.json).';
    if (/INVALID_IDP_RESPONSE|INVALID_ID_TOKEN/.test(message)) return 'Google no aceptó el inicio de sesión. Inténtalo de nuevo.';
    if (/USER_DISABLED/.test(message)) return 'Esta cuenta está desactivada.';
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
      return { apiKey: c.apiKey || '', projectId: c.projectId || '', emulator: c.emulator || '', googleClientId: c.googleClientId || '', authRelay: c.authRelay || '' };
    }

    async function urls() {
      const { apiKey, projectId, emulator } = await config();
      const auth = emulator ? `http://${emulator}:9099/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
      const secure = emulator ? `http://${emulator}:9099/securetoken.googleapis.com/v1` : 'https://securetoken.googleapis.com/v1';
      const fsBase = emulator ? `http://${emulator}:8080/v1` : 'https://firestore.googleapis.com/v1';
      const db = `projects/${projectId}/databases/(default)/documents`;
      return {
        signUp: `${auth}/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
        signInWithIdp: `${auth}/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`,
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
      err.raw = message;
      throw err;
    }

    // -------------------------------------------------------------- sesión anónima
    async function signUp() {
      const r = await call('POST', (await urls()).signUp, { body: { returnSecureToken: true } });
      await writeAuth({ uid: r.localId, refreshToken: r.refreshToken, provider: 'anonymous' });
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
        await writeAuth({ ...saved, uid: r.user_id || saved.uid, refreshToken: r.refresh_token || saved.refreshToken });
        token = { idToken: r.id_token, expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        return token.idToken;
      } catch (err) {
        // La sesión guardada ya no es válida (usuario borrado o token revocado): se empieza otra.
        // Con Google no se crea otra en silencio: hay que volver a iniciar sesión.
        if (err.status === 400 && saved.provider === 'google.com') {
          await writeAuth(null);
          const e = new Error('Tu sesión de Google ha caducado. Vuelve a iniciar sesión en Perfil.');
          e.code = 'SIGNED_OUT';
          throw e;
        }
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

    // -------------------------------------------------------------- cuenta de Google
    async function accountStatus() {
      const c = await config();
      const a = await readAuth();
      const google = a?.provider === 'google.com';
      return {
        available: !!(c.apiKey && c.projectId && c.googleClientId && c.authRelay),
        signedIn: google,
        uid: google ? a.uid : null,
        email: google ? a.email || '' : '',
        name: google ? a.name || '' : '',
        photoUrl: google ? a.photoUrl || '' : '',
      };
    }

    /** Dirección de la página de Google para iniciar sesión (flujo OpenID Connect implícito). */
    async function googleAuthUrl({ nonce, state }) {
      const c = await config();
      if (!c.googleClientId || !c.authRelay) throw new Error('El inicio de sesión con Google no está configurado en esta versión.');
      return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: c.googleClientId, redirect_uri: c.authRelay, response_type: 'id_token',
        scope: 'openid email profile', nonce, state, prompt: 'select_account',
      });
    }

    /** Copia a la cuenta nueva los mazos publicados con la sesión anónima y retira los antiguos. */
    async function migrateDecks(anon, newUid, newTok) {
      const u = await urls();
      const res = await call('POST', `${u.docs}:runQuery`, { body: { structuredQuery: {
        from: [{ collectionId: 'decks' }],
        where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: anon.uid } } },
        limit: 500,
      } } });
      const idMap = {};
      for (const r of (res || []).filter((x) => x.document)) {
        const oldId = docId(r.document.name);
        const d = fromFields(r.document.fields);
        const keep = ['title', 'description', 'authorName', 'cards', 'cardCount', 'sectionNames', 'appVersion'];
        const data = Object.fromEntries(keep.map((k) => [k, d[k]]));
        const id = newId();
        await call('POST', `${u.docs}:commit`, { idToken: newTok, body: { writes: [{
          update: { name: `${u.dbName}/decks/${id}`, fields: toFields({ ...data, ownerUid: newUid }) },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { exists: false },
        }] } });
        await call('DELETE', `${u.docs}/decks/${oldId}`, { idToken: anon.token }).catch(() => {});
        idMap[oldId] = id;
      }
      return idMap;
    }

    /**
     * Inicia sesión con el id_token que devuelve Google. Si este equipo tenía una sesión anónima
     * (mazos publicados), se vincula a la cuenta de Google y conserva su identificador; si esa
     * cuenta ya existía (otro dispositivo), los mazos publicados aquí pasan a la cuenta.
     */
    async function signInWithGoogle(googleIdToken, { nonce } = {}) {
      if (nonce && jwtPayload(googleIdToken)?.nonce !== nonce) throw new Error('La respuesta de Google no corresponde a este inicio de sesión. Inténtalo de nuevo.');
      const u = await urls();
      const saved = await readAuth();
      let anon = null;
      if (saved?.refreshToken && saved.provider !== 'google.com') {
        try { anon = { uid: saved.uid, token: await idToken() }; } catch { anon = null; }
      }
      const body = { postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true, returnIdpCredential: true };
      let r = null;
      if (anon) {
        try {
          r = await call('POST', u.signInWithIdp, { body: { ...body, idToken: anon.token } });
          if (r?.errorMessage) r = null; // la cuenta de Google ya existía: se entra en ella
        } catch (e) {
          if (!/FEDERATED_USER_ID_ALREADY_LINKED|CREDENTIAL_ALREADY_IN_USE|EMAIL_EXISTS/.test(e.raw || e.code || '')) throw e;
        }
      }
      if (!r) r = await call('POST', u.signInWithIdp, { body });
      if (r.errorMessage) throw new Error(friendly(400, '', r.errorMessage));
      const info = { uid: r.localId, refreshToken: r.refreshToken, provider: 'google.com', email: r.email || '', name: r.displayName || r.fullName || '', photoUrl: r.photoUrl || '' };
      await writeAuth(info);
      token = { idToken: r.idToken, expiresAt: Date.now() + (Number(r.expiresIn) || 3600) * 1000 };
      let idMap = {};
      if (anon && anon.uid !== r.localId) {
        try { idMap = await migrateDecks(anon, r.localId, r.idToken); } catch (e) { console.error('No se pudieron mover los mazos publicados', e); }
      }
      return { uid: info.uid, email: info.email, name: info.name, photoUrl: info.photoUrl, idMap };
    }

    /** Cierra la sesión de Google en este equipo (los datos locales se quedan). */
    async function signOut() {
      token = null;
      await writeAuth(null);
      return { ok: true };
    }

    /** Foto de perfil de Google como data: URL (la interfaz no puede cargar imágenes externas). */
    async function googlePhoto(url) {
      if (!GOOGLE_PHOTO_RE.test(String(url || ''))) return null;
      const res = await platform.request('GET', String(url).replace(/=s\d+(-c)?$/, '') + '=s256-c', { binary: true });
      if (res.status !== 200 || !res.base64) return null;
      return `data:${res.type || 'image/jpeg'};base64,${res.base64}`;
    }

    // -------------------------------------------------------------- copia en la nube
    async function googleSession() {
      const a = await readAuth();
      if (a?.provider !== 'google.com') {
        const e = new Error('Inicia sesión con Google para guardar tus datos en la nube.');
        e.code = 'SIGNED_OUT';
        throw e;
      }
      return { tok: await idToken(), uid: a.uid };
    }

    /**
     * Descarga la copia de la nube. Con `known` (updateTime de la última vez) devuelve
     * { unchanged: true } si no ha cambiado. Sin copia: { empty: true }.
     */
    async function pull(known) {
      const { tok, uid } = await googleSession();
      const u = await urls();
      const base = `${u.dbName}/users/${uid}/sync`;
      if (known) {
        // Comprobación barata (una sola lectura): ¿ha cambiado algo desde la última vez?
        try {
          const meta = await call('GET', `${u.docs}/users/${uid}/sync/meta`, { idToken: tok });
          if (meta.updateTime === known) return { unchanged: true, updateTime: known };
        } catch (e) { if (e.status !== 404) throw e; }
      }
      const names = [`${base}/meta`, ...Array.from({ length: SYNC_MAX_CHUNKS }, (_, i) => `${base}/c${i}`)];
      // Todo en una sola lectura para que la copia sea coherente aunque otro equipo esté subiendo.
      const res = await call('POST', `${u.docs}:batchGet`, { idToken: tok, body: { documents: names } });
      const found = new Map((res || []).filter((x) => x.found).map((x) => [x.found.name, x.found]));
      const meta = found.get(names[0]);
      if (!meta) return { empty: true };
      if (known && meta.updateTime === known) return { unchanged: true, updateTime: meta.updateTime };
      const m = fromFields(meta.fields);
      const parts = [];
      for (let i = 0; i < m.chunks; i++) {
        const doc = found.get(`${base}/c${i}`);
        if (!doc) throw new Error('La copia de la nube está incompleta. Vuelve a sincronizar en unos segundos.');
        parts.push(fromBase64(doc.fields.data.bytesValue));
      }
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let off = 0;
      for (const p of parts) { all.set(p, off); off += p.length; }
      return { updateTime: meta.updateTime, json: await gunzip(all), device: m.device || '', size: m.size || 0 };
    }

    /**
     * Sube los datos. `expected` es el updateTime de la copia sobre la que se combinó: si otro
     * equipo subió algo entretanto, falla con code 'CONFLICT' (hay que descargar y combinar).
     */
    async function push(json, expected, device) {
      const { tok, uid } = await googleSession();
      const u = await urls();
      const base = `${u.dbName}/users/${uid}/sync`;
      const bytes = await gzip(json);
      const n = Math.ceil(bytes.length / SYNC_CHUNK) || 1;
      if (n > SYNC_MAX_CHUNKS) throw new Error('Tus datos son demasiado grandes para la copia en la nube (más de 9 MB comprimidos).');
      const writes = [];
      for (let i = 0; i < SYNC_MAX_CHUNKS; i++) {
        const name = `${base}/c${i}`;
        if (i < n) writes.push({ update: { name, fields: { data: { bytesValue: toBase64(bytes.subarray(i * SYNC_CHUNK, (i + 1) * SYNC_CHUNK)) } } } });
        else writes.push({ delete: name });
      }
      writes.push({
        update: { name: `${base}/meta`, fields: toFields({ chunks: n, size: bytes.length, device: String(device || '').slice(0, 40), appVersion: String(await platform.version()).slice(0, 20) }) },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: expected ? { updateTime: expected } : { exists: false },
      });
      try {
        const r = await call('POST', `${u.docs}:commit`, { idToken: tok, body: { writes } });
        return { updateTime: r.writeResults[writes.length - 1].updateTime, size: bytes.length };
      } catch (e) {
        if (e.status === 409 || /FAILED_PRECONDITION|ALREADY_EXISTS|ABORTED/.test(e.code || '')) {
          const c = new Error('Otro dispositivo subió cambios a la vez.');
          c.code = 'CONFLICT';
          throw c;
        }
        throw e;
      }
    }

    return {
      status, list, get, publish, remove, report,
      account: { status: accountStatus, googleAuthUrl, signInWithGoogle, signOut, googlePhoto },
      cloud: { pull, push },
    };
  }

  return { create, jwtPayload, _test: { toFields, fromFields, sanitizeDeck, newId, gzip, gunzip, toBase64, fromBase64 } };
});
