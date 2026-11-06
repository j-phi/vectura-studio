/**
 * Start Page plate layouts (Vectura.StartPagePlateLayouts).
 *
 * 16 plate layouts as DOM builders. A plate is a sheet on its own ground with display type and art in the pen color
 * (the G2 plate style): the plate's colors live in CSS custom properties (--spl-paper / ink / art / text / acc / mute /
 * line / disc / inv, see StartPagePlateType.plateVars) so a recolor is one style swap.
 *
 *   render(layoutId, { plate, art, colorway, index, total, texts, frame?, autoMount? }) -> HTMLElement
 *     plate    { id, orientation: 'landscape' | 'portrait' | 'square' | '3d', frame?: { fit, z, cx, cy } }
 *     art      { id, svg, model?, seen? }   (model marks a live 3D piece: its print carries data-3d and a drag hint; seen = drawn before, so a live model mounts already plotted)
 *     colorway a placed plate colorway ({ ground, ink, accent, class } or { paper, ink })
 *     texts    { word, title, description, algorithm?, summary?, specs: [[label, value]] | [{ label, value }],
 *                actions?: [{ id, label, primary?, onClick? }] }
 *   mount(el)         mounts the art (StartPageInk) once the plate is in the document; resolves when ready.
 *                     render() calls it by itself when the plate is attached (autoMount, default true).
 *   recolor(el, cw)   new colorway: plate variables, art tiles, knockout word, partial proofs.
 *   destroy(el)       unmounts every art tile and stops observers.
 *   button({ label, primary, onClick, id }) -> inked button for the slots.
 * Slots (filled by the plates UI later): [data-slot="tools"] (header: Edit, Colorways, Use as cover) and
 * [data-slot="actions"] (the plate's buttons, empty unless texts.actions is given).
 *
 * Words are SVG <text> sized from the font's real ink box (src/core/start-page/plate-type.js), so no descender is
 * clipped. CSS lives in src/ui/skin/ (components.css, Start Page plate sections).
 */
