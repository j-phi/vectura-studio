/**
 * Pen Studio — Pair view (right column) — window.Vectura.UI.PenStudioPair.
 *
 *   const view = UI.PenStudioPair.mount(el, ctx);   // { update(), destroy() }
 *
 * Complement chips (tooltip names the real pen, or the closest owned pen),
 * Randomize, a note (real pen / not a pen yet / hidden on this paper), the
 * woven preview canvas (Lab.weave + InkRenderer.drawSample opts.paths), the
 * Lines slider (3-7) and the weave toggles (Alternate / Every 3rd / Center).
 *
 * Layout classes: pen-studio-pair(-empty|-body), pen-studio-pair-head,
 * pen-studio-chips, pen-studio-chip(.is-selected|-swatch|-name|-kind),
 * pen-studio-random, pen-studio-pair-note(.is-ok|.is-warn),
 * pen-studio-pair-contrast, pen-studio-weave-canvas, pen-studio-lines,
 * pen-studio-lines-label|-input|-value, pen-studio-weaves, pen-studio-weave-btn
 * (.is-selected), pen-studio-btn.
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  // <shared> (identical block in lab-view.js and pair-view.js; keep in sync)
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
    const testLabel = owned.indexOf(st.testSize) >= 0 ? st.testSize : owned[0];
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
  // </shared>

  const WEAVE_MM = { w: 60, h: 40 };
  const WEAVE_PX_PER_MM = 7;
  const WEAVE_LITERAL = { alt: ['WEAVE_ALT', 'Alternate'], third: ['WEAVE_THIRD', 'Every 3rd'], mid: ['WEAVE_MID', 'Center'] };

  const mount = (host, ctx) => {
    const win = (host.ownerDocument && host.ownerDocument.defaultView) || G;
    const doc = host.ownerDocument || document;
    const L = () => (ctx.L && ctx.L()) || {};
    const T = (key, literal, vars) => fmt(L()[key] || literal, vars);
    const q = makeQueue(win);
    let lastSig = null;
    let destroyed = false;
    let D = null;

    const root = el(doc, 'div', 'pen-studio-pair');
    const empty = el(doc, 'div', 'pen-studio-pair-empty');
    const body = el(doc, 'div', 'pen-studio-pair-body');
    const head = el(doc, 'div', 'pen-studio-pair-head');
    const headTitle = el(doc, 'div', 'pen-studio-pair-title');
    const headSub = el(doc, 'div', 'pen-studio-pair-sub');
    const random = el(doc, 'button', 'pen-studio-btn pen-studio-random'); random.type = 'button';
    head.append(headTitle, headSub);
    const chips = el(doc, 'div', 'pen-studio-chips');
    const contrast = el(doc, 'div', 'pen-studio-pair-contrast');
    const note = el(doc, 'div', 'pen-studio-pair-note');
    note.setAttribute('role', 'status');
    const canvas = el(doc, 'canvas', 'pen-studio-weave-canvas');
    const lines = el(doc, 'div', 'pen-studio-lines');
    const linesLabel = el(doc, 'label', 'pen-studio-lines-label');
    const linesInput = el(doc, 'input', 'pen-studio-lines-input');
    linesInput.type = 'range'; linesInput.id = 'pen-studio-lines-input';
    linesLabel.setAttribute('for', linesInput.id);
    const linesValue = el(doc, 'span', 'pen-studio-lines-value');
    lines.append(linesLabel, linesInput, linesValue);
    const weaves = el(doc, 'div', 'pen-studio-weaves');
    body.append(head, chips, random, contrast, note, canvas, lines, weaves);
    root.append(empty, body);
    host.appendChild(root);

    linesInput.addEventListener('input', () => ctx.set({ n: parseInt(linesInput.value, 10) }));
    random.addEventListener('click', () => {
      if (!D || !D.ok.length) return;
      const Comp = Vectura.PenStudioComplement;
      const rng = (ctx.rng && ctx.rng()) || Math.random;
      const pick = Comp.randomize(D.ok, D.comp ? D.comp.id : null, D.paperType, rng);
      if (!pick) return;
      ctx.set({ comp: pick.kind === 'random' ? pick : { id: pick.id } });
    });

    const paint = () => {
      const Lab = Vectura.PenStudioLab; const IR = Vectura.InkRenderer;
      if (!IR || !IR.drawSample || !D) return;
      const dpr = Math.min(2, (win.devicePixelRatio || 1));
      const wCss = Math.round(WEAVE_MM.w * WEAVE_PX_PER_MM); const hCss = Math.round(WEAVE_MM.h * WEAVE_PX_PER_MM);
      canvas.width = Math.round(wCss * dpr); canvas.height = Math.round(hCss * dpr);
      canvas.style.width = wCss + 'px'; canvas.style.height = hCss + 'px';
      const docPen = D.docPen; const compDoc = D.compDoc || D.docPen;
      const strokes = Lab.weave(D.n, D.mode, WEAVE_MM).map((s) => ({ pts: s.pts, pen: s.comp ? compDoc : docPen }));
      IR.drawSample(canvas, docPen, Lab.paperFor(D.paperType), { paths: strokes, paperFill: true, widthMm: WEAVE_MM.w });
    };

    const update = () => {
      if (destroyed) return;
      D = derive(ctx);
      if (!D) {
        q.bump(); lastSig = null;
        body.hidden = true; empty.hidden = false;
        setText(empty, T('EMPTY_BOX', 'Select a pen to see pairings.'));
        return;
      }
      empty.hidden = true; body.hidden = false;
      const Lab = Vectura.PenStudioLab; const Comp = Vectura.PenStudioComplement;
      const weaveCfg = D.cfg.WEAVE || { min: 3, max: 7, default: 5, modes: ['alt', 'third', 'mid'] };
      const n = Math.max(weaveCfg.min, Math.min(weaveCfg.max, Number.isFinite(D.st.n) ? D.st.n : weaveCfg.default));
      D.n = n; D.mode = D.st.weave || 'alt';
      const paperCfg = Lab.paperFor(D.paperType) || {};
      const paperName = (Lab.papers().find((p) => p.type === D.paperType) || {}).name || D.paperType;

      setText(headTitle, T('COMP_HEAD', 'Complement'));
      setText(headSub, T('COMP_SUB', 'Pairs that work with this pen on this paper'));
      setText(random, T('RANDOMIZE', 'Randomize'));
      random.disabled = !D.ok.length;

      syncList(chips, D.ok, (c) => c.id,
        () => {
          const b = el(doc, 'button', 'pen-studio-chip'); b.type = 'button';
          b.append(el(doc, 'span', 'pen-studio-chip-swatch'), el(doc, 'span', 'pen-studio-chip-name'), el(doc, 'span', 'pen-studio-chip-kind'));
          b.addEventListener('click', () => {
            const c = b._cand;
            ctx.set({ comp: c.kind === 'random' ? c : { id: c.id } });
          });
          return b;
        },
        (b, c) => {
          b._cand = c;
          const sel = !!D.comp && c.id === D.comp.id;
          b.children[0].style.background = c.hex;
          setText(b.children[1], c.name);
          const kindKey = { curated: ['KIND_CURATED', 'curated pairing'], hue: ['KIND_HUE', 'hue'], box: ['KIND_BOX', 'from this box'], random: ['KIND_RANDOM', 'random hue'] }[c.kind] || ['', c.kind || ''];
          setText(b.children[2], kindKey[0] ? T(kindKey[0], kindKey[1]) : kindKey[1]);
          b.classList.toggle('is-selected', sel);
          b.setAttribute('aria-pressed', sel ? 'true' : 'false');
          let tip;
          if (c.real) tip = c.name + ' is a pen you own';
          else {
            const near = Comp.nearestOwned ? Comp.nearestOwned(c.hex, D.doc.pens || [], D.effPen, D.paperType) : null;
            tip = c.name + ' ' + c.hex + (near ? ', closest pen: ' + near.name : '');
          }
          b.title = tip;
        });

      const comp = D.comp;
      if (comp) {
        const ratio = Comp.contrast(comp.hex, paperCfg.color);
        setText(contrast, comp.name + ' · ' + Number(ratio).toFixed(1) + ':1');
        let text = comp.real
          ? T('COMP_REAL', '{name} is a real pen, ready to plot on {paper}.', { name: comp.name, paper: paperName })
          : T('COMP_NOT_PEN', 'Not a pen yet. The closest pen you own that works on {paper} is {pen}. Add the color as a plain pen to plot it exactly.', { name: comp.name, paper: paperName, pen: D.nearest ? D.nearest.name : '—' });
        if (D.hiddenNames.length) text += ' ' + T('COMP_HIDDEN', 'Hidden on {paper}: {names} (would barely show).', { paper: paperName, names: D.hiddenNames.join(', ') });
        setText(note, text);
        note.className = 'pen-studio-pair-note ' + (comp.real ? 'is-ok' : 'is-warn');
      } else {
        setText(contrast, ''); setText(note, '');
        note.className = 'pen-studio-pair-note';
      }

      linesInput.min = String(weaveCfg.min); linesInput.max = String(weaveCfg.max); linesInput.step = '1';
      linesInput.value = String(n);
      setText(linesLabel, T('LINES', 'Lines'));
      setText(linesValue, String(n));
      syncList(weaves, weaveCfg.modes, (m) => m,
        (m) => {
          const b = el(doc, 'button', 'pen-studio-weave-btn'); b.type = 'button';
          b.addEventListener('click', () => ctx.set({ weave: b.dataset.key }));
          return b;
        },
        (b, m) => {
          const lit = WEAVE_LITERAL[m] || ['', m];
          setText(b, lit[0] ? T(lit[0], lit[1]) : lit[1]);
          const on = m === D.mode;
          b.classList.toggle('is-selected', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

      const sig = JSON.stringify([D.pen.id, D.pen.color, D.effPen.ink, D.testLabel, D.paperType, n, D.mode, comp ? comp.id + ':' + comp.hex : '']);
      if (sig !== lastSig) {
        lastSig = sig;
        q.bump();
        q.push(paint);
      }
    };

    update();
    return {
      update,
      destroy() {
        destroyed = true; q.destroy();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      _queue: q,
    };
  };

  UI.PenStudioPair = { mount };
})();
