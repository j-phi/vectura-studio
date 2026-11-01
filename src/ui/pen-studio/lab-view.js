/**
 * Pen Studio — Lab view (center column) — window.Vectura.UI.PenStudioLab.
 *
 *   const view = UI.PenStudioLab.mount(el, ctx);   // { update(), destroy() }
 *
 * Owned-size toggles (outlined = the size being tested), paper swatches with
 * contrast / "faint", the one-paper view (6 test strips with value labels),
 * the all-papers matrix (10 papers x 4 cells), six tuning sliders (draft /
 * saved / default coloring + evidence tooltips) and the action bar.
 *
 * Reads Vectura.PenStudioStore / PenStudioDraft / PenStudioLab (core) and
 * draws only into its own canvases via InkRenderer.drawSample (opts.paths);
 * it never touches SETTINGS. Canvas drawing goes through a rAF queue with
 * generation tokens so stale jobs are dropped.
 *
 * Layout classes: pen-studio-lab(-empty), pen-studio-sizes(-head|-src|-row),
 * pen-studio-size(.is-owned|.is-testing), pen-studio-papers, pen-studio-paper
 * (.is-selected), pen-studio-view(-toggle), pen-studio-view-btn,
 * pen-studio-strips, pen-studio-strip(-head|-label|-value|-canvas),
 * pen-studio-matrix, pen-studio-matrix-row(.is-selected), pen-studio-matrix-name,
 * pen-studio-matrix-cell, pen-studio-matrix-note, pen-studio-sliders,
 * pen-studio-slider(-head|-label|-value|-input|-ev), pen-studio-actions,
 * pen-studio-btn(.is-primary), pen-studio-note(.is-ok|.is-warn).
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

  const SLIDER_FALLBACK = [
    { key: 'wetness', label: 'BLEED', min: 0, max: 1, step: 0.05, evidence: 'EV_BLEED' },
    { key: 'blobs', label: 'BLOB', min: 0, max: 3, step: 0.05, evidence: 'EV_BLOB' },
    { key: 'overlap', label: 'OVERLAP', min: 0, max: 1, step: 0.05, evidence: 'EV_OVERLAP' },
    { key: 'skips', label: 'SKIPS', min: 0, max: 0.25, step: 0.005, evidence: 'EV_SKIPS' },
    { key: 'starvation', label: 'STARVATION', min: 0, max: 0.9, step: 0.05, evidence: 'EV_STARVATION' },
    { key: 'coverOnDark', label: 'COVER', min: 0, max: 1, step: 0.05, evidence: 'EV_COVER' },
  ];
  const SLIDER_LITERAL = {
    wetness: ['Bleed', 'P1 Micron on smooth: crisp. P8 Sharpie: soft edges on textured paper.'],
    blobs: ['Pen-down blob', 'P8 Sharpie: bulbous stroke ends. P9 Signo: dots at starts.'],
    overlap: ['Overlap darkening', 'P3 Stabilo CMYK hatch: dye colors mix where they cross.'],
    skips: ['Skips / streaks', 'P9 Signo white and P6 white gel: streaky strokes.'],
    starvation: ['Starvation', 'EMSL: Posca dries out on long plots. unsharpen: Signo Broad runs out on fills.'],
    coverOnDark: ['Coverage on dark', 'P5 white Gelly on black: opaque. P7 Posca: white opaque, yellow semi.'],
  };
  const TESTS_FALLBACK = ['line', 'bleed', 'blob', 'cross', 'skip', 'starv'];
  const MATRIX_FALLBACK = ['line', 'bleed', 'blob', 'cross'];
  const STRIP_PX_PER_MM = 14;
  const CELL_PX_PER_MM = 8;
  const TEST_LITERAL = {
    line: 'Nib vs line', bleed: 'Bleed · feathering', blob: 'Pen-down blob · lift',
    cross: 'Crossings with complement', skip: 'Skips · streaks', starv: 'Starvation, long stroke',
  };
  const VAL_LITERAL = {
    line: 'nib {nib} mm · line ≈{laid} mm', bleed: '{bleed} mm per side', blob: 'blob ≈{blob} mm',
    crossDye: 'dye: {pct}% darker', crossOpaque: 'opaque: last pen wins', skip: '{pct}% of line',
    starv: '{pct}% fade by end', none: 'none',
  };

  const mount = (host, ctx) => {
    const win = (host.ownerDocument && host.ownerDocument.defaultView) || G;
    const doc = host.ownerDocument || document;
    const L = () => (ctx.L && ctx.L()) || {};
    const T = (key, literal, vars) => fmt(L()[key] || literal, vars);
    const q = makeQueue(win);
    let lastSig = null;
    let destroyed = false;

    const root = el(doc, 'div', 'pen-studio-lab');
    const empty = el(doc, 'div', 'pen-studio-lab-empty');
    const body = el(doc, 'div', 'pen-studio-lab-body');
    root.append(empty, body);

    // --- sizes
    const sizesWrap = el(doc, 'section', 'pen-studio-sizes');
    const sizesHead = el(doc, 'div', 'pen-studio-sizes-head');
    const sizesRow = el(doc, 'div', 'pen-studio-sizes-row');
    const sizesSrc = el(doc, 'div', 'pen-studio-sizes-src');
    sizesWrap.append(sizesHead, sizesRow, sizesSrc);

    // --- papers + view toggle
    const papersWrap = el(doc, 'section', 'pen-studio-papers-wrap');
    const papersHead = el(doc, 'div', 'pen-studio-papers-head');
    const papers = el(doc, 'div', 'pen-studio-papers');
    const viewToggle = el(doc, 'div', 'pen-studio-view-toggle');
    const btnOne = el(doc, 'button', 'pen-studio-view-btn');
    const btnAll = el(doc, 'button', 'pen-studio-view-btn');
    [btnOne, btnAll].forEach((b) => { b.type = 'button'; });
    viewToggle.append(btnOne, btnAll);
    papersWrap.append(papersHead, papers, viewToggle);

    // --- one-paper strips and the all-papers matrix
    const strips = el(doc, 'div', 'pen-studio-strips');
    const matrix = el(doc, 'div', 'pen-studio-matrix');

    // --- sliders
    const slidersWrap = el(doc, 'section', 'pen-studio-sliders');
    // --- actions
    const actions = el(doc, 'div', 'pen-studio-actions');
    const mkBtn = (cls) => { const b = el(doc, 'button', 'pen-studio-btn ' + cls); b.type = 'button'; return b; };
    const bDiscard = mkBtn('is-discard'); const bReset = mkBtn('is-reset'); const bExport = mkBtn('is-export');
    const bSaveNew = mkBtn('is-save-new'); const bSave = mkBtn('is-primary is-save');
    const noteEl = el(doc, 'span', 'pen-studio-note');
    noteEl.setAttribute('role', 'status');
    actions.append(bDiscard, bReset, bExport, bSaveNew, bSave, noteEl);

    body.append(sizesWrap, papersWrap, strips, matrix, slidersWrap, actions);
    host.appendChild(root);

    let D = null; // latest derive()

    // ---------------------------------------------------------------- handlers
    const toggleSize = (label) => {
      if (!D || !D.box) return;
      const Store = Vectura.PenStudioStore;
      const order = D.sizes.map((s) => s.label);
      const has = D.owned.indexOf(label) >= 0;
      let next;
      if (has) {
        if (D.owned.length <= 1) return; // never empty
        next = D.owned.filter((x) => x !== label);
      } else {
        next = D.owned.concat([label]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      }
      const testSize = has ? (label === D.testLabel ? next[0] : D.testLabel) : label;
      ctx.setDoc(Store.setOwnedSizes(D.doc, D.box.id, D.pen.id, next));
      ctx.set({ testSize });
    };

    const withoutDraft = () => {
      const drafts = Object.assign({}, (D.st && D.st.drafts) || {});
      delete drafts[D.pen.id];
      return drafts;
    };

    const onSliderInput = (key, raw) => {
      if (!D) return;
      const Draft = Vectura.PenStudioDraft;
      const st = ctx.getState();
      const cur = (st.drafts && st.drafts[D.pen.id]) || { ink: {} };
      const next = Draft.set(cur, key, parseFloat(raw));
      ctx.set({ note: null, drafts: Object.assign({}, st.drafts || {}, { [D.pen.id]: next }) });
    };

    bSave.addEventListener('click', () => {
      if (!D || bSave.disabled) return;
      const Draft = Vectura.PenStudioDraft;
      ctx.setDoc(Draft.commit(D.doc, D.pen.id, D.draft));
      const name = (D.draft.name && String(D.draft.name).trim()) || D.pen.name;
      ctx.set({ drafts: withoutDraft(), editing: null, note: { text: T('NOTE_SAVED', 'Saved {name} ✓', { name }), tone: 'ok' } });
    });
    bDiscard.addEventListener('click', () => {
      if (!D || bDiscard.disabled) return;
      ctx.set({ drafts: withoutDraft(), editing: null, note: { text: T('NOTE_DISCARDED', 'Changes discarded'), tone: 'ok' } });
    });
    bReset.addEventListener('click', () => {
      if (!D) return;
      const Draft = Vectura.PenStudioDraft;
      const fresh = Draft.resetToModel(D.pen);
      const next = Object.assign({}, fresh);
      if (D.draft.name != null) next.name = D.draft.name;
      if (D.draft.desc != null) next.desc = D.draft.desc;
      ctx.set({ note: null, drafts: Object.assign({}, (D.st && D.st.drafts) || {}, { [D.pen.id]: next }) });
    });
    bExport.addEventListener('click', () => {
      if (!D) return;
      ctx.set({ overlay: { kind: 'export', scope: 'pen', penId: D.pen.id, sizeLabel: D.testLabel } });
    });
    bSaveNew.addEventListener('click', () => {
      if (!D) return;
      ctx.set({ editing: null, overlay: { kind: 'saveNew' } });
    });
    btnOne.addEventListener('click', () => ctx.set({ view: 'one' }));
    btnAll.addEventListener('click', () => ctx.set({ view: 'all' }));

    // ------------------------------------------------------------ build parts
    const sliderRows = {};
    const buildSliders = () => {
      const defs = (D.cfg.SLIDERS && D.cfg.SLIDERS.length ? D.cfg.SLIDERS : SLIDER_FALLBACK);
      defs.forEach((s) => {
        if (sliderRows[s.key]) return;
        const row = el(doc, 'div', 'pen-studio-slider');
        row.dataset.key = s.key;
        const head = el(doc, 'div', 'pen-studio-slider-head');
        const label = el(doc, 'label', 'pen-studio-slider-label');
        const value = el(doc, 'span', 'pen-studio-slider-value');
        const input = el(doc, 'input', 'pen-studio-slider-input');
        input.type = 'range';
        input.min = String(s.min); input.max = String(s.max); input.step = String(s.step);
        input.id = 'pen-studio-slider-' + s.key;
        label.setAttribute('for', input.id);
        const ev = el(doc, 'div', 'pen-studio-slider-ev');
        head.append(label, value);
        row.append(head, input, ev);
        input.addEventListener('input', () => onSliderInput(s.key, input.value));
        slidersWrap.appendChild(row);
        sliderRows[s.key] = { def: s, row, label, value, input, ev };
      });
    };

    const stripRows = {};
    const buildStrips = () => {
      const kinds = (D.cfg.TESTS && D.cfg.TESTS.length ? D.cfg.TESTS : TESTS_FALLBACK);
      kinds.forEach((k) => {
        if (stripRows[k]) return;
        const row = el(doc, 'div', 'pen-studio-strip');
        row.dataset.kind = k;
        const head = el(doc, 'div', 'pen-studio-strip-head');
        const label = el(doc, 'span', 'pen-studio-strip-label');
        const value = el(doc, 'span', 'pen-studio-strip-value');
        const canvas = el(doc, 'canvas', 'pen-studio-strip-canvas');
        head.append(label, value);
        row.append(head, canvas);
        strips.appendChild(row);
        stripRows[k] = { row, label, value, canvas };
      });
    };

    const matrixRows = {};
    const buildMatrix = (paperList) => {
      const kinds = (D.cfg.MATRIX_TESTS && D.cfg.MATRIX_TESTS.length ? D.cfg.MATRIX_TESTS : MATRIX_FALLBACK);
      paperList.forEach((p) => {
        if (matrixRows[p.type]) return;
        const row = el(doc, 'button', 'pen-studio-matrix-row');
        row.type = 'button';
        row.dataset.type = p.type;
        const name = el(doc, 'span', 'pen-studio-matrix-name');
        const cells = kinds.map((k) => {
          const c = el(doc, 'canvas', 'pen-studio-matrix-cell');
          c.dataset.kind = k;
          return c;
        });
        const note = el(doc, 'span', 'pen-studio-matrix-note');
        row.append(name, ...cells, note);
        row.addEventListener('click', () => ctx.set({ paperType: p.type, view: 'one' }));
        matrix.appendChild(row);
        matrixRows[p.type] = { row, name, cells, kinds, note };
      });
    };

    // ----------------------------------------------------------------- drawing
    const paintCanvas = (canvas, spec, pxPerMm, docPen, compDoc, paperType) => {
      const Lab = Vectura.PenStudioLab; const IR = Vectura.InkRenderer;
      if (!IR || !IR.drawSample) return;
      const dpr = Math.min(2, (win.devicePixelRatio || 1));
      const wCss = Math.round(spec.boxMm.w * pxPerMm); const hCss = Math.round(spec.boxMm.h * pxPerMm);
      canvas.width = Math.max(1, Math.round(wCss * dpr)); canvas.height = Math.max(1, Math.round(hCss * dpr));
      canvas.style.width = wCss + 'px'; canvas.style.height = hCss + 'px';
      const paths = spec.strokes.map((s) => ({ pts: s.pts, pen: s.pen }));
      IR.drawSample(canvas, docPen, Lab.paperFor(paperType), { paths, paperFill: true, widthMm: spec.boxMm.w });
    };

    const valueText = (kind, values, dye) => {
      const v = values || {};
      if (kind === 'line') return T('VAL_LINE', VAL_LITERAL.line, v);
      if (kind === 'bleed') return T('VAL_BLEED', VAL_LITERAL.bleed, v);
      if (kind === 'blob') return T('VAL_BLOB', VAL_LITERAL.blob, v);
      if (kind === 'cross') return dye ? T('VAL_CROSS_DYE', VAL_LITERAL.crossDye, v) : T('VAL_CROSS_OPAQUE', VAL_LITERAL.crossOpaque, v);
      if (kind === 'skip') return v.pct === 0 || v.pct === '0.0' ? T('VAL_NONE', VAL_LITERAL.none) : T('VAL_SKIP', VAL_LITERAL.skip, v);
      if (kind === 'starv') return v.pct === 0 || v.pct === '0' ? T('VAL_NONE', VAL_LITERAL.none) : T('VAL_STARV', VAL_LITERAL.starv, v);
      return '';
    };

    const renderStrips = () => {
      const Lab = Vectura.PenStudioLab;
      const kinds = (D.cfg.TESTS && D.cfg.TESTS.length ? D.cfg.TESTS : TESTS_FALLBACK);
      const compDoc = D.compDoc || D.docPen;
      kinds.forEach((k) => {
        const r = stripRows[k];
        const spec = Lab.testSpec(k, { pen: D.docPen, comp: compDoc, paperType: D.paperType, mini: false });
        setText(r.label, T('TEST_' + k.toUpperCase(), TEST_LITERAL[k] || k));
        const m = Lab.metrics ? Lab.metrics(D.docPen, D.paperType) : {};
        setText(r.value, valueText(k, spec.values, m && m.opaque === false));
        const docPen = D.docPen; const pt = D.paperType;
        q.push(() => paintCanvas(r.canvas, spec, STRIP_PX_PER_MM, docPen, compDoc, pt));
      });
    };

    const renderMatrix = (paperList) => {
      const Lab = Vectura.PenStudioLab;
      const kinds = (D.cfg.MATRIX_TESTS && D.cfg.MATRIX_TESTS.length ? D.cfg.MATRIX_TESTS : MATRIX_FALLBACK);
      const compDoc = D.compDoc || D.docPen;
      paperList.forEach((p) => {
        const r = matrixRows[p.type];
        const fit = Lab.fit(D.docPen.color, p.type, D.docPen);
        const key = fit.faint || fit.note === 'barely' ? 'NOTE_BARELY' : (fit.note === 'crisp' ? 'NOTE_CRISP' : 'NOTE_READS');
        const lit = key === 'NOTE_BARELY' ? 'barely shows' : (key === 'NOTE_CRISP' ? 'crisp' : 'reads well');
        setText(r.note, T(key, lit));
        r.note.classList.toggle('is-warn', key === 'NOTE_BARELY');
        r.row.classList.toggle('is-selected', p.type === D.paperType);
        r.row.setAttribute('aria-pressed', p.type === D.paperType ? 'true' : 'false');
        kinds.forEach((k, i) => {
          const spec = Lab.testSpec(k, { pen: D.docPen, comp: compDoc, paperType: p.type, mini: true });
          const docPen = D.docPen; const type = p.type; const canvas = r.cells[i];
          q.push(() => paintCanvas(canvas, spec, CELL_PX_PER_MM, docPen, compDoc, type));
        });
      });
    };

    // ------------------------------------------------------------------ update
    const update = () => {
      if (destroyed) return;
      D = derive(ctx);
      if (!D) {
        q.bump(); lastSig = null;
        body.hidden = true; empty.hidden = false;
        setText(empty, T('EMPTY_BOX', 'Select a pen to start testing.'));
        return;
      }
      empty.hidden = true; body.hidden = false;
      const Draft = Vectura.PenStudioDraft; const Lab = Vectura.PenStudioLab;
      const st = D.st; const pen = D.pen;

      // sizes
      setText(sizesHead, T('SIZES_HEAD', 'Sizes in {box}: click to add or remove. The outlined size is the one being tested.', { box: (D.box && D.box.name) || 'this box' }));
      syncList(sizesRow, D.sizes, (s) => s.label,
        () => {
          const b = el(doc, 'button', 'pen-studio-size'); b.type = 'button';
          b.addEventListener('click', () => toggleSize(b.dataset.key));
          return b;
        },
        (b, s) => {
          const own = D.owned.indexOf(s.label) >= 0; const testing = s.label === D.testLabel;
          setText(b, (own ? '✓ ' : '') + s.label + (testing ? T('TESTING', ' · testing') : ''));
          b.classList.toggle('is-owned', own); b.classList.toggle('is-testing', testing);
          b.setAttribute('aria-pressed', own ? 'true' : 'false');
          b.title = 'nib ' + Number(s.nominalWidthMm).toFixed(2) + ' mm · line ' + Number(s.laidWidthMm).toFixed(2) + ' mm';
        });
      const PMd = Vectura.PEN_MODELS && Vectura.PEN_MODELS.MODELS && pen.model ? Vectura.PEN_MODELS.MODELS[pen.model] : null;
      const src = PMd && (PMd.sizesSource || PMd.sizeSource || PMd.source);
      sizesSrc.hidden = !src;
      setText(sizesSrc, src ? T('SIZES_SRC', 'Nib sizes: {src}', { src }) : '');

      // papers
      const paperList = Lab.papers();
      setText(papersHead, T('PAPER_HEAD', 'Paper'));
      syncList(papers, paperList, (p) => p.type,
        () => {
          const b = el(doc, 'button', 'pen-studio-paper'); b.type = 'button';
          b.append(el(doc, 'span', 'pen-studio-paper-swatch'), el(doc, 'span', 'pen-studio-paper-name'), el(doc, 'span', 'pen-studio-paper-note'));
          b.addEventListener('click', () => ctx.set({ paperType: b.dataset.key }));
          return b;
        },
        (b, p) => {
          const fit = Lab.fit(D.docPen.color, p.type, D.docPen);
          const sel = p.type === D.paperType;
          b.children[0].style.background = p.color;
          setText(b.children[1], p.name);
          const note = fit.faint ? T('FAINT', 'faint') : Number(fit.ratio).toFixed(1) + ':1';
          setText(b.children[2], note);
          b.children[2].classList.toggle('is-warn', !!fit.faint);
          b.classList.toggle('is-selected', sel); b.classList.toggle('is-faint', !!fit.faint);
          b.setAttribute('aria-pressed', sel ? 'true' : 'false');
          b.setAttribute('aria-label', p.name + ', ' + pen.name + (fit.faint ? ' barely shows' : ' contrast ' + Number(fit.ratio).toFixed(1)));
        });
      const one = st.view !== 'all';
      setText(btnOne, T('VIEW_ONE', 'One paper'));
      setText(btnAll, T('VIEW_ALL', 'All {n} papers', { n: paperList.length }));
      btnOne.classList.toggle('is-selected', one); btnAll.classList.toggle('is-selected', !one);
      btnOne.setAttribute('aria-pressed', one ? 'true' : 'false'); btnAll.setAttribute('aria-pressed', one ? 'false' : 'true');
      strips.hidden = !one; matrix.hidden = one;
      buildStrips();
      if (!one) buildMatrix(paperList);

      // sliders
      buildSliders();
      Object.keys(sliderRows).forEach((key) => {
        const r = sliderRows[key];
        const value = Draft.valueOf(pen, D.draft, key);
        const state = Draft.keyState(pen, D.draft, key);
        const lit = SLIDER_LITERAL[key] || [key, ''];
        setText(r.label, L()['SLIDER_' + r.def.label] || L()[r.def.label] || lit[0]);
        r.input.value = String(value);
        let readout = Number(value).toFixed(2);
        if (key === 'blobs' && Lab.metrics) {
          const m = Lab.metrics(D.docPen, D.paperType);
          if (m && Number.isFinite(m.blobMm)) readout += ' ≈ ' + m.blobMm.toFixed(2) + ' mm';
        }
        setText(r.value, readout);
        r.value.className = 'pen-studio-slider-value is-' + state;
        r.value.dataset.state = state;
        const ev = L()[r.def.evidence] || lit[1];
        setText(r.ev, ev);
        r.row.title = ev;
      });

      // actions
      const dirty = !!Draft.isDirty(pen, D.draft);
      setText(bDiscard, T('DISCARD', 'Discard')); setText(bReset, T('RESET', 'Reset to model'));
      setText(bExport, T('EXPORT', 'Export')); setText(bSaveNew, T('SAVE_NEW', 'Save as new'));
      setText(bSave, T('SAVE', 'Save changes'));
      bSaveNew.title = T('SAVE_NEW_TITLE', 'Save these settings as a new pen');
      bSave.disabled = !dirty; bDiscard.disabled = !dirty;
      bSave.classList.toggle('is-clean', !dirty);
      const note = st.note || (dirty ? { text: T('UNSAVED', 'Unsaved changes'), tone: 'warn' } : null);
      setText(noteEl, note ? note.text : '');
      noteEl.className = 'pen-studio-note' + (note ? ' is-' + (note.tone === 'ok' ? 'ok' : 'warn') : '');

      // canvases: redraw only when an input to the drawing changed
      const compKey = D.comp ? (D.comp.id + ':' + D.comp.hex) : '';
      const sig = JSON.stringify([pen.id, pen.color, pen.model, D.effPen.ink, D.testLabel, D.paperType, one, compKey]);
      if (sig !== lastSig) {
        lastSig = sig;
        q.bump();
        if (one) renderStrips(); else renderMatrix(paperList);
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

  UI.PenStudioLab = { mount };
})();
