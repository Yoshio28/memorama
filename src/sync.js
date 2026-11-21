/*
 * Combinar los datos de dos dispositivos (sincronización con la cuenta de Google).
 *
 * Fusión a tres bandas: `base` es lo último que se sincronizó, `local` lo que hay en este
 * dispositivo y `remote` lo que hay en la nube. Para cada mazo, tarjeta, modo de estudio, etc.:
 *   - si solo cambió en un lado, gana ese cambio (también si fue un borrado);
 *   - si cambió en los dos, se combina campo a campo y, si chocan, gana el progreso con más
 *     repasos (en tarjetas) o el cambio de este dispositivo.
 * Sin base (primera vez que un dispositivo se une a la cuenta) se suman los datos de los dos.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  /** Objeto plano campo a campo (objetos anidados también campo a campo). */
  function mergeFields(base, local, remote, preferRemote = false) {
    if (local === undefined) return remote;
    if (remote === undefined) return local;
    if (same(local, remote)) return local;
    if (base !== undefined && same(local, base)) return remote;
    if (base !== undefined && same(remote, base)) return local;
    if (isObj(local) && isObj(remote)) {
      const out = {};
      const b = isObj(base) ? base : {};
      for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
        const inL = k in local; const inR = k in remote; const inB = k in b;
        if (inL && inR) out[k] = mergeFields(b[k], local[k], remote[k], preferRemote);
        else if (inL) { if (!(inB && same(b[k], local[k]))) out[k] = local[k]; } // borrado en remoto si no cambió aquí
        else if (inR) { if (!(inB && same(b[k], remote[k]))) out[k] = remote[k]; }
      }
      return out;
    }
    return preferRemote ? remote : local;
  }

  /**
   * Listas de elementos con identificador. `resolve(b, l, r)` decide cuando cambian en los dos
   * lados. Respeta el orden local y añade al final lo nuevo del otro dispositivo.
   */
  function mergeList(base, local, remote, key, resolve) {
    const B = new Map((base || []).map((x) => [key(x), x]));
    const L = new Map((local || []).map((x) => [key(x), x]));
    const R = new Map((remote || []).map((x) => [key(x), x]));
    const out = [];
    const pick = (k) => {
      const b = B.get(k); const l = L.get(k); const r = R.get(k);
      if (l && r) return same(l, r) ? l : b && same(l, b) ? r : b && same(r, b) ? l : resolve(b, l, r);
      if (l) return b && same(b, l) ? null : l; // falta en remoto: si aquí no cambió, se borró allí
      if (r) return b && same(b, r) ? null : r;
      return null;
    };
    const seen = new Set();
    for (const k of [...L.keys(), ...R.keys()]) {
      if (seen.has(k)) continue;
      seen.add(k);
      const v = pick(k);
      if (v) out.push(v);
    }
    return out;
  }

  const reviews = (c) => ((c && c.srs && (c.srs.reps || 0) + (c.srs.lapses || 0)) || 0);

  function resolveCard(b, l, r) {
    const out = mergeFields(b, l, r);
    // El progreso no se mezcla campo a campo: se queda el que tenga más repasos.
    if (!same(l.srs, r.srs)) {
      if (b && same(l.srs, b.srs)) out.srs = r.srs;
      else if (b && same(r.srs, b.srs)) out.srs = l.srs;
      else out.srs = reviews(r) > reviews(l) || (reviews(r) === reviews(l) && (r.srs.due || 0) > (l.srs.due || 0)) ? r.srs : l.srs;
    }
    return out;
  }

  function resolveDeck(b, l, r) {
    const out = mergeFields(b, l, r);
    out.sections = mergeList(b && b.sections, l.sections, r.sections, (s) => s.id, (sb, sl, sr) => mergeFields(sb, sl, sr));
    return out;
  }

  const logKey = (e) => `${e.cardId}|${e.ts}|${e.rating}|${e.mode || ''}`;
  const presetContent = (p) => JSON.stringify({ ...p, id: undefined });

  /** Combina dos copias completas de los datos. Devuelve una copia nueva. */
  function merge3(base, local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    const b = base || null;
    let localPresets = local.presets || [];
    if (!b) {
      // Primera unión: los modos de estudio por defecto existen en los dos con distinto id.
      const remoteContents = new Set((remote.presets || []).map(presetContent));
      localPresets = localPresets.filter((p) => !remoteContents.has(presetContent(p)));
    }
    const merged = {
      ...remote,
      ...local,
      // Sin base, los ajustes y el perfil de la nube mandan; con base, campo a campo.
      settings: b ? mergeFields(b.settings, local.settings, remote.settings) : mergeFields(undefined, local.settings, remote.settings, true),
      profile: b ? mergeFields(b.profile, local.profile, remote.profile) : mergeFields(undefined, local.profile, remote.profile, true),
      decks: mergeList(b && b.decks, local.decks, remote.decks, (d) => d.id, resolveDeck),
      cards: mergeList(b && b.cards, local.cards, remote.cards, (c) => c.id, resolveCard),
      presets: mergeList(b && b.presets, localPresets, remote.presets, (p) => p.id, (pb, pl, pr) => mergeFields(pb, pl, pr)),
      log: mergeList(b && b.log, local.log, remote.log, logKey, (lb, ll) => ll).sort((x, y) => x.ts - y.ts),
      published: mergeFields(b ? b.published || {} : undefined, local.published || {}, remote.published || {}),
    };
    if (merged.profile === undefined) delete merged.profile;
    return JSON.parse(JSON.stringify(merged));
  }

  return { merge3, same };
});
