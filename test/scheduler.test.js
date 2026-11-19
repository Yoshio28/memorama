'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/scheduler.js');

const MIN = S.MIN;
const DAY = S.DAY;
const NOW = new Date(2026, 10, 19, 15, 0, 0).getTime(); // 19 nov 2026, 15:00 local

test('una tarjeta nueva entra en aprendizaje con los pasos configurados', () => {
  const s = S.newSrs();
  const again = S.answer(s, 1, NOW);
  assert.equal(again.state, 'learning');
  assert.equal(again.due, NOW + 1 * MIN);
  const good = S.answer(s, 3, NOW);
  assert.equal(good.state, 'learning');
  assert.equal(good.step, 1);
  assert.equal(good.due, NOW + 10 * MIN);
  const hard = S.answer(s, 2, NOW);
  assert.equal(hard.due, NOW + 5.5 * MIN);
});

test('Bien en el último paso gradúa con el intervalo de graduación', () => {
  let s = S.answer(S.newSrs(), 3, NOW);
  s = S.answer(s, 3, NOW + 10 * MIN);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
  assert.equal(s.due, S.addDays(S.dayStart(NOW, 4), 1));
  assert.equal(s.ease, 2.5);
});

test('Fácil gradúa directamente con el intervalo fácil', () => {
  const s = S.answer(S.newSrs(), 4, NOW);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 4);
});

test('los intervalos de repaso crecen y respetan Difícil < Bien < Fácil', () => {
  const base = { state: 'review', interval: 10, ease: 2.5, reps: 5, lapses: 0, step: 0, due: S.dayStart(NOW, 4) };
  const h = S.answer(base, 2, NOW);
  const g = S.answer(base, 3, NOW);
  const e = S.answer(base, 4, NOW);
  assert.equal(h.interval, 12);
  assert.equal(g.interval, 25);
  assert.equal(e.interval, 33);
  assert.ok(h.interval < g.interval && g.interval < e.interval);
  assert.equal(h.ease, 2.35);
  assert.equal(e.ease, 2.65);
});

test('fallar un repaso cuenta un lapso, baja la facilidad y pasa a reaprendizaje', () => {
  const base = { state: 'review', interval: 30, ease: 2.5, reps: 8, lapses: 0, step: 0, due: S.dayStart(NOW, 4) };
  const s = S.answer(base, 1, NOW);
  assert.equal(s.state, 'relearning');
  assert.equal(s.lapses, 1);
  assert.equal(s.ease, 2.3);
  assert.equal(s.interval, 1);
  assert.equal(s.due, NOW + 10 * MIN);
  const back = S.answer(s, 3, NOW + 10 * MIN);
  assert.equal(back.state, 'review');
  assert.equal(back.interval, 1);
});

test('la facilidad nunca baja del mínimo', () => {
  let s = { state: 'review', interval: 5, ease: 1.35, reps: 3, lapses: 2, step: 0, due: S.dayStart(NOW, 4) };
  s = S.answer(s, 1, NOW);
  assert.equal(s.ease, 1.3);
});

test('las tarjetas atrasadas reciben un intervalo mayor', () => {
  const onTime = { state: 'review', interval: 10, ease: 2.5, reps: 5, lapses: 0, step: 0, due: S.dayStart(NOW, 4) };
  const late = { ...onTime, due: S.dayStart(NOW, 4) - 6 * DAY };
  assert.ok(S.answer(late, 3, NOW).interval > S.answer(onTime, 3, NOW).interval);
});

test('isReviewDue usa el inicio del día de estudio', () => {
  const dueToday = { state: 'review', due: S.dayStart(NOW, 4) };
  const dueTomorrow = { state: 'review', due: S.addDays(S.dayStart(NOW, 4), 1) };
  assert.equal(S.isReviewDue(dueToday, NOW), true);
  assert.equal(S.isReviewDue(dueTomorrow, NOW), false);
  // A las 2:00 aún cuenta como el día anterior (el día empieza a las 4:00)
  const early = new Date(2026, 10, 20, 2, 0, 0).getTime();
  assert.equal(S.dayStart(early, 4), S.dayStart(NOW, 4));
});

test('preview devuelve etiquetas legibles para los cuatro botones', () => {
  const p = S.preview(S.newSrs(), NOW);
  assert.deepEqual(p, { 1: '1 min', 2: '6 min', 3: '10 min', 4: '4 d' });
  assert.equal(S.formatDelay(45 * DAY), '1,5 m');
  assert.equal(S.formatDelay(400 * DAY), '1,1 a');
});

test('sin pasos de aprendizaje la tarjeta se gradúa al instante', () => {
  const s = S.answer(S.newSrs(), 3, NOW, { learningSteps: [] });
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
});

test('answer no modifica el objeto original', () => {
  const s = S.newSrs();
  const copy = { ...s };
  S.answer(s, 3, NOW);
  assert.deepEqual(s, copy);
});
