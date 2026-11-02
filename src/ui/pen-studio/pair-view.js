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

  const Shared = UI.PenStudioShared;
  if (!Shared) throw new Error('Pen Studio: load src/ui/pen-studio/shared.js first');
  const { fmt, el, setText, syncList, makeQueue, derive } = Shared;

  const WEAVE_KEY = { alt: 'WEAVE_ALT', third: 'WEAVE_THIRD', mid: 'WEAVE_MID' };
  const KIND_KEY = { curated: 'KIND_CURATED', hue: 'KIND_HUE', box: 'KIND_BOX', random: 'KIND_RANDOM' };

  const mount = (host, ctx) => {
    const win = (host.ownerDocument && host.ownerDocument.defaultView) || G;
    const doc = host.ownerDocument || document;
    const L = () => (ctx.L && ctx.L()) || {};
    const T = (key, vars) => fmt(L()[key] || '', vars);
    const weaveMm = () => (D && D.cfg.WEAVE_MM) || { w: 0, h: 0 };
    const weavePx = () => (D && D.cfg.PX_PER_MM && D.cfg.PX_PER_MM.weave) || 1;
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
      const wCss = Math.round(weaveMm().w * weavePx()); const hCss = Math.round(weaveMm().h * weavePx());
      canvas.width = Math.round(wCss * dpr); canvas.height = Math.round(hCss * dpr);
      canvas.style.width = wCss + 'px'; canvas.style.height = hCss + 'px';
      const docPen = D.docPen; const compDoc = D.compDoc || D.docPen;
      const strokes = Lab.weave(D.n, D.mode, weaveMm()).map((s) => ({ pts: s.pts, pen: s.comp ? compDoc : docPen }));
      IR.drawSample(canvas, docPen, Lab.paperFor(D.paperType), { paths: strokes, paperFill: true, widthMm: weaveMm().w });
    };

    const update = () => {
      if (destroyed) return;
      D = derive(ctx);
      if (!D) {
        q.bump(); lastSig = null;
        body.hidden = true; empty.hidden = false;
        setText(empty, T('EMPTY_BOX'));
        return;
      }
      empty.hidden = true; body.hidden = false;
      const Lab = Vectura.PenStudioLab; const Comp = Vectura.PenStudioComplement;
      const weaveCfg = D.cfg.WEAVE || { min: 3, max: 7, default: 5, modes: ['alt', 'third', 'mid'] };
      const n = Math.max(weaveCfg.min, Math.min(weaveCfg.max, Number.isFinite(D.st.n) ? D.st.n : weaveCfg.default));
      D.n = n; D.mode = D.st.weave || 'alt';
      const paperCfg = Lab.paperFor(D.paperType) || {};
      const paperName = (Lab.papers().find((p) => p.type === D.paperType) || {}).name || D.paperType;

      setText(headTitle, T('COMP_HEAD'));
      setText(headSub, T('COMP_SUB'));
      setText(random, T('RANDOMIZE'));
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
          setText(b.children[2], KIND_KEY[c.kind] ? T(KIND_KEY[c.kind], { deg: c.deg != null ? c.deg : '' }) : (c.kind || ''));
          b.classList.toggle('is-selected', sel);
          b.setAttribute('aria-pressed', sel ? 'true' : 'false');
          let tip;
          if (c.real) tip = T('COMP_OWNED_TITLE', { name: c.name });
          else {
            const near = Comp.nearestOwned ? Comp.nearestOwned(c.hex, D.doc.pens || [], D.effPen, D.paperType) : null;
            tip = near ? T('COMP_COLOR_TITLE', { name: c.name, hex: c.hex, closest: near.name }) : T('COMP_COLOR_TITLE_PLAIN', { name: c.name, hex: c.hex });
          }
          b.title = tip;
        });

      const comp = D.comp;
      if (comp) {
        const ratio = Comp.contrast(comp.hex, paperCfg.color);
        setText(contrast, comp.name + ' · ' + Number(ratio).toFixed(1) + ':1');
        let text = comp.real
          ? T('COMP_REAL', { name: comp.name, paper: paperName })
          : (D.nearest ? T('COMP_NOT_PEN', { name: comp.name, paper: paperName, closest: D.nearest.name }) : T('COMP_NOT_PEN_NONE', { paper: paperName }));
        if (D.hiddenNames.length) text += ' ' + T('COMP_HIDDEN', { paper: paperName, names: D.hiddenNames.join(', ') });
        setText(note, text);
        note.className = 'pen-studio-pair-note ' + (comp.real ? 'is-ok' : 'is-warn');
      } else {
        setText(contrast, ''); setText(note, '');
        note.className = 'pen-studio-pair-note';
      }

      linesInput.min = String(weaveCfg.min); linesInput.max = String(weaveCfg.max); linesInput.step = '1';
      linesInput.value = String(n);
      setText(linesLabel, T('LINES'));
      setText(linesValue, String(n));
      syncList(weaves, weaveCfg.modes, (m) => m,
        (m) => {
          const b = el(doc, 'button', 'pen-studio-weave-btn'); b.type = 'button';
          b.addEventListener('click', () => ctx.set({ weave: b.dataset.key }));
          return b;
        },
        (b, m) => {
          setText(b, WEAVE_KEY[m] ? T(WEAVE_KEY[m]) : m);
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
