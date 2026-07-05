/**
 * Vectura transform panel (Phase 2 step 4 fourth panel extraction).
 *
 * Exposes window.Vectura.UI.TransformPanel — namespace anchor for the
 * position / scale / rotation / seed transform controls.
 *
 * The transform UI itself is rendered inline by AlgoConfigPanel.buildControls()
 * via the COMMON_CONTROLS preamble (the "Selection & Transform" accordion).
 * This panel exposes the supporting helpers that algo-config-panel and
 * layer-type-change paths call:
 *
 *   - getDefaultTransformForType(type, currentParams)
 *       Returns the canonical {seed,posX,posY,scaleX,scaleY,rotation} for an
 *       algorithm type, preserving the current seed if base lacks one.
 *   - storeLayerParams(layer)
 *       Snapshots non-transform params into layer.paramStates[layer.type]
 *       so a later type swap restores them.
 *   - restoreLayerParams(layer, nextType)
 *       Swaps the layer type, restoring stored params for the new type and
 *       carrying transform values forward.
 *
 * DI bag: { ALGO_DEFAULTS, TRANSFORM_KEYS, clone }.
 *
 * Compile gate at tests/unit/transform-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`TransformPanel.${name} invoked before TransformPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function getDefaultTransformForType(type, currentParams = {}) {
    const { ALGO_DEFAULTS } = requireDeps('getDefaultTransformForType');
    const base = ALGO_DEFAULTS[type] || {};
    const fallbackSeed = Number.isFinite(currentParams.seed) ? currentParams.seed : 1;
    return {
      seed: Number.isFinite(base.seed) ? base.seed : fallbackSeed,
      posX: Number.isFinite(base.posX) ? base.posX : 0,
      posY: Number.isFinite(base.posY) ? base.posY : 0,
      scaleX: Number.isFinite(base.scaleX) ? base.scaleX : 1,
      scaleY: Number.isFinite(base.scaleY) ? base.scaleY : 1,
      rotation: Number.isFinite(base.rotation) ? base.rotation : 0,
    };
  }

  function storeLayerParams(layer) {
    const { TRANSFORM_KEYS, clone } = requireDeps('storeLayerParams');
    if (!layer) return;
    if (!layer.paramStates) layer.paramStates = {};
    const next = { ...layer.params };
    TRANSFORM_KEYS.forEach((key) => delete next[key]);
    layer.paramStates[layer.type] = clone(next);
  }

  function restoreLayerParams(layer, nextType) {
    const { ALGO_DEFAULTS, clone } = requireDeps('restoreLayerParams');
    if (!layer) return;
    const base = ALGO_DEFAULTS[nextType] ? clone(ALGO_DEFAULTS[nextType]) : {};
    const stored = layer.paramStates?.[nextType] ? clone(layer.paramStates[nextType]) : null;
    const transform = this.getDefaultTransformForType(nextType, layer.params);
    layer.type = nextType;
    layer.params = { ...base, ...(stored || {}), ...transform };
    this.storeLayerParams(layer);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Phase-3 Lane K — true X/Y/W/H transform, link W/H, Flip H/V, anchor readout
  // (SEL-5 / SEL-6 / SG-6).
  //
  // Self-mounting controller (mirrors context-bar.js / hint-bar.js): a rAF
  // ticker no-ops until `window.app.renderer` exists, then injects an
  // X/Y/W/H + link + Flip block into the Transform section (#algorithm-
  // transform-body) and keeps it in sync with the renderer's transform read
  // model. The renderer owns all geometry math (getTransformPanelModel /
  // applySelectionBox / applySelectedAnchorPosition / flipSelection); this
  // controller is pure UI plumbing. Tolerates the config, the renderer APIs,
  // and the markup all being absent (quietly idle) so load order is irrelevant.
  // ────────────────────────────────────────────────────────────────────────

  const doc = () => (typeof document !== 'undefined' ? document : null);
  const getApp = () => (G.app && typeof G.app === 'object' ? G.app : null);
  const getRenderer = () => { const a = getApp(); return (a && a.renderer) || null; };
  const cfg = () => (G.Vectura && G.Vectura.TRANSFORM_PANEL) || null;

  // Terse built-in fallbacks so the block still works if the config is absent.
  const LABELS = { x: 'X', y: 'Y', width: 'W', height: 'H', anchorX: 'Anchor X', anchorY: 'Anchor Y' };

  const unitBridge = () => {
    const U = (G.Vectura && G.Vectura.UnitUtils) || {};
    const norm = U.normalizeDocumentUnits
      || ((v) => (`${v || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
    const units = norm((G.Vectura && G.Vectura.SETTINGS ? G.Vectura.SETTINGS.documentUnits : null));
    const label = (U.getDocumentUnitLabel || ((u) => (u === 'imperial' ? 'in' : 'mm')))(units);
    const mmTo = (v) => (U.mmToDocumentUnits
      ? U.mmToDocumentUnits(v, units)
      : (units === 'imperial' ? Number(v || 0) / 25.4 : Number(v || 0)));
    const toMm = (v) => (U.documentUnitsToMm
      ? U.documentUnitsToMm(v, units)
      : (units === 'imperial' ? Number(v || 0) * 25.4 : Number(v || 0)));
    const prec = (U.getDocumentUnitPrecision ? U.getDocumentUnitPrecision(units) : (units === 'imperial' ? 2 : 1));
    return { units, label, mmTo, toMm, prec };
  };

  const controller = {
    mounted: false,
    linked: false,
    els: null,
    _rafId: null,
    _lastSig: null,
    _lastLinked: undefined,

    // Inject the block once, after #seed-controls inside the Transform body.
    ensureMounted() {
      if (this.mounted && this.els && this.els.root && this.els.root.isConnected) return true;
      const d = doc();
      if (!d) return false;
      const body = d.getElementById('algorithm-transform-body');
      if (!body) return false;
      const C = cfg();
      const L = (C && C.labels) || LABELS;
      const T = (C && C.tooltips) || {};
      const I = (C && C.icons) || {};
      const inputCls = 'w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:border-vectura-accent focus:outline-none';
      const labelCls = 'text-[11px] text-vectura-muted';

      const root = d.createElement('div');
      root.id = 'transform-bbox-controls';
      root.dataset.tkPanel = '1';
      root.innerHTML = `
        <div class="grid grid-cols-2 gap-2 mb-2" data-tk-row="xy">
          <div><label class="${labelCls}" data-tk-label="x"></label>
            <input type="number" id="tk-x" class="${inputCls}" title="${T.x || ''}" /></div>
          <div><label class="${labelCls}" data-tk-label="y"></label>
            <input type="number" id="tk-y" class="${inputCls}" title="${T.y || ''}" /></div>
        </div>
        <div class="grid grid-cols-[1fr_auto_1fr] gap-1 mb-2 items-end" data-tk-row="wh">
          <div><label class="${labelCls}" data-tk-label="width"></label>
            <input type="number" id="tk-w" class="${inputCls}" title="${T.width || ''}" /></div>
          <button type="button" id="tk-link" class="tk-link-btn" aria-pressed="false"></button>
          <div><label class="${labelCls}" data-tk-label="height"></label>
            <input type="number" id="tk-h" class="${inputCls}" title="${T.height || ''}" /></div>
        </div>
        <div class="flex gap-2 mb-2" data-tk-row="flip">
          <button type="button" id="tk-flip-h" class="tk-flip-btn"
            title="${T.flipH || 'Flip Horizontal'}" aria-label="${T.flipH || 'Flip Horizontal'}">${I.flipH || '⇋'}</button>
          <button type="button" id="tk-flip-v" class="tk-flip-btn"
            title="${T.flipV || 'Flip Vertical'}" aria-label="${T.flipV || 'Flip Vertical'}">${I.flipV || '⇅'}</button>
        </div>`;

      // Insert after the seed controls (or first if seed is absent).
      const seed = d.getElementById('seed-controls');
      if (seed && seed.parentElement === body) seed.after(root);
      else body.insertBefore(root, body.firstChild);

      const q = (sel) => root.querySelector(sel);
      this.els = {
        root,
        rowXY: q('[data-tk-row="xy"]'),
        rowWH: q('[data-tk-row="wh"]'),
        rowFlip: q('[data-tk-row="flip"]'),
        x: q('#tk-x'), y: q('#tk-y'), w: q('#tk-w'), h: q('#tk-h'),
        labelX: q('[data-tk-label="x"]'), labelY: q('[data-tk-label="y"]'),
        labelW: q('[data-tk-label="width"]'), labelH: q('[data-tk-label="height"]'),
        link: q('#tk-link'), flipH: q('#tk-flip-h'), flipV: q('#tk-flip-v'),
      };

      // Wiring — commit on change (fires on Enter/blur).
      this.els.x.addEventListener('change', () => this.commitBox('x'));
      this.els.y.addEventListener('change', () => this.commitBox('y'));
      this.els.w.addEventListener('change', () => this.commitBox('w'));
      this.els.h.addEventListener('change', () => this.commitBox('h'));
      this.els.link.addEventListener('click', () => { this.linked = !this.linked; this.refresh(); });
      this.els.flipH.addEventListener('click', () => this.doFlip('horizontal'));
      this.els.flipV.addEventListener('click', () => this.doFlip('vertical'));

      // Fresh DOM → force the next refresh() to write regardless of signature.
      this._lastSig = null;
      this._lastLinked = undefined;
      this.mounted = true;
      return true;
    },

    // Cache handles to the native Pos/Scale/Rotation rows so we can toggle them.
    _nativeRows() {
      const d = doc();
      if (!d) return {};
      const posX = d.getElementById('inp-pos-x');
      const scaleX = d.getElementById('inp-scale-x');
      const rotation = d.getElementById('inp-rotation');
      return {
        posRow: posX ? posX.closest('.grid') : null,
        scaleRow: scaleX ? scaleX.closest('.grid') : null,
        rotationInput: rotation,
      };
    },

    doFlip(axis) {
      const renderer = getRenderer();
      if (!renderer || typeof renderer.flipSelection !== 'function') return;
      const C = cfg();
      const a = (C && C.flipAxis && C.flipAxis[axis]) || axis;
      renderer.flipSelection(a);
      this.refresh();
    },

    commitBox(field) {
      const renderer = getRenderer();
      if (!renderer) return;
      const u = unitBridge();
      const model = typeof renderer.getTransformPanelModel === 'function'
        ? renderer.getTransformPanelModel()
        : null;
      if (!model) return;

      if (model.mode === 'anchor') {
        // SG-6: X/Y repurposed to the selected anchor's position.
        const px = this.els.x.value.trim() === '' ? null : u.toMm(parseFloat(this.els.x.value));
        const py = this.els.y.value.trim() === '' ? null : u.toMm(parseFloat(this.els.y.value));
        const point = {};
        if (field === 'x' && Number.isFinite(px)) point.x = px;
        if (field === 'y' && Number.isFinite(py)) point.y = py;
        if (typeof renderer.applySelectedAnchorPosition === 'function') {
          renderer.applySelectedAnchorPosition(point);
        }
        this.refresh();
        return;
      }
      if (model.mode !== 'object' || !model.manual) return;

      const box = {};
      const readMm = (el) => (el.value.trim() === '' ? null : u.toMm(parseFloat(el.value)));
      if (field === 'x') { const v = readMm(this.els.x); if (Number.isFinite(v)) box.x = v; }
      if (field === 'y') { const v = readMm(this.els.y); if (Number.isFinite(v)) box.y = v; }
      if (field === 'w') {
        const v = readMm(this.els.w);
        if (Number.isFinite(v) && v > 0) {
          box.width = v;
          if (this.linked && model.width > 1e-6) box.height = model.height * (v / model.width);
        }
      }
      if (field === 'h') {
        const v = readMm(this.els.h);
        if (Number.isFinite(v) && v > 0) {
          box.height = v;
          if (this.linked && model.height > 1e-6) box.width = model.width * (v / model.height);
        }
      }
      if (typeof renderer.applySelectionBox === 'function') renderer.applySelectionBox(box);
      this.refresh();
    },

    // Populate + toggle visibility for the current selection/anchor state.
    refresh() {
      if (!this.ensureMounted()) return;
      const renderer = getRenderer();
      const els = this.els;
      const C = cfg();
      const L = (C && C.labels) || LABELS;
      const T = (C && C.tooltips) || {};
      const I = (C && C.icons) || {};
      const u = unitBridge();
      const model = (renderer && typeof renderer.getTransformPanelModel === 'function')
        ? renderer.getTransformPanelModel()
        : { mode: 'none' };
      const native = this._nativeRows();
      const active = doc() ? doc().activeElement : null;

      // Dirty-check: skip the whole DOM write when nothing that affects the
      // block has changed since the last frame (the rAF ticker runs for the
      // app's lifetime — without this it would rewrite the DOM ~60×/s while
      // idle). The signature covers every input to the render below: selection
      // identity, mode/manual, the bbox or anchor numbers, link state, and the
      // document-unit label/precision. Live drags legitimately change the
      // numbers → signature differs → the block still updates every frame.
      const selIds = (renderer && renderer.selectedLayerIds)
        ? Array.from(renderer.selectedLayerIds).join(',')
        : '';
      const sig = [
        selIds, model.mode, model.manual ? 1 : 0,
        model.x, model.y, model.width, model.height,
        model.anchorX, model.anchorY, model.index,
        this.linked ? 1 : 0, u.label, u.prec,
      ].join('|');
      if (sig === this._lastSig) return;
      this._lastSig = sig;

      const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
      const fmt = (mm) => (Number.isFinite(mm) ? u.mmTo(mm).toFixed(u.prec) : '');
      const setVal = (el, v) => { if (el && el !== active) el.value = v; };

      // Link button glyph reflects current state — rewrite only when it flips
      // (avoids re-parsing the inline SVG on every non-link change).
      if (els.link && this._lastLinked !== this.linked) {
        els.link.innerHTML = this.linked ? (I.linkOn || '∞') : (I.linkOff || '×');
        els.link.setAttribute('aria-pressed', this.linked ? 'true' : 'false');
        els.link.title = this.linked ? (T.linkOn || '') : (T.linkOff || '');
        this._lastLinked = this.linked;
      }

      const withUnit = (base) => `${base} (${u.label})`;
      const setDisabled = (el, dis) => { if (el) el.disabled = !!dis; };

      if (model.mode === 'anchor') {
        // SG-6 anchor readout: X/Y = anchor position; W/H + rotation disabled.
        show(els.rowXY, true); show(els.rowWH, true); show(els.rowFlip, true);
        if (els.labelX) els.labelX.textContent = withUnit(L.anchorX || LABELS.anchorX);
        if (els.labelY) els.labelY.textContent = withUnit(L.anchorY || LABELS.anchorY);
        if (els.x) els.x.title = T.anchorX || '';
        if (els.y) els.y.title = T.anchorY || '';
        setVal(els.x, fmt(model.anchorX));
        setVal(els.y, fmt(model.anchorY));
        setDisabled(els.x, false); setDisabled(els.y, false);
        setDisabled(els.w, true); setDisabled(els.h, true); setDisabled(els.link, true);
        setVal(els.w, ''); setVal(els.h, '');
        setDisabled(els.flipH, true); setDisabled(els.flipV, true);
        // Hide native pos/scale; disable native rotation.
        show(native.posRow, false); show(native.scaleRow, false);
        setDisabled(native.rotationInput, true);
        return;
      }

      if (model.mode === 'object' && model.manual) {
        // SEL-5: true X/Y/W/H for manual (shape/text) layers.
        show(els.rowXY, true); show(els.rowWH, true); show(els.rowFlip, true);
        if (els.labelX) els.labelX.textContent = withUnit(L.x || LABELS.x);
        if (els.labelY) els.labelY.textContent = withUnit(L.y || LABELS.y);
        if (els.labelW) els.labelW.textContent = withUnit(L.width || LABELS.width);
        if (els.labelH) els.labelH.textContent = withUnit(L.height || LABELS.height);
        if (els.x) els.x.title = T.x || '';
        if (els.y) els.y.title = T.y || '';
        setVal(els.x, fmt(model.x));
        setVal(els.y, fmt(model.y));
        setVal(els.w, fmt(model.width));
        setVal(els.h, fmt(model.height));
        [els.x, els.y, els.w, els.h, els.link].forEach((el) => setDisabled(el, false));
        setDisabled(els.flipH, false); setDisabled(els.flipV, false);
        show(native.posRow, false); show(native.scaleRow, false);
        setDisabled(native.rotationInput, false);
        return;
      }

      if (model.mode === 'object') {
        // Algorithm / group selection: keep native Pos/Scale; only surface Flip.
        show(els.rowXY, false); show(els.rowWH, false); show(els.rowFlip, true);
        setDisabled(els.flipH, false); setDisabled(els.flipV, false);
        show(native.posRow, true); show(native.scaleRow, true);
        setDisabled(native.rotationInput, false);
        return;
      }

      // mode === 'none': nothing selected — Flip disabled (SEL-6), native shown.
      show(els.rowXY, false); show(els.rowWH, false); show(els.rowFlip, true);
      setDisabled(els.flipH, true); setDisabled(els.flipV, true);
      show(native.posRow, true); show(native.scaleRow, true);
      setDisabled(native.rotationInput, false);
    },

    tick() {
      try { this.refresh(); } catch (_e) { /* stay resilient to mid-load state */ }
      const G2 = G;
      if (typeof G2.requestAnimationFrame === 'function') {
        this._rafId = G2.requestAnimationFrame(() => this.tick());
      }
    },

    start() {
      if (this._started) return;
      this._started = true;
      const G2 = G;
      if (typeof G2.requestAnimationFrame === 'function') this.tick();
    },
  };

  UI.TransformPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps - { ALGO_DEFAULTS, TRANSFORM_KEYS, clone }
     */
    bind(deps) {
      DEPS = deps;
    },
    getDefaultTransformForType,
    storeLayerParams,
    restoreLayerParams,
    installOn(proto) {
      proto.getDefaultTransformForType = function(type, currentParams = {}) { return getDefaultTransformForType.call(this, type, currentParams); };
      proto.storeLayerParams = function(layer) { return storeLayerParams.call(this, layer); };
      proto.restoreLayerParams = function(layer, nextType) { return restoreLayerParams.call(this, layer, nextType); };
    },
    // Phase-3 Lane K controller surface (also used by integration tests to
    // drive the block synchronously without waiting on the rAF ticker).
    _controller: controller,
    refreshBboxControls() { return controller.refresh(); },
    setLinked(on) { controller.linked = !!on; controller.refresh(); },
    isLinked() { return controller.linked; },
  };

  // Kick the self-mounting ticker once the module loads (no-ops until the app
  // and the Transform markup exist).
  controller.start();
})();
