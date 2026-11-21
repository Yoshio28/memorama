'use strict';
/* global Scheduler */

const S = window.Scheduler;
const api = window.memora;

// Colores de sección (paleta categórica validada para daltonismo, orden fijo).
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

let db = null;
let view = { name: 'home' };
let session = null;
let saveTimer = null;
let lastCreated = 0;
const ui = { collapsed: new Set(), addDeck: null, addSection: null, browse: { q: '', deck: '', section: '', state: '', selected: new Set() } };

// ---------------------------------------------------------------- utilidades
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const now = () => Date.now();
const uid = () => crypto.randomUUID();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
/** Formato sencillo: **negrita**, *cursiva*, `código` y saltos de línea. */
function rich(s) {
  let h = esc(s);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return h.replace(/\n/g, '<br>');
}
const plain = (s) => String(s ?? '').replace(/\*\*|`/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (ts) => new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
function nextCreated() {
  lastCreated = Math.max(now(), lastCreated + 1);
  return lastCreated;
}

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  browse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

// ---------------------------------------------------------------- datos
function defaultPresets() {
  return [
    { id: uid(), name: 'Repaso rápido', mode: 'srs', scope: { all: true, decks: {} }, include: { new: true, learn: true, review: true }, filter: 'all', order: 'default', limit: 20, direction: 'front', typeAnswer: false },
    { id: uid(), name: 'Mis tarjetas difíciles', mode: 'practice', scope: { all: true, decks: {} }, include: { new: true, learn: true, review: true }, filter: 'difficult', order: 'random', limit: 30, direction: 'front', typeAnswer: false },
    { id: uid(), name: 'Examen escrito', mode: 'practice', scope: { all: true, decks: {} }, include: { new: true, learn: true, review: true }, filter: 'studied', order: 'random', limit: 25, direction: 'mixed', typeAnswer: true },
  ];
}

function emptyDb() {
  return {
    version: 1,
    settings: { scheduler: { ...S.DEFAULTS }, defaultNewPerDay: 20, defaultReviewsPerDay: 200, theme: 'system' },
    decks: [], cards: [], presets: defaultPresets(), log: [],
  };
}

function makeDeck(name) {
  return { id: uid(), name, created: nextCreated(), newPerDay: db.settings.defaultNewPerDay, reviewsPerDay: db.settings.defaultReviewsPerDay, sections: [] };
}
function makeSection(deck, name) {
  const used = new Set(deck.sections.map((s) => s.color));
  const color = COLORS.find((c) => !used.has(c)) || COLORS[deck.sections.length % COLORS.length];
  const sec = { id: uid(), name, color };
  deck.sections.push(sec);
  return sec;
}
function makeCard(deckId, sectionId, front, back) {
  return { id: uid(), deckId, sectionId: sectionId || null, front, back, flag: false, created: nextCreated(), srs: S.newSrs() };
}

function migrate(d) {
  const base = emptyDb();
  d.settings = Object.assign(base.settings, d.settings || {});
  d.settings.scheduler = Object.assign({ ...S.DEFAULTS }, d.settings.scheduler || {});
  d.decks = Array.isArray(d.decks) ? d.decks : [];
  d.cards = Array.isArray(d.cards) ? d.cards : [];
  d.presets = Array.isArray(d.presets) ? d.presets : [];
  d.log = Array.isArray(d.log) ? d.log : [];
  for (const deck of d.decks) {
    deck.sections = Array.isArray(deck.sections) ? deck.sections : [];
    deck.newPerDay ??= d.settings.defaultNewPerDay;
    deck.reviewsPerDay ??= d.settings.defaultReviewsPerDay;
  }
  const deckIds = new Set(d.decks.map((x) => x.id));
  d.cards = d.cards.filter((c) => deckIds.has(c.deckId));
  for (const c of d.cards) {
    c.srs = Object.assign(S.newSrs(), c.srs || {});
    c.flag = !!c.flag;
    lastCreated = Math.max(lastCreated, c.created || 0);
  }
  return d;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  return api.save(JSON.stringify(db)).catch((err) => toast('Error al guardar: ' + err.message));
}
window.addEventListener('beforeunload', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    api.saveSync(JSON.stringify(db));
  }
});

const deckById = (id) => db.decks.find((d) => d.id === id);
const cardById = (id) => db.cards.find((c) => c.id === id);
function sectionOf(card) {
  const d = deckById(card.deckId);
  return (d && d.sections.find((s) => s.id === card.sectionId)) || null;
}
const sched = () => db.settings.scheduler;
const today = () => S.dayStart(now(), sched().dayStartHour);

// ---------------------------------------------------------------- recuentos
function usageToday() {
  const t = today();
  const map = new Map();
  for (let i = db.log.length - 1; i >= 0; i--) {
    const l = db.log[i];
    if (l.ts < t) break;
    if (l.mode !== 'srs') continue;
    const u = map.get(l.deckId) || { newDone: 0, revDone: 0 };
    if (l.was === 'new') u.newDone++;
    else if (l.was === 'review') u.revDone++;
    map.set(l.deckId, u);
  }
  return map;
}

/** Recuentos Nuevas / Aprendiendo / Repasar para un conjunto de tarjetas, aplicando los límites diarios de cada mazo. */
function countCards(cards, usage) {
  const t = now();
  const o = sched();
  const endOfDay = S.addDays(today(), 1);
  const per = new Map();
  for (const c of cards) {
    let e = per.get(c.deckId);
    if (!e) per.set(c.deckId, (e = { n: 0, l: 0, r: 0 }));
    if (c.srs.state === 'new') e.n++;
    else if (S.isLearning(c.srs)) { if (c.srs.due < endOfDay) e.l++; }
    else if (S.isReviewDue(c.srs, t, o)) e.r++;
  }
  let n = 0, l = 0, r = 0;
  for (const [deckId, e] of per) {
    const d = deckById(deckId);
    const u = usage.get(deckId) || { newDone: 0, revDone: 0 };
    n += Math.min(e.n, Math.max(0, d.newPerDay - u.newDone));
    r += Math.min(e.r, Math.max(0, d.reviewsPerDay - u.revDone));
    l += e.l;
  }
  return { n, l, r, total: cards.length };
}

function countsHtml(c, cls = 'mini-counts') {
  const part = (v, k) => `<span class="${v ? k : 'c-zero'}" title="${{ 'c-new': 'Nuevas', 'c-learn': 'Aprendiendo', 'c-review': 'Para repasar' }[k]}">${v}</span>`;
  return `<span class="${cls}">${part(c.n, 'c-new')}${part(c.l, 'c-learn')}${part(c.r, 'c-review')}</span>`;
}

// Ámbito de estudio: { all: bool, decks: { deckId: null | [sectionId | 'none'] } }
function inScope(scope, c) {
  if (scope.all) return true;
  const s = scope.decks[c.deckId];
  if (s === undefined) return false;
  if (s === null) return true;
  return s.includes(c.sectionId || 'none');
}
const cardsInScope = (scope) => db.cards.filter((c) => inScope(scope, c));
const deckScope = (deckId) => ({ all: false, decks: { [deckId]: null } });
const sectionScope = (deckId, sectionId) => ({ all: false, decks: { [deckId]: [sectionId || 'none'] } });

function scopeLabel(scope) {
  if (scope.all) return 'Todos los mazos';
  const parts = [];
  for (const [deckId, secs] of Object.entries(scope.decks)) {
    const d = deckById(deckId);
    if (!d) continue;
    if (secs === null) parts.push(d.name);
    else {
      const names = secs.map((s) => (s === 'none' ? 'Sin sección' : d.sections.find((x) => x.id === s)?.name)).filter(Boolean);
      if (names.length) parts.push(`${d.name} › ${names.join(', ')}`);
    }
  }
  return parts.join(' · ') || 'Sin selección';
}

function failedRecently(days) {
  const since = now() - days * S.DAY;
  const set = new Set();
  for (let i = db.log.length - 1; i >= 0 && db.log[i].ts >= since; i--) if (db.log[i].rating === 1) set.add(db.log[i].cardId);
  return set;
}
const isDifficult = (c, failed) => c.srs.lapses > 0 || (c.srs.ease > 0 && c.srs.ease < 2.3) || failed.has(c.id);

const FILTERS = {
  all: 'Todas las tarjetas',
  studied: 'Ya estudiadas (no nuevas)',
  difficult: 'Solo difíciles',
  failedToday: 'Falladas hoy',
  due: 'Pendientes de hoy',
  new: 'Solo nuevas',
  flagged: 'Marcadas con estrella',
};
const ORDERS = { default: 'Normal', random: 'Aleatorio', section: 'Por sección', created: 'Por fecha de creación' };
const DIRS = { front: 'Anverso → Reverso', back: 'Reverso → Anverso', mixed: 'Mezclado' };

function practicePool(cfg) {
  const failed = failedRecently(14);
  const failedToday = new Set(db.log.filter((l) => l.ts >= today() && l.rating === 1).map((l) => l.cardId));
  const t = now();
  const endOfDay = S.addDays(today(), 1);
  return cardsInScope(cfg.scope).filter((c) => {
    switch (cfg.filter) {
      case 'studied': return c.srs.state !== 'new';
      case 'difficult': return isDifficult(c, failed);
      case 'failedToday': return failedToday.has(c.id);
      case 'due': return S.isReviewDue(c.srs, t, sched()) || (S.isLearning(c.srs) && c.srs.due < endOfDay);
      case 'new': return c.srs.state === 'new';
      case 'flagged': return c.flag;
      case 'ids': return (cfg.ids || []).includes(c.id);
      default: return true;
    }
  });
}

function sortCards(list, order, key) {
  const secIndex = (c) => {
    const d = deckById(c.deckId);
    const i = d ? d.sections.findIndex((s) => s.id === c.sectionId) : -1;
    return (db.decks.indexOf(d) * 1000) + (i < 0 ? 999 : i);
  };
  if (order === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else if (order === 'section') list.sort((a, b) => secIndex(a) - secIndex(b) || a.created - b.created);
  else if (order === 'created') list.sort((a, b) => a.created - b.created);
  else list.sort(key);
  return list;
}

function presetCount(p) {
  if (p.mode === 'srs') {
    const c = countCards(cardsInScope(p.scope), usageToday());
    const n = c.n + c.l + c.r;
    return p.limit ? Math.min(n, p.limit + c.l) : n;
  }
  const n = practicePool(p).length;
  return p.limit ? Math.min(n, p.limit) : n;
}

function presetDesc(p) {
  const bits = [p.mode === 'srs' ? 'Repaso programado' : 'Práctica libre'];
  if (p.mode === 'practice') bits.push(FILTERS[p.filter] || '');
  if (p.mode === 'srs') {
    const inc = [p.include.new && 'nuevas', p.include.learn && 'aprendiendo', p.include.review && 'repasos'].filter(Boolean);
    if (inc.length < 3) bits.push(inc.join(' + '));
  }
  if (p.order !== 'default') bits.push(ORDERS[p.order].toLowerCase());
  if (p.limit) bits.push(`máx. ${p.limit}`);
  if (p.direction !== 'front') bits.push(DIRS[p.direction].toLowerCase());
  if (p.typeAnswer) bits.push('escribiendo la respuesta');
  return `${scopeLabel(p.scope)} · ${bits.join(' · ')}`;
}

// ---------------------------------------------------------------- render general
function applyTheme() {
  const t = db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function go(v) {
  view = v;
  if (v.name !== 'study') session = null;
  render();
  $('#main').scrollTop = 0;
}

function render() {
  const app = $('.app');
  if (view.name === 'study') {
    app.style.gridTemplateColumns = '1fr';
    $('#sidebar').style.display = 'none';
  } else {
    app.style.gridTemplateColumns = '';
    $('#sidebar').style.display = '';
    renderSidebar();
  }
  const fn = { home: renderHome, deck: renderDeck, add: renderAdd, browse: renderBrowse, stats: renderStats, settings: renderSettings, study: renderStudy }[view.name];
  fn();
}

function renderSidebar() {
  const usage = usageToday();
  const navBtn = (name, label) => `<button data-act="nav" data-view="${name}" class="${view.name === name ? 'active' : ''}">${ICON[name]}<span>${label}</span></button>`;
  const decks = db.decks.map((d) => {
    const cards = db.cards.filter((c) => c.deckId === d.id);
    const open = !ui.collapsed.has(d.id);
    const activeDeck = view.name === 'deck' && view.id === d.id && !view.section;
    const secs = d.sections.map((s) => {
      const active = view.name === 'deck' && view.id === d.id && view.section === s.id;
      return `<li><div class="tree-row section ${active ? 'active' : ''}" data-act="open-deck" data-id="${d.id}" data-section="${s.id}">
        <span class="dot" style="background:${s.color}"></span><span class="name">${esc(s.name)}</span>
        ${countsHtml(countCards(cards.filter((c) => c.sectionId === s.id), usage))}</div></li>`;
    }).join('');
    return `<li><div class="tree-row deck ${activeDeck ? 'active' : ''}" data-act="open-deck" data-id="${d.id}">
        <button class="caret ${open ? '' : 'closed'}" data-act="toggle-deck" data-id="${d.id}" aria-label="Mostrar u ocultar secciones" ${d.sections.length ? '' : 'style="visibility:hidden"'}>${ICON.caret}</button>
        <span class="name">${esc(d.name)}</span>${countsHtml(countCards(cards, usage))}</div>
        ${open && secs ? `<ul>${secs}</ul>` : ''}</li>`;
  }).join('');
  $('#sidebar').innerHTML = `
    <div class="brand"><span class="logo">M</span>Memora</div>
    <nav class="nav">${navBtn('home', 'Inicio')}${navBtn('add', 'Añadir tarjetas')}${navBtn('browse', 'Explorar')}${navBtn('stats', 'Estadísticas')}${navBtn('settings', 'Ajustes')}</nav>
    <div class="side-title"><span>Mazos y secciones</span><button class="icon-btn" data-act="new-deck" title="Nuevo mazo" aria-label="Nuevo mazo">${ICON.add}</button></div>
    <ul class="deck-tree">${decks || '<li class="muted small" style="padding:8px">Aún no hay mazos</li>'}</ul>`;
}

// ---------------------------------------------------------------- Inicio
function renderHome() {
  const usage = usageToday();
  const t = today();
  const todayLog = db.log.filter((l) => l.ts >= t);
  const all = countCards(db.cards, usage);
  const correct = todayLog.filter((l) => l.rating > 1).length;
  const presets = db.presets.map((p) => {
    const n = presetCount(p);
    return `<div class="preset">
      <div class="title"><span class="badge ${p.mode === 'srs' ? 'srs' : ''}">${p.mode === 'srs' ? 'Programado' : 'Práctica'}</span><span style="flex:1">${esc(p.name)}</span>
        <button class="icon-btn" data-act="edit-preset" data-id="${p.id}" title="Editar modo" aria-label="Editar modo">${ICON.edit}</button></div>
      <div class="desc">${esc(presetDesc(p))}</div>
      <div class="foot"><span class="small muted">${plural(n, 'tarjeta', 'tarjetas')}</span>
        <button class="btn sm primary" data-act="run-preset" data-id="${p.id}" ${n ? '' : 'disabled'}>${ICON.play}Empezar</button></div></div>`;
  }).join('');

  const rows = db.decks.map((d) => {
    const cards = db.cards.filter((c) => c.deckId === d.id);
    const c = countCards(cards, usage);
    const cell = (v, k) => `<td class="r num ${v ? k : 'c-zero'}">${v}</td>`;
    const sub = d.sections.map((s) => {
      const sc = countCards(cards.filter((x) => x.sectionId === s.id), usage);
      return `<tr class="sub click" data-act="open-deck" data-id="${d.id}" data-section="${s.id}"><td><span class="deck-name" style="font-weight:400"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span></td>
        ${cell(sc.n, 'c-new')}${cell(sc.l, 'c-learn')}${cell(sc.r, 'c-review')}<td class="r"><button class="btn sm ghost" data-act="study-section" data-id="${d.id}" data-section="${s.id}" ${sc.n + sc.l + sc.r ? '' : 'disabled'}>Estudiar</button></td></tr>`;
    }).join('');
    return `<tr class="click" data-act="open-deck" data-id="${d.id}"><td><span class="deck-name">${esc(d.name)} <span class="muted small" style="font-weight:400">${plural(cards.length, 'tarjeta', 'tarjetas')}</span></span></td>
      ${cell(c.n, 'c-new')}${cell(c.l, 'c-learn')}${cell(c.r, 'c-review')}<td class="r"><button class="btn sm primary" data-act="study-deck" data-id="${d.id}" ${c.n + c.l + c.r ? '' : 'disabled'}>Estudiar</button></td></tr>${sub}`;
  }).join('');

  $('#main').innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Hola de nuevo</h1><div class="sub">${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <div class="row"><button class="btn" data-act="import-csv">Importar archivo de texto…</button><button class="btn" data-act="custom-study">Estudio personalizado</button><button class="btn primary" data-act="new-deck">${ICON.add}Nuevo mazo</button></div></div>
    <div class="strip">
      <div class="tile"><div class="label">Pendientes hoy</div><div class="value">${all.n + all.l + all.r}</div><div class="hint">${all.n} nuevas · ${all.l} aprendiendo · ${all.r} repasos</div></div>
      <div class="tile"><div class="label">Respondidas hoy</div><div class="value">${todayLog.length}</div><div class="hint">${todayLog.length ? Math.round((correct / todayLog.length) * 100) + ' % de aciertos' : 'Aún no has estudiado'}</div></div>
      <div class="tile"><div class="label">Racha</div><div class="value">${streak()}</div><div class="hint">días seguidos estudiando</div></div>
      <div class="tile"><div class="label">Colección</div><div class="value">${db.cards.length}</div><div class="hint">${plural(db.decks.length, 'mazo', 'mazos')} · ${plural(db.decks.reduce((a, d) => a + d.sections.length, 0), 'sección', 'secciones')}</div></div>
    </div>
    ${db.decks.length ? `<div class="panel"><table class="table"><thead><tr><th>Mazo / sección</th><th class="r c-new">Nuevas</th><th class="r c-learn">Aprendiendo</th><th class="r c-review">Repasar</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="panel empty"><h2>Crea tu primer mazo</h2><p>Los mazos agrupan tarjetas; dentro de cada mazo puedes organizarlas en secciones.<br>También puedes importar tus tarjetas desde un archivo de texto (<code>pregunta = respuesta</code>, una por línea).</p>
        <div class="row" style="justify-content:center"><button class="btn" data-act="import-csv">Importar archivo de texto…</button><button class="btn primary" data-act="new-deck">Nuevo mazo</button></div></div>`}
    <div class="section-head"><div><h2>Modos de estudio</h2><div class="small muted">Combinaciones guardadas de mazos, secciones y opciones. Empiézalas con un clic.</div></div></div>
    <div class="preset-grid">${presets}<div class="preset add" data-act="custom-study" role="button" tabindex="0">${ICON.add.replace('<svg', '<svg width="22" height="22"')}<span>Crear modo de estudio</span></div></div>
  </div>`;
}

