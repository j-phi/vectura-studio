/**
 * Start Page art provider — window.Vectura.StartPageArtProvider.
 *
 * The thin adapter between the cover / rail and the art lane. It reads Vectura.StartPageArtSource (works first,
 * studio picks after; contract D); without a source the list is empty. An Art is
 *   { id, kind: 'work'|'pick', name, algorithm, collection, recentId?, presetId?, bytes, ownColors, getSvg() }.
 * `getSvg()` always resolves to STROKES ONLY (the thumbnail's paper-colored ground rect is stripped), because the
 * ink runtime paints the paper from a colorway.
 *
 *   list({ recentFirst = true }) -> Promise<Art[]>
 *   subscribe(fn) -> unsubscribe        (works changed)
 *   strokeSvg(svg) -> string
 *   byteSize(svg) -> number
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  // The recents thumbnail wraps the export in a paper-colored <rect> covering the whole viewBox.
  const strokeSvg = (svg) => String(svg || '').replace(/<rect\b[^>]*\bfill="#[0-9a-fA-F]{3,8}"[^>]*\/>/, '');

  const normalize = (art) => {
    if (!art || !art.id || typeof art.getSvg !== 'function') return null;
    if (typeof art.bytes === 'number' && art.bytes > 0 && art.bytes < 300) return null; // empty export
    const getSvg = art.getSvg.bind(art);
    return {
      bytes: 0, ownColors: null, collection: 'Studies', algorithm: '', ...art,
      getSvg: () => Promise.resolve(getSvg()).then(strokeSvg),
    };
  };

  const create = (app) => {
    const source = () => Vectura.StartPageArtSource || null;
    const list = async ({ recentFirst = true } = {}) => {
      const src = source();
      if (src && typeof src.list === 'function') {
        try {
          // Works first, then studio picks: a thin library is topped up with picks before any piece repeats.
          const fn = recentFirst && typeof src.listRecentFirst === 'function' ? src.listRecentFirst : src.list;
          const out = ((await fn.call(src)) || []).map(normalize).filter(Boolean);
          if (out.length) return out;
        } catch (err) { if (G.console) G.console.warn('[StartPageArt] source failed', err); }
      }
      return []; // one source of art: StartPageArtSource (works first, studio picks after)
    };
    const subscribe = (fn) => {
      const offs = [];
      const src = source();
      if (src && typeof src.subscribe === 'function') { try { offs.push(src.subscribe(fn)); } catch (_) { /* noop */ } }
      if (app && app.recents && typeof app.recents.subscribe === 'function') offs.push(app.recents.subscribe(fn));
      return () => offs.forEach((off) => { try { if (typeof off === 'function') off(); } catch (_) { /* noop */ } });
    };
    return { list, subscribe };
  };

  Vectura.StartPageArtProvider = { create, strokeSvg };
})();
