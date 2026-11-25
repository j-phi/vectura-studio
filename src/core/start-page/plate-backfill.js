/**
 * Start Page plate backfill — window.Vectura.StartPagePlateBackfill.
 *
 * ONE-TIME pass that gives existing Recents entries display-only plate lines (see plate-lines.js): an entry with no `plate`,
 * a PNG (or no) thumbnail and a stored document copy has its document rendered once by StartPageArtRenderer, the export SVG
 * reduced by StartPagePlateLines.build, and the result written with store.setPlate (plate only: lastOpened, order, name, hash
 * and the thumbnail never change). Entries with no stored document are skipped (they gain a plate when reopened or saved);
 * a failed entry is never retried.
 *
 *   run({ store, renderer, plateLines, yieldFn, shouldAbort, log, version }) -> Promise<{ status, done, skipped, failed }>
 *     status: 'done' (marker written), 'already' (marker present), 'aborted' (no marker: it runs again next time), 'unavailable'
 *
 * The marker is a small record in the store (`getMeta/setMeta`, key META_KEY) holding PLATE_BACKFILL_VERSION; bump the constant to
 * re-run. Entries are processed one at a time with a yield between them, the store is told once at the end so the page re-renders
 * its plates once. Each entry is re-read before it is written, so a second tab (or a reopen that already made a plate) wins.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const PLATE_BACKFILL_VERSION = 1;
  const META_KEY = 'plate-backfill';

  const defaultYield = () => new Promise((resolve) => {
    if (typeof G.requestIdleCallback === 'function') G.requestIdleCallback(() => resolve());
    else setTimeout(resolve, 16);
  });
  const wants = (e) => Boolean(e && !e.plate && e.hasDoc && !(e.thumb && e.thumb.kind === 'svg'));

  const run = async (o = {}) => {
    const store = o.store;
    const renderer = o.renderer || Vectura.StartPageArtRenderer;
    const lines = o.plateLines || Vectura.StartPagePlateLines;
    const version = Number.isFinite(o.version) ? o.version : PLATE_BACKFILL_VERSION;
    const yieldFn = typeof o.yieldFn === 'function' ? o.yieldFn : defaultYield;
    const aborted = typeof o.shouldAbort === 'function' ? o.shouldAbort : () => false;
    const warn = typeof o.log === 'function' ? o.log : (...a) => { try { console.warn(...a); } catch (_e) { /* no console */ } };
    const out = { status: 'unavailable', done: 0, skipped: 0, failed: 0 };
    if (!store || typeof store.setPlate !== 'function' || typeof store.getMeta !== 'function'
      || !renderer || typeof renderer.renderDocument !== 'function' || !lines || typeof lines.build !== 'function') return out;

    const marker = await store.getMeta(META_KEY);
    if (marker && Number(marker.version) >= version) { out.status = 'already'; return out; }

    const maxDoc = Number(Vectura.START_PAGE && Vectura.START_PAGE.LIMITS && Vectura.START_PAGE.LIMITS.docsMaxBytes) || Infinity;
    const all = await store.listWorks();
    const failures = [];
    for (const first of all.filter(wants)) {
      if (aborted()) { out.status = 'aborted'; return out; }
      try {
        const e = await store.get(first.id); // re-read: another tab or a reopen may have made a plate meanwhile
        if (!wants(e)) { out.skipped += 1; continue; }
        if (!(e.bytes <= maxDoc)) { out.skipped += 1; continue; }
        const doc = await store.getDoc(e.id);
        if (!doc) { out.skipped += 1; continue; }
        const rec = await renderer.renderDocument(doc, `plate-backfill:${e.id}`);
        const paper = e.paperColor || (rec.ownColors && rec.ownColors.paper) || '';
        const built = rec && typeof rec.svg === 'string' ? lines.build(rec.svg, { paperColor: paper }) : null;
        if (!built || !built.svg) { out.skipped += 1; continue; }
        const ok = await store.setPlate(e.id, { kind: 'svg', data: built.svg }, { onlyIfAbsent: true, notify: false });
        if (ok) out.done += 1; else out.skipped += 1;
      } catch (err) {
        out.failed += 1;
        failures.push(`${first.id}: ${err && err.message ? err.message : err}`);
      }
      await yieldFn();
    }
    if (aborted()) { out.status = 'aborted'; return out; }
    if (failures.length) warn(`[PlateBackfill] ${failures.length} work(s) kept their thumbnail`, failures);
    await store.setMeta(META_KEY, { version, at: Date.now(), done: out.done, skipped: out.skipped, failed: out.failed });
    if (out.done > 0 && typeof store.notifyChanged === 'function') await store.notifyChanged();
    out.status = 'done';
    return out;
  };

  Vectura.StartPagePlateBackfill = { run, wants, PLATE_BACKFILL_VERSION, META_KEY };
})();
