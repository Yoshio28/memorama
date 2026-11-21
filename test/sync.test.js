'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { merge3 } = require('../src/sync.js');

const srs = (reps = 0, due = 0) => ({ state: reps ? 'review' : 'new', due, interval: 0, ease: 0, reps, lapses: 0, step: 0 });
const card = (id, deckId, front, extra = {}) => ({ id, deckId, sectionId: null, front, back: front + '!', flag: false, created: 1, srs: srs(), ...extra });
const db = (o = {}) => ({ version: 1, settings: { theme: 'system', scheduler: { easyInterval: 4 } }, decks: [], cards: [], presets: [], log: [], published: {}, ...o });
const clone = (x) => JSON.parse(JSON.stringify(x));

const deckA = { id: 'A', name: 'Inglés', sections: [{ id: 's1', name: 'Verbos', color: '#000' }] };
const base = db({ decks: [deckA], cards: [card('c1', 'A', 'go'), card('c2', 'A', 'eat')], log: [{ cardId: 'c1', ts: 1, rating: 3, mode: 'srs' }] });

test('sin cambios en ningún lado el resultado es igual', () => {
  assert.deepEqual(merge3(base, clone(base), clone(base)), base);
});

test('se suman las tarjetas nuevas de los dos dispositivos', () => {
  const local = clone(base); local.cards.push(card('c3', 'A', 'see'));
  const remote = clone(base); remote.cards.push(card('c4', 'A', 'write'));
  const m = merge3(base, local, remote);
  assert.deepEqual(m.cards.map((c) => c.id), ['c1', 'c2', 'c3', 'c4']);
});

test('un borrado en un lado se respeta si el otro no tocó la tarjeta', () => {
  const local = clone(base); local.cards = local.cards.filter((c) => c.id !== 'c2');
  const m = merge3(base, local, clone(base));
  assert.deepEqual(m.cards.map((c) => c.id), ['c1']);
  const m2 = merge3(base, clone(base), local);
  assert.deepEqual(m2.cards.map((c) => c.id), ['c1']);
});

test('si se edita en un lado y se borra en el otro, se conserva la edición', () => {
  const local = clone(base); local.cards[1].back = 'ate';
  const remote = clone(base); remote.cards = remote.cards.filter((c) => c.id !== 'c2');
  const m = merge3(base, local, remote);
  assert.equal(m.cards.find((c) => c.id === 'c2').back, 'ate');
});

test('ediciones de campos distintos de la misma tarjeta se combinan', () => {
  const local = clone(base); local.cards[0].back = 'went';
  const remote = clone(base); remote.cards[0].flag = true;
  const c = merge3(base, local, remote).cards[0];
  assert.equal(c.back, 'went');
  assert.equal(c.flag, true);
});

test('si se estudió en los dos, gana el progreso con más repasos', () => {
  const local = clone(base); local.cards[0].srs = srs(2, 100);
  const remote = clone(base); remote.cards[0].srs = srs(5, 50);
  assert.equal(merge3(base, local, remote).cards[0].srs.reps, 5);
});

test('el historial de repasos se une sin duplicados y en orden', () => {
  const local = clone(base); local.log.push({ cardId: 'c1', ts: 5, rating: 3, mode: 'srs' });
  const remote = clone(base); remote.log.push({ cardId: 'c2', ts: 3, rating: 1, mode: 'srs' });
  const m = merge3(base, local, remote);
  assert.deepEqual(m.log.map((e) => e.ts), [1, 3, 5]);
});

test('secciones añadidas en cada dispositivo se suman dentro del mazo', () => {
  const local = clone(base); local.decks[0].sections.push({ id: 's2', name: 'Vocabulario', color: '#111' });
  const remote = clone(base); remote.decks[0].name = 'Inglés B1'; remote.decks[0].sections.push({ id: 's3', name: 'Frases', color: '#222' });
  const d = merge3(base, local, remote).decks[0];
  assert.equal(d.name, 'Inglés B1');
  assert.deepEqual(d.sections.map((s) => s.id), ['s1', 's2', 's3']);
});

test('ajustes y perfil: campo a campo con base', () => {
  const b = db({ profile: { name: 'Ana', photo: '' } });
  const local = clone(b); local.settings.theme = 'dark';
  const remote = clone(b); remote.profile.name = 'Ana María'; remote.settings.scheduler.easyInterval = 5;
  const m = merge3(b, local, remote);
  assert.equal(m.settings.theme, 'dark');
  assert.equal(m.settings.scheduler.easyInterval, 5);
  assert.equal(m.profile.name, 'Ana María');
});

test('primera unión: se suman los datos y los modos por defecto no se duplican', () => {
  const preset = (id) => ({ id, name: 'Repaso rápido', mode: 'srs', limit: 20 });
  const local = db({ decks: [{ id: 'P', name: 'PC', sections: [] }], cards: [card('p1', 'P', 'x')], presets: [preset('l1')], settings: { theme: 'dark' } });
  const remote = db({ decks: [{ id: 'M', name: 'Móvil', sections: [] }], cards: [card('m1', 'M', 'y')], presets: [preset('r1')], settings: { theme: 'light' }, profile: { name: 'Ana' } });
  const m = merge3(null, local, remote);
  assert.deepEqual(m.decks.map((d) => d.id).sort(), ['M', 'P']);
  assert.equal(m.cards.length, 2);
  assert.deepEqual(m.presets.map((p) => p.id), ['r1']);
  assert.equal(m.settings.theme, 'light');
  assert.equal(m.profile.name, 'Ana');
});

test('sin datos en la nube se queda lo local', () => {
  assert.equal(merge3(null, base, null), base);
});
