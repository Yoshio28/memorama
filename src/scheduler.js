/*
 * Motor de repetición espaciada (variante de SM-2 con pasos de aprendizaje).
 * Módulo puro: se usa desde el renderer (window.Scheduler) y desde los tests (require).
 */
(function (root) {
  'use strict';

  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;

  const DEFAULTS = {
    learningSteps: [1, 10],      // minutos
    relearningSteps: [10],       // minutos
    graduatingInterval: 1,       // días
    easyInterval: 4,             // días
    startingEase: 2.5,
    easyBonus: 1.3,
    hardMultiplier: 1.2,
    lapseMultiplier: 0,          // nuevo intervalo tras fallar = intervalo * esto (mínimo 1)
    minEase: 1.3,
    maxInterval: 36500,
    dayStartHour: 4,             // el "día de estudio" empieza a las 4:00
    learnAheadMinutes: 20,
  };

  function opts(o) {
    return Object.assign({}, DEFAULTS, o || {});
  }

  /** Marca de tiempo del inicio del día de estudio que contiene `now`. */
  function dayStart(now, hour) {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  /** Suma días de calendario (respeta cambios de horario). */
  function addDays(ts, n) {
    const d = new Date(ts);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  function newSrs() {
    return { state: 'new', due: 0, interval: 0, ease: 0, reps: 0, lapses: 0, step: 0 };
  }

  function reviewDue(now, days, o) {
    return addDays(dayStart(now, o.dayStartHour), days);
  }

  function clampInterval(n, o) {
    return Math.min(o.maxInterval, Math.max(1, Math.round(n)));
  }

  /** Intervalos (en días) para Difícil/Bien/Fácil de una tarjeta en repaso. */
  function reviewIntervals(srs, now, o) {
    const today = dayStart(now, o.dayStartHour);
    const delay = Math.max(0, Math.round((today - srs.due) / DAY));
    const ivl = Math.max(1, srs.interval);
    const ease = srs.ease || o.startingEase;
    const hard = clampInterval(Math.max(ivl + 1, ivl * o.hardMultiplier), o);
    const good = clampInterval(Math.max(hard + 1, (ivl + delay / 2) * ease), o);
    const easy = clampInterval(Math.max(good + 1, (ivl + delay) * ease * o.easyBonus), o);
    return { 2: hard, 3: good, 4: easy };
  }

  function graduate(c, easy, now, o, fromRelearning) {
    if (fromRelearning) {
      c.interval = clampInterval(c.interval + (easy ? 1 : 0), o);
    } else {
      c.interval = clampInterval(easy ? o.easyInterval : o.graduatingInterval, o);
    }
    c.state = 'review';
    c.step = 0;
    c.due = reviewDue(now, c.interval, o);
  }

  /**
   * Aplica una respuesta (1 = Otra vez, 2 = Difícil, 3 = Bien, 4 = Fácil).
   * Devuelve un nuevo objeto srs; no modifica el original.
   */
  function answer(srs, rating, now, options) {
    const o = opts(options);
    const c = Object.assign(newSrs(), srs);
    c.reps += 1;

    if (c.state === 'new') {
      c.state = 'learning';
      c.step = 0;
      c.ease = o.startingEase;
    }

    if (c.state === 'learning' || c.state === 'relearning') {
      const relearn = c.state === 'relearning';
      const steps = relearn ? o.relearningSteps : o.learningSteps;
      if (!steps.length) {
        graduate(c, rating === 4, now, o, relearn);
        return c;
      }
      const step = Math.min(c.step, steps.length - 1);
      if (rating === 1) {
        c.step = 0;
        c.due = now + steps[0] * MIN;
      } else if (rating === 2) {
        const delay = step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[step] * (step === 0 ? 1.5 : 1);
        c.step = step;
        c.due = now + delay * MIN;
      } else if (rating === 3) {
        if (step + 1 < steps.length) {
          c.step = step + 1;
          c.due = now + steps[c.step] * MIN;
        } else {
          graduate(c, false, now, o, relearn);
        }
      } else {
        graduate(c, true, now, o, relearn);
      }
      return c;
    }

    // Estado: review
    if (rating === 1) {
      c.lapses += 1;
      c.ease = Math.max(o.minEase, c.ease - 0.2);
      c.interval = clampInterval(c.interval * o.lapseMultiplier, o);
      if (o.relearningSteps.length) {
        c.state = 'relearning';
        c.step = 0;
        c.due = now + o.relearningSteps[0] * MIN;
      } else {
        c.due = reviewDue(now, c.interval, o);
      }
      return c;
    }
    const ivls = reviewIntervals(c, now, o);
    if (rating === 2) c.ease = Math.max(o.minEase, c.ease - 0.15);
    if (rating === 4) c.ease = c.ease + 0.15;
    c.interval = ivls[rating];
    c.due = reviewDue(now, c.interval, o);
    return c;
  }

  /** Texto corto con el tiempo hasta el próximo repaso, p. ej. "10 min", "3 d", "2,1 m". */
  function formatDelay(ms) {
    const m = ms / MIN;
    if (m < 1) return '<1 min';
    if (m < 60) return Math.round(m) + ' min';
    const h = m / 60;
    if (h < 24) return Math.round(h) + ' h';
    const d = Math.round(h / 24);
    if (d < 30) return d + ' d';
    if (d < 365) return (d / 30).toFixed(1).replace('.', ',').replace(',0', '') + ' m';
    return (d / 365).toFixed(1).replace('.', ',').replace(',0', '') + ' a';
  }

  /** Previsualización de los cuatro botones: { 1: '1 min', 2: '6 min', 3: '10 min', 4: '4 d' }. */
  function preview(srs, now, options) {
    const o = opts(options);
    const out = {};
    for (const r of [1, 2, 3, 4]) {
      const next = answer(srs, r, now, o);
      out[r] = formatDelay(Math.max(0, next.due - now));
    }
    return out;
  }

  function isLearning(srs) {
    return srs.state === 'learning' || srs.state === 'relearning';
  }

  /** ¿Toca repasar hoy una tarjeta en estado review? */
  function isReviewDue(srs, now, options) {
    const o = opts(options);
    return srs.state === 'review' && srs.due <= dayStart(now, o.dayStartHour);
  }

  const api = {
    DEFAULTS, MIN, DAY,
    dayStart, addDays, newSrs, answer, preview, formatDelay, reviewIntervals,
    isLearning, isReviewDue,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(typeof window !== 'undefined' ? window : globalThis);
