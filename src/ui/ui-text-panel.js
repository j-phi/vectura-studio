/* ============================================================================
 * Vectura Studio — Bespoke Text Panel  (synthesis design port)
 * ----------------------------------------------------------------------------
 * Tabbed Type / Layout / Stroke / Fill panel with a live opentype-traced
 * specimen, scrub fields, and a rich font picker. Replaces the generic control
 * list for `text` layers via the early-return hook in
 * src/ui/panels/algo-config-panel.js.
 *
 * Design source: design-explorations/text-panel-synthesis.html
 *
 * ── INTEGRATION CONTRACT ───────────────────────────────────────────────────
 *   window.Vectura.UI.TextPanel = { build(ui, layer, container) }
 *   ui.app.pushHistory(), ui.app.regen(), ui.storeLayerParams(layer),
 *   ui.updateFormula(). Param-write commit pattern (one undo step per gesture):
 *     pushHistory(); layer.params[k]=v; storeLayerParams(layer); regen();
 *     updateFormula(); — fired ONCE on release; live drag updates the DOM only.
 *
 * The editable specimen IS the text field (writes layer.params.text). Specimen
 * rendering is owned by window.Vectura.UI.TextSpecimen (this panel only builds
 * the DOM + view prefs and calls spec.render(layer, view)). Every bespoke class
 * is prefixed `vtp-` and styled by the components.css "VECTURA TEXT PANEL" block.
 * ========================================================================== */