function streak() {
  const days = new Set(db.log.map((l) => S.dayStart(l.ts, sched().dayStartHour)));
  let d = today();
  if (!days.has(d)) d = S.addDays(d, -1);
  let n = 0;
  while (days.has(d)) { n++; d = S.addDays(d, -1); }
  return n;
}

// ---------------------------------------------------------------- Mazo
function renderDeck() {
  const d = deckById(view.id);
  if (!d) return go({ name: 'home' });
  const usage = usageToday();
  const cards = db.cards.filter((c) => c.deckId === d.id);
  const c = countCards(cards, usage);
  const noneCards = cards.filter((x) => !x.sectionId || !d.sections.some((s) => s.id === x.sectionId));
  const tile = (s, list) => {
    const sc = countCards(list, usage);
    const mature = list.filter((x) => x.srs.state === 'review' && x.srs.interval >= 21).length;
    const pct = list.length ? Math.round((mature / list.length) * 100) : 0;
    const sid = s ? s.id : 'none';
    return `<div class="sec ${view.section === sid ? 'selected' : ''}" style="--sec-color:${s ? s.color : 'var(--text-3)'}" data-drop-section="${sid}">
      <div class="head"><span class="name" data-act="filter-section" data-section="${sid}" title="Ver sus tarjetas">${s ? esc(s.name) : 'Sin sección'}</span>
        ${s ? `<button class="icon-btn" data-act="edit-section" data-id="${d.id}" data-section="${s.id}" title="Editar sección" aria-label="Editar sección">${ICON.edit}</button>` : ''}</div>
      <div class="counts"><span class="c-new"><b>${sc.n}</b> nuevas</span><span class="c-learn"><b>${sc.l}</b> aprend.</span><span class="c-review"><b>${sc.r}</b> repasar</span></div>
      <div class="progress" title="${pct} % dominadas (intervalo ≥ 21 días)"><i style="width:${pct}%"></i></div>
      <div class="small muted" style="margin-top:4px">${plural(list.length, 'tarjeta', 'tarjetas')} · ${pct} % dominadas</div>
      <div class="foot"><button class="btn sm primary" data-act="study-section" data-id="${d.id}" data-section="${sid}" ${sc.n + sc.l + sc.r ? '' : 'disabled'}>Estudiar</button>
        <button class="btn sm" data-act="practice-section" data-id="${d.id}" data-section="${sid}" ${list.length ? '' : 'disabled'} title="Repasa todas sus tarjetas sin afectar la programación">Practicar</button></div></div>`;
  };
  const tiles = d.sections.map((s) => tile(s, cards.filter((x) => x.sectionId === s.id))).join('') + (noneCards.length ? tile(null, noneCards) : '');

  const sel = view.section;
  const listCards = sel ? cards.filter((x) => (sel === 'none' ? noneCards.includes(x) : x.sectionId === sel)) : cards;
  const chip = (id, label, color) => `<button class="chip ${(sel || '') === id ? 'active' : ''}" data-act="filter-section" data-section="${id}">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${label}</button>`;

  $('#main').innerHTML = `<div class="page">
    <div class="crumbs"><a data-act="nav" data-view="home">Inicio</a> › Mazo</div>
    <div class="page-head"><div><h1>${esc(d.name)}</h1><div class="sub">${plural(cards.length, 'tarjeta', 'tarjetas')} · ${plural(d.sections.length, 'sección', 'secciones')}</div></div>
      <div class="row">
        <button class="btn" data-act="deck-options" data-id="${d.id}">Opciones</button>
        <button class="btn" data-act="import-csv" data-id="${d.id}">Importar…</button>
        <button class="btn" data-act="add-to" data-id="${d.id}" data-section="${sel && sel !== 'none' ? sel : ''}">${ICON.add}Añadir</button>
        <button class="btn" data-act="custom-study" data-id="${d.id}">Estudio personalizado</button>
        <button class="btn primary" data-act="study-deck" data-id="${d.id}" ${c.n + c.l + c.r ? '' : 'disabled'}>${ICON.play}Estudiar mazo (${c.n + c.l + c.r})</button></div></div>
    <div class="strip">
      <div class="tile"><div class="label">Nuevas hoy</div><div class="value c-new">${c.n}</div><div class="hint">límite ${d.newPerDay}/día</div></div>
      <div class="tile"><div class="label">Aprendiendo</div><div class="value c-learn">${c.l}</div><div class="hint">vuelven hoy</div></div>
      <div class="tile"><div class="label">Para repasar</div><div class="value c-review">${c.r}</div><div class="hint">límite ${d.reviewsPerDay}/día</div></div>
      <div class="tile"><div class="label">Dominadas</div><div class="value">${cards.filter((x) => x.srs.state === 'review' && x.srs.interval >= 21).length}</div><div class="hint">intervalo de 21 días o más</div></div>
    </div>
    <div class="section-head"><div><h2>Secciones</h2><div class="small muted">Arrastra tarjetas de la lista de abajo a una sección para clasificarlas.</div></div>
      <button class="btn sm" data-act="new-section" data-id="${d.id}">${ICON.add}Nueva sección</button></div>
    <div class="sec-grid">${tiles}<div class="sec add" data-act="new-section" data-id="${d.id}" role="button" tabindex="0"><div style="text-align:center">${ICON.add.replace('<svg', '<svg width="22" height="22"')}<div>Nueva sección</div></div></div></div>
    <div class="section-head"><h2>Tarjetas</h2><div class="chips">${chip('', 'Todas')}${d.sections.map((s) => chip(s.id, esc(s.name), s.color)).join('')}${noneCards.length ? chip('none', 'Sin sección') : ''}</div></div>
    <div class="panel">${cardTable(listCards.slice(0, 300), { showDeck: false, draggable: true })}
      ${listCards.length > 300 ? `<div class="small muted" style="padding:10px 14px">Mostrando 300 de ${listCards.length}. Usa Explorar para ver todas.</div>` : ''}</div>
  </div>`;
}

function stateLabel(c) {
  const s = c.srs;
  if (s.state === 'new') return '<span class="state-pill new">Nueva</span>';
  if (S.isLearning(s)) return `<span class="state-pill ${s.state}">${s.state === 'learning' ? 'Aprendiendo' : 'Reaprendiendo'}</span>`;
  return '<span class="state-pill review">Repaso</span>';
}
function dueLabel(c) {
  const s = c.srs;
  if (s.state === 'new') return '—';
  if (S.isLearning(s)) return s.due <= now() ? 'ahora' : 'en ' + S.formatDelay(s.due - now());
  const days = Math.round((s.due - today()) / S.DAY);
  if (days <= 0) return days < 0 ? `hoy (atrasada ${-days} d)` : 'hoy';
  if (days === 1) return 'mañana';
  return 'en ' + S.formatDelay(days * S.DAY);
}

