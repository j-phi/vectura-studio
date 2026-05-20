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

  // Unit 1.8: scissor helper. expandCirclePath is a pure geometry helper kept
  // local because its only consumer here is applyScissor; the legacy
  // _ui-legacy.js copy stays until that file is deleted.
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

  function computeHarmonographPlotterData(layer) {
    requireDeps('computeHarmonographPlotterData');
    const params = layer?.params || {};
    const samples = Math.max(200, Math.floor(params.samples ?? 4000));
    const duration = Math.max(1, params.duration ?? 30);
    const scale = params.scale ?? 1;
    const rotSpeed = (params.paperRotation ?? 0) * Math.PI * 2;
    const loopDrift = params.loopDrift ?? 0;
    const settleThreshold = Math.max(0, params.settleThreshold ?? 0);
    const settleWindow = Math.max(1, Math.floor(params.settleWindow ?? 24));
    const pendulums = (Array.isArray(params.pendulums) ? params.pendulums : [])
      .filter((pend) => pend?.enabled !== false)
      .map((pend) => ({
        ax: pend.ampX ?? 0,
        ay: pend.ampY ?? 0,
        phaseX: ((pend.phaseX ?? 0) * Math.PI) / 180,
        phaseY: ((pend.phaseY ?? 0) * Math.PI) / 180,
        freq: pend.freq ?? 1,
        micro: pend.micro ?? 0,
        damp: Math.max(0, pend.damp ?? 0),
      }));
    if (!pendulums.length) return { path: [], durationSec: 0 };
    const dt = duration / samples;
    const path = [];
    let settleCount = 0;
    for (let i = 0; i <= samples; i += 1) {
      const t = i * dt;
      let x = 0;
      let y = 0;
      pendulums.forEach((pend) => {
        const freq = (pend.freq + pend.micro + loopDrift * t) * Math.PI * 2;
        const decay = Math.exp(-pend.damp * t);
        x += pend.ax * Math.sin(freq * t + pend.phaseX) * decay;
        y += pend.ay * Math.sin(freq * t + pend.phaseY) * decay;
      });
      x *= scale;
      y *= scale;
      if (rotSpeed) {
        const ang = rotSpeed * t;
        const rx = x * Math.cos(ang) - y * Math.sin(ang);
        const ry = x * Math.sin(ang) + y * Math.cos(ang);
        x = rx;
        y = ry;
      }
      path.push({ x, y, t });
      if (settleThreshold > 0) {
        const mag = Math.hypot(x, y);
        settleCount = mag <= settleThreshold ? settleCount + 1 : 0;
        if (settleCount >= settleWindow) break;
      }
    }

    return { path, durationSec: path[path.length - 1]?.t ?? 0 };
  }

  function mountHarmonographPlotter(layer, target) {
    const { getThemeToken } = requireDeps('mountHarmonographPlotter');
    if (!target) return;
    const clamp =
      (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.AlgorithmUtils?.clamp ||
      ((value, min, max) => Math.min(Math.max(value, min), max));
    const data = this.computeHarmonographPlotterData(layer);
    const speeds = [0.25, 0.5, 1, 2, 4];
    const maxPlayhead = Math.max(0, data.path.length - 1);
    const initialPlayhead = clamp(this.harmonographPlotterState?.playhead ?? 0, 0, maxPlayhead);
    const rememberedSpeed = this.harmonographPlotterState?.speed ?? 1;
    const initialSpeed = speeds.includes(rememberedSpeed) ? rememberedSpeed : 1;
    const durationSec = Math.max(0.1, data.durationSec || layer?.params?.duration || 1);
    const progressPerMs = maxPlayhead > 0 ? maxPlayhead / (durationSec * 1000) : 0;
    const wrapper = document.createElement('div');
    wrapper.className = 'harmonograph-plotter mb-4';
    wrapper.innerHTML = `
        <div class="harmonograph-plotter-head">
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Virtual Plotter</span>
          <button type="button" class="harmonograph-plotter-play text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">Play</button>
        </div>
        <canvas class="harmonograph-plotter-canvas" width="240" height="240"></canvas>
        <div class="harmonograph-plotter-meta text-[10px] text-vectura-muted">Scrub the playhead to preview the drawing sequence.</div>
        <div class="harmonograph-plotter-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">Playhead</label>
          <input class="harmonograph-plotter-range" type="range" min="0" max="${maxPlayhead}" step="1" value="${initialPlayhead}">
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
    if (!canvas || !range || !speedSelect || !playBtn) return;

    const state = {
      rafId: null,
      playing: false,
      playhead: clamp(parseInt(range.value, 10) || 0, 0, maxPlayhead),
      speed: initialSpeed,
      lastTs: 0,
      maxPlayhead,
      progressPerMs,
    };
    this.harmonographPlotterState = state;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = getThemeToken('--plotter-bg', '#101115');
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!data.path.length) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      data.path.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
      const spanX = maxX - minX;
      const spanY = maxY - minY;
      const span = Math.max(spanX, spanY, 1);
      const pad = 16;
      const scale = (Math.min(canvas.width, canvas.height) - pad * 2) / span;
      const toCanvas = (pt) => ({
        x: (pt.x - (minX + maxX) / 2) * scale + canvas.width / 2,
        y: (pt.y - (minY + maxY) / 2) * scale + canvas.height / 2,
      });

      ctx.strokeStyle = getThemeToken('--plotter-path-base', 'rgba(113,113,122,0.35)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      data.path.forEach((pt, idx) => {
        const c = toCanvas(pt);
        if (idx === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();

      const limit = clamp(state.playhead, 0, data.path.length - 1);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= limit; i += 1) {
        const c = toCanvas(data.path[i]);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();

      const head = toCanvas(data.path[limit]);
      ctx.fillStyle = getThemeToken('--plotter-head', '#fafafa');
      ctx.beginPath();
      ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    const tick = (ts) => {
      if (!state.playing) return;
      const last = state.lastTs || ts;
      const delta = Math.max(0, ts - last);
      state.lastTs = ts;
      const step = delta * state.progressPerMs * state.speed;
      state.playhead += step;
      if (state.playhead >= state.maxPlayhead) {
        state.playhead = state.maxPlayhead;
        state.playing = false;
        state.rafId = null;
        playBtn.textContent = 'Play';
      }
      range.value = `${Math.round(state.playhead)}`;
      draw();
      if (state.playing) state.rafId = window.requestAnimationFrame(tick);
    };

    playBtn.onclick = () => {
      if (state.maxPlayhead <= 0) return;
      if (!state.playing && state.playhead >= state.maxPlayhead) {
        state.playhead = 0;
        range.value = '0';
        draw();
      }
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
      state.playhead = clamp(parseInt(e.target.value, 10) || 0, 0, state.maxPlayhead);
      if (state.playing) state.lastTs = 0;
      draw();
    };
    speedSelect.onchange = (e) => {
      const nextSpeed = parseFloat(e.target.value);
      state.speed = Number.isFinite(nextSpeed) ? nextSpeed : 1;
      if (state.playing) state.lastTs = 0;
    };
    if (state.maxPlayhead <= 0) {
      playBtn.disabled = true;
      playBtn.classList.add('opacity-60', 'cursor-not-allowed');
      range.disabled = true;
      speedSelect.disabled = true;
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


  // ── Meridian Unit 1.9c (2026-05-20) ─────────────────────────────────
  // `splitShapeLayer` migrated out of `class UI` in `_ui-legacy.js`. Reads
  // the `Layer` constructor from DEPS (already injected via bind).
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