(function () {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.UI = Vectura.UI || {};

  // localStorage keys — specimen view prefs are UI-only (never layer.params).
  const LS = {
    collapsed: 'vectura_spec_collapsed',
    guides: 'vectura_spec_guides',
    outlines: 'vectura_spec_outlines',
    fillLines: 'vectura_spec_filllines',
    favs: 'vectura_font_favs',
    recent: 'vectura_font_recent',
  };

  const STYLE_CHIPS = [
    ['sans-serif', 'Sans'], ['serif', 'Serif'], ['display', 'Display'],
    ['handwriting', 'Script'], ['monospace', 'Mono'],
  ];
  const POPULAR_N = 60;
  const MATCH_CAP = 200;

  // SVG icon snippets (inner markup; the wrapper sets viewBox-agnostic sizing).
  const I = {
    fill: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/></svg>',
    leading: '<svg viewBox="0 0 24 24"><path d="M7 4v16M11 7l-4-3-4 3M11 17l-4 3-4-3M15 7h6M15 12h6M15 17h6"/></svg>',
    tracking: '<svg viewBox="0 0 24 24"><path d="M3 6v12M21 6v12M8 12h2M14 12h2"/><path d="M6 9l-2 3 2 3M18 9l2 3-2 3"/></svg>',
    vscale: '<svg viewBox="0 0 24 24"><path d="M12 3v18M9 6l3-3 3 3M9 18l3 3 3-3"/></svg>',
    hscale: '<svg viewBox="0 0 24 24"><path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>',
    kerning: '<svg viewBox="0 0 24 24"><path d="M4 6l4 12M4 18l4-12M20 6v12M16 18l4-12"/></svg>',
    baseline: '<svg viewBox="0 0 24 24"><path d="M4 18h16M7 14V6M5 8l2-2 2 2M13 14h6"/></svg>',
    rotation: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>',
    jitter: '<svg viewBox="0 0 24 24"><path d="M3 14c2-4 3 4 5 0s3 4 5 0 3 4 5 0 3 4 3 4"/></svg>',
    indL: '<svg viewBox="0 0 24 24"><path d="M6 4v16M10 8l4 4-4 4M14 12h6"/></svg>',
    indR: '<svg viewBox="0 0 24 24"><path d="M18 4v16M14 8l-4 4 4 4M10 12H4"/></svg>',
    indFirst: '<svg viewBox="0 0 24 24"><path d="M10 6l4 3-4 3M4 6h4M4 12h16M4 18h16"/></svg>',
    spBefore: '<svg viewBox="0 0 24 24"><path d="M12 3v6M9 6l3-3 3 3M5 13h14M5 17h14"/></svg>',
    spAfter: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 11h14M12 21v-6M9 18l3 3 3-3"/></svg>',
    weight: '<svg viewBox="0 0 24 24"><path d="M4 8h16M4 12h16M4 16h16" stroke-width="2"/></svg>',
    smooth: '<svg viewBox="0 0 24 24"><path d="M3 18C8 18 8 6 13 6s5 12 8 12"/></svg>',
    simplify: '<svg viewBox="0 0 24 24"><path d="M4 18L9 9l4 5 3-6 4 10" stroke-width="1.4"/></svg>',
    fillInset: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><rect x="7.5" y="7.5" width="9" height="9" rx="1"/></svg>',
    up: '<svg viewBox="0 0 10 10"><path d="M2 7L5 3L8 7" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>',
    down: '<svg viewBox="0 0 10 10"><path d="M2 3L5 7L8 3" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>',
    chev: '<svg viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>',
  };

  // Scrub field registry: param key + range/step/precision/perpx + chrome.
  const SCRUBS = {
    fill:      { param: 'fillRatio', min: 0.3, max: 1, step: 0.01, dec: 2, perpx: 0.005, label: 'Frame Fill', hint: '↔ drag', unit: '×', icon: I.fill },
    size:      { param: 'fontSize', min: 4, max: 160, step: 1, dec: 0, perpx: 0.5, label: 'Size', hint: '↔ drag', unit: 'mm', ftxt: 'TT', steppers: true, preset: true },
    leading:   { param: 'lineHeight', min: 0.8, max: 3, step: 0.05, dec: 2, perpx: 0.01, label: 'Leading', hint: '↔', icon: I.leading },
    tracking:  { param: 'tracking', min: -4, max: 24, step: 0.5, dec: 1, perpx: 0.12, label: 'Tracking', hint: '↔', icon: I.tracking },
    vscale:    { param: 'vScale', min: 50, max: 200, step: 1, dec: 0, perpx: 0.6, label: 'V-Scale', hint: '↔', unit: '%', icon: I.vscale },
    hscale:    { param: 'hScale', min: 50, max: 200, step: 1, dec: 0, perpx: 0.6, label: 'H-Scale', hint: '↔', unit: '%', icon: I.hscale },
    kerning:   { param: 'kerning', min: -50, max: 200, step: 1, dec: 0, perpx: 1, label: 'Kerning', hint: '↔', icon: I.kerning },
    baseline:  { param: 'baselineShift', min: -20, max: 20, step: 0.5, dec: 1, perpx: 0.1, label: 'Baseline', hint: '↔', unit: 'mm', icon: I.baseline },
    rotation:  { param: 'charRotation', min: -180, max: 180, step: 1, dec: 0, perpx: 0.8, label: 'Character Rotation', hint: '↔ drag · Shift = ×10', unit: '°', icon: I.rotation, steppers: true },
    jitter:    { param: 'jitter', min: 0, max: 3, step: 0.1, dec: 1, perpx: 0.012, label: 'Character Jitter', hint: '↔ drag', icon: I.jitter },
    offsetX:   { param: 'offsetX', min: -200, max: 200, step: 1, dec: 0, perpx: 1, label: 'Offset X', hint: '↔', unit: 'mm', icon: I.hscale },
    offsetY:   { param: 'offsetY', min: -200, max: 200, step: 1, dec: 0, perpx: 1, label: 'Offset Y', hint: '↔', unit: 'mm', icon: I.vscale },
    indL:      { param: 'indentLeft', min: 0, max: 100, step: 1, dec: 0, perpx: 0.5, label: 'Left Indent', hint: '↔', unit: 'mm', icon: I.indL },
    indR:      { param: 'indentRight', min: 0, max: 100, step: 1, dec: 0, perpx: 0.5, label: 'Right Indent', hint: '↔', unit: 'mm', icon: I.indR },
    indFirst:  { param: 'indentFirst', min: 0, max: 100, step: 1, dec: 0, perpx: 0.5, label: 'First-Line Indent', hint: '↔', unit: 'mm', icon: I.indFirst },
    spBefore:  { param: 'spaceBefore', min: 0, max: 60, step: 1, dec: 0, perpx: 0.4, label: 'Space Before', hint: '↔', unit: 'mm', icon: I.spBefore },
    spAfter:   { param: 'spaceAfter', min: 0, max: 60, step: 1, dec: 0, perpx: 0.4, label: 'Space After', hint: '↔', unit: 'mm', icon: I.spAfter },
    weight:    { param: 'outlineThickness', min: 1, max: 100, step: 1, dec: 0, perpx: 0.4, label: 'Outline Weight', hint: '↔ drag · 1–100 · thickens specimen', unit: 'px', icon: I.weight, steppers: true },
    inkOverlap: { param: 'inkOverlap', min: 0, max: 60, step: 5, dec: 0, perpx: 0.4, label: 'Ink Overlap', hint: '↔ drag · pass overlap · % of pen width', unit: '%', icon: I.weight, steppers: true },
    // Bezier-block "Smoothness" and the common "Smoothing" both drive the single
    // `smoothing` param (kept in sync); the bezier block is web-only + hides on merge.
    smoothness: { param: 'smoothing', min: 0, max: 1, step: 0.05, dec: 2, perpx: 0.005, label: 'Smoothness', hint: '↔ drag · 0–1', icon: I.smooth },
    smoothing:  { param: 'smoothing', min: 0, max: 1, step: 0.05, dec: 2, perpx: 0.005, label: 'Smoothing', hint: '↔ drag · 0–1', icon: I.smooth },
    simplify:   { param: 'simplify', min: 0, max: 1, step: 0.05, dec: 2, perpx: 0.005, label: 'Simplify', hint: '↔ drag · 0–1', icon: I.simplify },
    fillInset:  { param: 'fillInset', min: 0.2, max: 8, step: 0.1, dec: 1, perpx: 0.03, label: 'Distance', hint: '↔', unit: 'mm', icon: I.fillInset },
    strikeOff:  { param: 'strikethroughOffset', min: -20, max: 20, step: 0.5, dec: 1, perpx: 0.1, label: 'Strike Height', hint: '↕ drag · + raises', unit: 'mm', icon: I.baseline },
    stWeight:   { param: 'strikethroughThickness', min: 1, max: 40, step: 1, dec: 0, perpx: 0.3, label: 'Strike Weight', hint: '↔ drag · pen passes', unit: 'px', icon: I.weight, steppers: true },
    ulOff:      { param: 'underlineOffset', min: -20, max: 20, step: 0.5, dec: 1, perpx: 0.1, label: 'Underline Position', hint: '↕ drag · + lowers', unit: 'mm', icon: I.baseline },
    ulWeight:   { param: 'underlineThickness', min: 1, max: 40, step: 1, dec: 0, perpx: 0.3, label: 'Underline Weight', hint: '↔ drag · pen passes', unit: 'px', icon: I.weight, steppers: true },
    ulBreakGap: { param: 'underlineBreakGap', min: 0, max: 8, step: 0.25, dec: 2, perpx: 0.03, label: 'Break Padding', hint: '↔ drag', unit: 'mm', icon: I.tracking },
  };

  const ALIGN_MAP = {
    left: 'left', center: 'center', right: 'right',
    jleft: 'justify-left', jcenter: 'justify-center', jright: 'justify-right', jall: 'justify-all',
  };
  const STYLE_MAP = { caps: 'allCaps', smcaps: 'smallCaps', super: 'superscript', sub: 'subscript', under: 'underline', strike: 'strikethrough' };
  const OT_MAP = { lig: 'otLigatures', ctx: 'otContextual', disc: 'otDiscretionary', swash: 'otSwash', sty: 'otStylistic', frac: 'otFractions' };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, f) => { const n = parseFloat(v); return isFinite(n) ? n : f; };
  const prettify = (s) => String(s || '').split(/[-_\s]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const catLabel = (c) => ({ 'sans-serif': 'Sans', serif: 'Serif', display: 'Display', handwriting: 'Script', monospace: 'Mono' }[c] || 'Sans');
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } };

  function scrubHTML(field, cfg) {
    const steppers = cfg.steppers
      ? `<div class="vtp-scrub-steppers"><button type="button" data-dir="1" aria-label="Increase ${cfg.label}">${I.up}</button><button type="button" data-dir="-1" aria-label="Decrease ${cfg.label}">${I.down}</button></div>`
      : '';
    const unit = cfg.unit ? `<span class="vtp-unit">${cfg.unit}</span>` : '';
    const preset = cfg.preset ? `<button type="button" class="vtp-scrub-preset" title="presets" aria-label="${cfg.label} presets">${I.chev}</button>` : '';
    const gicon = cfg.ftxt
      ? `<span class="vtp-gicon"><span class="vtp-ftxt">${cfg.ftxt}</span></span>`
      : `<span class="vtp-gicon">${cfg.icon || ''}</span>`;
    return `<div class="vtp-scrub-name" data-scrubname="${field}">${cfg.label} <span class="vtp-drag-hint">${cfg.hint || '↔'}</span></div>`
      + `<div class="vtp-scrub" data-field="${field}" data-param="${cfg.param}" data-min="${cfg.min}" data-max="${cfg.max}" data-step="${cfg.step}" data-dec="${cfg.dec}" data-perpx="${cfg.perpx}">`
        + `<div class="vtp-scrub-handle" tabindex="0" role="slider" aria-label="${cfg.label}" aria-valuemin="${cfg.min}" aria-valuemax="${cfg.max}">${gicon}</div>`
        + steppers
        + `<input type="text" inputmode="decimal" aria-label="${cfg.label} value">`
        + unit + preset
      + '</div>';
  }

  // ── module-level singleton so build() can tear down the prior instance ──
  let CURRENT = null;

  function build(ui, layer, container) {
    if (CURRENT) { try { CURRENT.destroy(); } catch (_) { /* ignore */ } CURRENT = null; }
    if (!container) return;
    container.innerHTML = '';
    CURRENT = createPanel(ui, layer, container);
  }

  function createPanel(ui, layer, container) {
    const GF = Vectura.GoogleFonts || {};
    const DEF = (Vectura.ALGO_DEFAULTS && Vectura.ALGO_DEFAULTS.text) || {};
    const isWeb = (v) => (GF.isWebFontKey ? GF.isWebFontKey(v) : String(v || '').startsWith('google:'));
    const keyToId = (v) => (GF.keyToId ? GF.keyToId(v) : String(v || '').replace(/^google:/, ''));
    const idToKey = (id) => (GF.idToKey ? GF.idToKey(id) : `google:${id}`);

    // Vectura is ONE family. Its slant/width variants are *styles* (chosen in the
    // Style select), not separate fonts — so the picker lists a single Vectura row.
    const SF = Vectura.StrokeFont || {};
    const builtinFamily = SF.family || { id: 'vectura', label: 'Vectura' };
    const builtinStyles = (SF.styles && SF.styles.length ? SF.styles : null) || [{ id: 'sans', label: 'Regular' }];
    const styleIds = builtinStyles.map((s) => s.id);
    const isBuiltinId = (v) => v === builtinFamily.id || styleIds.indexOf(v) >= 0;
    const styleLabelOf = (v) => { const s = builtinStyles.find((x) => x.id === v); return s ? s.label : builtinStyles[0].label; };
    const builtinValues = [builtinFamily.id];
    const strokeLabel = { [builtinFamily.id]: builtinFamily.label };
    builtinStyles.forEach((s) => { strokeLabel[s.id] = builtinFamily.label; });

    let families = (typeof GF.getFamilies === 'function' && GF.getFamilies()) || [];
    let idMap = {};
    families.forEach((f) => { idMap[f.id] = f; });

    const listeners = [];
    const listen = (t, e, f, o) => { if (!t) return; t.addEventListener(e, f, o); listeners.push([t, e, f, o]); };
    // Standalone widget instances (each owns listeners outside `listeners`) torn
    // down explicitly in destroy() — e.g. the fill-angle radial dial.
    const dials = [];

    const viewPrefs = {
      guides: lsGet(LS.guides, 'frame'),
      showOutlines: !!lsGet(LS.outlines, false),
      showFillLines: !!lsGet(LS.fillLines, false),
    };
    let favs = lsGet(LS.favs, []);
    let recent = lsGet(LS.recent, []);
    let activeTab = 'type';
    let textTimer = null;
    // Active scrub gesture's abort handle — lets destroy() tear down a drag that
    // is still in flight (e.g. async font-load → regen → rebuild mid-scrub) so no
    // detached-DOM/window listener survives to fire flush() on a dead instance.
    let activeFinish = null;

    // ── DOM skeleton ──────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'vtp-panel';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Text layer settings');
    root.innerHTML = skeleton();
    container.appendChild(root);

    const q = (sel) => root.querySelector(sel);
    const qa = (sel) => Array.from(root.querySelectorAll(sel));
    const ref = (name) => root.querySelector(`[data-ref="${name}"]`);

    // ── host commit helpers ─────────────────────────────────────────────────
    const pushHist = () => { try { ui.app && ui.app.pushHistory && ui.app.pushHistory(); } catch (_) { /* */ } };
    const flush = () => {
      try { ui.storeLayerParams && ui.storeLayerParams(layer); } catch (_) { /* */ }
      try { ui.app && ui.app.regen && ui.app.regen(); } catch (_) { /* */ }
      try { ui.updateFormula && ui.updateFormula(); } catch (_) { /* */ }
      renderSpec();
    };
    const setParam = (key, value) => { pushHist(); layer.params[key] = value; flush(); };

    // ── specimen controller ─────────────────────────────────────────────────
    const specTextEl = ref('specText');
    const refs = {
      stage: ref('stage'),
      specText: specTextEl,
      guideSvg: ref('guideSvg'),
      fillSvg: ref('fillSvg'),
      outlineSvg: ref('outlineSvg'),
    };
    let spec = null;
    try { spec = Vectura.UI.TextSpecimen && Vectura.UI.TextSpecimen.create(refs); } catch (_) { spec = null; }

    const currentView = () => ({
      guides: viewPrefs.guides,
      showOutlines: viewPrefs.showOutlines,
      showFillLines: viewPrefs.showFillLines,
      editing: document.activeElement === specTextEl,
    });
    function renderSpec() {
      try { if (spec && spec.render) spec.render(layer, currentView()); } catch (_) { /* never throw */ }
      updateCaption();
      updateLegend();
    }

    // ── face naming ──────────────────────────────────────────────────────
    const faceName = (v) => {
      if (isWeb(v)) { const f = idMap[keyToId(v)]; return (f && f.family) || prettify(keyToId(v)); }
      return strokeLabel[v] || prettify(v);
    };
    const faceCss = (v) => {
      if (isWeb(v)) { const f = idMap[keyToId(v)]; return f ? `'Vectura WF ${f.family}', sans-serif` : 'inherit'; }
      return 'inherit';
    };
    const faceCat = (v) => { if (isWeb(v)) { const f = idMap[keyToId(v)]; return catLabel(f && f.category); } return 'Stroke'; };
    // Web faces have a real loaded @font-face so their preview name renders in the
    // face itself (faceCss). The built-in Vectura family is generated geometry with
    // NO CSS representation, so its previews used to fall back to the generic UI
    // font — misrepresenting the single-stroke letterforms. Draw the face name from
    // the actual StrokeFont outline instead, so the menu preview matches the plotted
    // glyphs. Returns an inline <svg> string, or '' when unavailable (→ CSS text).
    const strokePreviewSvg = (v, label) => {
      if (!SF.layout) return '';
      const styleId = (v === builtinFamily.id) ? styleIds[0] : (SF.isStyle && SF.isStyle(v) ? v : styleIds[0]);
      let lay = null;
      try { lay = SF.layout(String(label || faceName(v)), { font: styleId, size: 100 }); } catch (_) { lay = null; }
      const paths = lay && lay.paths;
      if (!Array.isArray(paths) || !paths.length) return '';
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      let d = '';
      for (const stroke of paths) {
        if (!Array.isArray(stroke) || stroke.length < 2) continue;
        for (let i = 0; i < stroke.length; i += 1) {
          const pt = stroke[i];
          if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
          d += `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
        }
      }
      if (!d || !Number.isFinite(minX) || maxX <= minX || maxY <= minY) return '';
      const w = maxX - minX; const h = maxY - minY;
      // Height matches the option-name line; width follows the glyph aspect ratio.
      const H = 15; const W = Math.max(1, Math.round(H * (w / h)));
      return `<svg class="vtp-fp-opt-svg" width="${W}" height="${H}" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" `
        + `role="img" aria-label="${faceName(v)}" fill="none" stroke="currentColor" stroke-width="4" `
        + `stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"><path d="${d}"/></svg>`;
    };
    const ensureWeb = (v) => {
      if (isWeb(v) && GF.ensureFont) {
        GF.ensureFont(keyToId(v)).then(() => { syncFontTrigger(); renderSpec(); }).catch(() => {});
      }
    };

    function updateCaption() {
      const p = layer.params; const web = isWeb(p.font); const filled = p.fillEnabled && web;
      const fe = ref('specFace');
      if (fe) fe.textContent = web
        ? `${faceName(p.font)} · ${p.fontWeight || 'Regular'}`
        : `Vectura ${styleLabelOf(p.font)} · ${p.fontWeight || 'Regular'}`;
      const de = ref('specDim');
      if (de) {
        const nLines = String(p.text || '').split('\n').length;
        const dimVal = p.fitToFrame ? `${Number(p.fillRatio || 0).toFixed(2)}× fill` : `${p.fontSize}mm`;
        const wTag = p.outlineStroke ? ` · w${p.outlineThickness}` : '';
        const fTag = filled ? ' · fill' : '';
        de.textContent = `${dimVal} · ${nLines}ln · tr${p.tracking}${wTag}${fTag}`;
      }
    }
    function updateLegend() {
      const p = layer.params; const filled = p.fillEnabled && isWeb(p.font);
      const fl = ref('fillLineToggle'); const lg = ref('fillLegend');
      if (fl) fl.classList.toggle('show', !!filled);
      if (lg) lg.classList.toggle('show', !!filled && viewPrefs.showFillLines);
    }

    // ── scrub fields ──────────────────────────────────────────────────────
    function syncSiblings(param, value, exclude) {
      qa(`.vtp-scrub[data-param="${param}"]`).forEach((s) => {
        const inp = s.querySelector('input');
        if (!inp || inp === exclude) return;
        const dec = parseInt(s.dataset.dec, 10) || 0;
        inp.value = Number(value).toFixed(dec);
        const h = s.querySelector('.vtp-scrub-handle');
        if (h) h.setAttribute('aria-valuenow', String(value));
      });
    }
    function makeScrub(target, field) {
      if (!target) return;
      const cfg = SCRUBS[field];
      const cell = document.createElement('div');
      cell.innerHTML = scrubHTML(field, cfg);
      target.appendChild(cell);

      const scrub = cell.querySelector('.vtp-scrub');
      const input = cell.querySelector('input');
      const handle = cell.querySelector('.vtp-scrub-handle');
      const nameEl = cell.querySelector('.vtp-scrub-name');
      const defVal = (DEF[cfg.param] != null) ? DEF[cfg.param] : cfg.min;

      const clampSnap = (raw) => {
        let v = clamp(num(raw, layer.params[cfg.param] != null ? layer.params[cfg.param] : cfg.min), cfg.min, cfg.max);
        let s = Math.round(v / cfg.step) * cfg.step;
        s = clamp(s, cfg.min, cfg.max);
        return parseFloat(s.toFixed(6));
      };
      const setDisplay = (raw) => {
        const s = clampSnap(raw);
        input.value = s.toFixed(cfg.dec);
        if (handle) handle.setAttribute('aria-valuenow', String(s));
        return s;
      };
      const live = (raw) => { const s = setDisplay(raw); layer.params[cfg.param] = s; syncSiblings(cfg.param, s, input); renderSpec(); };
      const commit = (raw) => { const s = clampSnap(raw); pushHist(); layer.params[cfg.param] = s; setDisplay(s); syncSiblings(cfg.param, s, input); flush(); };

      setDisplay(layer.params[cfg.param] != null ? layer.params[cfg.param] : defVal);

      const beginDrag = (e, origin) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (scrub.classList.contains('disabled')) return;
        if (e.target.closest && e.target.closest('.vtp-scrub-steppers, .vtp-scrub-preset, input')) return;
        e.preventDefault();
        const startX = e.clientX;
        const startVal = num(input.value, layer.params[cfg.param] || 0);
        const pid = e.pointerId;
        // Defer pushHistory() to the FIRST real movement: a bare click (focus/
        // select, or the two pointer cycles of a dblclick-reset) must not record
        // an undo snapshot or fire a regen when layer.params is unchanged.
        let moved = false;
        scrub.classList.add('scrubbing');
        document.body.classList.add('vtp-is-scrubbing');
        try { origin.setPointerCapture(pid); } catch (_) { /* */ }
        const move = (ev) => {
          const dx = ev.clientX - startX;
          if (!moved && dx !== 0) { moved = true; pushHist(); }
          const c = ev.shiftKey ? 10 : 1;
          live(startVal + dx * cfg.perpx * c);
        };
        // opts.abort = teardown (destroy mid-drag): detach everything but never
        // flush()/regen() on a dead instance.
        const finish = (opts) => {
          if (!scrub.classList.contains('scrubbing')) return;
          scrub.classList.remove('scrubbing');
          document.body.classList.remove('vtp-is-scrubbing');
          try { origin.releasePointerCapture(pid); } catch (_) { /* */ }
          origin.removeEventListener('pointermove', move);
          origin.removeEventListener('pointerup', onEnd);
          origin.removeEventListener('pointercancel', onEnd);
          origin.removeEventListener('lostpointercapture', onEnd);
          window.removeEventListener('blur', onEnd);
          activeFinish = null;
          if (moved && !(opts && opts.abort === true)) flush();
        };
        const onEnd = () => finish();
        activeFinish = () => finish({ abort: true });
        origin.addEventListener('pointermove', move);
        origin.addEventListener('pointerup', onEnd);
        origin.addEventListener('pointercancel', onEnd);
        origin.addEventListener('lostpointercapture', onEnd);
        window.addEventListener('blur', onEnd);
      };

      if (handle) {
        listen(handle, 'pointerdown', (e) => beginDrag(e, handle));
        listen(handle, 'dblclick', (e) => { e.preventDefault(); commit(defVal); });
        listen(handle, 'keydown', (e) => {
          const c = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); commit(num(input.value, layer.params[cfg.param]) + cfg.step * c); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); commit(num(input.value, layer.params[cfg.param]) - cfg.step * c); }
          else if (e.key === 'Home') { e.preventDefault(); commit(cfg.min); }
          else if (e.key === 'End') { e.preventDefault(); commit(cfg.max); }
        });
      }
      if (nameEl) {
        listen(nameEl, 'pointerdown', (e) => beginDrag(e, nameEl));
        listen(nameEl, 'dblclick', (e) => { e.preventDefault(); commit(defVal); });
      }
      listen(input, 'change', () => commit(num(input.value, layer.params[cfg.param])));
      listen(input, 'keydown', (e) => {
        const c = e.shiftKey ? 10 : 1;
        if (e.key === 'Enter') { e.preventDefault(); commit(num(input.value, layer.params[cfg.param])); input.blur(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); commit(num(input.value, layer.params[cfg.param]) + cfg.step * c); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); commit(num(input.value, layer.params[cfg.param]) - cfg.step * c); }
      });
      cell.querySelectorAll('.vtp-scrub-steppers button').forEach((b) => {
        listen(b, 'pointerdown', (e) => e.stopPropagation());
        listen(b, 'click', (e) => {
          e.stopPropagation();
          const dir = parseInt(b.dataset.dir, 10) || 0;
          const c = e.shiftKey ? 10 : 1;
          commit(num(input.value, layer.params[cfg.param]) + dir * cfg.step * c);
        });
      });
      const presetBtn = cell.querySelector('.vtp-scrub-preset');
      if (presetBtn) {
        const presets = [cfg.min, (cfg.min + cfg.max) / 2, cfg.max];
        let pi = 0;
        listen(presetBtn, 'click', (e) => { e.stopPropagation(); pi = (pi + 1) % presets.length; commit(presets[pi]); });
      }
    }

    // Mount every scrub into its slot/grid.
    makeScrub(ref('slot-fill'), 'fill');
    makeScrub(ref('slot-size'), 'size');
    ['leading', 'tracking', 'vscale', 'hscale', 'kerning', 'baseline'].forEach((f) => makeScrub(ref('metricsGrid'), f));
    makeScrub(ref('slot-rotation'), 'rotation');
    makeScrub(ref('slot-jitter'), 'jitter');
    makeScrub(ref('offsetsGrid'), 'offsetX');
    makeScrub(ref('offsetsGrid'), 'offsetY');
    makeScrub(ref('indentsGrid'), 'indL');
    makeScrub(ref('indentsGrid'), 'indR');
    makeScrub(ref('slot-indFirst'), 'indFirst');
    makeScrub(ref('spacingGrid'), 'spBefore');
    makeScrub(ref('spacingGrid'), 'spAfter');
    makeScrub(ref('slot-weight'), 'weight');
    makeScrub(ref('slot-inkOverlap'), 'inkOverlap');
    makeScrub(ref('slot-smoothness'), 'smoothness');
    makeScrub(ref('slot-smoothing'), 'smoothing');
    makeScrub(ref('slot-simplify'), 'simplify');
    makeScrub(ref('slot-fillInset'), 'fillInset');
    makeScrub(ref('slot-strikeOff'), 'strikeOff');
    makeScrub(ref('slot-stWeight'), 'stWeight');
    makeScrub(ref('slot-ulOff'), 'ulOff');
    makeScrub(ref('slot-ulWeight'), 'ulWeight');
    makeScrub(ref('slot-ulBreakGap'), 'ulBreakGap');

    // ── reveals ──────────────────────────────────────────────────────────
    const updateFitSwap = () => {
      const on = !!layer.params.fitToFrame;
      ref('fitView').style.display = on ? 'block' : 'none';
      ref('sizeView').style.display = on ? 'none' : 'block';
      ref('fitSub').textContent = on ? 'ratio mode' : 'absolute mode';
    };
    const updateThickReveal = () => {
      // A heavier BUILT-IN style (Medium/Semibold/Bold) is also a thickened
      // stroke, so it reveals the thickening options even at Outline Weight 1.
      const builtinHeavy = !isWeb(layer.params.font) && (layer.params.fontWeight || 'Regular') !== 'Regular';
      const heavy = layer.params.outlineThickness > 1 || builtinHeavy;
      ref('thickReveal').classList.toggle('open', !!layer.params.outlineStroke && heavy);
      ref('outlineBody').style.display = layer.params.outlineStroke ? 'block' : 'none';
      // Ink Overlap only drives the built-in banded bold's PARALLEL engine.
      const io = ref('slot-inkOverlap');
      if (io) {
        const mode = layer.params.thickeningMode || 'parallel';
        io.style.display = (!isWeb(layer.params.font) && mode === 'parallel') ? 'block' : 'none';
      }
    };
    const updateMergeReveal = () => { ref('bezierSmoothBlock').style.display = layer.params.mergeOverlaps ? 'none' : 'block'; };
    const updateFillReveal = () => { ref('fillReveal').classList.toggle('open', !!layer.params.fillEnabled && isWeb(layer.params.font)); };
    const updateFillInsetReveal = () => { ref('fillInsetReveal').classList.toggle('open', !!layer.params.fillInsetEnabled); };
    // Strikethrough / underline option panels reveal only while their decoration
    // is selected; the descender-break padding nests inside the underline panel.
    const updateDecorReveal = () => {
      const sr = ref('strikeReveal'); if (sr) sr.classList.toggle('open', !!layer.params.strikethrough);
      const ur = ref('underlineReveal'); if (ur) ur.classList.toggle('open', !!layer.params.underline);
      const br = ref('ulBreakReveal'); if (br) br.classList.toggle('open', !!layer.params.underline && !!layer.params.underlineBreak);
    };

    // ── toggles ──────────────────────────────────────────────────────────
    const bindToggle = (name, key, after) => {
      const el = ref(name);
      if (!el) return;
      const setVis = (on) => { el.dataset.state = on ? '1' : '0'; el.classList.toggle('on', on); el.setAttribute('aria-checked', on ? 'true' : 'false'); };
      setVis(!!layer.params[key]);
      const flip = () => { const on = !(el.dataset.state === '1'); pushHist(); layer.params[key] = on; setVis(on); if (after) after(); flush(); };
      listen(el, 'click', flip);
      listen(el, 'keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
    };
    bindToggle('fitToggle', 'fitToFrame', updateFitSwap);
    bindToggle('outlineToggle', 'outlineStroke', updateThickReveal);
    bindToggle('mergeToggle', 'mergeOverlaps', updateMergeReveal);
    bindToggle('bezierToggle', 'bezierOutline');
    bindToggle('curvesToggle', 'curves');
    bindToggle('fillToggle', 'fillEnabled', updateFillReveal);
    bindToggle('fillInsetToggle', 'fillInsetEnabled', updateFillInsetReveal);

    // ── segmented controls ──────────────────────────────────────────────
    const bindSeg = (name, key, map, after) => {
      const seg = ref(name);
      if (!seg) return;
      const btns = Array.from(seg.querySelectorAll('button'));
      btns.forEach((b) => { const on = map[b.dataset.seg] === layer.params[key]; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      btns.forEach((b) => listen(b, 'click', () => {
        btns.forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('active'); b.setAttribute('aria-pressed', 'true');
        setParam(key, map[b.dataset.seg]);
        if (after) after();
      }));
    };
    bindSeg('thickSeg', 'thickeningMode', { parallel: 'parallel', sinusoidal: 'sinusoidal', snake: 'snake' }, updateThickReveal);

    // ── align row ──────────────────────────────────────────────────────────
    const abtns = qa('[data-ref="align7"] .vtp-glyph-btn');
    abtns.forEach((b) => { const on = ALIGN_MAP[b.dataset.align] === layer.params.align; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    abtns.forEach((b) => listen(b, 'click', () => {
      abtns.forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('active'); b.setAttribute('aria-pressed', 'true');
      setParam('align', ALIGN_MAP[b.dataset.align]);
    }));

    // ── caps / style glyph buttons ─────────────────────────────────────────
    // Mutually-exclusive pairs: All Caps ↔ Small Caps and Superscript ↔
    // Subscript. Turning one on clears its partner (button + param) so the two
    // can never both be active.
    const STYLE_EXCL = { allCaps: 'smallCaps', smallCaps: 'allCaps', superscript: 'subscript', subscript: 'superscript' };
    const styleBtns = qa('.vtp-glyph-btn[data-style]');
    const styleBtnFor = (paramKey) => styleBtns.find((x) => STYLE_MAP[x.dataset.style] === paramKey);
    const setStyleBtn = (btn, on) => { if (!btn) return; btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    styleBtns.forEach((b) => {
      const key = STYLE_MAP[b.dataset.style];
      setStyleBtn(b, !!layer.params[key]);
      listen(b, 'click', () => {
        const nv = !b.classList.contains('active');
        pushHist();
        setStyleBtn(b, nv);
        layer.params[key] = nv;
        if (nv && STYLE_EXCL[key]) {
          const other = STYLE_EXCL[key];
          if (layer.params[other]) { layer.params[other] = false; setStyleBtn(styleBtnFor(other), false); }
        }
        updateDecorReveal();
        flush();
      });
    });

    // ── decoration line style / thickening selects + descender breaks ───────
    const bindSelect = (name, key, fallback) => {
      const el = ref(name);
      if (!el) return;
      el.value = layer.params[key] || fallback;
      listen(el, 'change', (e) => setParam(key, e.target.value));
    };
    bindSelect('stThickenMode', 'strikethroughThickenMode', 'parallel');
    bindSelect('stStyle', 'strikethroughStyle', 'solid');
    bindSelect('ulThickenMode', 'underlineThickenMode', 'parallel');
    bindSelect('ulStyle', 'underlineStyle', 'solid');
    bindToggle('ulBreakToggle', 'underlineBreak', updateDecorReveal);

    // ── OpenType buttons + selects ─────────────────────────────────────────
    qa('.vtp-ot-btn').forEach((b) => {
      const key = OT_MAP[b.dataset.ot];
      const act = !!layer.params[key];
      b.classList.toggle('active', act); b.setAttribute('aria-pressed', act ? 'true' : 'false');
      listen(b, 'click', () => {
        if (b.classList.contains('locked')) return;
        const nv = !b.classList.contains('active');
        b.classList.toggle('active', nv); b.setAttribute('aria-pressed', nv ? 'true' : 'false');
        setParam(key, nv);
      });
    });
    const otFig = ref('otFigures'); if (otFig) { otFig.value = layer.params.otFigures; listen(otFig, 'change', (e) => setParam('otFigures', e.target.value)); }
    const otPos = ref('otPosition'); if (otPos) { otPos.value = layer.params.otPosition; listen(otPos, 'change', (e) => setParam('otPosition', e.target.value)); }

    // ── hyphenate checkbox ─────────────────────────────────────────────────
    const hyph = ref('hyphRow');
    if (hyph) {
      const setHyph = (v) => { hyph.classList.toggle('on', v); hyph.setAttribute('aria-checked', v ? 'true' : 'false'); };
      setHyph(!!layer.params.hyphenate);
      const flip = () => { const nv = !hyph.classList.contains('on'); setHyph(nv); setParam('hyphenate', nv); };
      listen(hyph, 'click', flip);
      listen(hyph, 'keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
    }

    // ── style (slant/width variant) select — Vectura family only ──────────────
    const variantSel = ref('variantSelect');
    if (variantSel) {
      listen(variantSel, 'change', (e) => {
        pushHist(); layer.params.font = e.target.value; flush();
        syncFontTrigger(); refresh(); renderSpec();
      });
    }

    // ── weight (fontWeight) select ────────────────────────────────────────────
    // Web faces load a real weighted outline; the built-in monoline font thickens
    // by wrapping extra parallel pen passes per stroke (text.js + the specimen).
    const styleSel = ref('styleSelect');
    if (styleSel) {
      styleSel.value = layer.params.fontWeight || 'Regular';
      listen(styleSel, 'change', (e) => {
        const label = e.target.value;
        setParam('fontWeight', label);
        updateThickReveal();
        if (isWeb(layer.params.font)) { if (GF.loadWeight) GF.loadWeight(keyToId(layer.params.font), label).then(() => renderSpec()).catch(() => {}); }
        else renderSpec();
      });
    }

    // ── fill type + per-variant controls (shared surface) ─────────────────
    // The variant grid + its parameter sliders come from the SAME module the
    // paint bucket tool uses (Vectura.UI.FillControlSurface), so Type fills
    // offer the exact same fill types and parameters. The engine path was
    // already shared (text.js → PaintBucketOps.buildFillRecord →
    // _generatePatternFillPaths); this closes the UI gap.
    //
    // Excluded here: fillAngle (text keeps its own 0°-up AngleDial below — see
    // the −90° note in text.js), and fillPadding/fillShiftX/fillShiftY (text's
    // Inset + Offset-pad controls own those roles). onEdit snapshots history
    // once per interaction; onChange previews live (renderSpec) then commits
    // (flush) on release, matching the old density slider's behaviour.
    const fillGridEl = ref('fillVariantGrid');
    const fillControlsEl = ref('fillControls');
    if (fillGridEl && fillControlsEl && Vectura.UI && Vectura.UI.FillControlSurface) {
      Vectura.UI.FillControlSurface.mount({
        gridEl: fillGridEl,
        controlsEl: fillControlsEl,
        params: layer.params,
        typeKey: 'fillType',
        idPrefix: 'txtfill',
        exclude: ['fillAngle', 'fillPadding', 'fillShiftX', 'fillShiftY'],
        noneHint: 'Pick a fill type to fill glyph interiors.',
        onEdit: () => pushHist(),
        onChange: (committed) => { if (committed) flush(); else renderSpec(); },
      });
    }

    // ── fill offset XY pad ────────────────────────────────────────────────
    const pad = ref('fillOffsetPad'); const knob = ref('fillOffsetKnob'); const padRead = ref('fillOffsetRead');
    const maxSlider = ref('fillOffsetMaxSlider'); const maxChip = ref('fillOffsetMaxChip');
    if (pad) {
      // Pad edge = ±padMax() millimetres (user-set via the vertical slider beside
      // the pad, 1–1000mm). fillOffsetX/Y are stored (and shown) in true mm so the
      // fill window translates by real millimetres, matching the inset unit.
      const padMax = () => { const v = +layer.params.fillOffsetMax; return isFinite(v) && v > 0 ? clamp(v, 1, 1000) : (DEF.fillOffsetMax != null ? DEF.fillOffsetMax : 20); };
      const padRefresh = () => {
        const M = padMax();
        const x = layer.params.fillOffsetX || 0; const y = layer.params.fillOffsetY || 0;
        knob.style.left = `${50 + (x / M) * 50}%`; knob.style.top = `${50 + (y / M) * 50}%`;
        const c = !x && !y;
        pad.classList.toggle('off', c);
        pad.setAttribute('aria-valuetext', c ? 'centred' : `${x.toFixed(1)} by ${y.toFixed(1)} millimetres`);
        if (padRead) padRead.textContent = c ? 'centred' : `${x.toFixed(1)}, ${y.toFixed(1)} mm`;
      };
      // Inputs arrive in mm; clamp the offset vector to the padMax() radius.
      const padApply = (mx, my, render) => {
        const M = padMax();
        let ax = mx; let ay = my; const mag = Math.hypot(ax, ay);
        if (mag > M) { ax = (ax / mag) * M; ay = (ay / mag) * M; }
        layer.params.fillOffsetX = Math.round(ax * 100) / 100;
        layer.params.fillOffsetY = Math.round(ay * 100) / 100;
        padRefresh();
        if (render) renderSpec();
      };
      const fromPoint = (cx, cy) => { const M = padMax(); const r = pad.getBoundingClientRect(); padApply(((cx - r.left) / r.width - 0.5) * 2 * M, ((cy - r.top) / r.height - 0.5) * 2 * M, true); };
      listen(pad, 'pointerdown', (e) => {
        e.preventDefault(); pushHist();
        try { pad.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        fromPoint(e.clientX, e.clientY);
        const mv = (ev) => fromPoint(ev.clientX, ev.clientY);
        const up = () => { pad.removeEventListener('pointermove', mv); pad.removeEventListener('pointerup', up); pad.removeEventListener('pointercancel', up); flush(); };
        pad.addEventListener('pointermove', mv); pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
      });
      listen(pad, 'dblclick', () => { pushHist(); padApply(0, 0, false); flush(); });
      listen(pad, 'keydown', (e) => {
        const s = e.shiftKey ? 2 : 0.5; const x = layer.params.fillOffsetX || 0; const y = layer.params.fillOffsetY || 0; let hit = true;
        if (e.key === 'ArrowLeft') { pushHist(); padApply(x - s, y, false); flush(); }
        else if (e.key === 'ArrowRight') { pushHist(); padApply(x + s, y, false); flush(); }
        else if (e.key === 'ArrowUp') { pushHist(); padApply(x, y - s, false); flush(); }
        else if (e.key === 'ArrowDown') { pushHist(); padApply(x, y + s, false); flush(); }
        else hit = false;
        if (hit) e.preventDefault();
      });
      // Vertical slider sets the pad's max offset. Changing it re-clamps the
      // current offset to the new radius and repositions the knob so the pad edge
      // always maps to fillOffsetMax on both X and Y.
      if (maxSlider) {
        const syncMaxUI = () => { const M = padMax(); maxSlider.value = M; if (maxChip) maxChip.textContent = String(Math.round(M)); };
        syncMaxUI();
        listen(maxSlider, 'pointerdown', () => pushHist());
        listen(maxSlider, 'input', (e) => {
          layer.params.fillOffsetMax = clamp(+e.target.value || 1, 1, 1000);
          if (maxChip) maxChip.textContent = String(Math.round(layer.params.fillOffsetMax));
          padApply(layer.params.fillOffsetX || 0, layer.params.fillOffsetY || 0, true);
        });
        listen(maxSlider, 'change', () => flush());
        listen(maxSlider, 'dblclick', (e) => {
          e.preventDefault(); pushHist();
          layer.params.fillOffsetMax = (DEF.fillOffsetMax != null ? DEF.fillOffsetMax : 20);
          syncMaxUI();
          padApply(layer.params.fillOffsetX || 0, layer.params.fillOffsetY || 0, false);
          flush();
        });
      }
      padRefresh();
    }

    // ── fill angle radial selector ─────────────────────────────────────────
    const angleMount = ref('fillAngleMount');
    if (angleMount && Vectura.UI && typeof Vectura.UI.AngleDial === 'function') {
      let angleHist = false;
      const angleDial = Vectura.UI.AngleDial(angleMount, {
        value: layer.params.fillAngle || 0,
        ariaLabel: 'Fill angle',
        onChange: (v) => { if (!angleHist) { pushHist(); angleHist = true; } layer.params.fillAngle = Math.round(v); renderSpec(); },
        onCommit: (v) => { layer.params.fillAngle = Math.round(v); flush(); angleHist = false; },
      });
      dials.push(angleDial);
    }

    // ── tabs ──────────────────────────────────────────────────────────────
    function selectTab(id) {
      qa('.vtp-tab').forEach((t) => { const on = t.dataset.tab === id; t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
      qa('.vtp-page').forEach((p) => { const on = p.dataset.page === id; p.classList.toggle('active', on); if (on) p.removeAttribute('hidden'); else p.setAttribute('hidden', ''); });
      activeTab = id;
    }
    qa('.vtp-tab').forEach((t) => listen(t, 'click', () => { if (t.classList.contains('disabled')) return; selectTab(t.dataset.tab); }));

    // ── specimen collapse + view pills + guide picker ─────────────────────
    const specimen = ref('specimen'); const specToggle = ref('specToggle');
    const applyCollapsed = () => { const c = !!lsGet(LS.collapsed, false); specimen.classList.toggle('collapsed', c); specToggle.setAttribute('aria-expanded', c ? 'false' : 'true'); };
    listen(specToggle, 'click', () => { specimen.classList.toggle('collapsed'); const c = specimen.classList.contains('collapsed'); specToggle.setAttribute('aria-expanded', c ? 'false' : 'true'); lsSet(LS.collapsed, c); });
    applyCollapsed();

    const ovBtn = ref('outlineViewToggle'); const ovTxt = ref('outlineViewTxt');
    const applyOV = () => { ovBtn.classList.toggle('on', viewPrefs.showOutlines); ovBtn.setAttribute('aria-pressed', viewPrefs.showOutlines ? 'true' : 'false'); ovTxt.textContent = viewPrefs.showOutlines ? 'Hide Outlines' : 'Show Outlines'; };
    listen(ovBtn, 'click', () => { viewPrefs.showOutlines = !viewPrefs.showOutlines; lsSet(LS.outlines, viewPrefs.showOutlines); applyOV(); renderSpec(); });
    applyOV();

    const flBtn = ref('fillLineToggle'); const flTxt = ref('fillLineTxt');
    const applyFL = () => { flBtn.classList.toggle('on', viewPrefs.showFillLines); flBtn.setAttribute('aria-pressed', viewPrefs.showFillLines ? 'true' : 'false'); flTxt.textContent = viewPrefs.showFillLines ? 'Hide fill lines' : 'Show fill lines'; };
    listen(flBtn, 'click', () => { viewPrefs.showFillLines = !viewPrefs.showFillLines; lsSet(LS.fillLines, viewPrefs.showFillLines); applyFL(); renderSpec(); });
    applyFL();

    const guidePick = ref('guidePick');
    if (guidePick) { guidePick.value = viewPrefs.guides; listen(guidePick, 'change', (e) => { viewPrefs.guides = e.target.value; lsSet(LS.guides, viewPrefs.guides); renderSpec(); }); }

    // ── editable specimen (the single text source) ─────────────────────────
    specTextEl.textContent = layer.params.text || '';
    const readSpec = () => { const raw = specTextEl.innerText; const s = (typeof raw === 'string' ? raw : specTextEl.textContent) || ''; return s.replace(/ /g, ' ').replace(/\n$/, ''); };
    const commitText = () => {
      if (textTimer) { clearTimeout(textTimer); textTimer = null; }
      const t = readSpec();
      if (t === layer.params.text) return;
      pushHist(); layer.params.text = t; flush();
    };
    listen(specTextEl, 'focus', () => renderSpec());
    listen(specTextEl, 'input', () => { if (textTimer) clearTimeout(textTimer); textTimer = setTimeout(commitText, 400); renderSpec(); });
    listen(specTextEl, 'blur', () => commitText());

    // ── font picker popover (body-level) ───────────────────────────────────
    let pop = document.createElement('div');
    pop.className = 'vtp-fp-pop';
    pop.setAttribute('role', 'listbox');
    pop.setAttribute('aria-label', 'Font face');
    pop.innerHTML = '<div class="vtp-fp-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
      + '<input type="text" placeholder="Search name or category (serif, mono…)" spellcheck="false" autocomplete="off" aria-label="Search fonts"></div>'
      + '<div class="vtp-fp-tags" role="group" aria-label="Filter by category"></div>'
      + '<div class="vtp-fp-list"></div>';
    document.body.appendChild(pop);
    const fpSearch = pop.querySelector('.vtp-fp-search input');
    const fpTags = pop.querySelector('.vtp-fp-tags');
    const fpList = pop.querySelector('.vtp-fp-list');
    const fpTrigger = ref('fpTrigger');
    const fpName = ref('fpName');
    const fpTagMini = ref('fpTagMini');
    let popOpen = false;
    let activeTags = [];

    STYLE_CHIPS.forEach(([tag, label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'vtp-fp-chip'; b.dataset.tag = tag; b.textContent = label; b.setAttribute('aria-pressed', 'false');
      listen(b, 'click', () => {
        const i = activeTags.indexOf(tag); const act = i < 0;
        if (act) activeTags.push(tag); else activeTags.splice(i, 1);
        b.classList.toggle('on', act); b.setAttribute('aria-pressed', act ? 'true' : 'false');
        rebuildList();
      });
      fpTags.appendChild(b);
    });

    const passTag = (v) => { if (!activeTags.length) return true; if (!isWeb(v)) return false; const f = idMap[keyToId(v)]; return f ? activeTags.indexOf(f.category) >= 0 : false; };
    const passSearch = (v, query) => { if (!query) return true; return faceName(v).toLowerCase().indexOf(query) >= 0 || faceCat(v).toLowerCase().indexOf(query) >= 0; };
    const nameKnown = (v) => (isWeb(v) ? true : isBuiltinId(v));

    function syncFontTrigger() {
      if (!fpName) return;
      const v = layer.params.font;
      const svg = isWeb(v) ? '' : strokePreviewSvg(v);
      if (svg) { fpName.innerHTML = svg; fpName.style.fontFamily = ''; fpName.setAttribute('aria-label', faceName(v)); }
      else { fpName.innerHTML = ''; fpName.removeAttribute('aria-label'); fpName.textContent = faceName(v); fpName.style.fontFamily = faceCss(v); }
      if (fpTagMini) fpTagMini.textContent = faceCat(v);
    }
    function makeOption(v) {
      const row = document.createElement('div');
      row.className = `vtp-fp-opt${v === layer.params.font ? ' sel' : ''}`;
      row.dataset.value = v; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', v === layer.params.font ? 'true' : 'false');
      const fav = favs.indexOf(v) >= 0;
      const star = document.createElement('button');
      star.type = 'button'; star.className = `vtp-fp-star${fav ? ' on' : ''}`; star.title = fav ? 'Unfavorite' : 'Favorite';
      star.setAttribute('aria-label', `${fav ? 'Unfavorite ' : 'Favorite '}${faceName(v)}`);
      star.innerHTML = `<svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>`;
      listen(star, 'click', (ev) => { ev.stopPropagation(); const i = favs.indexOf(v); if (i >= 0) favs.splice(i, 1); else favs.push(v); lsSet(LS.favs, favs); rebuildList(); });
      const nm = document.createElement('span'); nm.className = 'vtp-fp-opt-name';
      const nmSvg = isWeb(v) ? '' : strokePreviewSvg(v);
      if (nmSvg) { nm.innerHTML = nmSvg; nm.setAttribute('aria-label', faceName(v)); }
      else { nm.textContent = faceName(v); nm.style.fontFamily = faceCss(v); }
      const tg = document.createElement('span'); tg.className = 'vtp-fp-tag'; tg.textContent = faceCat(v);
      row.appendChild(star); row.appendChild(nm); row.appendChild(tg);
      listen(row, 'click', () => chooseFace(v));
      ensureWeb(v);
      return row;
    }
    const addSection = (title) => { const h = document.createElement('div'); h.className = 'vtp-fp-sec'; h.textContent = title; fpList.appendChild(h); };
    const addHint = (text) => { const h = document.createElement('div'); h.className = 'vtp-fp-empty'; h.textContent = text; fpList.appendChild(h); };
    const addOptions = (vals) => vals.forEach((v) => fpList.appendChild(makeOption(v)));

    function rebuildList() {
      const query = (fpSearch.value || '').trim().toLowerCase();
      const tagsActive = activeTags.length > 0;
      fpList.innerHTML = '';
      if (query || tagsActive) {
        const hits = [];
        if (!tagsActive) builtinValues.forEach((v) => { if (passSearch(v, query)) hits.push(v); });
        families.forEach((f) => { const v = idToKey(f.id); if (passTag(v) && passSearch(v, query)) hits.push(v); });
        if (hits.length) { addOptions(hits.slice(0, MATCH_CAP)); if (hits.length > MATCH_CAP) addHint(`+ ${hits.length - MATCH_CAP} more — refine your search`); }
        else addHint('No fonts match these filters.');
        return;
      }
      const favVals = favs.filter((v) => nameKnown(v));
      if (favVals.length) { addSection('★ Favorites'); addOptions(favVals); }
      const recentVals = recent.filter((v) => nameKnown(v) && favVals.indexOf(v) < 0);
      if (recentVals.length) { addSection('Recent'); addOptions(recentVals); }
      addSection('Google Fonts');
      if (families.length) {
        addOptions(families.slice(0, POPULAR_N).map((f) => idToKey(f.id)));
        if (families.length > POPULAR_N) addHint(`Search to reach all ${families.length.toLocaleString()} Google Fonts…`);
      } else {
        addHint('Web font catalog unavailable — built-in faces only.');
      }
      addSection('Built-in single-stroke'); addOptions(builtinValues);
    }
    function moveActive(dir) {
      const rows = Array.from(fpList.querySelectorAll('.vtp-fp-opt'));
      if (!rows.length) return;
      let idx = rows.findIndex((r) => r.classList.contains('active'));
      rows.forEach((r) => r.classList.remove('active'));
      idx = (idx + dir + rows.length) % rows.length;
      rows[idx].classList.add('active');
      rows[idx].scrollIntoView({ block: 'nearest' });
    }
    function positionPop() {
      const r = fpTrigger.getBoundingClientRect();
      const w = Math.max(r.width, 260);
      pop.style.width = `${w}px`;
      pop.style.left = `${Math.min(r.left, window.innerWidth - w - 8)}px`;
      const below = window.innerHeight - r.bottom;
      if (below < 240 && r.top > below) { pop.style.top = ''; pop.style.bottom = `${window.innerHeight - r.top + 6}px`; }
      else { pop.style.bottom = ''; pop.style.top = `${r.bottom + 6}px`; }
    }
    function openPop() {
      if (popOpen) return; popOpen = true;
      fpSearch.value = ''; activeTags = [];
      fpTags.querySelectorAll('.vtp-fp-chip').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
      rebuildList(); positionPop(); pop.classList.add('open'); fpTrigger.setAttribute('aria-expanded', 'true');
      favs.concat(recent).forEach((v) => ensureWeb(v));
      setTimeout(() => { try { fpSearch.focus(); } catch (_) { /* */ } }, 20);
    }
    function closePop() { if (!popOpen) return; popOpen = false; pop.classList.remove('open'); fpTrigger.setAttribute('aria-expanded', 'false'); }
    function chooseFace(v) {
      recent = [v].concat(recent.filter((x) => x !== v)).slice(0, 8); lsSet(LS.recent, recent);
      closePop();
      // The Vectura row is a family marker — keep the current style if already on a
      // Vectura style, else fall to the first (Regular). Web keys pass through.
      let target = v;
      if (v === builtinFamily.id) target = isBuiltinId(layer.params.font) && layer.params.font !== builtinFamily.id ? layer.params.font : styleIds[0];
      pushHist(); layer.params.font = target; flush();
      ensureWeb(target);
      if (isWeb(target) && GF.loadWeight) GF.loadWeight(keyToId(target), layer.params.fontWeight).then(() => renderSpec()).catch(() => {});
      syncFontTrigger();
      refresh();
      renderSpec();
    }
    listen(fpTrigger, 'click', () => (popOpen ? closePop() : openPop()));
    listen(fpSearch, 'input', rebuildList);
    listen(fpSearch, 'keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closePop(); fpTrigger.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); const a = fpList.querySelector('.vtp-fp-opt.active') || fpList.querySelector('.vtp-fp-opt'); if (a) chooseFace(a.dataset.value); }
    });
    listen(document, 'pointerdown', (e) => { if (popOpen && !pop.contains(e.target) && !fpTrigger.contains(e.target)) closePop(); });
    listen(window, 'scroll', () => { if (popOpen) positionPop(); }, true);
    listen(window, 'resize', () => { if (popOpen) positionPop(); });

    // Kick the real catalog load; refresh names/list once it lands.
    if (GF.loadCatalog) {
      GF.loadCatalog().then((list) => {
        families = list || [];
        idMap = {}; families.forEach((f) => { idMap[f.id] = f; });
        syncFontTrigger(); updateCaption();
        if (popOpen) rebuildList();
      }).catch(() => {});
    }

    // ── context strip + gating ──────────────────────────────────────────────
    function refresh() {
      const p = layer.params; const web = isWeb(p.font);
      const cf = ref('ctxFace'); if (cf) cf.textContent = faceName(p.font);
      const chip = ref('ctxChip'); const chipTxt = ref('ctxChipTxt');
      if (chip) chip.className = `vtp-chip ${web ? 'outline' : 'stroke'}`;
      if (chipTxt) chipTxt.textContent = web ? 'Outline face' : 'Stroke face';
      const fillTab = q('.vtp-tab[data-tab="fill"]');
      if (fillTab) { fillTab.classList.toggle('disabled', !web); fillTab.setAttribute('aria-disabled', web ? 'false' : 'true'); }
      const reason = ref('fillReason'); if (reason) reason.style.display = web ? 'none' : 'flex';
      const fea = ref('fillEnabledArea'); if (fea) fea.classList.toggle('vtp-disabled-area', !web);
      if (!web && activeTab === 'fill') selectTab('type');
      const gos = ref('googleOnlyStroke'); if (gos) gos.style.display = web ? 'block' : 'none';
      const note = ref('otLockNote'); if (note) note.style.display = web ? 'none' : 'inline';
      qa('.vtp-ot-btn').forEach((b, i) => { const lock = (!web && i > 1); b.classList.toggle('locked', lock); b.setAttribute('aria-disabled', lock ? 'true' : 'false'); });
      updateFillReveal();
      syncFaceControls();
      syncFontTrigger();
      updateCaption();
    }

    // Style (variant) select is Vectura-only; Weight applies to both. Keep both
    // selects in sync with the live params and hide the variant picker for web.
    function syncFaceControls() {
      const p = layer.params; const web = isWeb(p.font);
      const vf = ref('variantField'); if (vf) vf.style.display = web ? 'none' : '';
      const vs = ref('variantSelect');
      if (vs && !web) vs.value = (isBuiltinId(p.font) && p.font !== builtinFamily.id) ? p.font : styleIds[0];
      const ws = ref('styleSelect'); if (ws) ws.value = p.fontWeight || 'Regular';
    }

    // ── init ──────────────────────────────────────────────────────────────
    updateFitSwap();
    updateThickReveal();
    updateMergeReveal();
    updateFillInsetReveal();
    updateDecorReveal();
    refresh();
    ensureWeb(layer.params.font);
    renderSpec();

    function destroy() {
      // Abort any in-flight scrub gesture so its window 'blur' + origin pointer
      // listeners are removed (they live outside the tracked `listeners` array).
      if (activeFinish) { try { activeFinish(); } catch (_) { /* */ } activeFinish = null; }
      // Flush a pending debounced specimen edit before tearing down — otherwise
      // the most recent keystrokes (within the 400ms window, pre-blur) are lost.
      if (textTimer) { try { commitText(); } catch (_) { /* */ } textTimer = null; }
      dials.forEach((d) => { try { if (d && d.destroy) d.destroy(); } catch (_) { /* */ } });
      dials.length = 0;
      listeners.forEach(([t, e, f, o]) => { try { t.removeEventListener(e, f, o); } catch (_) { /* */ } });
      listeners.length = 0;
      try { document.body.classList.remove('vtp-is-scrubbing'); } catch (_) { /* */ }
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null;
      try { if (spec && spec.destroy) spec.destroy(); } catch (_) { /* */ }
    }

    return { destroy };
  }

  // ── static skeleton ───────────────────────────────────────────────────
  function skeleton() {
    const tabSvg = {
      type: '<path d="M4 6h16M12 6v13M8 19h8"/>',
      layout: '<path d="M4 6h16M4 10h11M4 14h16M4 18h9"/>',
      stroke: '<path d="M3 17c4-9 14-9 18 0"/><circle cx="3" cy="17" r="1.4"/><circle cx="21" cy="17" r="1.4"/>',
      fill: '<path d="M5 4h14v16H5z"/><path d="M5 9h14M5 14h14"/>',
    };
    const alignBtn = (token, title, inner) => `<button type="button" class="vtp-glyph-btn" data-align="${token}" title="${title}" aria-pressed="false" aria-label="${title}"><svg viewBox="0 0 24 18">${inner}</svg></button>`;
    // Shared decoration option lists (underline + strikethrough).
    const THICKEN_OPTS = '<option value="parallel">Parallel</option><option value="sinusoidal">Sinusoidal</option><option value="snake">Snake</option><option value="hatch">Hatch</option><option value="cross">Cross-Hatch</option>';
    const STYLE_OPTS = '<option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="dash-dot">Dash-Dot</option><option value="long-dash">Long Dash</option><option value="dense-dot">Dense Dots</option>';
    return `
  <div class="vtp-titlebar"><span class="vtp-dot"></span><h1>Text</h1><span class="vtp-sub">Synthesis</span></div>

  <div class="vtp-specimen" data-ref="specimen">
    <div class="vtp-spec-head">
      <button type="button" class="vtp-spec-head-btn" data-ref="specToggle" aria-expanded="true">
        <span class="vtp-chev" aria-hidden="true">▼</span><span class="vtp-lbl">Specimen</span>
      </button>
      <button type="button" class="vtp-spec-pill vtp-spec-pill-head" data-ref="outlineViewToggle" aria-pressed="false" title="Reveal glyph outlines — nodes and Bézier handles">
        <span data-ref="outlineViewTxt">Show Outlines</span>
      </button>
    </div>
    <div class="vtp-spec-body">
      <div class="vtp-spec-inner">
        <div class="vtp-spec-stage" data-ref="stage">
          <svg class="vtp-guide-svg" data-ref="guideSvg" aria-hidden="true"></svg>
          <div class="vtp-spec-text" data-ref="specText" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="Specimen text — click to edit" title="Click to edit"></div>
          <svg class="vtp-fill-svg" data-ref="fillSvg" aria-hidden="true"></svg>
          <svg class="vtp-outline-svg" data-ref="outlineSvg" aria-hidden="true"></svg>
          <div class="vtp-spec-tools">
            <button type="button" class="vtp-spec-pill vtp-fill-toggle" data-ref="fillLineToggle" aria-pressed="false" title="Reveal fill toolpaths and overlaps">
              <span class="vtp-dotp"></span><span data-ref="fillLineTxt">Show fill lines</span>
            </button>
          </div>
          <div class="vtp-fill-legend" data-ref="fillLegend">
            <span><i style="background:#4f93d6"></i>single pass</span>
            <span><i style="background:#dff0ff;box-shadow:0 0 6px #bfe6ff"></i>re-covered · overlap</span>
          </div>
        </div>
        <div class="vtp-spec-cap">
          <span class="vtp-face" data-ref="specFace">Inter · Regular</span>
          <span class="vtp-dim vtp-mono" data-ref="specDim"></span>
          <select class="vtp-guide-pick" data-ref="guidePick" aria-label="Specimen guide overlay">
            <option value="frame">Frame</option>
            <option value="center">Frame + center</option>
            <option value="baseline">Baseline</option>
            <option value="ruled">Cap + baseline</option>
            <option value="hand">Handwriting guides</option>
            <option value="dots">Dot grid</option>
            <option value="none">No frame</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <div class="vtp-ctx-strip" aria-live="polite">
    <span class="vtp-ctx-face">Face: <b data-ref="ctxFace">Inter</b></span>
    <span class="vtp-chip outline" data-ref="ctxChip"><span class="vtp-pip"></span><span data-ref="ctxChipTxt">Outline face</span></span>
  </div>

  <div class="vtp-tabbar" role="tablist" aria-label="Text settings sections">
    <button type="button" class="vtp-tab active" data-tab="type" role="tab" aria-selected="true"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.type}</svg>Type</button>
    <button type="button" class="vtp-tab" data-tab="layout" role="tab" aria-selected="false"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.layout}</svg>Layout</button>
    <button type="button" class="vtp-tab" data-tab="stroke" role="tab" aria-selected="false"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.stroke}</svg>Stroke</button>
    <button type="button" class="vtp-tab" data-tab="fill" role="tab" aria-selected="false"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.fill}</svg>Fill</button>
  </div>

  <div class="vtp-tab-body">

    <section class="vtp-page active" data-page="type" role="tabpanel">
      <div class="vtp-tab-heading"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.type}</svg>Type — Character<span class="vtp-h-sub">face · size · metrics</span></div>

      <div class="vtp-field-block">
        <div class="vtp-field-cap"><label>Font source &amp; face</label></div>
        <button type="button" class="vtp-fontpick-trigger" data-ref="fpTrigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="vtp-fp-name" data-ref="fpName">Inter</span>
          <span class="vtp-fp-tagmini" data-ref="fpTagMini"></span>
          <svg class="vtp-fp-chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <div class="vtp-field-block" data-ref="variantField">
        <div class="vtp-field-cap"><label>Style</label></div>
        <select class="vtp-vselect" data-ref="variantSelect">
          <option value="sans">Regular</option><option value="italic">Italic</option><option value="condensed">Condensed</option><option value="wide">Wide</option><option value="oblique">Backslant</option>
        </select>
      </div>

      <div class="vtp-field-block">
        <div class="vtp-field-cap"><label>Weight</label></div>
        <select class="vtp-vselect" data-ref="styleSelect">
          <option value="Regular">Regular</option><option value="Medium">Medium</option><option value="Semibold">Semibold</option><option value="Bold">Bold</option>
        </select>
      </div>

      <div class="vtp-grp-label">Size &amp; Fit</div>
      <div class="vtp-row-toggle">
        <span class="vtp-rt-label">Fit to Frame</span><span class="vtp-rt-sub" data-ref="fitSub">absolute mode</span>
        <button type="button" class="vtp-sw-toggle" data-ref="fitToggle" role="switch" aria-checked="true"><span class="vtp-knob"></span></button>
      </div>
      <div data-ref="fitView" style="display:none;"><div data-ref="slot-fill"></div></div>
      <div data-ref="sizeView"><div data-ref="slot-size"></div></div>

      <div class="vtp-grp-label">Metrics</div>
      <div class="vtp-grid2" data-ref="metricsGrid"></div>

      <div class="vtp-field-block" data-ref="slot-rotation" style="margin-top:7px;"></div>
      <div class="vtp-field-block" data-ref="slot-jitter" style="margin-top:7px;"></div>

      <div class="vtp-grp-label">Style</div>
      <div class="vtp-glyph-row" role="group" aria-label="Character style toggles">
        <button type="button" class="vtp-glyph-btn" data-style="caps" title="All Caps" aria-pressed="false" aria-label="All Caps">TT</button>
        <button type="button" class="vtp-glyph-btn" data-style="smcaps" title="Small Caps" aria-pressed="false" aria-label="Small Caps"><span class="vtp-gl">T<span class="vtp-smc">T</span></span></button>
        <button type="button" class="vtp-glyph-btn" data-style="super" title="Superscript" aria-pressed="false" aria-label="Superscript"><span class="vtp-gl">x<span class="vtp-sup">2</span></span></button>
        <button type="button" class="vtp-glyph-btn" data-style="sub" title="Subscript" aria-pressed="false" aria-label="Subscript"><span class="vtp-gl">x<span class="vtp-sub">2</span></span></button>
        <button type="button" class="vtp-glyph-btn" data-style="under" title="Underline" style="text-decoration:underline;" aria-pressed="false" aria-label="Underline">T</button>
        <button type="button" class="vtp-glyph-btn" data-style="strike" title="Strikethrough" style="text-decoration:line-through;" aria-pressed="false" aria-label="Strikethrough">T</button>
      </div>

      <div class="vtp-reveal" data-ref="strikeReveal">
        <div class="vtp-reveal-inner">
          <div class="vtp-field-block" data-ref="slot-strikeOff" style="margin-top:8px;"></div>
          <div class="vtp-field-block" data-ref="slot-stWeight" style="margin-top:7px;"></div>
          <div class="vtp-field-block" style="margin-top:9px;">
            <div class="vtp-field-cap"><label>Thicken Mode</label></div>
            <select class="vtp-vselect" data-ref="stThickenMode">${THICKEN_OPTS}</select>
          </div>
          <div class="vtp-field-block" style="margin-top:9px;">
            <div class="vtp-field-cap"><label>Line Style</label></div>
            <select class="vtp-vselect" data-ref="stStyle">${STYLE_OPTS}</select>
          </div>
        </div>
      </div>

      <div class="vtp-reveal" data-ref="underlineReveal">
        <div class="vtp-reveal-inner">
          <div class="vtp-field-block" data-ref="slot-ulOff" style="margin-top:8px;"></div>
          <div class="vtp-field-block" data-ref="slot-ulWeight" style="margin-top:7px;"></div>
          <div class="vtp-field-block" style="margin-top:9px;">
            <div class="vtp-field-cap"><label>Thicken Mode</label></div>
            <select class="vtp-vselect" data-ref="ulThickenMode">${THICKEN_OPTS}</select>
          </div>
          <div class="vtp-field-block" style="margin-top:9px;">
            <div class="vtp-field-cap"><label>Line Style</label></div>
            <select class="vtp-vselect" data-ref="ulStyle">${STYLE_OPTS}</select>
          </div>
          <div class="vtp-row-toggle" style="margin-top:9px;">
            <span class="vtp-rt-label">Descender Breaks</span><span class="vtp-rt-sub">gap around letter tails</span>
            <button type="button" class="vtp-sw-toggle" data-ref="ulBreakToggle" role="switch" aria-checked="false"><span class="vtp-knob"></span></button>
          </div>
          <div class="vtp-reveal" data-ref="ulBreakReveal">
            <div class="vtp-reveal-inner">
              <div class="vtp-field-block" data-ref="slot-ulBreakGap" style="margin-top:7px;"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="vtp-page" data-page="layout" role="tabpanel" hidden>
      <div class="vtp-tab-heading"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.layout}</svg>Layout — Paragraph<span class="vtp-h-sub">align · spacing · OpenType</span></div>

      <div class="vtp-grp-label">Alignment</div>
      <div class="vtp-align7" data-ref="align7" role="group" aria-label="Paragraph alignment">
        ${alignBtn('left', 'Align left', '<path d="M3 3h18M3 9h12M3 15h16"/>')}
        ${alignBtn('center', 'Align center', '<path d="M3 3h18M7 9h10M5 15h14"/>')}
        ${alignBtn('right', 'Align right', '<path d="M3 3h18M9 9h12M5 15h16"/>')}
        ${alignBtn('jleft', 'Justify, last left', '<path d="M3 3h18M3 9h18M3 15h11"/>')}
        ${alignBtn('jcenter', 'Justify, last center', '<path d="M3 3h18M3 9h18M7 15h10"/>')}
        ${alignBtn('jright', 'Justify, last right', '<path d="M3 3h18M3 9h18M10 15h11"/>')}
        ${alignBtn('jall', 'Justify all', '<path d="M3 3h18M3 9h18M3 15h18"/>')}
      </div>

      <div class="vtp-grp-label">Offsets</div>
      <div class="vtp-grid2" data-ref="offsetsGrid"></div>

      <div class="vtp-grp-label">Indents <span class="vtp-info-i" title="Illustrator-convention controls — affect paragraph block geometry">i</span></div>
      <div class="vtp-grid2" data-ref="indentsGrid"></div>
      <div class="vtp-field-block" data-ref="slot-indFirst" style="margin-top:7px;"></div>

      <div class="vtp-grp-label">Spacing</div>
      <div class="vtp-grid2" data-ref="spacingGrid"></div>

      <button type="button" class="vtp-checkrow" data-ref="hyphRow" role="checkbox" aria-checked="false"><span class="vtp-vcheck"><svg viewBox="0 0 10 10"><path d="M2 5l2 2 4-4"/></svg></span>Hyphenate</button>

      <div class="vtp-hr"></div>
      <div class="vtp-grp-label">OpenType <span data-ref="otLockNote" style="display:none;font-weight:400;text-transform:none;letter-spacing:0;color:var(--ui-danger);">· limited on built-in face</span></div>
      <div class="vtp-grid2" style="margin-bottom:9px;">
        <div>
          <div class="vtp-field-cap"><label>Figures</label></div>
          <select class="vtp-vselect" data-ref="otFigures" style="font-size:10px;padding-right:24px;"><option value="default">Default Figure</option><option value="tabular">Tabular Lining</option><option value="oldstyle">Oldstyle</option></select>
        </div>
        <div>
          <div class="vtp-field-cap"><label>Position</label></div>
          <select class="vtp-vselect" data-ref="otPosition" style="font-size:10px;padding-right:24px;"><option value="default">Default</option><option value="super">Superscript</option><option value="sub">Subscript</option></select>
        </div>
      </div>
      <div class="vtp-ot-row" role="group" aria-label="OpenType features">
        <button type="button" class="vtp-ot-btn" data-ot="lig" title="Standard Ligatures" aria-pressed="false">fi Ligatures</button>
        <button type="button" class="vtp-ot-btn" data-ot="ctx" title="Contextual Alternates" aria-pressed="false">Contextual</button>
        <button type="button" class="vtp-ot-btn" data-ot="disc" title="Discretionary" aria-pressed="false">st Disc.</button>
        <button type="button" class="vtp-ot-btn" data-ot="swash" title="Swash" aria-pressed="false">Swash</button>
        <button type="button" class="vtp-ot-btn" data-ot="sty" title="Stylistic" aria-pressed="false">Stylistic</button>
        <button type="button" class="vtp-ot-btn" data-ot="frac" title="Fractions" aria-pressed="false">½ Fractions</button>
      </div>
    </section>

    <section class="vtp-page" data-page="stroke" role="tabpanel" hidden>
      <div class="vtp-tab-heading"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.stroke}</svg>Stroke — Outline<span class="vtp-h-sub">weight · curves</span></div>

      <div class="vtp-row-toggle">
        <span class="vtp-rt-label">Outline Stroke</span><span class="vtp-rt-sub">draw glyph contours</span>
        <button type="button" class="vtp-sw-toggle" data-ref="outlineToggle" role="switch" aria-checked="true"><span class="vtp-knob"></span></button>
      </div>

      <div data-ref="outlineBody">
        <div class="vtp-field-block" data-ref="slot-weight" style="margin-top:9px;"></div>

        <div class="vtp-reveal" data-ref="thickReveal">
          <div class="vtp-reveal-inner">
            <div class="vtp-field-cap" style="margin-top:6px;">Thickening Mode</div>
            <div class="vtp-seg-ctrl vtp-thick-seg" data-ref="thickSeg" role="group" aria-label="Thickening mode">
              <button type="button" data-seg="parallel" aria-pressed="false"><span class="vtp-hint"><svg viewBox="0 0 26 8"><path d="M1 2h24M1 6h24"/></svg></span>Parallel</button>
              <button type="button" data-seg="sinusoidal" aria-pressed="false"><span class="vtp-hint"><svg viewBox="0 0 26 8"><path d="M1 4q3-4 6 0t6 0 6 0 6 0"/></svg></span>Sine</button>
              <button type="button" data-seg="snake" aria-pressed="false"><span class="vtp-hint"><svg viewBox="0 0 26 8"><path d="M1 4c3 0 3-2 6-2s3 4 6 4 3-2 6-2 6 0 6 0"/></svg></span>Snake</button>
            </div>
            <div class="vtp-field-block" data-ref="slot-inkOverlap" style="margin-top:8px;"></div>
          </div>
        </div>

        <div data-ref="googleOnlyStroke">
          <div class="vtp-row-toggle" style="margin-top:9px;">
            <span class="vtp-rt-label">Merge Overlaps</span><span class="vtp-rt-sub">weld crossing contours</span>
            <button type="button" class="vtp-sw-toggle" data-ref="mergeToggle" role="switch" aria-checked="true"><span class="vtp-knob"></span></button>
          </div>
          <div data-ref="bezierSmoothBlock">
            <div class="vtp-row-toggle" style="margin-top:9px;">
              <span class="vtp-rt-label">Bézier Outline</span><span class="vtp-rt-sub">true curve contours</span>
              <button type="button" class="vtp-sw-toggle" data-ref="bezierToggle" role="switch" aria-checked="true"><span class="vtp-knob"></span></button>
            </div>
            <div class="vtp-field-block" data-ref="slot-smoothness" style="margin-top:7px;"></div>
          </div>
        </div>
      </div>

      <div class="vtp-hr"></div>
      <div class="vtp-grp-label">Common · Curves &amp; Simplify</div>
      <div class="vtp-row-toggle">
        <span class="vtp-rt-label">Curves</span><span class="vtp-rt-sub">smooth polylines</span>
        <button type="button" class="vtp-sw-toggle" data-ref="curvesToggle" role="switch" aria-checked="false"><span class="vtp-knob"></span></button>
      </div>
      <div class="vtp-field-block" data-ref="slot-smoothing" style="margin-top:8px;"></div>
      <div class="vtp-field-block" data-ref="slot-simplify" style="margin-top:7px;"></div>
    </section>

    <section class="vtp-page" data-page="fill" role="tabpanel" hidden>
      <div class="vtp-tab-heading"><svg viewBox="0 0 24 24" aria-hidden="true">${tabSvg.fill}</svg>Fill — Interior<span class="vtp-h-sub">hatch · spiral · dots</span></div>

      <div class="vtp-reason" data-ref="fillReason" style="display:none;" role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
        <span><b>Fill unavailable.</b> Single-stroke faces draw one centreline path — they have no enclosed interior to fill. Switch to a <b>Google outline face</b> to enable fills.</span>
      </div>

      <div data-ref="fillEnabledArea">
        <div class="vtp-row-toggle">
          <span class="vtp-rt-label">Fill Enabled</span><span class="vtp-rt-sub">fill glyph interiors</span>
          <button type="button" class="vtp-sw-toggle" data-ref="fillToggle" role="switch" aria-checked="false"><span class="vtp-knob"></span></button>
        </div>
        <div class="vtp-reveal" data-ref="fillReveal">
          <div class="vtp-reveal-inner">
            <div class="vtp-field-block" style="margin-top:9px;">
              <div class="vtp-field-cap"><label>Fill Type</label></div>
              <div class="paint-bucket-variant-grid" data-ref="fillVariantGrid" role="radiogroup" aria-label="Fill type"></div>
            </div>
            <!-- Per-variant controls (density, amplitude, dots, spiral, contour,
                 truchet, maze, stripes, weave …) rendered by the shared
                 Vectura.UI.FillControlSurface — identical to the paint bucket. -->
            <div class="vtp-fill-controls" data-ref="fillControls"></div>
            <div class="vtp-field-block" style="margin-top:11px;">
              <div class="vtp-field-cap"><label>Angle <span class="vtp-drag-hint">↻ drag</span></label></div>
              <div class="vtp-angle-mount" data-ref="fillAngleMount"></div>
            </div>
            <div class="vtp-field-block" style="margin-top:11px;">
              <div class="vtp-field-cap"><label>Fill Offset <span class="vtp-drag-hint">drag · dbl-click resets</span></label></div>
              <div class="vtp-xypad-row">
                <div class="vtp-xypad" data-ref="fillOffsetPad" role="slider" aria-label="Fill offset" aria-valuetext="centred" tabindex="0">
                  <div class="vtp-xypad-cross"></div>
                  <div class="vtp-xypad-rim"></div>
                  <div class="vtp-xypad-knob" data-ref="fillOffsetKnob"></div>
                </div>
                <div class="vtp-xypad-max" title="Maximum fill offset — the pad edge maps to this distance">
                  <input type="range" class="vtp-vslider vtp-vslider-vert" data-ref="fillOffsetMaxSlider" min="1" max="1000" step="1" value="20" orient="vertical" aria-label="Maximum fill offset in millimetres">
                  <span class="vtp-vchip vtp-mono" data-ref="fillOffsetMaxChip">20</span>
                  <span class="vtp-xypad-max-unit">mm</span>
                </div>
              </div>
              <div class="vtp-xypad-read" data-ref="fillOffsetRead">centred</div>
            </div>
            <div class="vtp-row-toggle" style="margin-top:11px;">
              <span class="vtp-rt-label">Inset fill from edge</span><span class="vtp-rt-sub">pull fill in from the outline</span>
              <button type="button" class="vtp-sw-toggle" data-ref="fillInsetToggle" role="switch" aria-checked="false"><span class="vtp-knob"></span></button>
            </div>
            <div class="vtp-reveal" data-ref="fillInsetReveal">
              <div class="vtp-reveal-inner">
                <div class="vtp-field-block" data-ref="slot-fillInset"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

  </div>
  <div class="vtp-foot">VECTURA STUDIO · TEXT</div>`;
  }

  Vectura.UI.TextPanel = { build };
})();
