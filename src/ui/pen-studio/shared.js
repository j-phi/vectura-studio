/**
 * Pen Studio shared view helpers - window.Vectura.UI.PenStudioShared.
 *
 * Used by lab-view.js and pair-view.js (load this file first): DOM helpers,
 * keyed child sync, the rAF render queue and derive(ctx), which resolves the
 * selected pen, its box, owned sizes, effective doc pen and complement.
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const W = () => (typeof window !== 'undefined' ? window : globalThis);
  const V = () => W().Vectura || {};
  const fmt = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));

  const el = (doc, tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  // Keyed child sync: reuse nodes (keeps focus), create missing, drop stale.
  const syncList = (parent, items, keyOf, create, patch) => {
    const existing = new Map();
    Array.from(parent.children).forEach((c) => existing.set(c.dataset.key, c));
    items.forEach((it, i) => {
      const k = String(keyOf(it));
      let node = existing.get(k);
      if (node) existing.delete(k);
      else { node = create(it); node.dataset.key = k; }
      patch(node, it);
      if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] || null);
    });
    existing.forEach((n) => n.remove());
  };

  // rAF render queue. Jobs carry the generation they were queued in; bump()
  // makes every queued job stale. Each frame runs jobs until the budget is
  // spent (at least one), so ~46 canvases never block a frame.
  const makeQueue = (win) => {
    let gen = 0; let jobs = []; let raf = 0; let dead = false;
    const now = () => (win.performance && win.performance.now ? win.performance.now() : Date.now());
    const budget = () => {
      const PM = V().PEN_MODELS;
      return (PM && PM.LIMITS && PM.LIMITS.buildBudgetMs) || 8;
    };
    const pump = () => {
      raf = 0;
      if (dead) return;
      const t0 = now();
      while (jobs.length) {
        const j = jobs.shift();
        if (j.gen !== gen) continue;
        j.run();
        if (now() - t0 >= budget()) break;
      }
      if (jobs.length) schedule();
    };
    const schedule = () => { if (!raf && !dead) raf = win.requestAnimationFrame(pump); };
    return {
      bump() { gen += 1; jobs = []; return gen; },
      push(run) { jobs.push({ gen, run }); schedule(); },
      pending() { return jobs.filter((j) => j.gen === gen).length; },
      generation() { return gen; },
      destroy() {
        dead = true; jobs = []; gen += 1;
        if (raf && win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
        raf = 0;
      },
    };
  };

  // Everything both views need, derived from ctx (pure; no DOM).
  const derive = (ctx) => {
    const v = V();
    const Store = v.PenStudioStore; const Draft = v.PenStudioDraft;
    const Lab = v.PenStudioLab; const Comp = v.PenStudioComplement;
    const st = ctx.getState() || {};
    const doc = ctx.getDoc();
    const cfg = (ctx.cfg && ctx.cfg()) || {};
    if (!doc || !Store || !Draft || !Lab) return null;
    const pen = (doc.pens || []).find((p) => p.id === st.selPenId);
    if (!pen) return null;
    const draft = (st.drafts && st.drafts[pen.id]) || { ink: {} };
    let box = st.selBoxId ? (doc.boxes || []).find((b) => b.id === st.selBoxId) : null;
    if (!box || !(box.items || []).some((i) => i.penId === pen.id)) {
      let b = Store.boxOf ? Store.boxOf(doc, pen.id) : null;
      if (typeof b === 'string') b = (doc.boxes || []).find((x) => x.id === b);
      box = b || (doc.boxes || []).find((x) => (x.items || []).some((i) => i.penId === pen.id)) || null;
    }
    const sizes = Store.sizesOf(pen.model || null) || [];
    const item = box ? box.items.find((i) => i.penId === pen.id) : null;
    let owned = item && item.sizes && item.sizes.length ? item.sizes.slice() : [];
    if (!owned.length && sizes[0]) owned = [sizes[0].label];
    const ctxLabel = typeof ctx.testSizeLabel === 'function' ? ctx.testSizeLabel() : null;
    const testLabel = owned.indexOf(ctxLabel) >= 0 ? ctxLabel : (owned.indexOf(st.testSize) >= 0 ? st.testSize : owned[0]);
    const effPen = Object.assign({}, pen, { ink: Draft.effectiveInk(pen, draft) });
    const docPen = Store.toDocPen(effPen, testLabel);
    const paperType = st.paperType || 'bristol-smooth';
    const out = { st, doc, cfg, pen, draft, box, sizes, owned, testLabel, effPen, docPen, paperType, cands: [], ok: [], hiddenNames: [], comp: null, compDoc: null, nearest: null };
    if (Comp) {
      const boxPens = box ? box.items.filter((i) => i.penId !== pen.id).map((i) => doc.pens.find((p) => p.id === i.penId)).filter(Boolean) : [];
      const all = Comp.candidates({ pen: effPen, penId: pen.id, paperType, boxPens, curated: cfg.CURATED_PAIRS || {} }) || [];
      const ok = all.filter((c) => Comp.fits(c, effPen, paperType));
      let comp = null;
      const sc = st.comp;
      if (sc) comp = ok.find((c) => c.id === sc.id) || (sc.hex && Comp.fits(sc, effPen, paperType) ? sc : null);
      comp = comp || ok[0] || null;
      out.cands = all; out.ok = ok; out.comp = comp;
      out.hiddenNames = (Comp.hidden && Comp.hidden(all, effPen, paperType)) || [];
      if (comp) {
        const sp = comp.penId ? doc.pens.find((p) => p.id === comp.penId) : null;
        if (sp) {
          const bi = (doc.boxes || []).map((b) => (b.items || []).find((i) => i.penId === sp.id)).find(Boolean);
          const lbl = bi && bi.sizes && bi.sizes[0];
          out.compDoc = Store.toDocPen(sp, lbl || (Store.sizesOf(sp.model || null)[0] || {}).label);
        } else {
          out.compDoc = { name: comp.name, color: comp.hex, width: docPen.width };
          if (comp.model) out.compDoc.model = comp.model;
        }
        if (!comp.real && Comp.nearestOwned) out.nearest = Comp.nearestOwned(comp.hex, doc.pens || [], effPen, paperType) || null;
      }
    }
    return out;
  };

  UI.PenStudioShared = { W, V, fmt, el, setText, syncList, makeQueue, derive };
})();
