/**
 * Vectura algorithm panel (Phase 2 step 4 eighth panel extraction).
 *
 * Exposes window.Vectura.UI.AlgorithmPanel — the algorithm-selector
 * dispatch / layer-type predicate helpers. Distinct from
 * AlgoConfigPanel (which renders the dynamic-controls container) and
 * Header (which builds the dropdown <select>).
 *
 * Methods lifted verbatim from class UI:
 *   - syncPrimaryModuleDropdown    (re-populate dropdown when layer changes)
 *   - isModifierType               (predicate: type is a registered modifier)
 *   - isDrawableLayerType          (predicate: type is a drawable algorithm)
 *   - rememberDrawableLayerType    (cache last drawable type for new layers)
 *   - getPreferredNewLayerType     (heuristic: which type to use for next add)
 *   - computeHarmonographPlotterData  (Unit 1.8: harmonograph virtual plotter sampling)
 *   - mountHarmonographPlotter        (Unit 1.8: virtual-plotter DOM widget)
 *   - applyScissor                    (Unit 1.8: scissor tool — splits layer paths by shape)
 *
 * The legacy UI prototype delegates to this module via 1-line pass-throughs.
 *
 * DI bag: { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms, getThemeToken }.
 * AlgorithmUtils.clamp and GeometryUtils.splitPathByShape are sourced from
 * window.Vectura at call time (matches their legacy ui-IIFE binding).
 *
 * Compile gate at tests/unit/algorithm-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`AlgorithmPanel.${name} invoked before AlgorithmPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function syncPrimaryModuleDropdown(layer) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('syncPrimaryModuleDropdown');
    const select = getEl('generator-module', { silent: true });
    if (!select || !layer) return;
    if (this.isModifierLayer(layer)) {
      const modifier = this.getModifierState(layer);
      const type = modifier?.type || 'mirror';
      select.innerHTML = '';
      Object.keys(MODIFIER_DEFAULTS || { mirror: { label: 'Mirror' } }).forEach((key) => {
        const def = MODIFIER_DEFAULTS[key] || {};
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = def.label || key.charAt(0).toUpperCase() + key.slice(1);
        select.appendChild(opt);
      });
      select.value = type;
      select.disabled = false;
      select.classList.remove('opacity-60');
      this._syncModuleDisplay();
      return;
    }
    this.initModuleDropdown();
    this.rememberDrawableLayerType(layer);
    select.value = layer.type;
  }

  function isModifierType(type) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('isModifierType');
    return Boolean(type && Object.prototype.hasOwnProperty.call(MODIFIER_DEFAULTS || {}, type));
  }

  function isDrawableLayerType(type) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('isDrawableLayerType');
    if (!type || type === 'group' || this.isModifierType(type)) return false;
    return Boolean((Algorithms && Algorithms[type]) || (ALGO_DEFAULTS && ALGO_DEFAULTS[type]));
  }

  function rememberDrawableLayerType(typeOrLayer) {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('rememberDrawableLayerType');
    const type = typeof typeOrLayer === 'string' ? typeOrLayer : typeOrLayer?.type;
    if (!this.isDrawableLayerType(type)) return this.lastDrawableLayerType || null;
    this.lastDrawableLayerType = type;
    return type;
  }

  // Scissor helper: expandCirclePath is a pure geometry helper kept local
  // because its only consumer here is applyScissor.
  function expandCirclePath(meta, segments = 80) {
    const cx = meta.cx ?? meta.x ?? 0;
    const cy = meta.cy ?? meta.y ?? 0;
    const rx = meta.rx ?? meta.r ?? 0;
    const ry = meta.ry ?? meta.r ?? rx;
    const rotation = meta.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const out = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = (i / segments) * Math.PI * 2;
      const px = Math.cos(t) * rx;
      const py = Math.sin(t) * ry;
      out.push({ x: cx + px * cos - py * sin, y: cy + px * sin + py * cos });
    }
    return out;
  }

  function applyScissor(payload) {
    requireDeps('applyScissor');
    if (!payload) return;
    const shape = {
      mode: payload.mode,
      line: payload.line,
      rect: payload.rect,
      circle: payload.circle,
    };
    if (!shape.mode) return;
    if (this.app.pushHistory) this.app.pushHistory();

    const renderer = this.app.renderer;
    const engine = this.app.engine;
    const splitPathByShape =
      (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.GeometryUtils?.splitPathByShape;
    if (typeof splitPathByShape !== 'function') return;
    const baseTargets = (engine?.layers || []).filter((layer) => !layer.isGroup && layer.visible);
    const targets = [];

    baseTargets.forEach((layer) => {
      if (layer.isGroup) {
        targets.push(...this.getGroupDescendants(layer.id));
        return;
      }
      if (layer.type !== 'shape' && !layer.parentId) {
        const expanded = this.expandLayer(layer, { skipHistory: true, returnChildren: true, suppressRender: true, selectChildren: false });
        if (expanded && expanded.length) targets.push(...expanded);
        return;
      }
      targets.push(layer);
    });

    const uniqueTargets = Array.from(new Map(targets.map((layer) => [layer.id, layer])).values());
    const newSelection = [];

    uniqueTargets.forEach((layer) => {
      const src = layer.sourcePaths || layer.paths || [];
      let segments = [];
      let didSplit = false;
      src.forEach((path) => {
        const basePath = path && path.meta && path.meta.kind === 'circle' ? expandCirclePath(path.meta, 80) : path;
        const split = splitPathByShape(basePath, shape);
        if (!split || !split.length) {
          segments.push(path);
          return;
        }
        segments = segments.concat(split);
        didSplit = true;
      });
      if (!segments.length || !didSplit) return;
      if (segments.length === 1) {
        layer.sourcePaths = segments.map((seg) => seg.map((pt) => ({ x: pt.x, y: pt.y })));
        engine.generate(layer.id);
        newSelection.push(layer.id);
        return;
      }
      const children = this.splitShapeLayer(layer, segments);
      newSelection.push(...children.map((child) => child.id));
    });

    this.normalizeGroupOrder?.();
    this.renderLayers();
    this.app.render();
    if (newSelection.length && renderer) {
      const primary = newSelection[newSelection.length - 1];
      renderer.setSelection(newSelection, primary);
      engine.activeLayerId = primary;
    }
  }

  // Delegates to the shared, pipeline-free evaluator (HarmonographCore) so the
  // live playback loop can re-evaluate the figure every frame without touching
  // engine.generate()/computeAllDisplayGeometry(). `opts.sampleCap` caps the
  // vertex count for cheap live preview; full resolution is used when idle.
  function computeHarmonographPlotterData(layer, opts = {}) {
    requireDeps('computeHarmonographPlotterData');
    const core = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.HarmonographCore;
    const params = layer?.params || {};
    if (!core) return { path: [], durationSec: 0 };
    return core.evaluatePath(params, opts);
  }

  function mountHarmonographPlotter(layer, target) {
    const { getThemeToken } = requireDeps('mountHarmonographPlotter');
    if (!target) return;
    const clamp =
      (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.AlgorithmUtils?.clamp ||
      ((value, min, max) => Math.min(Math.max(value, min), max));
    // REVEAL-ONLY playback. The grey "ghost" is the full STATIC figure (with
    // any LFO motion already baked into its geometry by the shared evaluator —
    // computeHarmonographPlotterData forwards params.motion). The red line just
    // traces that fixed figure 0->100% on a loop, exactly like dragging the
    // Reveal scrubber. Evolution lives in the figure (parameterized by its own
    // progress t), never in wall-clock playback — so the ghost never morphs.
    const RANGE_MAX = 1000;          // reveal scrubber resolution (fraction * 1000)
    const REVEAL_SECONDS = 7;        // seconds for the pen to trace the whole figure once (at 1x)

    // Cached static figure; `let` so a Motion Rack edit can rebuild it in place.
    let data = this.computeHarmonographPlotterData(layer);
    const speeds = [0.25, 0.5, 1, 2, 4];
    const rememberedSpeed = this.harmonographPlotterState?.speed ?? 1;
    const initialSpeed = speeds.includes(rememberedSpeed) ? rememberedSpeed : 1;
    const initialReveal = clamp(this.harmonographPlotterState?.revealFrac ?? 1, 0, 1);
    // Plot range (start/stop): a committed param pair that truncates the drawn
    // line by arc-length fraction. Lives on layer.params so generate() (main
    // canvas) and the plotter ghost both reflect it via the shared evaluator.
    const PLOT_MIN_GAP = 1; // keep the two thumbs at least 1% apart
    let plotStartInit = clamp(layer?.params?.plotStart ?? 0, 0, 100);
    let plotEndInit = clamp(layer?.params?.plotEnd ?? 100, 0, 100);
    if (plotEndInit < plotStartInit + PLOT_MIN_GAP) plotEndInit = Math.min(100, plotStartInit + PLOT_MIN_GAP);
    const infoPrefix = layer?.type === 'pendula' ? 'pendula' : 'harmonograph';
    let drawable = data.path.length > 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'harmonograph-plotter mb-4';
    wrapper.innerHTML = `
        <div class="harmonograph-plotter-head">
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Virtual Plotter</span>
          <button type="button" class="harmonograph-plotter-play text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">Play</button>
        </div>
        <canvas class="harmonograph-plotter-canvas" width="240" height="240"></canvas>
        <div class="harmonograph-plotter-meta text-[10px] text-vectura-muted">Play traces the pen along the figure on a loop. Shape the figure itself with LFOs in the Motion Rack.</div>
        <div class="harmonograph-plotter-row harmonograph-plotter-plotrange-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">
            Plot <span class="harmonograph-plotter-plotrange-val">${Math.round(plotStartInit)}–${Math.round(plotEndInit)}%</span>
            <button type="button" class="info-btn" data-info="${infoPrefix}.plotStart">i</button>
          </label>
          <div class="harmonograph-plotter-plotrange" role="group" aria-label="Plot range">
            <div class="hp-plotrange-track"><div class="hp-plotrange-fill"></div></div>
            <input class="hp-plot-start" type="range" min="0" max="100" step="1" value="${Math.round(plotStartInit)}" aria-label="Plot start (%)">
            <input class="hp-plot-end" type="range" min="0" max="100" step="1" value="${Math.round(plotEndInit)}" aria-label="Plot end (%)">
          </div>
        </div>
        <div class="harmonograph-plotter-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">Reveal</label>
          <input class="harmonograph-plotter-range" type="range" min="0" max="${RANGE_MAX}" step="1" value="${Math.round(initialReveal * RANGE_MAX)}">
        </div>
        <div class="harmonograph-plotter-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">Speed</label>
          <select class="harmonograph-plotter-speed bg-vectura-bg border border-vectura-border p-1 text-[10px] focus:outline-none focus:border-vectura-accent">
            ${speeds
              .map((speed) => `<option value="${speed}" ${speed === initialSpeed ? 'selected' : ''}>${speed}x</option>`)
              .join('')}
          </select>
        </div>
      `;
    target.appendChild(wrapper);
    const canvas = wrapper.querySelector('.harmonograph-plotter-canvas');
    const playBtn = wrapper.querySelector('.harmonograph-plotter-play');
    const range = wrapper.querySelector('.harmonograph-plotter-range');
    const speedSelect = wrapper.querySelector('.harmonograph-plotter-speed');
    const plotStartInput = wrapper.querySelector('.hp-plot-start');
    const plotEndInput = wrapper.querySelector('.hp-plot-end');
    const plotFill = wrapper.querySelector('.hp-plotrange-fill');
    const plotValLabel = wrapper.querySelector('.harmonograph-plotter-plotrange-val');
    if (!canvas || !range || !speedSelect || !playBtn) return;

    // Crisp on Hi-DPI: back the canvas with a devicePixelRatio-scaled buffer and
    // draw in a fixed 240-unit logical space. CSS still sizes the element
    // responsively (width:100%, max 240px, height:auto) and downscales this
    // higher-resolution buffer — so the plotter stays sharp on Retina instead of
    // rendering at CSS resolution. We deliberately do NOT set an inline pixel
    // width/height so the responsive CSS sizing is preserved.
    const CSS_SIZE = 240;
    const dpr = Math.max(1, Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3));
    canvas.width = Math.round(CSS_SIZE * dpr);
    canvas.height = Math.round(CSS_SIZE * dpr);

    const state = {
      rafId: null,
      playing: false,
      revealFrac: initialReveal,   // 0..1 — how much of the curve is drawn
      speed: initialSpeed,
      lastTs: 0,
      figure: data,                // the cached static figure (exposed for rebuild/tests)
    };
    this.harmonographPlotterState = state;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Draw in logical (CSS) coordinates; the DPR-scaled backing store is
      // handled by this transform so strokes stay crisp on Hi-DPI. Guarded for
      // headless canvas mocks (jsdom) that omit setTransform — there dpr is 1,
      // so the identity transform is a no-op anyway.
      if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, CSS_SIZE, CSS_SIZE);
      ctx.fillStyle = getThemeToken('--plotter-bg', '#101115');
      ctx.fillRect(0, 0, CSS_SIZE, CSS_SIZE);
      // Always the static cached figure — the grey ghost never changes while
      // playing; only the red reveal advances.
      const renderData = data;
      if (!renderData.path.length) return;
      const bboxSrc = renderData;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      bboxSrc.path.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
      const spanX = maxX - minX;
      const spanY = maxY - minY;
      const span = Math.max(spanX, spanY, 1);
      const pad = 16;
      const scale = (CSS_SIZE - pad * 2) / span;
      const toCanvas = (pt) => ({
        x: (pt.x - (minX + maxX) / 2) * scale + CSS_SIZE / 2,
        y: (pt.y - (minY + maxY) / 2) * scale + CSS_SIZE / 2,
      });

      const pts = renderData.path;
      ctx.strokeStyle = getThemeToken('--plotter-path-base', 'rgba(113,113,122,0.35)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const c = toCanvas(pt);
        if (idx === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();

      // revealFrac is a 0..1 fraction; floor the resulting index so we never
      // read pts[fractional] (undefined → throws in toCanvas).
      const limit = clamp(Math.floor(state.revealFrac * (pts.length - 1)), 0, pts.length - 1);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= limit; i += 1) {
        const c = toCanvas(pts[i]);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();

      const head = toCanvas(pts[limit]);
      ctx.fillStyle = getThemeToken('--plotter-head', '#fafafa');
      ctx.beginPath();
      ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    const tick = (ts) => {
      if (!state.playing) return;
      const last = state.lastTs || ts;
      const deltaSec = (Math.max(0, ts - last) / 1000) * state.speed;
      state.lastTs = ts;
      // Advance ONLY the reveal and wrap it into [0,1) so the pen retraces the
      // (static) figure on a loop. The figure itself never changes here.
      state.revealFrac += deltaSec / REVEAL_SECONDS;
      if (state.revealFrac >= 1) state.revealFrac -= Math.floor(state.revealFrac);
      range.value = `${Math.round(state.revealFrac * RANGE_MAX)}`;
      draw();
      if (state.playing) state.rafId = window.requestAnimationFrame(tick);
    };

    playBtn.onclick = () => {
      if (!drawable) return;
      state.playing = !state.playing;
      playBtn.textContent = state.playing ? 'Pause' : 'Play';
      if (state.playing) {
        state.lastTs = 0;
        state.rafId = window.requestAnimationFrame(tick);
      } else if (state.rafId) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    };
    range.oninput = (e) => {
      state.revealFrac = clamp((parseInt(e.target.value, 10) || 0) / RANGE_MAX, 0, 1);
      if (state.playing) state.lastTs = 0;
      draw();
    };
    speedSelect.onchange = (e) => {
      const nextSpeed = parseFloat(e.target.value);
      state.speed = Number.isFinite(nextSpeed) ? nextSpeed : 1;
      if (state.playing) state.lastTs = 0;
    };

    // Plot range (start/stop): a dual-thumb slider that truncates the drawn line
    // by arc-length %. Unlike Reveal (a transient preview scrubber), this commits
    // plotStart/plotEnd onto the layer and regenerates — so the MAIN CANVAS and
    // the plotter ghost both truncate, and the reveal then retraces the visible
    // slice. The two thumbs are kept PLOT_MIN_GAP apart.
    const plotState = { start: plotStartInit, end: plotEndInit };
    const syncPlotUI = () => {
      if (plotStartInput) plotStartInput.value = `${Math.round(plotState.start)}`;
      if (plotEndInput) plotEndInput.value = `${Math.round(plotState.end)}`;
      if (plotFill) {
        plotFill.style.left = `${plotState.start}%`;
        plotFill.style.width = `${Math.max(0, plotState.end - plotState.start)}%`;
      }
      if (plotValLabel) plotValLabel.textContent = `${Math.round(plotState.start)}–${Math.round(plotState.end)}%`;
    };
    // Heavy work (regenerating main-canvas geometry + the ghost) runs on COMMIT,
    // i.e. range `change` (pointer release / keystroke), not on every `input`
    // tick — mirroring the sibling range controls so a drag at high sample
    // counts / long durations doesn't fire a full pipeline regen per pixel.
    const commitPlot = () => {
      if (!layer.params) layer.params = {};
      if (layer.params.plotStart === plotState.start && layer.params.plotEnd === plotState.end) return;
      this.app?.pushHistory?.(); // plot-range edits are undoable like every other param
      layer.params.plotStart = plotState.start;
      layer.params.plotEnd = plotState.end;
      this.storeLayerParams?.(layer);
      // regen() rebuilds main-canvas geometry AND the plotter ghost (app.js:955).
      this.app?.regen?.();
    };
    if (plotStartInput && plotEndInput) {
      // Dual overlapping range inputs: raise whichever thumb is nearer the
      // pointer so a handle parked next to its sibling stays grabbable (the
      // classic two-thumb overlap pitfall).
      const plotrangeEl = wrapper.querySelector('.harmonograph-plotter-plotrange');
      if (plotrangeEl) {
        plotrangeEl.addEventListener('pointerdown', (e) => {
          const rect = plotrangeEl.getBoundingClientRect();
          const frac = rect.width ? ((e.clientX - rect.left) / rect.width) * 100 : 0;
          const nearStart = Math.abs(frac - plotState.start) <= Math.abs(frac - plotState.end);
          plotStartInput.style.zIndex = nearStart ? '5' : '4';
          plotEndInput.style.zIndex = nearStart ? '4' : '5';
        });
      }
      plotStartInput.oninput = () => {
        let v = clamp(parseInt(plotStartInput.value, 10) || 0, 0, 100);
        if (v > plotState.end - PLOT_MIN_GAP) v = Math.max(0, plotState.end - PLOT_MIN_GAP);
        plotState.start = v;
        syncPlotUI();
      };
      plotEndInput.oninput = () => {
        let v = clamp(parseInt(plotEndInput.value, 10) || 100, 0, 100);
        if (v < plotState.start + PLOT_MIN_GAP) v = Math.min(100, plotState.start + PLOT_MIN_GAP);
        plotState.end = v;
        syncPlotUI();
      };
      plotStartInput.onchange = commitPlot;
      plotEndInput.onchange = commitPlot;
      syncPlotUI();
    }

    // Recompute the cached static figure in place — called by the Motion Rack
    // commit so editing an LFO updates the ghost without a full panel rebuild
    // (and without restarting playback).
    state.rebuild = () => {
      data = this.computeHarmonographPlotterData(layer);
      state.figure = data;
      drawable = data.path.length > 1;
      playBtn.disabled = !drawable;
      playBtn.classList.toggle('opacity-60', !drawable);
      playBtn.classList.toggle('cursor-not-allowed', !drawable);
      // Keep the interactive controls' enabled state in sync with drawability so
      // a figure that becomes drawable via another edit doesn't leave them stuck.
      range.disabled = !drawable;
      speedSelect.disabled = !drawable;
      if (plotStartInput) plotStartInput.disabled = !drawable;
      if (plotEndInput) plotEndInput.disabled = !drawable;
      draw();
    };

    if (!drawable) {
      playBtn.disabled = true;
      playBtn.classList.add('opacity-60', 'cursor-not-allowed');
      range.disabled = true;
      speedSelect.disabled = true;
      if (plotStartInput) plotStartInput.disabled = true;
      if (plotEndInput) plotEndInput.disabled = true;
    }

    draw();
  }

  function getPreferredNewLayerType() {
    const { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms } = requireDeps('getPreferredNewLayerType');
    const isHidden = (type) => ALGO_DEFAULTS?.[type]?.hidden;
    const active = this.app.engine.getActiveLayer?.();
    if (active && !active.isGroup) {
      const activeType = this.rememberDrawableLayerType(active);
      if (activeType && !isHidden(activeType)) return activeType;
    }
    const rememberedType = this.rememberDrawableLayerType(this.lastDrawableLayerType);
    if (rememberedType && !isHidden(rememberedType)) return rememberedType;
    const moduleSelect = getEl('generator-module', { silent: true });
    if (moduleSelect && this.isDrawableLayerType(moduleSelect.value) && !isHidden(moduleSelect.value)) {
      return this.rememberDrawableLayerType(moduleSelect.value);
    }
    const fallbackLayer =
      (this.app.engine.layers || []).find((layer) => layer && !layer.isGroup && this.isDrawableLayerType(layer.type) && !isHidden(layer.type)) || null;
    return this.rememberDrawableLayerType(fallbackLayer?.type || 'wavetable') || 'wavetable';
  }


  // `splitShapeLayer` reads the `Layer` constructor from DEPS (already
  // injected via bind).
  function splitShapeLayer(layer, segments) {
    const { Layer } = requireDeps('splitShapeLayer');
    if (!Layer || !layer || !segments || !segments.length) return [];
    const engine = this.app.engine;
    const idx = engine.layers.findIndex((l) => l.id === layer.id);
    const pad = String(segments.length).length;
    const children = segments.map((seg, i) => {
      const newId = Math.random().toString(36).slice(2, 11);
      const child = new Layer(newId, 'shape', `${layer.name} Cut ${String(i + 1).padStart(pad, '0')}`);
      child.parentId = layer.parentId;
      child.params.seed = 0;
      child.params.posX = 0;
      child.params.posY = 0;
      child.params.scaleX = 1;
      child.params.scaleY = 1;
      child.params.rotation = 0;
      child.params.curves = Boolean(layer.params.curves);
      child.params.smoothing = 0;
      child.params.simplify = 0;
      child.sourcePaths = [seg.map((pt) => ({ x: pt.x, y: pt.y }))];
      child.penId = layer.penId;
      child.color = layer.color;
      child.strokeWidth = layer.strokeWidth;
      child.lineCap = layer.lineCap;
      child.visible = layer.visible;
      return child;
    });
    if (idx >= 0) {
      engine.layers.splice(idx, 1, ...children);
    } else {
      engine.layers.push(...children);
    }
    children.forEach((child) => engine.generate(child.id));
    return children;
  }

  UI.AlgorithmPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms, getThemeToken }
     */
    bind(deps) {
      DEPS = deps;
    },
    syncPrimaryModuleDropdown,
    isModifierType,
    isDrawableLayerType,
    rememberDrawableLayerType,
    getPreferredNewLayerType,
    computeHarmonographPlotterData,
    mountHarmonographPlotter,
    applyScissor,
    splitShapeLayer,
    installOn(proto) {
      proto.syncPrimaryModuleDropdown = function(layer) { return syncPrimaryModuleDropdown.call(this, layer); };
      proto.isModifierType = function(type) { return isModifierType.call(this, type); };
      proto.isDrawableLayerType = function(type) { return isDrawableLayerType.call(this, type); };
      proto.rememberDrawableLayerType = function(typeOrLayer) { return rememberDrawableLayerType.call(this, typeOrLayer); };
      proto.getPreferredNewLayerType = function() { return getPreferredNewLayerType.call(this); };
      proto.computeHarmonographPlotterData = function(layer) { return computeHarmonographPlotterData.call(this, layer); };
      proto.mountHarmonographPlotter = function(layer, target) { return mountHarmonographPlotter.call(this, layer, target); };
      proto.applyScissor = function(payload) { return applyScissor.call(this, payload); };
      proto.splitShapeLayer = function(layer, segments) { return splitShapeLayer.call(this, layer, segments); };
    },
  };
})();