function cardTable(cards, { showDeck = true, draggable = false, selectable = false } = {}) {
  if (!cards.length) return '<div class="empty">No hay tarjetas aquí todavía.</div>';
  const sel = ui.browse.selected;
  const rows = cards.map((c) => {
    const s = sectionOf(c);
    const d = deckById(c.deckId);
    return `<tr class="click" data-act="edit-card" data-id="${c.id}" ${draggable ? `draggable="true" data-drag-card="${c.id}"` : ''}>
      ${selectable ? `<td style="width:36px" data-stop="1"><input type="checkbox" class="row-check" data-id="${c.id}" ${sel.has(c.id) ? 'checked' : ''} aria-label="Seleccionar"></td>` : ''}
      <td class="cell-clip">${c.flag ? `<span class="flag">${ICON.starOn.replace('<svg', '<svg width="12" height="12"')}</span> ` : ''}${esc(plain(c.front))}</td>
      <td class="cell-clip muted">${esc(plain(c.back))}</td>
      ${showDeck ? `<td class="cell-clip" style="max-width:160px">${esc(d?.name)}</td>` : ''}
      <td>${s ? `<span class="deck-name" style="font-weight:400"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${stateLabel(c)}</td><td class="small muted" style="white-space:nowrap">${dueLabel(c)}</td></tr>`;
  }).join('');
  return `<table class="table"><thead><tr>${selectable ? `<th><input type="checkbox" id="check-all" aria-label="Seleccionar todas"></th>` : ''}<th>Anverso</th><th>Reverso</th>${showDeck ? '<th>Mazo</th>' : ''}<th>Sección</th><th>Estado</th><th>Próximo repaso</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------------------------------------------------------------- Añadir
function renderAdd() {
  if (!db.decks.length) {
    $('#main').innerHTML = `<div class="page"><div class="panel empty"><h2>Primero crea un mazo</h2><p>Las tarjetas se guardan dentro de un mazo. También puedes importarlas desde un archivo de texto y el mazo se crea solo.</p>
      <div class="row" style="justify-content:center"><button class="btn" data-act="import-csv">Importar archivo de texto…</button><button class="btn primary" data-act="new-deck">Nuevo mazo</button></div></div></div>`;
    return;
  }
  if (!deckById(ui.addDeck)) ui.addDeck = db.decks[0].id;
  const d = deckById(ui.addDeck);
  if (ui.addSection && !d.sections.some((s) => s.id === ui.addSection)) ui.addSection = null;
  const recent = db.cards.filter((c) => c.deckId === d.id).sort((a, b) => b.created - a.created).slice(0, 8);
  $('#main').innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Añadir tarjetas</h1><div class="sub">Escribe la pregunta y la respuesta. <code>Ctrl</code>+<code>Enter</code> para añadir.</div></div></div>
    <div class="add-layout">
      <form class="panel pad" id="add-form">
        <div class="grid-2">
          <div class="field"><label for="add-deck">Mazo</label><select class="input" id="add-deck">${db.decks.map((x) => `<option value="${x.id}" ${x.id === d.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="add-section">Sección</label><select class="input" id="add-section">
            <option value="">Sin sección</option>${d.sections.map((s) => `<option value="${s.id}" ${s.id === ui.addSection ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            <option value="__new">+ Nueva sección…</option></select></div>
        </div>
        <div class="field"><label for="add-front">Anverso (pregunta)</label><textarea class="input" id="add-front" placeholder="¿Cuál es la capital de Francia?"></textarea></div>
        <div class="field"><label for="add-back">Reverso (respuesta)</label><textarea class="input" id="add-back" placeholder="París"></textarea></div>
        <label class="check"><input type="checkbox" id="add-reverse"> Crear también la tarjeta inversa (respuesta → pregunta)</label>
        <div class="row" style="margin-top:16px"><span class="hint">Formato: **negrita**, *cursiva*, \`código\`</span><span class="spacer"></span>
          <button type="button" class="btn" data-act="import-csv">Importar archivo de texto…</button><button class="btn primary" type="submit">Añadir tarjeta</button></div>
      </form>
      <div class="panel pad"><h3>Últimas en «${esc(d.name)}»</h3>
        <ul class="recent">${recent.map((c) => `<li><div>${esc(plain(c.front))}</div><div class="muted">${esc(plain(c.back))}</div></li>`).join('') || '<li class="muted">Todavía no hay tarjetas.</li>'}</ul></div>
    </div></div>`;
  $('#add-front').focus();
  $('#add-deck').onchange = (e) => { ui.addDeck = e.target.value; ui.addSection = null; renderAdd(); };
  $('#add-section').onchange = async (e) => {
    if (e.target.value === '__new') {
      const name = await ask({ title: 'Nueva sección', label: `Nombre de la sección en «${d.name}»`, okText: 'Crear' });
      if (name) { const s = makeSection(d, name); ui.addSection = s.id; persist(); renderSidebar(); }
      renderAdd();
    } else ui.addSection = e.target.value || null;
  };
  const submit = (e) => {
    e?.preventDefault();
    const front = $('#add-front').value.trim();
    const back = $('#add-back').value.trim();
    if (!front || !back) { toast('Rellena el anverso y el reverso'); return; }
    db.cards.push(makeCard(d.id, ui.addSection, front, back));
    if ($('#add-reverse').checked) db.cards.push(makeCard(d.id, ui.addSection, back, front));
    persist();
    toast('Tarjeta añadida');
    const rev = $('#add-reverse').checked;
    renderAdd();
    renderSidebar();
    $('#add-reverse').checked = rev;
  };
  $('#add-form').onsubmit = submit;
  $('#add-form').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e); };
}

// ---------------------------------------------------------------- Explorar
function browseResults() {
  const b = ui.browse;
  const q = b.q.trim().toLowerCase();
  const t = now();
  const failed = failedRecently(14);
  return db.cards.filter((c) => {
    if (b.deck && c.deckId !== b.deck) return false;
    if (b.section && (b.section === 'none' ? !!sectionOf(c) : c.sectionId !== b.section)) return false;
    if (b.state === 'new' && c.srs.state !== 'new') return false;
    if (b.state === 'learning' && !S.isLearning(c.srs)) return false;
    if (b.state === 'review' && c.srs.state !== 'review') return false;
    if (b.state === 'due' && !(S.isReviewDue(c.srs, t, sched()) || (S.isLearning(c.srs) && c.srs.due <= t))) return false;
    if (b.state === 'difficult' && !isDifficult(c, failed)) return false;
    if (b.state === 'flagged' && !c.flag) return false;
    if (q && !(`${c.front}\n${c.back}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b2) => b2.created - a.created);
}

function renderBrowse() {
  const b = ui.browse;
  const deck = deckById(b.deck);
  $('#main').innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Explorar tarjetas</h1><div class="sub">Busca, edita y clasifica tus tarjetas en secciones.</div></div></div>
    <div class="filters">
      <input class="input" id="b-q" placeholder="Buscar en anverso o reverso…" value="${esc(b.q)}">
      <select class="input" id="b-deck"><option value="">Todos los mazos</option>${db.decks.map((d) => `<option value="${d.id}" ${d.id === b.deck ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <select class="input" id="b-section" ${deck ? '' : 'disabled'}><option value="">Todas las secciones</option>${deck ? deck.sections.map((s) => `<option value="${s.id}" ${s.id === b.section ? 'selected' : ''}>${esc(s.name)}</option>`).join('') + `<option value="none" ${b.section === 'none' ? 'selected' : ''}>Sin sección</option>` : ''}</select>
      <select class="input" id="b-state">${[['', 'Cualquier estado'], ['new', 'Nuevas'], ['learning', 'Aprendiendo'], ['review', 'En repaso'], ['due', 'Pendientes ahora'], ['difficult', 'Difíciles'], ['flagged', 'Marcadas']].map(([v, l]) => `<option value="${v}" ${v === b.state ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="panel" id="browse-table"></div></div>`;
  const q = $('#b-q');
  q.oninput = () => { b.q = q.value; renderBrowseTable(); };
  $('#b-deck').onchange = (e) => { b.deck = e.target.value; b.section = ''; renderBrowse(); };
  $('#b-section').onchange = (e) => { b.section = e.target.value; renderBrowseTable(); };
  $('#b-state').onchange = (e) => { b.state = e.target.value; renderBrowseTable(); };
  renderBrowseTable();
}

function sectionTargets() {
  return db.decks.map((d) => `<optgroup label="${esc(d.name)}"><option value="${d.id}|">${esc(d.name)} › Sin sección</option>${d.sections.map((s) => `<option value="${d.id}|${s.id}">${esc(d.name)} › ${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
}

function renderBrowseTable() {
  const res = browseResults();
  const sel = ui.browse.selected;
  for (const id of [...sel]) if (!cardById(id)) sel.delete(id);
  const shown = res.slice(0, 500);
  $('#browse-table').innerHTML = `
    ${sel.size ? `<div class="bulk"><b>${plural(sel.size, 'seleccionada', 'seleccionadas')}</b><span class="spacer"></span>
      <select class="input" id="bulk-target" style="width:auto"><option value="">Mover a sección…</option>${sectionTargets()}</select>
      <button class="btn sm" data-act="bulk-flag">Marcar / desmarcar</button><button class="btn sm" data-act="bulk-forget">Reiniciar progreso</button>
      <button class="btn sm danger" data-act="bulk-delete">Eliminar</button><button class="btn sm ghost" data-act="bulk-clear">Quitar selección</button></div>`
      : `<div class="small muted" style="padding:10px 14px;border-bottom:1px solid var(--border)">${plural(res.length, 'tarjeta', 'tarjetas')}${res.length > 500 ? ' (mostrando 500)' : ''} · marca varias para moverlas de sección a la vez</div>`}
    ${cardTable(shown, { selectable: true })}`;
  const all = $('#check-all');
  if (all) {
    all.checked = shown.length > 0 && shown.every((c) => sel.has(c.id));
    all.onchange = () => { for (const c of shown) all.checked ? sel.add(c.id) : sel.delete(c.id); renderBrowseTable(); };
  }
  $$('.row-check').forEach((el) => { el.onchange = () => { el.checked ? sel.add(el.dataset.id) : sel.delete(el.dataset.id); renderBrowseTable(); }; });
  const tgt = $('#bulk-target');
  if (tgt) tgt.onchange = () => {
    if (!tgt.value) return;
    const [deckId, secId] = tgt.value.split('|');
    moveCards([...sel], deckId, secId || null);
    sel.clear();
    renderBrowseTable();
  };
}

function moveCards(ids, deckId, sectionId) {
  let n = 0;
  for (const id of ids) {
    const c = cardById(id);
    if (!c) continue;
    c.deckId = deckId;
    c.sectionId = sectionId;
    n++;
  }
  persist();
  renderSidebar();
  const d = deckById(deckId);
  const s = d.sections.find((x) => x.id === sectionId);
  toast(`${plural(n, 'tarjeta movida', 'tarjetas movidas')} a ${s ? s.name : 'Sin sección'}`);
}

// ---------------------------------------------------------------- Estadísticas
function renderStats() {
  const scopeId = view.deck || '';
  const scope = scopeId ? deckScope(scopeId) : { all: true, decks: {} };
  const cards = cardsInScope(scope);
  const ids = new Set(cards.map((c) => c.id));
  const log = db.log.filter((l) => ids.has(l.cardId) || (scopeId ? l.deckId === scopeId : true));
  const t0 = today();
  const todayLog = log.filter((l) => l.ts >= t0);
  const todayOk = todayLog.filter((l) => l.rating > 1).length;
  const minutes = Math.round(todayLog.reduce((a, l) => a + (l.ms || 0), 0) / 60000);

  // Previsión 14 días
  const fc = Array.from({ length: 14 }, (_, i) => ({ day: S.addDays(t0, i), n: 0 }));
  for (const c of cards) {
    if (c.srs.state === 'new') continue;
    let idx = S.isLearning(c.srs) ? 0 : Math.round((c.srs.due - t0) / S.DAY);
    if (idx < 0) idx = 0;
    if (idx < 14) fc[idx].n++;
  }
  // Últimos 30 días
  const hist = Array.from({ length: 30 }, (_, i) => ({ day: S.addDays(t0, i - 29), n: 0 }));
  for (const l of log) {
    const idx = 29 - Math.round((t0 - S.dayStart(l.ts, sched().dayStartHour)) / S.DAY);
    if (idx >= 0 && idx < 30) hist[idx].n++;
  }
  // Estados
  const st = { new: 0, learn: 0, young: 0, mature: 0 };
  for (const c of cards) {
    if (c.srs.state === 'new') st.new++;
    else if (S.isLearning(c.srs)) st.learn++;
    else if (c.srs.interval >= 21) st.mature++;
    else st.young++;
  }
  const total = cards.length || 1;
  const stateDefs = [['new', 'Nuevas', 'var(--series-1)'], ['learn', 'Aprendiendo', 'var(--series-2)'], ['young', 'Jóvenes (< 21 d)', 'var(--series-3)'], ['mature', 'Dominadas (≥ 21 d)', 'var(--series-4)']];

  // Rendimiento por sección (últimos 30 días)
  const since = S.addDays(t0, -29);
  const secRows = [];
  for (const d of db.decks) {
    if (scopeId && d.id !== scopeId) continue;
    const groups = [...d.sections.map((s) => ({ s, list: cards.filter((c) => c.deckId === d.id && c.sectionId === s.id) })),
      { s: null, list: cards.filter((c) => c.deckId === d.id && !d.sections.some((s) => s.id === c.sectionId)) }];
    for (const { s, list } of groups) {
      if (!list.length) continue;
      const set = new Set(list.map((c) => c.id));
      const ls = log.filter((l) => l.ts >= since && set.has(l.cardId));
      const ok = ls.filter((l) => l.rating > 1).length;
      const mature = list.filter((c) => c.srs.state === 'review' && c.srs.interval >= 21).length;
      secRows.push({ d, s, n: list.length, mature, answers: ls.length, rate: ls.length ? ok / ls.length : null, lapses: list.reduce((a, c) => a + c.srs.lapses, 0) });
    }
  }
  secRows.sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2));

  const bars = (arr, label) => {
    const max = Math.max(1, ...arr.map((x) => x.n));
    return `<div class="chart" role="img" aria-label="${label}">${arr.map((x) => `<div class="bar-wrap" data-tip="<b>${x.n}</b> · ${esc(new Date(x.day).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }))}"><div class="bar" style="height:${(x.n / max) * 100}%"></div></div>`).join('')}</div>
      <div class="chart-axis">${arr.map((x, i) => `<span>${i % Math.ceil(arr.length / 7) === 0 ? new Date(x.day).getDate() : ''}</span>`).join('')}</div>`;
  };

  $('#main').innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Estadísticas</h1><div class="sub">Tu progreso y qué secciones necesitan más trabajo.</div></div>
      <select class="input" id="stats-deck" style="width:auto"><option value="">Todos los mazos</option>${db.decks.map((d) => `<option value="${d.id}" ${d.id === scopeId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
    <div class="strip">
      <div class="tile"><div class="label">Respondidas hoy</div><div class="value">${todayLog.length}</div><div class="hint">${minutes} min de estudio</div></div>
      <div class="tile"><div class="label">Aciertos hoy</div><div class="value">${todayLog.length ? Math.round((todayOk / todayLog.length) * 100) + ' %' : '—'}</div><div class="hint">Difícil, Bien o Fácil</div></div>
      <div class="tile"><div class="label">Racha</div><div class="value">${streak()}</div><div class="hint">días seguidos</div></div>
      <div class="tile"><div class="label">Tarjetas</div><div class="value">${cards.length}</div><div class="hint">${st.mature} dominadas</div></div>
    </div>
    <div class="panel pad" style="margin-bottom:16px"><h2>Estado de las tarjetas</h2>
      <div class="stack" role="img" aria-label="Distribución de tarjetas por estado">${stateDefs.filter(([k]) => st[k]).map(([k, l, col]) => `<i style="flex:${st[k]};background:${col}" data-tip="${l}: <b>${st[k]}</b>"></i>`).join('') || '<i style="flex:1;background:var(--surface-2)"></i>'}</div>
      <div class="legend">${stateDefs.map(([k, l, col]) => `<span><i style="background:${col}"></i>${l} <b class="num">${st[k]}</b> <span class="muted">(${Math.round((st[k] / total) * 100)} %)</span></span>`).join('')}</div></div>
    <div class="stats-grid">
      <div class="panel pad"><h2>Repasos de los próximos 14 días</h2><div class="small muted" style="margin-bottom:6px">Tarjetas que vencen cada día</div>${bars(fc, 'Previsión de repasos')}</div>
      <div class="panel pad"><h2>Actividad de los últimos 30 días</h2><div class="small muted" style="margin-bottom:6px">Respuestas por día</div>${bars(hist, 'Respuestas por día')}</div>
    </div>
    <div class="section-head"><div><h2>Rendimiento por sección</h2><div class="small muted">Últimos 30 días, de menor a mayor porcentaje de aciertos.</div></div></div>
    <div class="panel">${secRows.length ? `<table class="table"><thead><tr><th>Sección</th><th class="r">Tarjetas</th><th>Dominadas</th><th>Aciertos (30 d)</th><th class="r">Fallos totales</th><th></th></tr></thead><tbody>
      ${secRows.map((r) => `<tr><td><span class="deck-name" style="font-weight:400"><span class="dot" style="background:${r.s ? r.s.color : 'var(--text-3)'}"></span>${esc(r.s ? r.s.name : 'Sin sección')} <span class="muted small">${esc(r.d.name)}</span></span></td>
        <td class="r num">${r.n}</td><td class="num"><span class="meter"><i style="width:${Math.round((r.mature / r.n) * 100)}%"></i></span>${Math.round((r.mature / r.n) * 100)} %</td>
        <td class="num">${r.rate === null ? '<span class="muted">sin datos</span>' : `${Math.round(r.rate * 100)} % <span class="muted small">de ${r.answers}</span>`}</td>
        <td class="r num">${r.lapses}</td><td class="r"><button class="btn sm" data-act="practice-section" data-id="${r.d.id}" data-section="${r.s ? r.s.id : 'none'}">Practicar</button></td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">No hay tarjetas.</div>'}</div>
  </div>`;
  $('#stats-deck').onchange = (e) => go({ name: 'stats', deck: e.target.value });
}

// Tooltips de gráficos
document.addEventListener('mousemove', (e) => {
  const tipEl = e.target.closest?.('[data-tip]');
  let tip = $('.viz-tip');
  if (!tipEl) { if (tip) tip.style.display = 'none'; return; }
  if (!tip) { tip = document.createElement('div'); tip.className = 'viz-tip'; document.body.appendChild(tip); }
  tip.innerHTML = tipEl.dataset.tip;
  tip.style.display = 'block';
  const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + 'px';
  tip.style.top = (e.clientY - tip.offsetHeight - 10) + 'px';
});

// ---------------------------------------------------------------- Ajustes
function renderSettings() {
  const o = sched();
  const set = db.settings;
  $('#main').innerHTML = `<div class="page" style="max-width:820px">
    <div class="page-head"><div><h1>Ajustes</h1><div class="sub">Se guardan automáticamente.</div></div></div>
    <div class="panel pad" style="margin-bottom:16px"><h2 style="margin-bottom:14px">Apariencia</h2>
      <div class="seg" id="theme">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" ${set.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <div class="panel pad" style="margin-bottom:16px"><h2 style="margin-bottom:4px">Algoritmo de repaso</h2><p class="hint" style="margin:0 0 14px">Valores por defecto razonables; cámbialos solo si sabes lo que buscas.</p>
      <div class="grid-2">
        <div class="field"><label for="s-steps">Pasos de aprendizaje (minutos)</label><input class="input" id="s-steps" value="${o.learningSteps.join(' ')}"><span class="hint">Separados por espacios, p. ej. «1 10»</span></div>
        <div class="field"><label for="s-relearn">Pasos al fallar un repaso (minutos)</label><input class="input" id="s-relearn" value="${o.relearningSteps.join(' ')}"></div>
        <div class="field"><label for="s-grad">Intervalo al graduarse (días)</label><input class="input" type="number" min="1" id="s-grad" value="${o.graduatingInterval}"></div>
        <div class="field"><label for="s-easy">Intervalo con «Fácil» (días)</label><input class="input" type="number" min="1" id="s-easy" value="${o.easyInterval}"></div>
        <div class="field"><label for="s-hour">El día empieza a las (hora)</label><input class="input" type="number" min="0" max="23" id="s-hour" value="${o.dayStartHour}"></div>
        <div class="field"><label for="s-max">Intervalo máximo (días)</label><input class="input" type="number" min="1" id="s-max" value="${o.maxInterval}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="s-newday">Nuevas por día en mazos nuevos</label><input class="input" type="number" min="0" id="s-newday" value="${set.defaultNewPerDay}"></div>
        <div class="field"><label for="s-revday">Repasos por día en mazos nuevos</label><input class="input" type="number" min="0" id="s-revday" value="${set.defaultReviewsPerDay}"></div>
      </div></div>
    <div class="panel pad"><h2 style="margin-bottom:4px">Datos</h2><p class="hint" style="margin:0 0 14px">Tus datos se guardan en este equipo. Cada día se crea una copia de seguridad automática (se conservan 14).</p>
      <div class="row"><button class="btn" data-act="export-json">Exportar copia (JSON)</button><button class="btn" data-act="import-json">Restaurar copia…</button>
        <button class="btn" data-act="import-csv">Importar archivo de texto…</button><button class="btn" data-act="export-csv">Exportar mazo a CSV…</button>
        <button class="btn ghost" data-act="open-folder">Abrir carpeta de datos</button></div></div>
  </div>`;
  $$('#theme input').forEach((el) => { el.onchange = () => { set.theme = el.value; applyTheme(); persist(); }; });
  const steps = (v) => v.split(/[\s,]+/).map(Number).filter((n) => n > 0);
  const bind = (id, fn) => { $(id).onchange = (e) => { fn(e.target.value); persist(); toast('Ajuste guardado'); }; };
  bind('#s-steps', (v) => { o.learningSteps = steps(v); });
  bind('#s-relearn', (v) => { o.relearningSteps = steps(v); });
  bind('#s-grad', (v) => { o.graduatingInterval = Math.max(1, +v || 1); });
  bind('#s-easy', (v) => { o.easyInterval = Math.max(1, +v || 4); });
  bind('#s-hour', (v) => { o.dayStartHour = Math.min(23, Math.max(0, +v || 0)); });
  bind('#s-max', (v) => { o.maxInterval = Math.max(1, +v || 36500); });
  bind('#s-newday', (v) => { set.defaultNewPerDay = Math.max(0, +v || 0); });
  bind('#s-revday', (v) => { set.defaultReviewsPerDay = Math.max(0, +v || 0); });
}

// ---------------------------------------------------------------- Sesión de estudio
function startSession(cfg, title) {
  const scopeCards = cardsInScope(cfg.scope);
  const s = {
    cfg, title: title || cfg.name || scopeLabel(cfg.scope), mode: cfg.mode,
    scopeIds: scopeCards.map((c) => c.id),
    queueNew: [], queueRev: [], practice: [], current: null, revealed: false, dir: 'front',
    shownAt: 0, sinceNew: 0, newEvery: 0, forceAhead: false, typed: '',
    stats: { done: 0, correct: 0, ms: 0, failed: [] }, history: [], total: 0,
  };
  if (cfg.mode === 'srs') {
    const usage = usageToday();
    const t = now();
    const o = sched();
    const left = new Map(db.decks.map((d) => {
      const u = usage.get(d.id) || { newDone: 0, revDone: 0 };
      return [d.id, { n: Math.max(0, d.newPerDay - u.newDone), r: Math.max(0, d.reviewsPerDay - u.revDone) }];
    }));
    let rev = cfg.include.review ? scopeCards.filter((c) => S.isReviewDue(c.srs, t, o)) : [];
    let news = cfg.include.new ? scopeCards.filter((c) => c.srs.state === 'new') : [];
    rev = sortCards(rev, cfg.order, (a, b) => a.srs.due - b.srs.due).filter((c) => left.get(c.deckId).r-- > 0);
    news = sortCards(news, cfg.order, (a, b) => a.created - b.created).filter((c) => left.get(c.deckId).n-- > 0);
    if (cfg.limit) {
      rev = rev.slice(0, cfg.limit);
      news = news.slice(0, Math.max(0, cfg.limit - rev.length));
    }
    s.queueRev = rev.map((c) => c.id);
    s.queueNew = news.map((c) => c.id);
    s.newEvery = s.queueNew.length ? Math.max(1, Math.floor(s.queueRev.length / s.queueNew.length)) : 0;
    if (!cfg.include.learn) s.noLearn = true;
    s.total = rev.length + news.length;
  } else {
    let pool = sortCards(practicePool(cfg), cfg.order, (a, b) => {
      const sa = deckById(a.deckId)?.sections.findIndex((x) => x.id === a.sectionId) ?? 0;
      const sb = deckById(b.deckId)?.sections.findIndex((x) => x.id === b.sectionId) ?? 0;
      return sa - sb || a.created - b.created;
    });
    if (cfg.limit) pool = pool.slice(0, cfg.limit);
    s.practice = pool.map((c) => c.id);
    s.total = pool.length;
  }
  session = s;
  view = { name: 'study' };
  advance();
}

function learningInScope() {
  if (session.noLearn) {
    // Solo las tarjetas que se empezaron en esta sesión
    const seen = new Set(session.history.map((h) => h.cardId));
    return session.scopeIds.map(cardById).filter((c) => c && S.isLearning(c.srs) && seen.has(c.id)).sort((a, b) => a.srs.due - b.srs.due);
  }
  return session.scopeIds.map(cardById).filter((c) => c && S.isLearning(c.srs)).sort((a, b) => a.srs.due - b.srs.due);
}

function advance() {
  const s = session;
  s.revealed = false;
  s.typed = '';
  s.current = null;
  s.waitUntil = null;
  if (s.mode === 'practice') {
    while (s.practice.length && !cardById(s.practice[0])) s.practice.shift();
    s.current = s.practice[0] || null;
  } else {
    const t = now();
    const o = sched();
    const learn = learningInScope();
    const dueNow = learn.find((c) => c.srs.due <= t);
    const takeValid = (q, ok) => { while (q.length) { const c = cardById(q.shift()); if (c && ok(c)) return c; } return null; };
    let pick = dueNow || null;
    if (!pick && (s.queueRev.length || s.queueNew.length)) {
      const wantNew = s.queueNew.length && (!s.queueRev.length || s.sinceNew >= s.newEvery);
      if (wantNew) { pick = takeValid(s.queueNew, (c) => c.srs.state === 'new'); s.sinceNew = 0; }
      if (!pick) { pick = takeValid(s.queueRev, (c) => c.srs.state === 'review'); s.sinceNew++; }
      if (!pick) pick = takeValid(s.queueNew, (c) => c.srs.state === 'new');
    }
    if (!pick && learn.length) {
      const ahead = learn.find((c) => s.forceAhead || c.srs.due <= t + o.learnAheadMinutes * S.MIN);
      if (ahead) pick = ahead;
      else s.waitUntil = learn[0].srs.due;
    }
    s.current = pick ? pick.id : null;
  }
  if (s.current) {
    const d = s.cfg.direction;
    s.dir = d === 'mixed' ? (Math.random() < 0.5 ? 'front' : 'back') : d;
    s.shownAt = now();
  }
  render();
}

function srsCounts() {
  const s = session;
  const t = now();
  const learn = learningInScope().filter((c) => c.srs.due <= S.addDays(today(), 1)).length;
  const valid = (q, ok) => q.filter((id) => { const c = cardById(id); return c && ok(c); }).length;
  return { n: valid(s.queueNew, (c) => c.srs.state === 'new'), l: learn, r: valid(s.queueRev, (c) => S.isReviewDue(c.srs, t, sched())) };
}

let waitTimer = null;
function renderStudy() {
  clearTimeout(waitTimer);
  const s = session;
  if (!s) return go({ name: 'home' });
  const card = s.current ? cardById(s.current) : null;
  const sec = card ? sectionOf(card) : null;
  const deck = card ? deckById(card.deckId) : null;
  let countsBar = '';
  let progress = 0;
  if (s.mode === 'srs') {
    const c = srsCounts();
    const kind = card ? (card.srs.state === 'new' ? 'n' : S.isLearning(card.srs) ? 'l' : 'r') : '';
    countsBar = `<div class="study-counts" title="Nuevas · Aprendiendo · Repasar"><span class="c-new ${kind === 'n' ? 'cur' : ''}">${c.n + (kind === 'n' ? 1 : 0)}</span><span class="c-learn ${kind === 'l' ? 'cur' : ''}">${c.l}</span><span class="c-review ${kind === 'r' ? 'cur' : ''}">${c.r + (kind === 'r' ? 1 : 0)}</span></div>`;
    const remaining = c.n + c.r + (card && kind !== 'l' ? 1 : 0);
    progress = s.total ? (1 - remaining / s.total) * 100 : 100;
  } else {
    countsBar = `<div class="study-counts"><span>${s.total - s.practice.length + (card ? 1 : 0)} / ${s.total}</span></div>`;
    progress = s.total ? ((s.total - s.practice.length) / s.total) * 100 : 100;
  }

  const top = `<div class="study-top">
    <button class="btn ghost sm" data-act="exit-study" title="Salir (Esc)">← Salir</button>
    <div class="title">${esc(s.title)} <span class="badge ${s.mode === 'srs' ? 'srs' : ''}" style="margin-left:6px">${s.mode === 'srs' ? 'Programado' : 'Práctica libre'}</span></div>
    ${countsBar}
    <button class="icon-btn" data-act="undo" title="Deshacer (Z)" aria-label="Deshacer" ${s.history.length ? '' : 'disabled'}>${ICON.undo}</button>
    ${card ? `<button class="icon-btn ${card.flag ? 'flag' : ''}" data-act="flag-current" title="Marcar con estrella (M)" aria-label="Marcar">${card.flag ? ICON.starOn : ICON.star}</button>
    <button class="icon-btn" data-act="edit-current" title="Editar (E)" aria-label="Editar">${ICON.edit}</button>` : ''}</div>
    <div class="study-progress"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div>`;

  let body = '';
  let foot = '';
  if (!card) {
    if (s.waitUntil) {
      body = `<div class="done"><div class="big">⏳</div><h1>Un momento…</h1><p class="muted">Tienes tarjetas en aprendizaje que vuelven en <b>${S.formatDelay(s.waitUntil - now())}</b>. Puedes esperar aquí o estudiarlas ya.</p>
        <div class="row" style="justify-content:center;margin-top:18px"><button class="btn" data-act="exit-study">Volver</button><button class="btn primary" data-act="study-ahead">Estudiarlas ahora</button></div></div>`;
      waitTimer = setTimeout(() => { if (session === s && view.name === 'study' && !s.current) advance(); }, Math.min(30000, Math.max(1000, s.waitUntil - now() + 200)));
    } else {
      const acc = s.stats.done ? Math.round((s.stats.correct / s.stats.done) * 100) : 0;
      const failedIds = [...new Set(s.stats.failed)].filter(cardById);
      body = `<div class="done"><div class="big">🎉</div><h1>${s.stats.done ? '¡Sesión terminada!' : 'No hay nada que estudiar ahora'}</h1>
        <p class="muted">${s.stats.done ? 'Buen trabajo. Vuelve mañana para los próximos repasos.' : 'Prueba un estudio personalizado o una práctica libre.'}</p>
        ${s.stats.done ? `<div class="strip"><div class="tile"><div class="label">Respuestas</div><div class="value">${s.stats.done}</div></div>
          <div class="tile"><div class="label">Aciertos</div><div class="value">${acc} %</div></div>
          <div class="tile"><div class="label">Tiempo</div><div class="value">${Math.max(1, Math.round(s.stats.ms / 60000))}<span class="small"> min</span></div></div></div>` : ''}
        <div class="row" style="justify-content:center"><button class="btn" data-act="exit-study">Volver al inicio</button>
          ${failedIds.length ? `<button class="btn primary" data-act="practice-failed">Practicar las ${failedIds.length} falladas</button>` : ''}
          <button class="btn" data-act="custom-study">Estudio personalizado</button></div></div>`;
      s.failedIds = failedIds;
    }
  } else {
    const q = s.dir === 'front' ? card.front : card.back;
    const a = s.dir === 'front' ? card.back : card.front;
    const meta = `<div class="card-meta">${sec ? `<span class="dot" style="background:${sec.color}"></span>${esc(sec.name)} ·` : ''} ${esc(deck?.name)}${s.dir === 'back' ? ' · <i>inversa</i>' : ''}</div>`;
    let typed = '';
    if (s.cfg.typeAnswer) {
      if (!s.revealed) typed = `<div class="typed"><input class="input" id="typed" placeholder="Escribe tu respuesta y pulsa Enter" autocomplete="off" value="${esc(s.typed)}"></div>`;
      else typed = `<div class="typed-result">${compareTyped(s.typed, a)}</div>`;
    }
    body = `<div class="flashcard">${meta}<div class="q">${rich(q)}</div>${typed}${s.revealed ? `<div class="divider"></div><div class="a">${rich(a)}</div>` : ''}</div>`;
    if (!s.revealed) foot = `<button class="btn primary reveal-btn" data-act="reveal">Mostrar respuesta <span class="kbd" style="color:inherit;border-color:currentColor">Espacio</span></button>`;
    else if (s.mode === 'srs') {
      const p = S.preview(card.srs, now(), sched());
      foot = `<div class="answers">${[[1, 'Otra vez'], [2, 'Difícil'], [3, 'Bien'], [4, 'Fácil']].map(([r, l]) => `<button class="ans r${r}" data-act="rate" data-r="${r}"><small>${p[r]}</small>${l}<small class="kbd">${r}</small></button>`).join('')}</div>`;
    } else {
      foot = `<div class="answers two"><button class="ans r1" data-act="rate" data-r="1"><small>vuelve en un rato</small>No la sabía<small class="kbd">1</small></button><button class="ans r3" data-act="rate" data-r="3"><small>hecha</small>La sabía<small class="kbd">2</small></button></div>`;
    }
  }
  $('#main').innerHTML = `<div class="study">${top}<div class="study-body">${body}</div>${foot ? `<div class="study-foot">${foot}</div>` : ''}</div>`;
  const inp = $('#typed');
  if (inp) {
    inp.focus();
    inp.oninput = () => { s.typed = inp.value; };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); reveal(); } };
  }
}

function normalize(s) {
  return plain(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function compareTyped(typed, answer) {
  if (!typed.trim()) return `<span class="muted">No escribiste respuesta.</span>`;
  if (normalize(typed) === normalize(answer)) return `<span class="ok">✓ ¡Correcto!</span> <span class="muted">${esc(typed)}</span>`;
  return `<span class="bad">✗ Tu respuesta:</span> <del>${esc(typed)}</del>`;
}

function reveal() {
  if (!session || !session.current || session.revealed) return;
  session.revealed = true;
  renderStudy();
}

function rate(r) {
  const s = session;
  if (!s || !s.current || !s.revealed) return;
  const c = cardById(s.current);
  if (!c) return advance();
  const t = now();
  const ms = Math.min(60000, t - s.shownAt);
  s.history.push({
    cardId: c.id, srs: { ...c.srs }, logLen: db.log.length,
    queueNew: s.queueNew.slice(), queueRev: s.queueRev.slice(), practice: s.practice.slice(),
    sinceNew: s.sinceNew, stats: { ...s.stats, failed: s.stats.failed.slice() },
  });
  if (s.history.length > 50) s.history.shift();
  s.stats.done++;
  s.stats.ms += ms;
  if (r > 1) s.stats.correct++;
  else s.stats.failed.push(c.id);
  if (s.mode === 'srs') {
    const was = c.srs.state;
    c.srs = S.answer(c.srs, r, t, sched());
    db.log.push({ cardId: c.id, deckId: c.deckId, ts: t, rating: r, was, ms, mode: 'srs' });
  } else {
    db.log.push({ cardId: c.id, deckId: c.deckId, ts: t, rating: r, was: c.srs.state, ms, mode: 'practice' });
    s.practice.shift();
    if (r === 1) s.practice.splice(Math.min(3, s.practice.length), 0, c.id);
  }
  persist();
  advance();
}

function undo() {
  const s = session;
  if (!s || !s.history.length) return;
  const h = s.history.pop();
  const c = cardById(h.cardId);
  if (c) c.srs = h.srs;
  db.log.length = h.logLen;
  Object.assign(s, { queueNew: h.queueNew, queueRev: h.queueRev, practice: h.practice, sinceNew: h.sinceNew, stats: h.stats });
  s.current = h.cardId;
  s.revealed = false;
  s.typed = '';
  s.waitUntil = null;
  s.shownAt = now();
  persist();
  toast('Respuesta deshecha');
  renderStudy();
}

function quickSrs(scope) {
  return { mode: 'srs', scope, include: { new: true, learn: true, review: true }, filter: 'all', order: 'default', limit: 0, direction: 'front', typeAnswer: false };
}

// ---------------------------------------------------------------- Modales
function openModal(html, { wide = false } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const back = root.firstElementChild;
  back.addEventListener('mousedown', (e) => { if (e.target === back) closeModal(); });
  const first = root.querySelector('input:not([type=radio]):not([type=checkbox]), textarea, select');
  if (first) setTimeout(() => first.focus(), 0);
  return root.querySelector('.modal');
}
let modalOnClose = null;
function closeModal() {
  $('#modal-root').innerHTML = '';
  const fn = modalOnClose;
  modalOnClose = null;
  if (fn) fn();
}
const modalOpen = () => !!$('#modal-root').firstElementChild;
const modalHead = (title) => `<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-act="close-modal" aria-label="Cerrar">${ICON.close}</button></div>`;

function ask({ title, label, value = '', okText = 'Aceptar' }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`${modalHead(esc(title))}<form><div class="modal-body"><div class="field"><label for="ask-in">${esc(label)}</label><input class="input" id="ask-in" value="${esc(value)}"></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-act="close-modal">Cancelar</button><button class="btn primary" type="submit">${esc(okText)}</button></div></form>`);
    modalOnClose = () => { if (!done) resolve(null); };
    m.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = $('#ask-in').value.trim();
      if (!v) return;
      done = true;
      closeModal();
      resolve(v);
    };
  });
}

function confirmBox({ title, message, okText = 'Aceptar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`${modalHead(esc(title))}<div class="modal-body"><p style="margin:0">${message}</p></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" id="confirm-ok">${esc(okText)}</button></div>`);
    modalOnClose = () => { if (!done) resolve(false); };
    m.querySelector('#confirm-ok').onclick = () => { done = true; closeModal(); resolve(true); };
    m.querySelector('#confirm-ok').focus();
  });
}

function editSectionModal(deck, sec) {
  const m = openModal(`${modalHead('Editar sección')}<form><div class="modal-body">
    <div class="field"><label for="sec-name">Nombre</label><input class="input" id="sec-name" value="${esc(sec.name)}"></div>
    <div class="field"><span class="field-label">Color</span><div class="colors">${COLORS.map((c) => `<label><input type="radio" name="sec-color" value="${c}" ${c === sec.color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>
    <div class="field"><span class="field-label">Posición</span><div class="row"><button type="button" class="btn sm" id="sec-up">↑ Subir</button><button type="button" class="btn sm" id="sec-down">↓ Bajar</button></div></div>
    </div><div class="modal-foot"><button type="button" class="btn danger" id="sec-del">Eliminar sección</button><span class="spacer"></span>
    <button type="button" class="btn" data-act="close-modal">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
  const moveBy = (k) => {
    const i = deck.sections.indexOf(sec);
    const j = i + k;
    if (j < 0 || j >= deck.sections.length) return;
    [deck.sections[i], deck.sections[j]] = [deck.sections[j], deck.sections[i]];
    persist();
    render();
  };
  m.querySelector('#sec-up').onclick = () => moveBy(-1);
  m.querySelector('#sec-down').onclick = () => moveBy(1);
  m.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    sec.name = $('#sec-name').value.trim() || sec.name;
    sec.color = m.querySelector('input[name=sec-color]:checked')?.value || sec.color;
    persist();
    closeModal();
    render();
  };
  m.querySelector('#sec-del').onclick = async () => {
    const n = db.cards.filter((c) => c.deckId === deck.id && c.sectionId === sec.id).length;
    closeModal();
    const ok = await confirmBox({ title: 'Eliminar sección', message: `Se eliminará la sección <b>${esc(sec.name)}</b>. Sus ${n} tarjetas no se borran: pasan a «Sin sección».`, okText: 'Eliminar', danger: true });
    if (!ok) return;
    deck.sections = deck.sections.filter((s) => s !== sec);
    for (const c of db.cards) if (c.deckId === deck.id && c.sectionId === sec.id) c.sectionId = null;
    if (view.section === sec.id) view.section = null;
    persist();
    render();
  };
}

function deckOptionsModal(deck) {
  const m = openModal(`${modalHead('Opciones del mazo')}<form><div class="modal-body">
    <div class="field"><label for="d-name">Nombre</label><input class="input" id="d-name" value="${esc(deck.name)}"></div>
    <div class="grid-2"><div class="field"><label for="d-new">Tarjetas nuevas por día</label><input class="input" type="number" min="0" id="d-new" value="${deck.newPerDay}"></div>
    <div class="field"><label for="d-rev">Repasos máximos por día</label><input class="input" type="number" min="0" id="d-rev" value="${deck.reviewsPerDay}"></div></div>
    </div><div class="modal-foot"><button type="button" class="btn danger" id="d-del">Eliminar mazo</button><span class="spacer"></span>
    <button type="button" class="btn" data-act="close-modal">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`);
  m.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    deck.name = $('#d-name').value.trim() || deck.name;
    deck.newPerDay = Math.max(0, parseInt($('#d-new').value, 10) || 0);
    deck.reviewsPerDay = Math.max(0, parseInt($('#d-rev').value, 10) || 0);
    persist();
    closeModal();
    render();
  };
  m.querySelector('#d-del').onclick = async () => {
    const n = db.cards.filter((c) => c.deckId === deck.id).length;
    closeModal();
    const ok = await confirmBox({ title: 'Eliminar mazo', message: `Se eliminará <b>${esc(deck.name)}</b> con sus ${plural(n, 'tarjeta', 'tarjetas')} y su historial. No se puede deshacer (salvo restaurando una copia de seguridad).`, okText: 'Eliminar mazo', danger: true });
    if (!ok) return;
    db.decks = db.decks.filter((d) => d !== deck);
    const gone = new Set(db.cards.filter((c) => c.deckId === deck.id).map((c) => c.id));
    db.cards = db.cards.filter((c) => !gone.has(c.id));
    for (const p of db.presets) delete p.scope.decks[deck.id];
    persist();
    go({ name: 'home' });
  };
}

function editCardModal(card, after) {
  const deck = deckById(card.deckId);
  const s = card.srs;
  const m = openModal(`${modalHead('Editar tarjeta')}<form><div class="modal-body">
    <div class="info-grid"><div>Estado<b>${{ new: 'Nueva', learning: 'Aprendiendo', relearning: 'Reaprendiendo', review: 'Repaso' }[s.state]}</b></div>
      <div>Próximo repaso<b>${dueLabel(card)}</b></div><div>Intervalo<b>${s.state === 'review' ? plural(s.interval, 'día', 'días') : '—'}</b></div>
      <div>Repasos<b>${s.reps}</b></div><div>Fallos<b>${s.lapses}</b></div><div>Facilidad<b>${s.ease ? Math.round(s.ease * 100) + ' %' : '—'}</b></div></div>
    <div class="grid-2"><div class="field"><label for="e-deck">Mazo</label><select class="input" id="e-deck">${db.decks.map((d) => `<option value="${d.id}" ${d.id === deck.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="e-sec">Sección</label><select class="input" id="e-sec"></select></div></div>
    <div class="field"><label for="e-front">Anverso</label><textarea class="input" id="e-front">${esc(card.front)}</textarea></div>
    <div class="field"><label for="e-back">Reverso</label><textarea class="input" id="e-back">${esc(card.back)}</textarea></div>
    <label class="check"><input type="checkbox" id="e-flag" ${card.flag ? 'checked' : ''}> Marcada con estrella</label>
    </div><div class="modal-foot"><button type="button" class="btn danger" id="e-del">Eliminar</button><button type="button" class="btn ghost" id="e-reset">Reiniciar progreso</button><span class="spacer"></span>
    <button type="button" class="btn" data-act="close-modal">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`, { wide: true });
  const fillSecs = () => {
    const d = deckById($('#e-deck').value);
    $('#e-sec').innerHTML = `<option value="">Sin sección</option>` + d.sections.map((x) => `<option value="${x.id}" ${x.id === card.sectionId ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  };
  fillSecs();
  $('#e-deck').onchange = fillSecs;
  const finish = () => { persist(); closeModal(); if (after) after(); else render(); };
  m.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const f = $('#e-front').value.trim();
    const b = $('#e-back').value.trim();
    if (!f || !b) return toast('El anverso y el reverso no pueden estar vacíos');
    Object.assign(card, { front: f, back: b, deckId: $('#e-deck').value, sectionId: $('#e-sec').value || null, flag: $('#e-flag').checked });
    finish();
  };
  m.querySelector('form').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) m.querySelector('form').requestSubmit(); };
  $('#e-reset').onclick = () => { card.srs = S.newSrs(); toast('Progreso reiniciado: vuelve a ser nueva'); finish(); };
  $('#e-del').onclick = () => {
    db.cards = db.cards.filter((c) => c !== card);
    toast('Tarjeta eliminada');
    if (session && session.current === card.id) { persist(); closeModal(); advance(); return; }
    finish();
  };
}

/** Estudio personalizado: crear o editar un modo de estudio. */
function customStudyModal(initial, preset) {
  const cfg = initial || { mode: 'srs', scope: { all: true, decks: {} }, include: { new: true, learn: true, review: true }, filter: 'all', order: 'default', limit: 0, direction: 'front', typeAnswer: false };
  const sel = (deckId, secId) => {
    if (cfg.scope.all) return true;
    const v = cfg.scope.decks[deckId];
    if (v === undefined) return false;
    return v === null || (secId !== undefined && v.includes(secId));
  };
  const deckRows = db.decks.map((d) => {
    const hasNone = db.cards.some((c) => c.deckId === d.id && !d.sections.some((s) => s.id === c.sectionId));
    const secs = [...d.sections.map((s) => [s.id, s.name, s.color]), ...(hasNone ? [['none', 'Sin sección', 'var(--text-3)']] : [])];
    const deckChecked = sel(d.id) && (cfg.scope.all || cfg.scope.decks[d.id] === null || secs.every(([id]) => sel(d.id, id)));
    return `<div><label class="check"><input type="checkbox" class="sc-deck" data-id="${d.id}" ${deckChecked ? 'checked' : ''}><b>${esc(d.name)}</b></label>
      ${secs.length ? `<div class="secs">${secs.map(([id, n, col]) => `<label class="check small"><input type="checkbox" class="sc-sec" data-deck="${d.id}" data-id="${id}" ${sel(d.id, id) ? 'checked' : ''}><span class="dot" style="background:${col}"></span>${esc(n)}</label>`).join('')}</div>` : ''}</div>`;
  }).join('');
  const radio = (name, val, label, cur) => `<label><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}><span>${label}</span></label>`;
  const m = openModal(`${modalHead(preset ? 'Editar modo de estudio' : 'Estudio personalizado')}<form id="cs-form"><div class="modal-body">
    <div class="field"><span class="field-label">¿Qué quieres estudiar?</span><div class="scope-tree">${deckRows || '<span class="muted">No hay mazos</span>'}</div>
      <div class="row" style="margin-top:6px"><button type="button" class="btn sm ghost" id="sc-all">Todo</button><button type="button" class="btn sm ghost" id="sc-none">Nada</button></div></div>
    <div class="field"><span class="field-label">Tipo de estudio</span><div class="seg">${radio('mode', 'srs', 'Repaso programado', cfg.mode)}${radio('mode', 'practice', 'Práctica libre', cfg.mode)}</div>
      <span class="hint" id="mode-hint"></span></div>
    <div class="field" id="f-include"><span class="field-label">Incluir</span><div class="row">
      <label class="check"><input type="checkbox" id="inc-new" ${cfg.include.new ? 'checked' : ''}> Nuevas</label>
      <label class="check"><input type="checkbox" id="inc-learn" ${cfg.include.learn ? 'checked' : ''}> En aprendizaje</label>
      <label class="check"><input type="checkbox" id="inc-review" ${cfg.include.review ? 'checked' : ''}> Repasos pendientes</label></div></div>
    <div class="field" id="f-filter"><label for="cs-filter">Tarjetas</label><select class="input" id="cs-filter">${Object.entries(FILTERS).map(([k, l]) => `<option value="${k}" ${cfg.filter === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="grid-3">
      <div class="field"><label for="cs-order">Orden</label><select class="input" id="cs-order">${Object.entries(ORDERS).map(([k, l]) => `<option value="${k}" ${cfg.order === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="cs-dir">Dirección</label><select class="input" id="cs-dir">${Object.entries(DIRS).map(([k, l]) => `<option value="${k}" ${cfg.direction === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="cs-limit">Máximo de tarjetas</label><input class="input" type="number" min="0" id="cs-limit" value="${cfg.limit || ''}" placeholder="Sin límite"></div>
    </div>
    <label class="check"><input type="checkbox" id="cs-type" ${cfg.typeAnswer ? 'checked' : ''}> Escribir la respuesta antes de verla</label>
    <div class="field" style="margin-top:14px"><label for="cs-name">Guardar como modo de estudio (opcional)</label><input class="input" id="cs-name" placeholder="p. ej. «Verbos antes del examen»" value="${esc(preset?.name || '')}"></div>
    </div><div class="modal-foot">${preset ? '<button type="button" class="btn danger" id="cs-del">Eliminar modo</button>' : ''}<span class="small muted" id="cs-count"></span><span class="spacer"></span>
      <button type="button" class="btn" id="cs-save">${preset ? 'Guardar cambios' : 'Solo guardar'}</button><button class="btn primary" type="submit">${ICON.play}Empezar</button></div></form>`, { wide: true });

  const read = () => {
    const scope = { all: false, decks: {} };
    for (const d of db.decks) {
      const deckBox = m.querySelector(`.sc-deck[data-id="${d.id}"]`);
      const secBoxes = $$(`.sc-sec[data-deck="${d.id}"]`, m);
      const checked = secBoxes.filter((b) => b.checked).map((b) => b.dataset.id);
      if (deckBox.checked && (secBoxes.length === 0 || checked.length === secBoxes.length)) scope.decks[d.id] = null;
      else if (checked.length) scope.decks[d.id] = checked;
    }
    if (db.decks.length && db.decks.every((d) => scope.decks[d.id] === null)) { scope.all = true; scope.decks = {}; }
    return {
      scope, mode: m.querySelector('input[name=mode]:checked').value,
      include: { new: $('#inc-new').checked, learn: $('#inc-learn').checked, review: $('#inc-review').checked },
      filter: $('#cs-filter').value, order: $('#cs-order').value, direction: $('#cs-dir').value,
      limit: Math.max(0, parseInt($('#cs-limit').value, 10) || 0), typeAnswer: $('#cs-type').checked,
    };
  };
  const refresh = () => {
    const c = read();
    $('#f-include').style.display = c.mode === 'srs' ? '' : 'none';
    $('#f-filter').style.display = c.mode === 'practice' ? '' : 'none';
    $('#mode-hint').textContent = c.mode === 'srs'
      ? 'Sigue el algoritmo de repetición espaciada: tus respuestas deciden cuándo vuelve cada tarjeta.'
      : 'Repasa libremente lo que quieras, cuando quieras. No cambia la programación de las tarjetas.';
    const n = presetCount(c);
    $('#cs-count').textContent = plural(n, 'tarjeta disponible', 'tarjetas disponibles');
    m.querySelector('button[type=submit]').disabled = !n;
  };
  $$('.sc-deck', m).forEach((b) => { b.onchange = () => { $$(`.sc-sec[data-deck="${b.dataset.id}"]`, m).forEach((x) => { x.checked = b.checked; }); refresh(); }; });
  $$('.sc-sec', m).forEach((b) => { b.onchange = () => {
    const all = $$(`.sc-sec[data-deck="${b.dataset.deck}"]`, m);
    m.querySelector(`.sc-deck[data-id="${b.dataset.deck}"]`).checked = all.every((x) => x.checked);
    refresh();
  }; });
  $('#sc-all').onclick = () => { $$('.sc-deck, .sc-sec', m).forEach((x) => { x.checked = true; }); refresh(); };
  $('#sc-none').onclick = () => { $$('.sc-deck, .sc-sec', m).forEach((x) => { x.checked = false; }); refresh(); };
  m.querySelector('#cs-form').addEventListener('change', refresh);
  m.querySelector('#cs-form').addEventListener('input', refresh);
  refresh();

  const savePreset = () => {
    const c = read();
    const name = $('#cs-name').value.trim();
    if (!name) { toast('Escribe un nombre para guardar el modo'); $('#cs-name').focus(); return null; }
    if (preset) Object.assign(preset, c, { name });
    else db.presets.push({ id: uid(), name, ...c });
    persist();
    return name;
  };
  $('#cs-save').onclick = () => { if (savePreset()) { closeModal(); toast('Modo de estudio guardado'); render(); } };
  if (preset) $('#cs-del').onclick = () => { db.presets = db.presets.filter((p) => p !== preset); persist(); closeModal(); render(); };
  m.querySelector('#cs-form').onsubmit = (e) => {
    e.preventDefault();
    const c = read();
    let name = $('#cs-name').value.trim();
    if (name) savePreset();
    closeModal();
    startSession(c, name || (c.mode === 'srs' ? 'Estudio personalizado' : 'Práctica libre') + ' · ' + scopeLabel(c.scope));
  };
}

// ---------------------------------------------------------------- Importar / exportar
const SEPARATORS = { '=': '= (igual)', '\t': 'Tabulador', ';': '; (punto y coma)', ',': ', (coma)', '|': '| (barra vertical)', ':': ': (dos puntos)' };

/** Lee las cabeceras tipo «#separator:tab» que añaden otras apps al exportar en texto plano. */
function readHeaders(text) {
  const h = { sep: null, html: false };
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^#(\w+):(.*)$/);
    if (!m) continue;
    const v = m[2].trim().toLowerCase();
    if (m[1] === 'separator') h.sep = { tab: '\t', semicolon: ';', comma: ',', pipe: '|', space: ' ', colon: ':' }[v] || v;
    if (m[1] === 'html') h.html = v === 'true';
  }
  return h;
}

/**
 * Convierte texto delimitado en filas de campos. `sep` fuerza el separador; si no se indica,
 * se usa la cabecera del archivo o se detecta (tabulador, «=», «;» o «,»).
 */
function parseDelimited(text, sep) {
  const headers = readHeaders(text);
  const body = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => !/^#\w+:/.test(l));
  if (!sep) sep = headers.sep;
  if (!sep) {
    const first = body.find((l) => l.trim()) || '';
    sep = first.includes('\t') ? '\t' : first.includes('=') ? '=' : first.includes(';') ? ';' : ',';
  }
  const textBody = body.join('\n');
  // Las comillas solo agrupan campos en formatos tipo CSV; en «a = b» se conservan tal cual.
  const quotes = [',', ';', '\t', '|'].includes(sep);
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < textBody.length; i++) {
    const ch = textBody[i];
    if (q) {
      if (ch === '"') { if (textBody[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (quotes && ch === '"' && field.trim() === '') { q = true; field = ''; }
    else if (textBody.startsWith(sep, i)) { row.push(field); field = ''; i += sep.length - 1; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  row.push(field);
  rows.push(row);
  const clean = (s) => {
    if (!headers.html && !/<[a-z][\s\S]*>/i.test(s)) return s.trim();
    const doc = new DOMParser().parseFromString(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '\n'), 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  };
  return rows.filter((r) => r.some((f) => f.trim())).map((r) => r.map(clean));
}

/** Separador inicial: el de la cabecera del archivo; en .txt, «=»; en el resto, detección automática. */
function defaultSeparator(name, text) {
  const h = readHeaders(text).sep;
  if (h) return h;
  if (/\.txt$/i.test(name)) return '=';
  if (/\.tsv$/i.test(name)) return '\t';
  const first = text.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#')) || '';
  return first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
}

async function importCsv(targetDeckId) {
  const file = await api.openFile({ filters: [{ name: 'Archivos de texto', extensions: ['txt', 'csv', 'tsv'] }, { name: 'Todos los archivos', extensions: ['*'] }] });
  if (!file) return;
  let sep = defaultSeparator(file.name, file.content);
  let rows = [];        // filas parseadas; null = línea eliminada por el usuario
  let fixIdx = [];      // filas que no tenían separador al leer el archivo
  const known = Object.prototype.hasOwnProperty.call(SEPARATORS, sep);
  const preselect = deckById(targetDeckId)?.id || deckById(ui.addDeck)?.id || '';
  // El tabulador no se puede escribir en un campo de texto: para corregir líneas se usa «=».
  const fixSep = () => (sep === '\t' ? '=' : sep);
  const valid = (r) => !!r && r.length >= 2 && !!r[0] && !!r[1];
  const start = () => ($('#imp-header').checked ? 1 : 0);
  const rowText = (r) => (r.length === 1 ? r[0] : r.join(` ${fixSep()} `));

  const m = openModal(`${modalHead('Importar tarjetas')}<form><div class="modal-body">
    <p class="hint" style="margin-top:0"><b>${esc(file.name)}</b>. Una tarjeta por línea: <code>anverso = reverso</code>, y opcionalmente <code>= sección</code> al final (la sección se crea si no existe).</p>
    <div class="grid-2">
      <div class="field"><label for="imp-sep">Separador</label><div class="row" style="flex-wrap:nowrap">
        <select class="input" id="imp-sep">${Object.entries(SEPARATORS).map(([v, l]) => `<option value="${esc(v)}" ${v === sep ? 'selected' : ''}>${l}</option>`).join('')}<option value="__custom" ${known ? '' : 'selected'}>Otro…</option></select>
        <input class="input" id="imp-sep-custom" style="width:90px;${known ? 'display:none' : ''}" placeholder="p. ej. -&gt;" value="${known ? '' : esc(sep)}" aria-label="Separador personalizado"></div></div>
      <div class="field"><label for="imp-deck">Mazo de destino</label><select class="input" id="imp-deck">${db.decks.map((d) => `<option value="${d.id}" ${d.id === preselect ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}<option value="__new" ${preselect ? '' : 'selected'}>+ Nuevo mazo…</option></select></div>
    </div>
    <div class="field" id="imp-newname-f"><label for="imp-newname">Nombre del nuevo mazo</label><input class="input" id="imp-newname" value="${esc(file.name.replace(/\.[^.]+$/, ''))}"></div>
    <label class="check"><input type="checkbox" id="imp-header"> La primera fila es un encabezado</label>
    <label class="check"><input type="checkbox" id="imp-dupes" checked> Omitir tarjetas cuyo anverso ya exista en el mazo</label>
    <div id="imp-fix"></div>
    <div class="small muted" id="imp-summary" style="margin-top:12px"></div>
    <div class="panel" style="margin-top:6px;box-shadow:none"><table class="table"><thead><tr><th>Anverso</th><th>Reverso</th><th>Sección</th></tr></thead><tbody id="imp-preview"></tbody></table></div>
    </div><div class="modal-foot"><span class="small muted" id="imp-foot-hint"></span><span class="spacer"></span><button type="button" class="btn" data-act="close-modal">Cancelar</button><button class="btn primary" type="submit" id="imp-ok">Importar</button></div></form>`, { wide: true });

  /** Recuentos, vista previa y botón (no toca la lista de correcciones para no perder el foco). */
  const refresh = () => {
    const data = rows.slice(start()).filter(Boolean);
    const ok = data.filter(valid);
    const pending = data.length - ok.length;
    $('#imp-summary').textContent = `Vista previa · ${plural(ok.length, 'tarjeta lista para importar', 'tarjetas listas para importar')}`;
    $('#imp-preview').innerHTML = ok.slice(0, 6).map((r) => `<tr><td class="cell-clip">${esc(r[0])}</td><td class="cell-clip">${esc(r[1])}</td><td>${esc(r[2] || '—')}</td></tr>`).join('')
      + (ok.length > 6 ? `<tr><td colspan="3" class="small muted">… y ${ok.length - 6} más</td></tr>` : '')
      || '<tr><td colspan="3" class="muted">Ninguna línea tiene anverso y reverso todavía.</td></tr>';
    const btn = $('#imp-ok');
    btn.disabled = !ok.length;
    btn.textContent = ok.length ? `Importar ${plural(ok.length, 'tarjeta', 'tarjetas')}` : 'Importar';
    $('#imp-foot-hint').textContent = pending ? `${plural(pending, 'línea sin separador se omitirá', 'líneas sin separador se omitirán')}` : '';
    const counter = $('#fix-count');
    if (counter) counter.textContent = pending ? plural(pending, 'línea sin separador', 'líneas sin separador') : 'Todas las líneas están listas';
    $('#imp-newname-f').style.display = $('#imp-deck').value === '__new' ? '' : 'none';
  };

  /** Lista de líneas sin separador, cada una editable y con botón para eliminarla. */
  const renderFix = () => {
    const idx = fixIdx.filter((i) => i >= start() && rows[i]);
    const box = $('#imp-fix');
    if (!idx.length) { box.innerHTML = ''; return; }
    const sepName = sep === '\t' ? '«=» (equivale al tabulador)' : `«${esc(fixSep())}»`;
    box.innerHTML = `<div class="fix-box">
      <div class="fix-head"><div><b id="fix-count"></b><div class="small muted">Escribe ${sepName} entre el anverso y el reverso para convertirlas en tarjetas, o elimínalas.</div></div>
        <button type="button" class="btn sm danger" id="fix-del-all">Eliminar las que falten</button></div>
      <div class="fix-list">${idx.slice(0, 300).map((i) => `<div class="fix-row ${valid(rows[i]) ? 'ok' : ''}" data-i="${i}">
        <input class="input" value="${esc(rowText(rows[i]))}" aria-label="Línea ${i + 1}" spellcheck="false">
        <span class="fix-state">${valid(rows[i]) ? '✓ Lista' : 'Sin separador'}</span>
        <button type="button" class="icon-btn" data-fix-del title="Eliminar esta línea" aria-label="Eliminar esta línea">${ICON.trash}</button></div>`).join('')}
        ${idx.length > 300 ? `<div class="small muted" style="padding:6px 0">Mostrando 300 de ${idx.length}. Usa «Eliminar las que falten» o corrige el archivo.</div>` : ''}</div></div>`;
    $$('.fix-row', box).forEach((row) => {
      const i = +row.dataset.i;
      const inp = row.querySelector('input');
      inp.oninput = () => {
        const parsed = parseDelimited(inp.value, fixSep())[0] || [inp.value.trim()];
        rows[i] = parsed;
        const ok = valid(parsed);
        row.classList.toggle('ok', ok);
        row.querySelector('.fix-state').textContent = ok ? '✓ Lista' : 'Sin separador';
        refresh();
      };
      inp.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = row.nextElementSibling?.querySelector('input');
        if (next) next.focus();
      };
      row.querySelector('[data-fix-del]').onclick = () => { rows[i] = null; renderFix(); refresh(); };
    });
    $('#fix-del-all').onclick = () => {
      for (const i of idx) if (!valid(rows[i])) rows[i] = null;
      renderFix();
      refresh();
    };
  };

  /** Vuelve a leer el archivo con el separador elegido. */
  const reparse = () => {
    const v = $('#imp-sep').value;
    $('#imp-sep-custom').style.display = v === '__custom' ? '' : 'none';
    sep = v === '__custom' ? $('#imp-sep-custom').value : v;
    rows = sep ? parseDelimited(file.content, sep) : [];
    fixIdx = rows.map((r, i) => (valid(r) ? -1 : i)).filter((i) => i >= 0);
    renderFix();
    refresh();
  };

  $('#imp-sep').onchange = reparse;
  $('#imp-sep-custom').oninput = reparse;
  $('#imp-header').onchange = () => { renderFix(); refresh(); };
  $('#imp-deck').onchange = refresh;
  reparse();

  m.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const data = rows.slice(start()).filter(valid);
    if (!data.length) return;
    let deck;
    if ($('#imp-deck').value === '__new') { deck = makeDeck($('#imp-newname').value.trim() || 'Importado'); db.decks.push(deck); }
    else deck = deckById($('#imp-deck').value);
    const existing = new Set(db.cards.filter((c) => c.deckId === deck.id).map((c) => c.front.trim().toLowerCase()));
    const skipDupes = $('#imp-dupes').checked;
    let added = 0, dupes = 0;
    for (const [front, back, secName] of data) {
      if (skipDupes && existing.has(front.toLowerCase())) { dupes++; continue; }
      let secId = null;
      if (secName) {
        const sec = deck.sections.find((s) => s.name.toLowerCase() === secName.toLowerCase()) || makeSection(deck, secName);
        secId = sec.id;
      }
      db.cards.push(makeCard(deck.id, secId, front, back));
      existing.add(front.toLowerCase());
      added++;
    }
    persist();
    closeModal();
    toast(`${plural(added, 'tarjeta importada', 'tarjetas importadas')}${dupes ? ` · ${dupes} repetidas omitidas` : ''}`);
    go({ name: 'deck', id: deck.id });
  };
}

function csvField(s) {
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function exportCsv() {
  if (!db.decks.length) return toast('No hay mazos');
  const deckId = await new Promise((resolve) => {
    const m = openModal(`${modalHead('Exportar mazo a CSV')}<form><div class="modal-body"><div class="field"><label for="x-deck">Mazo</label><select class="input" id="x-deck">${db.decks.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-act="close-modal">Cancelar</button><button class="btn primary" type="submit">Exportar</button></div></form>`);
    let done = false;
    modalOnClose = () => { if (!done) resolve(null); };
    m.querySelector('form').onsubmit = (e) => { e.preventDefault(); done = true; const v = $('#x-deck').value; closeModal(); resolve(v); };
  });
  if (!deckId) return;
  const d = deckById(deckId);
  const lines = db.cards.filter((c) => c.deckId === d.id).map((c) => [c.front, c.back, sectionOf(c)?.name || ''].map(csvField).join(','));
  const path = await api.saveFile({ defaultName: `${d.name}.csv`, content: '﻿' + lines.join('\n'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (path) toast('Mazo exportado');
}

async function exportJson() {
  const path = await api.saveFile({ defaultName: `memora-copia-${new Date().toISOString().slice(0, 10)}.json`, content: JSON.stringify(db, null, 1), filters: [{ name: 'Copia de Memora', extensions: ['json'] }] });
  if (path) toast('Copia exportada');
}
async function importJson() {
  const file = await api.openFile({ filters: [{ name: 'Copia de Memora', extensions: ['json'] }] });
  if (!file) return;
  let data;
  try {
    data = JSON.parse(file.content);
    if (!Array.isArray(data.decks) || !Array.isArray(data.cards)) throw new Error('formato');
  } catch {
    return toast('El archivo no es una copia válida de Memora');
  }
  const ok = await confirmBox({ title: 'Restaurar copia', message: `Se reemplazarán todos tus datos actuales por los de <b>${esc(file.name)}</b> (${plural(data.decks.length, 'mazo', 'mazos')}, ${plural(data.cards.length, 'tarjeta', 'tarjetas')}). Antes conviene exportar una copia de lo actual.`, okText: 'Restaurar', danger: true });
  if (!ok) return;
  db = migrate(data);
  applyTheme();
  await flush();
  toast('Copia restaurada');
  go({ name: 'home' });
}

// ---------------------------------------------------------------- Eventos
async function newDeck() {
  const name = await ask({ title: 'Nuevo mazo', label: 'Nombre del mazo', okText: 'Crear' });
  if (!name) return;
  const d = makeDeck(name);
  db.decks.push(d);
  persist();
  go({ name: 'deck', id: d.id });
}

async function newSection(deckId) {
  const d = deckById(deckId);
  const name = await ask({ title: 'Nueva sección', label: `Nombre de la sección en «${d.name}»`, okText: 'Crear' });
  if (!name) return;
  makeSection(d, name);
  persist();
  render();
}

const actions = {
  nav: (el) => go({ name: el.dataset.view }),
  'open-deck': (el) => go({ name: 'deck', id: el.dataset.id, section: el.dataset.section || null }),
  'toggle-deck': (el) => { const id = el.dataset.id; ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); renderSidebar(); },
  'new-deck': newDeck,
  'new-section': (el) => newSection(el.dataset.id),
  'edit-section': (el) => { const d = deckById(el.dataset.id); editSectionModal(d, d.sections.find((s) => s.id === el.dataset.section)); },
  'filter-section': (el) => { view.section = el.dataset.section || null; renderDeck(); renderSidebar(); },
  'deck-options': (el) => deckOptionsModal(deckById(el.dataset.id)),
  'add-to': (el) => { ui.addDeck = el.dataset.id; ui.addSection = el.dataset.section || null; go({ name: 'add' }); },
  'study-deck': (el) => startSession(quickSrs(deckScope(el.dataset.id)), deckById(el.dataset.id).name),
  'study-section': (el) => {
    const d = deckById(el.dataset.id);
    const s = d.sections.find((x) => x.id === el.dataset.section);
    startSession(quickSrs(sectionScope(d.id, el.dataset.section)), `${d.name} › ${s ? s.name : 'Sin sección'}`);
  },
  'practice-section': (el) => {
    const d = deckById(el.dataset.id);
    const s = d.sections.find((x) => x.id === el.dataset.section);
    startSession({ ...quickSrs(sectionScope(d.id, el.dataset.section)), mode: 'practice', order: 'random' }, `${d.name} › ${s ? s.name : 'Sin sección'}`);
  },
  'custom-study': (el) => {
    const id = el.dataset.id;
    customStudyModal(id ? { ...quickSrs(deckScope(id)) } : null);
  },
  'run-preset': (el) => { const p = db.presets.find((x) => x.id === el.dataset.id); startSession(p, p.name); },
  'edit-preset': (el) => { const p = db.presets.find((x) => x.id === el.dataset.id); customStudyModal(JSON.parse(JSON.stringify(p)), p); },
  'edit-card': (el) => editCardModal(cardById(el.dataset.id)),
  'close-modal': closeModal,
  'exit-study': () => go({ name: 'home' }),
  reveal,
  rate: (el) => rate(+el.dataset.r),
  undo,
  'study-ahead': () => { session.forceAhead = true; advance(); },
  'practice-failed': () => {
    const ids = session.failedIds;
    startSession({ ...quickSrs({ all: true, decks: {} }), mode: 'practice', filter: 'ids', ids, order: 'random' }, 'Repaso de las falladas');
  },
  'edit-current': () => { const c = cardById(session.current); if (c) editCardModal(c, () => renderStudy()); },
  'flag-current': () => { const c = cardById(session.current); if (c) { c.flag = !c.flag; persist(); renderStudy(); } },
  'bulk-flag': () => {
    const cards = [...ui.browse.selected].map(cardById).filter(Boolean);
    const val = !cards.every((c) => c.flag);
    cards.forEach((c) => { c.flag = val; });
    persist(); renderBrowseTable();
  },
  'bulk-forget': async () => {
    const ok = await confirmBox({ title: 'Reiniciar progreso', message: `Las ${ui.browse.selected.size} tarjetas seleccionadas volverán a ser nuevas.`, okText: 'Reiniciar' });
    if (!ok) return;
    for (const id of ui.browse.selected) { const c = cardById(id); if (c) c.srs = S.newSrs(); }
    persist(); renderBrowseTable(); renderSidebar();
  },
  'bulk-delete': async () => {
    const ok = await confirmBox({ title: 'Eliminar tarjetas', message: `Se eliminarán ${plural(ui.browse.selected.size, 'tarjeta', 'tarjetas')}.`, okText: 'Eliminar', danger: true });
    if (!ok) return;
    db.cards = db.cards.filter((c) => !ui.browse.selected.has(c.id));
    ui.browse.selected.clear();
    persist(); renderBrowseTable(); renderSidebar();
  },
  'bulk-clear': () => { ui.browse.selected.clear(); renderBrowseTable(); },
  'import-csv': (el) => importCsv(el?.dataset?.id),
  'export-csv': exportCsv,
  'export-json': exportJson,
  'import-json': importJson,
  'open-folder': () => api.openDataFolder(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  const stop = e.target.closest('[data-stop]');
  if (stop && (!el || el.contains(stop))) return;
  if (!el || el.disabled) return;
  // Un botón dentro de una fila clicable: que gane el botón.
  e.stopPropagation();
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});

document.addEventListener('keydown', (e) => {
  if (modalOpen()) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.key === 'Enter' || e.key === ' ') && !typing && document.activeElement?.matches('[role=button]')) {
    e.preventDefault();
    document.activeElement.click();
    return;
  }
  if (view.name !== 'study' || !session) return;
  if (typing) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') return go({ name: 'home' });
  if ((k === 'z' && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && k === 'z')) { e.preventDefault(); return undo(); }
  if (!session.current) return;
  if (k === 'e') { e.preventDefault(); return actions['edit-current'](); }
  if (k === 'm') return actions['flag-current']();
  if (!session.revealed) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
    return;
  }
  if (session.mode === 'srs') {
    if (['1', '2', '3', '4'].includes(e.key)) rate(+e.key);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rate(3); }
  } else {
    if (e.key === '1') rate(1);
    else if (e.key === '2' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rate(3); }
  }
});

// Arrastrar tarjetas a secciones
document.addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('[data-drag-card]');
  if (!row) return;
  e.dataTransfer.setData('text/x-memora-card', row.dataset.dragCard);
  e.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragover', (e) => {
  const t = e.target.closest?.('[data-drop-section]');
  if (!t || !e.dataTransfer.types.includes('text/x-memora-card')) return;
  e.preventDefault();
  $$('.sec.drop').forEach((x) => x !== t && x.classList.remove('drop'));
  t.classList.add('drop');
});
document.addEventListener('dragleave', (e) => {
  const t = e.target.closest?.('[data-drop-section]');
  if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop');
});
document.addEventListener('drop', (e) => {
  const t = e.target.closest?.('[data-drop-section]');
  if (!t) return;
  e.preventDefault();
  const id = e.dataTransfer.getData('text/x-memora-card');
  const c = cardById(id);
  if (!c) return;
  const sec = t.dataset.dropSection;
  moveCards([id], c.deckId, sec === 'none' ? null : sec);
  renderDeck();
});

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------- Inicio de la app
(async function init() {
  let raw = null;
  try { raw = await api.load(); } catch (err) { console.error(err); }
  if (raw) {
    try { db = migrate(JSON.parse(raw)); }
    catch (err) {
      console.error(err);
      db = emptyDb();
      toast('No se pudo leer el archivo de datos; revisa las copias de seguridad en Ajustes');
    }
  } else {
    db = emptyDb();
    persist();
  }
  applyTheme();
  render();
  // Refresca los recuentos cada minuto (las tarjetas en aprendizaje vencen con el tiempo).
  setInterval(() => { if (view.name !== 'study' && !modalOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) render(); }, 60000);
})();
