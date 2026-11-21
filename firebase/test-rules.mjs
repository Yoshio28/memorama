// Pruebas de las reglas de Firestore contra el emulador de Firebase.
// Uso: (en firebase/) firebase emulators:exec --only auth,firestore --project demo-memora "node test-rules.mjs"
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-memora';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const DB = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `http://127.0.0.1:8080/v1/${DB}`;

let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok' : 'FALLO'} - ${msg}`); if (!cond) failed++; };

async function anon() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"returnSecureToken":true}' });
  const j = await r.json();
  return { uid: j.localId, token: j.idToken };
}
const v = (x) => (typeof x === 'string' ? { stringValue: x } : Number.isInteger(x) ? { integerValue: String(x) }
  : Array.isArray(x) ? { arrayValue: { values: x.map(v) } } : { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, y]) => [k, v(y)])) } });
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, v(x)]));
const deck = (uid, extra = {}) => ({ title: 'Mazo', description: '', authorName: 'Ana', ownerUid: uid,
  cards: [{ f: 'a', b: 'b', s: '' }], cardCount: 1, sectionNames: [], appVersion: '1.1.0', ...extra });

async function commit(user, write) {
  const r = await fetch(`${FS}:commit`, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify({ writes: [write] }) });
  return r.status;
}
const create = (user, id, data, times = ['createdAt', 'updatedAt']) => commit(user, {
  update: { name: `${DB}/decks/${id}`, fields: fields(data) }, currentDocument: { exists: false },
  updateTransforms: times.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) });
const update = (user, id, data) => commit(user, {
  update: { name: `${DB}/decks/${id}`, fields: fields(data) }, updateMask: { fieldPaths: Object.keys(data) },
  currentDocument: { exists: true }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] });
const del = async (user, id) => (await fetch(`${FS}/decks/${id}`, { method: 'DELETE', headers: user ? { authorization: `Bearer ${user.token}` } : {} })).status;

const a = await anon();
const b = await anon();
check(a.uid && b.uid && a.uid !== b.uid, 'el emulador crea dos sesiones anónimas distintas');

check(await create(null, 'x0', deck('nadie')) === 403, 'sin sesión no se puede publicar');
check(await create(a, 'x1', deck(b.uid)) === 403, 'no se puede publicar a nombre de otro');
check(await create(a, 'x2', deck(a.uid, { cardCount: 5 })) === 403, 'cardCount debe coincidir con las tarjetas');
check(await create(a, 'x3', deck(a.uid, { cards: [], cardCount: 0 })) === 403, 'no se publican mazos vacíos');
check(await create(a, 'x4', deck(a.uid, { title: 'x'.repeat(81) })) === 403, 'título de más de 80 caracteres rechazado');
check(await create(a, 'x5', deck(a.uid, { admin: 'sí' })) === 403, 'no se aceptan campos extra');
check(await create(a, 'x6', deck(a.uid), ['updatedAt']) === 403, 'createdAt debe ponerlo el servidor');
check(await create(a, 'm1', deck(a.uid)) === 200, 'el usuario A publica su mazo');

const list = await fetch(`${FS}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'decks' }] } }) });
check(list.status === 200 && (await list.json()).some((r) => r.document?.name.endsWith('/m1')), 'cualquiera (sin sesión) puede listar los mazos');

check(await update(b, 'm1', { ...deck(a.uid), title: 'Hackeado' }) === 403, 'B no puede modificar el mazo de A');
check(await update(a, 'm1', { ...deck(b.uid) }) === 403, 'A no puede regalar su mazo a otro dueño');
check(await update(a, 'm1', { ...deck(a.uid), title: 'Nuevo título' }) === 200, 'A puede actualizar su mazo');
check(await del(b, 'm1') === 403, 'B no puede borrar el mazo de A');
check(await del(a, 'm1') === 200, 'A puede retirar su mazo');

const rep = (user, data) => commit(user, { update: { name: `${DB}/reports/r${Math.random().toString(36).slice(2)}`, fields: fields(data) },
  currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
check(await rep(b, { deckId: 'm1', reason: 'Spam', reporterUid: b.uid }) === 200, 'B puede denunciar un mazo');
check(await rep(b, { deckId: 'm1', reason: 'Spam', reporterUid: a.uid }) === 403, 'no se puede denunciar en nombre de otro');
const readRep = await fetch(`${FS}/reports`, { headers: { authorization: `Bearer ${b.token}` } });
check(readRep.status === 403, 'nadie puede leer las denuncias desde la app');

console.log(failed ? `\n${failed} comprobaciones fallidas` : '\nTodas las reglas se comportan como se espera');
process.exit(failed ? 1 : 0);