(() => {
  const W = window;
  const D = document;
  const Vectura = (W.Vectura = W.Vectura || {});
  const T = Vectura.StartPagePlateType;
  const Geo = Vectura.StartPageArtGeometry;
  if (!T) throw new Error('StartPagePlateLayouts requires StartPagePlateType (src/core/start-page/plate-type.js)');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ink = () => Vectura.StartPageInk;

  /* ------------------------------------------------------------------ DOM helpers */
  const el = (tag, cls, o) => {
    const n = D.createElement(tag);
    if (cls) n.className = cls;
    if (o) {
      if (o.text != null) n.textContent = o.text;
      if (o.attrs) Object.keys(o.attrs).forEach((k) => n.setAttribute(k, o.attrs[k]));
      if (o.kids) o.kids.forEach((k) => k && n.appendChild(k));
    }
    return n;
  };
  const svgEl = (tag, attrs) => { const n = D.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k])); return n; };
  const f2 = (v) => +(+v).toFixed(2);

  /* ------------------------------------------------------------------ word measuring (cached; cleared when fonts load) */
  let measCtx = null;
  const metricsCache = new Map();
  const measure = (word) => {
    if (metricsCache.has(word)) return metricsCache.get(word);
    let m = null;
    try {
      if (!measCtx) measCtx = D.createElement('canvas').getContext('2d');
      if (measCtx) {
        measCtx.font = T.FONT;
        try { measCtx.letterSpacing = `${T.LETTER_SPACING}px`; } catch (e) { /* older engines */ }
        m = measCtx.measureText(word);
        try { measCtx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
      }
    } catch (e) { m = null; }
    if (!m || !(m.actualBoundingBoxAscent > 0) || !(m.width > 0)) m = T.estimateMetrics(word);
    const out = { width: m.width, actualBoundingBoxLeft: m.actualBoundingBoxLeft, actualBoundingBoxRight: m.actualBoundingBoxRight, actualBoundingBoxAscent: m.actualBoundingBoxAscent, actualBoundingBoxDescent: m.actualBoundingBoxDescent };
    metricsCache.set(word, out);
    return out;
  };
  const textNode = (word, x, y, extra) => {
    const t = svgEl('text', Object.assign({
      x: f2(x), y: f2(y), 'font-size': 100, 'letter-spacing': T.LETTER_SPACING, 'font-weight': T.FONT_WEIGHT, 'font-family': T.FONT_FAMILY,
    }, extra || {}));
    t.textContent = word;
    return t;
  };
  const buildH = (host, word, maxh) => {
    const b = T.wordBox(measure(word));
    const s = svgEl('svg', { class: 'spl-hword', viewBox: `0 0 ${f2(b.width)} ${f2(b.height)}`, preserveAspectRatio: 'xMinYMid meet', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(textNode(word, b.x, b.y));
    s.style.setProperty('--spl-mw', `${f2(maxh * b.width / b.height)}px`);
    s.dataset.boxH = String(f2(b.height));
    host.replaceChildren(s);
    return s;
  };
  const buildV = (host, word, down) => {
    const b = T.wordBox(measure(word)); const v = T.verticalBox(b, down);
    const s = svgEl('svg', { class: 'spl-vword', viewBox: `0 0 ${f2(v.width)} ${f2(v.height)}`, preserveAspectRatio: down ? 'xMidYMin meet' : 'xMidYMax meet', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(textNode(word, 0, 0, { x: 0, y: 0, transform: v.transform }));
    /* the column width comes from this ratio in CSS, not from the SVG's own height:100%/width:auto, which WebKit (iPad) cannot resolve while sizing a grid column */
    host.style.setProperty('--spl-vr', String(+(v.width / v.height).toFixed(4)));
    host.replaceChildren(s);
    return s;
  };

  /* ------------------------------------------------------------------ partial pen proofs (canvas) */
  const parsedCache = new Map();
  const parsedOf = (art) => {
    const k = `${art.id}:${(art.svg || '').length}`;
    if (!parsedCache.has(k)) {
      parsedCache.set(k, Geo.parseArtSvg(art.svg));
      if (parsedCache.size > 12) parsedCache.delete(parsedCache.keys().next().value);
    }
    return parsedCache.get(k);
  };
  const drawPartial = (c, cv, frac, w, h) => {
    w = Math.max(20, Math.round(w)); h = Math.max(16, Math.round(h));
    const dpr = Math.min(2, W.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    let g; try { g = cv.getContext('2d'); } catch (e) { g = null; }
    if (!g) return;
    const a = parsedOf(c.art); const v = c.vars;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = v['--spl-paper']; g.fillRect(0, 0, w, h);
    const [vx, vy, vw, vh] = a.vb; const pd = Math.max(4, w * 0.08);
    const s = Math.min((w - 2 * pd) / vw, (h - 2 * pd) / vh); const ox = (w - vw * s) / 2 - vx * s; const oy = (h - vh * s) / 2 - vy * s;
    const dens = a.total * s / (w * h);
    g.lineWidth = Math.max(0.35, Math.min(1, 0.5 / Math.sqrt(dens || 1e-6))); g.globalAlpha = Math.max(0.45, Math.min(1, 1.2 / Math.sqrt(dens || 1e-6)));
    g.strokeStyle = v['--spl-art']; g.lineCap = 'round'; g.lineJoin = 'round';
    let left = a.total * frac; g.beginPath();
    for (let j = 0; j < a.polys.length && left > 0; j++) {
      const P = a.polys[j]; g.moveTo(P[0] * s + ox, P[1] * s + oy);
      for (let q = 2; q < P.length; q += 2) {
        const L = Math.hypot(P[q] - P[q - 2], P[q + 1] - P[q - 1]);
        if (L > left) { const t = left / L; g.lineTo((P[q - 2] + (P[q] - P[q - 2]) * t) * s + ox, (P[q - 1] + (P[q + 1] - P[q - 1]) * t) * s + oy); left = 0; break; }
        left -= L; g.lineTo(P[q] * s + ox, P[q + 1] * s + oy);
      }
    }
    g.stroke();
  };
  const ro = typeof W.ResizeObserver !== 'undefined' ? new W.ResizeObserver((es) => es.forEach((e) => { const f = e.target._splRedraw; if (f) f(); })) : null;

  /* ------------------------------------------------------------------ buttons */
  const button = (o) => {
    o = o || {};
    const b = el('button', `spl-btn ${o.primary ? 'spl-btn-p' : 'spl-btn-s'}`, { text: o.label || '', attrs: { type: 'button' } });
    if (o.id) b.dataset.action = o.id;
    if (o.ariaLabel) b.setAttribute('aria-label', o.ariaLabel);
    if (typeof o.onClick === 'function') b.addEventListener('click', o.onClick);
    return b;
  };

  /* ------------------------------------------------------------------ plate context + parts */
  const HINT3 = ' Drawn live in 3D here: drag it to turn it.';

  const makeCtx = (id, o) => {
    const texts = o.texts || {};
    const plate = o.plate || {};
    const orientation = plate.orientation || 'landscape';
    const c = {
      id, plate, art: o.art, cw: o.colorway, index: o.index | 0, total: o.total | 0, orientation,
      is3d: orientation === '3d' || !!(o.art && o.art.model),
      live3d: !!(o.art && o.art.model),
      vars: T.plateVars(o.colorway || {}),
      word: String(texts.word == null ? '' : texts.word), title: String(texts.title == null ? '' : texts.title),
      desc: String(texts.description == null ? '' : texts.description), algo: String(texts.algorithm || texts.word || ''),
      specs: T.normSpecs(texts.specs), actions: Array.isArray(texts.actions) ? texts.actions : [], summary: texts.summary,
      prints: [], crops: [], words: [], stages: [], ko: null, frameOverride: o.frame || plate.frame || null,
    };
    c.short = c.specs.slice(0, 4);
    c.note = c.desc + (c.live3d ? HINT3 : '');
    c.algoBase = c.algo.split(/[·,]/)[0].trim() || c.word;
    c.ar = T.aspectOf(orientation);
    return c;
  };
  const sv = (c, label) => { const s = c.specs.find((x) => x.label.toLowerCase() === label.toLowerCase()); return s ? s.value : ''; };

  const mkPrint = (c, shape, cls, o) => {
    const p = el('span', `spl-print${cls ? ` ${cls}` : ''}`, { attrs: { role: 'img', 'aria-label': `${c.title}, ${c.algo}`.replace(/^, |, $/g, '') } });
    p.dataset.shape = shape; p.style.setProperty('--ar', c.ar);
    if (c.is3d) { p.dataset['3d'] = '1'; if (c.art && c.art.model) p.dataset.model = c.art.model; p.dataset.hint = 'Drag to rotate'; }
    c.prints.push({ el: p, shape, disc: !!(o && o.disc), main: !!(o && o.main) });
    return p;
  };
  const mkCrop = (c, z, x, y, cls) => {
    const p = el('span', `spl-crop${cls ? ` ${cls}` : ''}`, { attrs: { role: 'img', 'aria-label': `${c.title}, detail` } });
    c.crops.push({ el: p, z, x, y });
    return p;
  };
  const mkH = (c, word, maxh, cls) => {
    const h = el('span', `spl-hw${cls ? ` ${cls}` : ''}`);
    c.words.push({ host: h, kind: 'h', word, maxh });
    buildH(h, word, maxh);
    return h;
  };
  const mkV = (c, word, down, cls) => {
    const h = el('span', `spl-vw${cls ? ` ${cls}` : ''}`);
    c.words.push({ host: h, kind: 'v', word, down });
    buildV(h, word, down);
    return h;
  };
  const mkActions = (c, cls) => {
    const a = el('div', `spl-acts${cls ? ` ${cls}` : ''}`, { attrs: { 'data-slot': 'actions' } });
    c.actions.forEach((x) => a.appendChild(button(x)));
    return a;
  };
  const mkSpec = (list) => {
    const dl = el('dl', 'spl-spec');
    list.forEach((s) => { dl.appendChild(el('dt', null, { text: s.label })); dl.appendChild(el('dd', null, { text: s.value })); });
    return dl;
  };
  const mkCap = (c, o) => {
    o = o || {};
    const cap = el('div', `spl-cap${o.cls ? ` ${o.cls}` : ''}`);
    cap.appendChild(el('h3', 'spl-title', { text: c.title }));
    if (!o.noNote) cap.appendChild(el('p', 'spl-note', { text: o.firstSentence ? T.firstSentence(c.desc) + (c.live3d ? HINT3 : '') : c.note }));
    if (o.specs !== false && c.specs.length) cap.appendChild(mkSpec(o.specs || c.specs));
    if (!o.noActions) cap.appendChild(mkActions(c));
    return cap;
  };

  /* ------------------------------------------------------------------ the 16 layouts */
  const LAYOUT = {
    'vertical-word': (c) => [mkV(c, c.word, false), mkPrint(c, 'rect', 'framed', { main: true }), mkCap(c)],
    'spec-sheet': (c) => [mkV(c, c.word, false), mkPrint(c, 'rect', '', { main: true }), mkCap(c)],
    'text-wrap': (c) => {
      const disc = el('div', 'spl-disc', { kids: [mkPrint(c, 'circle', '', { main: true, disc: true })] });
      if (c.is3d) disc.appendChild(el('span', 'spl-3dhint', { text: 'Drag to rotate', attrs: { 'aria-hidden': 'true' } }));
      const p = el('p', 'spl-wrap-txt');
      p.appendChild(el('b', null, { text: c.title }));
      p.appendChild(el('span', 'al', { text: c.algoBase }));
      const set = [sv(c, 'Paper') && `Set on ${sv(c, 'Paper')}`, sv(c, 'Pen') && `in ${sv(c, 'Pen')}`, sv(c, 'Stock') && `on ${sv(c, 'Stock')}`].filter(Boolean);
      p.appendChild(D.createTextNode(`${c.note}${set.length ? ` ${set.join(', ')}.` : ''} `));
      const len = sv(c, 'Line'); const st = sv(c, 'Strokes'); const tm = sv(c, 'Plot time');
      if (len && st && tm) p.appendChild(el('span', 'fact', { text: `The pen travels ${len} in ${st} strokes, about ${tm} on the plotter.` }));
      return [disc, p, mkActions(c)];
    },
    'waterfall': (c) => {
      const wf = el('div', 'spl-wf');
      T.WATERFALL.forEach((r, k) => {
        const row = el('div', 'spl-wf-row');
        const px = el('span', 'spl-wf-px'); px.dataset.px = String(k);
        const w = el('span', 'spl-wf-w'); w.style.setProperty('--s', String(r.scale));
        const hw = mkH(c, c.word, 2000); hw.classList.add('spl-wf-h'); w.appendChild(hw);
        const mini = el('canvas', 'spl-wf-mini', { attrs: { 'aria-hidden': 'true', width: 64, height: 48 } }); mini.dataset.frac = String(r.pen / 100);
        c.stages.push({ el: mini, frac: r.pen / 100, fixed: [64, 48] });
        row.append(px, w, el('span', 'spl-wf-pen', { text: `PEN ${r.pen}%` }), mini);
        wf.appendChild(row);
      });
      return [wf, el('div', 'spl-wf-side', { kids: [mkPrint(c, 'rect', 'framed', { main: true }), mkCap(c, { specs: false, noActions: true }), mkActions(c)] })];
    },
    'knockout': (c) => {
      const ko = el('h3', 'spl-ko-word', { text: c.word, attrs: { 'aria-label': c.word } });
      c.ko = ko;
      return [el('div', 'spl-ko-band', { kids: [ko] }),
        el('div', 'spl-ko-foot', { kids: [mkPrint(c, 'square', 'framed', { main: true }),
          el('div', null, { kids: [el('h3', 'spl-title', { text: c.title }), el('p', 'spl-note', { text: c.desc })] }),
          c.short.length ? mkSpec(c.short) : null, mkActions(c, 'spl-ko-acts')] })];
    },
    'full-sheet': (c) => {
      const cap = el('div', 'spl-cap spl-sheet-cap', { kids: [mkH(c, c.word, 72), el('h3', 'spl-title', { text: c.title }), el('p', 'spl-note', { text: c.note }), c.specs.length ? mkSpec(c.specs) : null, mkActions(c)] });
      return [mkPrint(c, 'rect', '', { main: true }), cap];
    },
    'full-bleed-band': (c) => [
      el('div', 'spl-bleed-art', { kids: [mkPrint(c, 'band', '', { main: true })] }),
      el('div', 'spl-cband', { kids: [el('div', 'spl-band-w', { kids: [mkH(c, c.word, 74)] }),
        el('div', null, { kids: [el('h3', 'spl-title', { text: c.title }), el('p', 'spl-note', { text: T.firstSentence(c.desc) + (c.live3d ? HINT3 : '') })] }),
        c.short.length ? mkSpec(c.short) : null, mkActions(c)] })],
    'diptych': (c) => [
      el('div', 'spl-dip-l', { kids: [mkPrint(c, 'square', 'framed', { main: true })] }),
      el('div', 'spl-dip-r', { kids: [mkH(c, c.word, 120), mkCap(c)] })],
    'specimen-frame': (c) => [
      el('div', 'spl-spm-label', { text: `Specimen Nº ${T.pad2(c.index + 1)} · ${c.algoBase}` }),
      el('div', 'spl-spm-frame', { kids: [mkPrint(c, 'rect', '', { main: true })] }),
      el('h3', 'spl-title', { text: c.title }),
      el('p', 'spl-note', { text: T.firstSentence(c.desc) + (c.live3d ? HINT3 : '') }),
      el('div', 'spl-spm-meta', { kids: c.short.map((s) => el('span', null, { text: s.value })) }),
      mkActions(c)],
    'big-numeral': (c) => [
      el('div', 'spl-num-col', { kids: [mkH(c, T.pad2(c.index + 1), 300, 'num'), mkCap(c, { specs: false })] }),
      mkPrint(c, 'rect', 'framed', { main: true })],
    'words-both-sides': (c) => [
      mkV(c, c.word, false),
      el('div', 'spl-vb-mid', { kids: [mkPrint(c, 'rect', '', { main: true })] }),
      mkV(c, c.algoBase === c.word ? (c.title.split(/\s+/)[0] || c.word) : c.algoBase, true, 'vr'),
      mkCap(c, { cls: 'spl-vb-cap', specs: c.short })],
    'plot-stages': (c) => {
      const stg = el('div', 'spl-stg');
      T.STAGES.forEach((f, k) => {
        const cv = el('canvas', 'spl-stage', { attrs: { 'aria-hidden': 'true' } }); c.stages.push({ el: cv, frac: f });
        stg.appendChild(el('figure', 'spl-stg-i', { kids: [cv, el('figcaption', null, { text: `Stage ${k + 1} · ${Math.round(f * 100)}%` })] }));
      });
      stg.appendChild(el('figure', 'spl-stg-i', { kids: [mkPrint(c, 'rect', '', { main: true }), el('figcaption', null, { text: 'Plotted · 100%' })] }));
      return [stg, mkCap(c, { cls: 'spl-stg-cap', specs: c.short })];
    },
    'knockout-title': (c) => [
      el('div', 'spl-kt-art', { kids: [mkPrint(c, 'band', '', { main: true }), el('div', 'spl-kt-band', { kids: [mkH(c, c.word, 150, 'inv')] })] }),
      el('div', 'spl-kt-foot', { kids: [el('div', null, { kids: [el('h3', 'spl-title', { text: c.title }), el('p', 'spl-note', { text: c.desc })] }),
        c.short.length ? mkSpec(c.short) : null, mkActions(c)] })],
    'detail-full': (c) => {
      const d = T.DETAIL; const m = T.cropMark(d.z, d.x, d.y);
      const mark = el('i', 'spl-dt-mark', { attrs: { 'aria-hidden': 'true' } });
      mark.style.cssText = `--z:${d.z};--x:${f2(m.left / 100 + 0.5 / d.z)};--y:${f2(m.top / 100 + 0.5 / d.z)}`;
      return [el('div', 'spl-dt-big', { kids: [mkCrop(c, d.z, d.x, d.y), el('span', 'spl-dt-lab', { text: `Detail · ${d.z}×` })] }),
        el('div', 'spl-dt-side', { kids: [el('div', 'spl-dt-full', { kids: [mkPrint(c, 'rect', 'framed', { main: true }), mark] }), mkCap(c, { specs: c.short })] })];
    },
    'four-crops': (c) => [
      el('div', 'spl-g4', { kids: T.CROPS_4.map((k, i) => el('div', 'spl-g4-c', { kids: [mkCrop(c, k.z, k.x, k.y), el('span', 'spl-g4-n', { text: String.fromCharCode(65 + i) })] })) }),
      el('div', 'spl-g4-side', { kids: [mkPrint(c, 'rect', 'framed spl-g4-full', { main: true }), mkCap(c, { specs: c.short })] })],
    'pull-quote': (c) => [
      el('blockquote', 'spl-pq', { kids: [el('p', null, { text: `“${T.firstSentence(c.desc).replace(/\.$/, '')}.”` }),
        el('footer', null, { text: [c.title, c.algoBase, (sv(c, 'Paper') || '').split(' ')[0]].filter(Boolean).join(' · ') })] }),
      el('div', 'spl-pq-side', { kids: [mkPrint(c, 'rect', 'framed', { main: true }), mkActions(c)] })],
  };

  /* ------------------------------------------------------------------ build */
  const applyVars = (root, c) => {
    Object.keys(c.vars).forEach((k) => root.style.setProperty(k, c.vars[k]));
    root.dataset.cls = (c.cw && c.cw.class) || '';
  };

  const render = (layoutId, o) => {
    const build = LAYOUT[layoutId];
    if (!build) throw new Error(`StartPagePlateLayouts: unknown layout "${layoutId}"`);
    o = o || {};
    if (!o.art || typeof o.art.svg !== 'string') throw new Error('StartPagePlateLayouts.render: art needs { id, svg }');
    const c = makeCtx(layoutId, o);
    const root = el('article', `spl spl-lay-${layoutId}`, { attrs: { 'aria-label': `Plate ${T.pad2(c.index + 1)}: ${c.title}` } });
    root.dataset.layout = layoutId; root.dataset.orientation = c.orientation;
    applyVars(root, c);
    const summary = c.summary != null ? String(c.summary) : [c.algo].concat(c.specs.slice(0, 3).map((s) => s.value)).filter(Boolean).join(' · ');
    const head = el('header', 'spl-h', { kids: [
      el('span', 'spl-no', { kids: [D.createTextNode(`Plate ${T.pad2(c.index + 1)}${c.total ? ` / ${T.pad2(c.total)}` : ''} · `), el('b', null, { text: c.title })] }),
      el('span', 'spl-hs', { kids: [el('i', 'spl-sw', { attrs: { 'aria-hidden': 'true' } }), el('span', null, { text: summary })] }),
      el('div', 'spl-tools', { attrs: { 'data-slot': 'tools' } })] });
    const body = el('div', 'spl-b');
    build(c).filter(Boolean).forEach((n) => body.appendChild(n));
    root.append(head, body);
    root._spl = c;
    if (o.autoMount !== false) whenConnected(root);
    return root;
  };

  /* ------------------------------------------------------------------ mount, recolor, destroy */
  const whenConnected = (root) => {
    let n = 0;
    const tick = () => {
      const c = root._spl;
      if (!c || c.mounted || c.dead) return;
      if (root.isConnected) { mount(root); return; }
      // The window may be gone by now (teardown, closed window): stop quietly.
      if (++n < 240 && typeof W.requestAnimationFrame === 'function') W.requestAnimationFrame(tick);
    };
    W.requestAnimationFrame(tick);
  };
  const artColorway = (c, disc) => ({ paper: disc ? c.vars['--spl-disc'] : c.vars['--spl-paper'], ink: c.vars['--spl-art'], ink2: null });

  const afterLayout = (c, root) => {
    root.querySelectorAll('[data-px]').forEach((x) => {
      const row = x.parentElement; const svg = row && row.querySelector('svg.spl-hword');
      if (!svg) return;
      const hpx = svg.getBoundingClientRect().height; const bh = +svg.dataset.boxH || 0;
      x.textContent = hpx && bh ? `${Math.round(hpx / bh * 100)} PX` : '';
    });
  };
  const redrawStages = (c) => {
    c.stages.forEach((s) => {
      const w = s.fixed ? s.fixed[0] : (s.el.clientWidth || 0); const h = s.fixed ? s.fixed[1] : w * 0.75;
      if (w < 8) return;
      drawPartial(c, s.el, s.frac, w, h);
    });
  };

  const mount = (root) => {
    const c = root && root._spl;
    if (!c || c.dead) return Promise.resolve(root);
    c.mounted = true;
    const Ink = ink();
    const jobs = [];
    const O3 = Vectura.StartPageOrbit3D;
    if (Ink) {
      c.prints.forEach((p) => {
        // A 3D piece is a live, drag-to-rotate model (idle sway, plot-in at 30 % visible), drawn in the plate's colors.
        if (c.art && c.art.model && O3 && p.main) {
          try {
            O3.mount(p.el, { model: c.art.model, colorway: () => artColorway(c, p.disc), hint: false, plotted: !!c.art.seen, label: `${c.title}, ${c.algo}`.replace(/^, |, $/g, '') });
            p.el.classList.add('sp-print-3d');
            return;
          } catch (err) { if (W.console) W.console.warn('[PlateLayouts] 3D model failed, using the drawing', err); if (p.el._vorbit) p.el._vorbit.destroy(); }
        }
        const user = p.main ? c.frameOverride : null;
        const fit = user && user.fit === 'contain' ? 'contain' : 'cover';
        const job = Ink.mount(p.el, c.art, { label: false, pad: 0, fit, frame: T.frameFor(p.shape, user), colorway: artColorway(c, p.disc) });
        // A 3D Scene keeps exactly this drawing (the app's fills and shadow shapes) and turns it with real renders.
        const SO = Vectura.StartPageSceneOrbit;
        if (p.main && c.art && c.art.scene && SO) {
          job.then(() => {
            if (c.dead || !p.el._spInk) return;
            const so = SO.attach(p.el, { payload: c.art.scene.payload, label: `${c.title}, ${c.algo}`.replace(/^, |, $/g, ''), hint: false });
            if (!so) return;
            p.el.dataset['3d'] = '1'; p.el.dataset.hint = 'Drag to rotate';
            so.loaded.then((pl) => { if (!pl) { delete p.el.dataset['3d']; delete p.el.dataset.hint; } });
          }, () => {});
        }
        jobs.push(job);
      });
      c.crops.forEach((k) => {
        jobs.push(Ink.mount(k.el, c.art, { label: false, pad: 0, fit: 'cover', frame: { z: k.z, cx: k.x, cy: k.y }, colorway: artColorway(c, false) }));
      });
      if (c.ko) {
        jobs.push(Ink.fillWord(c.ko, c.word, c.art, { fit: true, min: 28, max: 230, outline: true, frame: c.frameOverride ? T.frameFor('rect', c.frameOverride) : null, colorway: { paper: c.vars['--spl-paper'], ink: c.vars['--spl-art'], ink2: null } }));
      }
    }
    c.stages.forEach((s) => { if (ro && !s.fixed) { s.el._splRedraw = () => redrawStages(c); ro.observe(s.el); } });
    redrawStages(c);
    const settle = Promise.all(jobs).then(() => { if (!c.dead) { redrawStages(c); afterLayout(c, root); } return root; }, () => root);
    W.requestAnimationFrame(() => { if (!c.dead) afterLayout(c, root); });
    return settle;
  };

  const recolor = (root, cw) => {
    const c = root && root._spl;
    if (!c) return;
    c.cw = cw; c.vars = T.plateVars(cw || {});
    applyVars(root, c);
    c.prints.forEach((p) => { const h = p.el._spInk; if (h) h.setColorway(artColorway(c, p.disc)); if (p.el._vorbit) p.el._vorbit.setColorway(() => artColorway(c, p.disc)); });
    c.crops.forEach((k) => { const h = k.el._spInk; if (h) h.setColorway(artColorway(c, false)); });
    if (c.ko && c.ko._spWord) c.ko._spWord.setColorway({ paper: c.vars['--spl-paper'], ink: c.vars['--spl-art'], ink2: null });
    redrawStages(c);
  };

  const destroy = (root) => {
    const c = root && root._spl;
    if (!c) return;
    c.dead = true;
    const Ink = ink();
    if (Ink) {
      c.prints.forEach((p) => { if (p.el._vorbit) p.el._vorbit.destroy(); if (p.el._spScene) p.el._spScene.destroy(); Ink.unmount(p.el); });
      c.crops.forEach((k) => Ink.unmount(k.el));
      if (c.ko) Ink.unmount(c.ko);
    }
    c.stages.forEach((s) => { if (ro) ro.unobserve(s.el); s.el._splRedraw = null; });
    // the word-fill gradient this plate put in the shared #spe-defs block (colors.js) goes with it
    [root._speUid, root._speUidT].forEach((uid) => { if (!uid) return; const g = D.getElementById(uid); if (g && g.parentNode) g.parentNode.removeChild(g); });
  };

  /* fonts: the ink box of every word is measured again once the face is really there */
  const refitAll = () => {
    metricsCache.clear();
    D.querySelectorAll('.spl').forEach((root) => {
      const c = root._spl; if (!c || c.dead) return;
      c.words.forEach((w) => { if (w.kind === 'h') buildH(w.host, w.word, w.maxh); else buildV(w.host, w.word, w.down); });
      afterLayout(c, root);
    });
  };
  try { if (D.fonts && D.fonts.addEventListener) D.fonts.addEventListener('loadingdone', refitAll); } catch (e) { /* no FontFaceSet events */ }

  Vectura.StartPagePlateLayouts = { LAYOUTS: T.LAYOUTS.map((l) => l.id), NAMES: T.LAYOUTS, render, mount, recolor, destroy, button, refit: refitAll };
})();
