/**
 * Vectura Send to Plotter panel (shell + Connect, Setup, Plot tabs).
 *
 * Exposes window.Vectura.UI.Modals.SendToPlotter. File > Send to Plotter... opens a large panel
 * with a left tab rail: Connect, Setup, Machine, Plot, Console. This module owns the shell and the
 * Connect / Setup / Plot tabs; Machine and Console are mounted from window.Vectura.PlotterMachineTools
 * (mountMachine / mountConsole, each returning { update(), destroy() }).
 *
 * Core modules used (all pure, see docs/plotter-send-spec.md): PlotSafety, PlotJob, GrblProtocol,
 * PlotterTransports (WebSerialTransport / SimulatorTransport), PlotterController. This file never
 * writes to a port itself: every byte goes through the controller and its safety filter.
 *
 * Methods installed onto UI.prototype via installOn: bindSendToPlotterButton, openSendToPlotter.
 * DI bag: { getEl, SETTINGS }.
 *
 * State that must outlive the panel (controller, running job, progress) lives in a module-level
 * session, so closing the panel while a job runs keeps the job running and re-opening shows it.
 *
 * Compile gate: tests/unit/modals/send-to-plotter-compile.test.js
 * Lifecycle test: tests/integration/modals/send-to-plotter.test.js
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  const Modals = UI.Modals = UI.Modals || {};

  let DEPS = null;
  const requireDeps = (name) => {
    if (!DEPS) throw new Error(`SendToPlotter.${name} invoked before SendToPlotter.bind(deps) — load order broken`);
    return DEPS;
  };

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const clampNum = (v, lo, hi, fb) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : fb);
  const clone = (v) => {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).forEach((k) => { o[k] = clone(v[k]); });
      return o;
    }
    return v;
  };
  const merge = (base, over) => {
    const out = clone(base);
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach((k) => {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = merge(out[k], v);
      } else if (v !== undefined) out[k] = clone(v);
    });
    return out;
  };
  const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const patchFromPath = (path, value) => {
    const out = {};
    let cur = out;
    const keys = path.split('.');
    keys.forEach((k, i) => { if (i === keys.length - 1) cur[k] = value; else { cur[k] = {}; cur = cur[k]; } });
    return out;
  };
  const hexOk = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c);
  const safeColor = (c) => (hexOk(c) ? c : '#000000');
  const safeId = (s) => (typeof s === 'string' && /^[A-Za-z0-9_\-.:]{1,64}$/.test(s) ? s : null);

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    const a = attrs || {};
    Object.keys(a).forEach((k) => {
      const v = a[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.keys(v).forEach((d) => { el.dataset[d] = v[d]; });
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    kids.flat().forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  };
  const svgEl = (markup) => {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstChild;
  };

  const fmtMm = (mm) => (mm >= 10000 ? `${(mm / 1000).toFixed(1)} m` : mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${mm.toFixed(0)} mm`);
  const fmtTime = (sec) => {
    if (!isNum(sec) || sec < 0) return '–';
    const s = Math.round(sec);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
  };
  const fmtN = (n, d = 1) => (isNum(n) ? String(Number(n.toFixed(d))) : '–');

  const PS = () => Vectura.PlotSafety;
  const PJ = () => Vectura.PlotJob;
  const getSettingsRoot = () => (DEPS && DEPS.SETTINGS) || Vectura.SETTINGS || {};

  // ---------------------------------------------------------------------------
  // Plot settings (preference key `plotter`): defaults + validation
  // ---------------------------------------------------------------------------
  const PLACEMENT_MODES = ['document', 'fit', 'center'];
  const ORDER_MODES = ['optimized', 'document', 'reverse', 'random'];
  const SWATCH_PATTERNS = ['hatch', 'zigzag', 'circle'];
  const SWATCH_DEFAULTS = { rows: '1500, 3000, 6000', cols: '2.5, 3.5, 4.5', pattern: 'hatch', size: 15, offsetX: 0, offsetY: 0 };

  const baseSettings = () => {
    const d = (Vectura.PLOTTER_DEFAULTS && Vectura.PLOTTER_DEFAULTS.settings) || {};
    return merge(d, {
      registrationMark: false,
      showTravel: true,
      swatch: SWATCH_DEFAULTS,
    });
  };

  const sanitizePen = (raw) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const optNum = (v, lo, hi) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : null);
    const out = {
      enabled: r.enabled !== false,
      drawFeed: optNum(r.drawFeed, 50, 20000),
      down: optNum(r.down, 0, 12),
      downDelay: optNum(r.downDelay, 0, 10),
      passes: Math.round(clampNum(r.passes, 1, 10, 1)),
      order: ORDER_MODES.includes(r.order) ? r.order : 'optimized',
    };
    if (r.reload && typeof r.reload === 'object' && isNum(r.reload.everyMm) && r.reload.everyMm > 0) {
      const rl = r.reload;
      out.reload = {
        everyMm: clampNum(rl.everyMm, 1, 100000, 500),
        position: { x: clampNum(rl.position && rl.position.x, -5000, 5000, 0), y: clampNum(rl.position && rl.position.y, -5000, 5000, 0) },
        dips: Math.round(clampNum(rl.dips, 1, 20, 1)),
        dipDepth: isNum(rl.dipDepth) ? clampNum(rl.dipDepth, 0, 12, null) : null,
        dwell: clampNum(rl.dwell, 0, 30, 0),
      };
    }
    return out;
  };

  const sanitizeSettings = (raw) => {
    const base = baseSettings();
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = clone(base);
    out.profileId = safeId(r.profileId) || base.profileId;
    const pl = r.placement && typeof r.placement === 'object' ? r.placement : {};
    out.placement = {
      mode: PLACEMENT_MODES.includes(pl.mode) ? pl.mode : 'document',
      offsetX: clampNum(pl.offsetX, -5000, 5000, 0),
      offsetY: clampNum(pl.offsetY, -5000, 5000, 0),
      scale: clampNum(pl.scale, 0.01, 100, 1),
      rotate: [0, 90, 180, 270].includes(pl.rotate) ? pl.rotate : 0,
    };
    const op = r.optimize && typeof r.optimize === 'object' ? r.optimize : {};
    out.optimize = {
      enabled: op.enabled !== false,
      simplify: clampNum(op.simplify, 0, 5, 0.02),
      minLength: clampNum(op.minLength, 0, 100, 0),
      dedupe: op.dedupe !== false,
      sort: op.sort !== false,
      merge: op.merge !== false,
      mergeTol: clampNum(op.mergeTol, 0, 5, 0.1),
    };
    out.pens = {};
    if (r.pens && typeof r.pens === 'object') {
      Object.keys(r.pens).slice(0, 32).forEach((id) => { if (safeId(id)) out.pens[id] = sanitizePen(r.pens[id]); });
    }
    out.penOrder = Array.isArray(r.penOrder) ? r.penOrder.filter((id) => safeId(id)).slice(0, 32) : null;
    out.penChange = r.penChange === 'continue' ? 'continue' : 'pause';
    out.penChangePosition = 'origin';
    out.returnToOrigin = r.returnToOrigin !== false;
    out.airPlot = r.airPlot === true;
    out.registrationMark = r.registrationMark === true;
    out.showTravel = r.showTravel !== false;
    out.profileOverrides = {};
    const sw = r.swatch && typeof r.swatch === 'object' ? r.swatch : {};
    const list = (v, fb) => (typeof v === 'string' && /^[0-9eE.,\s+-]{1,60}$/.test(v) ? v : fb);
    out.swatch = {
      rows: list(sw.rows, SWATCH_DEFAULTS.rows),
      cols: list(sw.cols, SWATCH_DEFAULTS.cols),
      pattern: SWATCH_PATTERNS.includes(sw.pattern) ? sw.pattern : 'hatch',
      size: clampNum(sw.size, 2, 100, 15),
      offsetX: clampNum(sw.offsetX, -5000, 5000, 0),
      offsetY: clampNum(sw.offsetY, -5000, 5000, 0),
    };
    return out;
  };

  // ---------------------------------------------------------------------------
  // Profile store: user profiles + per-profile overrides in localStorage
  // ---------------------------------------------------------------------------
  const PROFILES_KEY = 'vectura_plotter_profiles';
  const OVERRIDES_KEY = 'vectura_plotter_overrides';
  const lsRead = (key, fb) => {
    try {
      const raw = G.localStorage && G.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fb;
    } catch (e) { return fb; }
  };
  const lsWrite = (key, value) => {
    try { if (G.localStorage) G.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  };

  const Store = {
    builtIns() { return Vectura.PLOTTER_PROFILES || []; },
    isBuiltIn(id) { return Store.builtIns().some((p) => p.id === id); },
    userProfiles() {
      const raw = lsRead(PROFILES_KEY, []);
      if (!Array.isArray(raw)) return [];
      const out = [];
      raw.slice(0, 50).forEach((p) => {
        if (!p || typeof p !== 'object' || !safeId(p.id)) return;
        const n = PS().normalizeProfile(p);
        if (PS().validateProfile(n).ok && !Store.isBuiltIn(p.id)) out.push(Object.assign(clone(n), { user: true }));
      });
      return out;
    },
    allProfiles() { return Store.builtIns().map((p) => clone(p)).concat(Store.userProfiles()); },
    baseProfile(id) { return Store.allProfiles().find((p) => p.id === id) || Store.builtIns()[0] || null; },
    overrides(id) {
      const all = lsRead(OVERRIDES_KEY, {});
      return all && typeof all === 'object' && all[id] && typeof all[id] === 'object' ? all[id] : {};
    },
    // Validates the merged result; never persists an invalid override.
    setOverride(id, patch) {
      const base = Store.baseProfile(id);
      if (!base) return { ok: false, errors: ['Unknown profile.'] };
      const next = merge(Store.overrides(id), patch);
      const eff = PS().normalizeProfile(merge(base, next));
      const v = PS().validateProfile(eff);
      if (!v.ok) return { ok: false, errors: v.errors };
      const all = lsRead(OVERRIDES_KEY, {});
      const root = all && typeof all === 'object' ? all : {};
      root[id] = next;
      lsWrite(OVERRIDES_KEY, root);
      return { ok: true, profile: eff };
    },
    effectiveProfile(id) {
      const base = Store.baseProfile(id);
      if (!base) return null;
      return PS().normalizeProfile(merge(base, Store.overrides(id)));
    },
    saveUserProfile(p) {
      const n = PS().normalizeProfile(p);
      const v = PS().validateProfile(n);
      if (!v.ok) return { ok: false, errors: v.errors };
      const list = lsRead(PROFILES_KEY, []);
      const arr = Array.isArray(list) ? list.filter((x) => x && x.id !== n.id) : [];
      arr.push(Object.assign(clone(n), { user: true }));
      if (!lsWrite(PROFILES_KEY, arr)) return { ok: false, errors: ['Could not save: browser storage is unavailable.'] };
      return { ok: true, profile: n };
    },
    deleteUserProfile(id) {
      const list = lsRead(PROFILES_KEY, []);
      const arr = Array.isArray(list) ? list.filter((x) => x && x.id !== id) : [];
      lsWrite(PROFILES_KEY, arr);
      const all = lsRead(OVERRIDES_KEY, {});
      if (all && typeof all === 'object' && all[id]) { delete all[id]; lsWrite(OVERRIDES_KEY, all); }
    },
    duplicate(id) {
      const base = Store.effectiveProfile(id);
      if (!base) return null;
      const taken = new Set(Store.allProfiles().map((p) => p.id));
      let n = 1;
      let nid = `user-${id.replace(/^user-/, '').slice(0, 40)}-${n}`;
      while (taken.has(nid)) { n += 1; nid = `user-${id.replace(/^user-/, '').slice(0, 40)}-${n}`; }
      const copy = clone(base);
      copy.id = nid;
      copy.name = `${base.name} (copy)`;
      copy.tested = false;
      copy.user = true;
      delete copy.calibration;
      const r = Store.saveUserProfile(copy);
      return r.ok ? r.profile : null;
    },
  };

  // ---------------------------------------------------------------------------
  // Session: outlives the panel (a job keeps running when the panel is closed)
  // ---------------------------------------------------------------------------
  const ACTIVE_STATES = ['running', 'paused', 'penChange'];
  const STATE_LABEL = {
    disconnected: 'Disconnected', connecting: 'Connecting', idle: 'Idle', jogging: 'Idle', running: 'Running',
    paused: 'Paused', penChange: 'Pen change', stopping: 'Stopping', alarm: 'Alarm', error: 'Error',
  };

  const session = {
    controller: null,
    transport: null,
    kind: null, // 'usb' | 'sim'
    profileId: null,
    status: null,
    progress: null,
    penChange: null,
    alarm: null,
    lastError: null,
    lastResult: null,
    run: null, // { kind, job, gcode, startedAt, runOpts }
    simSpeed: 20,
    useMachineZero: false,
    unsubs: [],
    listeners: new Set(),
    hooked: false,
  };
  const notify = (what) => {
    session.listeners.forEach((fn) => { try { fn(what); } catch (e) { /* a panel must not break the session */ } });
  };
  const liveController = () => (session.controller && session.controller.state !== 'disconnected' ? session.controller : null);
  const isActiveJob = () => !!(session.controller && ACTIVE_STATES.includes(session.controller.state));

  const hookPageHide = () => {
    if (session.hooked || typeof G.addEventListener !== 'function') return;
    session.hooked = true;
    // Closing the tab mid-job: best-effort feed hold so the pen is not dragged on.
    G.addEventListener('pagehide', () => {
      try { if (Vectura.PlotterController) Vectura.PlotterController.bestEffortHold(); } catch (e) { /* ignore */ }
    });
  };

  const unbindController = () => {
    session.unsubs.forEach((off) => { try { off(); } catch (e) { /* ignore */ } });
    session.unsubs = [];
  };

  const bindController = (c) => {
    unbindController();
    const on = (evt, fn) => session.unsubs.push(c.on(evt, fn));
    on('state', ({ state }) => {
      if (state !== 'penChange') session.penChange = null;
      if (state === 'running' && session.lastResult && session.lastResult.aborted) {
        session.lastResult = null;
        session.alarm = null;
      }
      if (state === 'disconnected') {
        session.status = null;
        session.penChange = null;
      }
      notify('state');
    });
    on('status', (s) => { session.status = s; notify('status'); });
    on('progress', (p) => { session.progress = p; notify('progress'); });
    on('penChange', (e) => { session.penChange = e; notify('penChange'); });
    on('done', (r) => {
      session.lastResult = r;
      if (!r.aborted) {
        const total = (session.progress && session.progress.pathCount) || (r.pathCount || 0);
        session.progress = Object.assign({}, session.progress, { percent: 100, pathIndex: Math.max(0, total - 1), pathCount: total });
      }
      notify('done');
    });
    on('alarm', (a) => { session.alarm = a; notify('alarm'); });
    on('error', (e) => { session.lastError = e; notify('error'); });
    on('origin', () => notify('origin'));
  };

  const simOptionsOverride = () => (Modals.SendToPlotter && Modals.SendToPlotter.simOptions) || {};

  // NOTE: for a USB connection requestPort() needs the user's click; callers must invoke this
  // directly from the click handler with no await before it.
  async function connectSession(kind, profile, opts) {
    const o = opts || {};
    const T = Vectura.PlotterTransports;
    if (!T || !Vectura.PlotterController) throw new Error('The plotter modules did not load.');
    if (liveController()) throw new Error('Already connected. Disconnect first.');
    let transport;
    if (kind === 'sim') {
      transport = new T.SimulatorTransport(Object.assign({ profile, speed: session.simSpeed }, simOptionsOverride()));
    } else {
      transport = new T.WebSerialTransport({ profile });
      if (o.port) transport.usePort(o.port);
      else {
        const port = await transport.requestPort(o.showAll ? { showAll: true } : undefined);
        if (!port) return null; // dialog dismissed
      }
    }
    const driver = Vectura.PLOTTER_DRIVERS && Vectura.PLOTTER_DRIVERS[profile.driver];
    if (!driver) throw new Error(`No driver for "${profile.driver}".`);
    const controller = driver.createController(profile, transport);
    session.controller = controller;
    session.transport = transport;
    session.kind = kind;
    session.profileId = profile.id;
    session.lastError = null;
    session.lastResult = null;
    session.alarm = null;
    session.progress = null;
    session.run = null;
    session.useMachineZero = false;
    bindController(controller);
    hookPageHide();
    notify('connecting');
    try {
      await controller.connect();
    } catch (err) {
      unbindController();
      session.controller = null;
      session.transport = null;
      session.kind = null;
      throw err;
    }
    notify('connected');
    return controller;
  }

  async function disconnectSession() {
    const c = session.controller;
    if (!c) return;
    try { await c.disconnect(); } catch (e) { /* ignore */ }
    unbindController();
    session.controller = null;
    session.transport = null;
    session.kind = null;
    session.run = null;
    session.progress = null;
    session.alarm = null;
    session.lastResult = null;
    session.status = null;
    notify('disconnected');
  }

  // ---------------------------------------------------------------------------
  // Geometry + job pipeline
  // ---------------------------------------------------------------------------
  function readGeometry(ui) {
    const B = Vectura.ExportSvgBuilder;
    if (!B || typeof B.buildPlotPolylines !== 'function' || !ui || typeof ui.getExportSnapshot !== 'function') {
      return { groups: [], docSize: { width: 0, height: 0 }, error: 'The export pipeline is unavailable.' };
    }
    const snapshot = ui.getExportSnapshot();
    const groups = B.buildPlotPolylines(snapshot, { tolerance: 0.05 });
    const prof = (snapshot && snapshot.prof) || {};
    return { groups, docSize: { width: isNum(prof.width) ? prof.width : 0, height: isNum(prof.height) ? prof.height : 0 }, error: null };
  }

  const originOffsetOf = (c) => (c && c.wco ? { x: c.wco.x, y: c.wco.y } : { x: 0, y: 0 });

  function buildJobFor(geometry, settings, profile, controller) {
    const s = clone(settings);
    s.profileOverrides = {};
    return PJ().buildJob(geometry.groups, {
      settings: s,
      profile,
      docSize: geometry.docSize,
      firmware: controller ? controller.fw : null,
      originOffset: originOffsetOf(controller),
    });
  }

  const travelCache = new WeakMap();
  const travelOf = (job) => {
    if (travelCache.has(job)) return travelCache.get(job);
    const segs = [];
    let pos = { x: 0, y: 0 };
    (job.pens || []).forEach((pen) => (pen.paths || []).forEach((path) => {
      if (!path || path.length < 2) return;
      segs.push([pos, path[0]]);
      pos = path[path.length - 1];
    }));
    if (job.returnToOrigin !== false && segs.length) segs.push([pos, { x: 0, y: 0 }]);
    travelCache.set(job, segs);
    return segs;
  };

  // ---------------------------------------------------------------------------
  // Preview canvas (DPR aware): work area, sheet, origin, paths, travel, overflow, live pen
  // ---------------------------------------------------------------------------
  // Black pens would vanish on a dark canvas: swap to the text color when the pen is close to the background.
  const lumOf = (hex) => {
    let c = hex.slice(1);
    if (c.length === 3 || c.length === 4) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c.slice(0, 6), 16);
    if (!Number.isFinite(n)) return 0.5;
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };
  const visibleOnDark = (color, textColor, bgColor) => {
    if (!hexOk(bgColor)) return color;
    return Math.abs(lumOf(color) - lumOf(bgColor)) < 0.25 && hexOk(textColor) ? textColor : color;
  };

  class Preview {
    constructor(panel) {
      this.panel = panel;
      this.canvas = h('canvas', { class: 'stp-canvas', role: 'img', 'aria-label': 'Plot preview in machine coordinates' });
      this.el = h('div', { class: 'stp-canvas-wrap' }, this.canvas);
      this.raf = 0;
      this.ro = null;
      if (typeof ResizeObserver === 'function') {
        this.ro = new ResizeObserver(() => this.invalidate());
        this.ro.observe(this.el);
      }
    }

    invalidate() {
      if (this.raf || typeof requestAnimationFrame !== 'function') { if (typeof requestAnimationFrame !== 'function') this.draw(); return; }
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
    }

    destroy() {
      if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.ro) this.ro.disconnect();
    }

    draw() {
      const canvas = this.canvas;
      const cssW = this.el.clientWidth;
      const cssH = this.el.clientHeight;
      if (!cssW || !cssH) return;
      const dpr = Math.max(1, G.devicePixelRatio || 1);
      const pw = Math.round(cssW * dpr);
      const ph = Math.round(cssH * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return;
      const v = this.panel.view();
      const cs = G.getComputedStyle ? G.getComputedStyle(canvas) : null;
      const tok = (name, fb) => ((cs && cs.getPropertyValue(name).trim()) || fb);
      const cBorder = tok('--ui-border-hi', '#3f3f46');
      const cText = tok('--ui-text-2', '#a1a1aa');
      const cDanger = tok('--ui-danger', '#e5484d');
      const cAccent = tok('--ui-accent', '#fafafa');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const a = v.area;
      let minX = Math.min(a.x, 0); let minY = Math.min(a.y, 0);
      let maxX = Math.max(a.x + a.w, 0); let maxY = Math.max(a.y + a.h, 0);
      if (v.job && v.job.bbox) {
        minX = Math.min(minX, v.job.bbox.minX); minY = Math.min(minY, v.job.bbox.minY);
        maxX = Math.max(maxX, v.job.bbox.maxX); maxY = Math.max(maxY, v.job.bbox.maxY);
      }
      const pad = 20;
      const sc = Math.min((cssW - pad * 2) / Math.max(1, maxX - minX), (cssH - pad * 2) / Math.max(1, maxY - minY));
      const ox = pad + ((cssW - pad * 2) - (maxX - minX) * sc) / 2 - minX * sc;
      const oy = pad + ((cssH - pad * 2) - (maxY - minY) * sc) / 2 - minY * sc;
      const X = (x) => ox + x * sc;
      const Y = (y) => oy + y * sc;
      this.last = { sc, ox, oy };

      // work area
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(127,127,127,0.06)';
      ctx.fillRect(X(a.x), Y(a.y), a.w * sc, a.h * sc);
      ctx.strokeStyle = v.overflow ? cDanger : cBorder;
      ctx.strokeRect(X(a.x) + 0.5, Y(a.y) + 0.5, a.w * sc, a.h * sc);

      // sheet / document rectangle at its placement
      if (v.doc && v.doc.length > 2) {
        ctx.beginPath();
        v.doc.forEach((p, i) => { if (i) ctx.lineTo(X(p.x), Y(p.y)); else ctx.moveTo(X(p.x), Y(p.y)); });
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fill();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = cText;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // travel moves
      if (v.job && v.showTravel) {
        ctx.beginPath();
        travelOf(v.job).forEach(([p, q]) => { ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(q.x), Y(q.y)); });
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(160,160,170,0.55)';
        ctx.lineWidth = 0.75;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // drawn paths, one batch per pen colour; segments outside the work area in red
      if (v.job) {
        const eps = 1e-6;
        const inside = (p) => p.x >= a.x - eps && p.x <= a.x + a.w + eps && p.y >= a.y - eps && p.y <= a.y + a.h + eps;
        const red = [];
        (v.job.pens || []).forEach((pen) => {
          ctx.beginPath();
          (pen.paths || []).forEach((path) => {
            if (!path || path.length < 2) return;
            ctx.moveTo(X(path[0].x), Y(path[0].y));
            for (let i = 1; i < path.length; i += 1) {
              ctx.lineTo(X(path[i].x), Y(path[i].y));
              if (!inside(path[i]) || !inside(path[i - 1])) red.push(path[i - 1], path[i]);
            }
          });
          ctx.strokeStyle = visibleOnDark(safeColor(pen.pen && pen.pen.color), tok('--ui-text', '#e4e4e7'), tok('--ui-bg', '#09090b'));
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        if (red.length) {
          ctx.beginPath();
          for (let i = 0; i < red.length; i += 2) { ctx.moveTo(X(red[i].x), Y(red[i].y)); ctx.lineTo(X(red[i + 1].x), Y(red[i + 1].y)); }
          ctx.strokeStyle = cDanger;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // origin marker
      ctx.strokeStyle = cAccent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(0) - 7, Y(0)); ctx.lineTo(X(0) + 7, Y(0));
      ctx.moveTo(X(0), Y(0) - 7); ctx.lineTo(X(0), Y(0) + 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(0), Y(0), 4, 0, Math.PI * 2);
      ctx.stroke();

      // live pen position
      if (v.live) {
        ctx.beginPath();
        ctx.arc(X(v.live.x), Y(v.live.y), 5, 0, Math.PI * 2);
        ctx.fillStyle = v.live.down ? cDanger : cAccent;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Control wrappers (existing components with plain fallbacks)
  // ---------------------------------------------------------------------------
  const ctlSwitch = (checked, onChange, aria, disabled) => {
    if (typeof UI.SwToggle === 'function') {
      const c = UI.SwToggle(null, { checked: !!checked, ariaLabel: aria, disabled: !!disabled, onChange });
      c.el.classList.add('stp-sw');
      return c.el;
    }
    const cb = h('input', { type: 'checkbox', 'aria-label': aria, onchange: () => onChange(cb.checked) });
    cb.checked = !!checked;
    cb.disabled = !!disabled;
    return cb;
  };
  const ctlSeg = (options, value, onChange, aria) => {
    if (typeof UI.TogGrp === 'function') {
      const c = UI.TogGrp(null, { options, value, ariaLabel: aria, onChange });
      return c.el;
    }
    const sel = h('select', { 'aria-label': aria, onchange: () => onChange(sel.value) }, options.map((o) => h('option', { value: o.value, text: o.label })));
    sel.value = value;
    return sel;
  };
  const ctlStep = (value, o, onChange) => {
    if (typeof UI.NumStep === 'function') {
      const c = UI.NumStep(null, Object.assign({ value, onChange }, o));
      return c.el;
    }
    const inp = h('input', { type: 'number', 'aria-label': o.ariaLabel, step: o.step || 1, onchange: () => onChange(parseFloat(inp.value)) });
    inp.value = value;
    return inp;
  };
  // Dense numeric input; empty = inherit the profile value (placeholder shows it).
  const ctlNum = (value, o, onChange) => {
    const inp = h('input', {
      type: 'number', class: 'stp-in', 'aria-label': o.ariaLabel, step: o.step || 'any', min: o.min, max: o.max,
      placeholder: o.placeholder != null ? String(o.placeholder) : null,
    });
    inp.value = value == null ? '' : String(value);
    inp.addEventListener('change', () => {
      const raw = inp.value.trim();
      if (raw === '') { onChange(o.nullable ? null : (o.fallback != null ? o.fallback : 0)); return; }
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) { inp.value = value == null ? '' : String(value); return; }
      onChange(clampNum(n, o.min != null ? o.min : -Infinity, o.max != null ? o.max : Infinity, n));
    });
    return inp;
  };
  const field = (label, control, hint) => h('label', { class: 'stp-field' },
    h('span', { class: 'stp-field-lbl', text: label }), control, hint ? h('span', { class: 'stp-hint', text: hint }) : null);
  const row = (label, control, hint) => h('div', { class: 'stp-row' },
    h('span', { class: 'stp-row-lbl' }, label, hint ? h('span', { class: 'stp-hint', text: hint }) : null), control);
  const section = (title, ...kids) => h('section', { class: 'stp-sec' }, h('h3', { class: 'stp-sec-h', text: title }), ...kids);
  const btn = (label, onClick, cls, attrs) => h('button', Object.assign({ type: 'button', class: `stp-btn ${cls || ''}`.trim(), onclick: onClick }, attrs || {}), label);

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------
  const TABS = [
    { id: 'connect', label: 'Connect' },
    { id: 'setup', label: 'Setup' },
    { id: 'machine', label: 'Machine' },
    { id: 'plot', label: 'Plot' },
    { id: 'console', label: 'Console' },
  ];
  let activePanel = null;

  class Panel {
    constructor(ui) {
      this.ui = ui;
      this.tab = 'connect';
      this.panes = {};
      this.tools = { machine: null, console: null };
      this.previews = [];
      this.timers = {};
      this.s = { geometry: null, job: null, jobError: null, building: false, altJob: null, connectMsg: null, connectBusy: false, plotMsg: null, confirmClose: false, profileErrors: null, simSpeedLabel: null };
      this.onSession = (what) => this.queueRefresh(what);
      this.refreshQueued = null;
      this.destroyed = false;
    }

    // ---- settings / profile access ----
    settings() {
      const root = getSettingsRoot();
      if (!root.plotter) root.plotter = sanitizeSettings({});
      return root.plotter;
    }

    saveSettings(patch) {
      const root = getSettingsRoot();
      root.plotter = sanitizeSettings(merge(this.settings(), patch || {}));
      const app = this.ui && this.ui.app;
      if (app && typeof app.persistPreferencesDebounced === 'function') app.persistPreferencesDebounced();
      this.scheduleRecompute();
      return root.plotter;
    }

    profile() {
      const id = session.controller && session.controller.state !== 'disconnected' ? session.profileId : this.settings().profileId;
      return Store.effectiveProfile(id) || Store.effectiveProfile(Store.builtIns()[0] && Store.builtIns()[0].id);
    }

    calibration() {
      const o = Store.overrides(this.profile().id);
      const c = (o && o.calibration) || {};
      return { axisChecked: c.axisChecked === true, penHeightChecked: c.penHeightChecked === true };
    }

    setProfileOverride(patch) {
      const p = this.profile();
      const r = Store.setOverride(p.id, patch);
      if (r.ok) {
        const c = liveController();
        if (c && !isActiveJob() && c.profile) c.profile = Object.assign(c.profile, r.profile); // keeps the controller's reference
        this.scheduleRecompute();
        this.queueRefresh('profile');
      }
      return r;
    }

    makeCtx() {
      const self = this;
      return {
        getController: () => liveController(),
        getProfile: () => self.profile(),
        getFirmware: () => (liveController() ? Object.assign({}, liveController().fw) : {}),
        getSettings: () => self.settings(),
        saveSettings: (patch) => self.saveSettings(patch),
        setProfileOverride: (patch) => self.setProfileOverride(patch),
        getJobBbox: () => {
          const j = self.s.job;
          return j && j.bbox ? Object.assign({}, j.bbox) : null;
        },
        getOriginOffset: () => originOffsetOf(liveController()),
        log: (msg, level) => {
          const c = liveController();
          if (c && typeof c.emit === 'function') c.emit('log', { dir: level === 'warn' || level === 'error' ? 'warn' : 'info', text: String(msg) });
        },
        requestTab: (name) => self.showTab(name),
      };
    }

    // ---- lifecycle ----
    open() {
      const Modal = UI.overlays && UI.overlays.Modal;
      if (typeof Modal !== 'function') throw new Error('The modal primitive is unavailable.');
      this.settings();
      this.ctx = this.makeCtx();
      this.modal = Modal(document.body, {
        ariaLabel: 'Send to Plotter',
        keyboard: false,
        dismissOnBackdrop: false,
        render: (body) => this.build(body),
        onClose: () => this.teardown(),
      });
      this.modal.dialog.classList.add('stp-dialog');
      this.modal.body.classList.add('stp-modal-body');
      session.listeners.add(this.onSession);
      this.modal.open();
      this.refreshGeometry();
      this.refreshAll();
      // Land on the most useful tab: Plot when a job is live, Connect when not connected, else Setup.
      const c = liveController();
      this.showTab(isActiveJob() ? 'plot' : (c ? 'setup' : 'connect'));
    }

    requestClose() {
      if (isActiveJob()) { this.s.confirmClose = true; this.renderHeader(); return; }
      this.close();
    }

    close() { if (this.modal) this.modal.close(); }

    teardown() {
      if (this.destroyed) return;
      this.destroyed = true;
      session.listeners.delete(this.onSession);
      Object.keys(this.timers).forEach((k) => clearTimeout(this.timers[k]));
      this.previews.forEach((p) => p.destroy());
      ['machine', 'console'].forEach((k) => { try { if (this.tools[k]) this.tools[k].destroy(); } catch (e) { /* ignore */ } this.tools[k] = null; });
      if (this.modal) {
        const m = this.modal;
        this.modal = null;
        setTimeout(() => { try { m.destroy(); } catch (e) { /* ignore */ } }, 0);
      }
      if (activePanel === this) activePanel = null;
    }

    // ---- shell ----
    build(body) {
      this.root = h('div', { class: 'stp-root' });
      this.head = h('header', { class: 'stp-head' });
      this.runbar = h('div', { class: 'stp-runbar', hidden: true });
      this.rail = h('nav', { class: 'stp-rail', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'Send to Plotter sections' });
      this.stage = h('div', { class: 'stp-stage' });
      TABS.forEach((t) => {
        const b = h('button', { type: 'button', class: 'stp-tab', role: 'tab', id: `stp-tab-${t.id}`, 'aria-controls': `stp-pane-${t.id}`, dataset: { tab: t.id }, onclick: () => this.showTab(t.id) }, t.label);
        this.rail.appendChild(b);
        const pane = h('div', { class: 'stp-pane', role: 'tabpanel', id: `stp-pane-${t.id}`, 'aria-labelledby': `stp-tab-${t.id}`, dataset: { pane: t.id }, hidden: true });
        this.panes[t.id] = pane;
        this.stage.appendChild(pane);
      });
      this.root.append(this.head, this.runbar, h('div', { class: 'stp-main' }, this.rail, this.stage));
      body.appendChild(this.root);
      this.root.addEventListener('keydown', (e) => this.onKey(e));
      this.buildConnect();
      this.buildSetup();
      this.buildPlot();
      this.renderHeader();
    }

    onKey(e) {
      // Keep app shortcuts (Delete, undo, tool keys) out while the panel holds focus.
      e.stopPropagation();
      if (e.key !== 'Escape') return;
      e.preventDefault();
      const c = liveController();
      if (c && ACTIVE_STATES.includes(c.state)) { this.stopJob(); return; }
      const ae = document.activeElement;
      if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) { ae.blur(); return; }
      this.requestClose();
    }

    showTab(id) {
      if (!this.panes[id]) return;
      this.tab = id;
      TABS.forEach((t) => {
        const on = t.id === id;
        this.panes[t.id].hidden = !on;
        const b = this.rail.querySelector(`[data-tab="${t.id}"]`);
        if (b) { b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
      });
      if (id === 'machine' || id === 'console') this.mountTool(id);
      if (id === 'setup' || id === 'plot') this.previews.forEach((p) => p.invalidate());
      if (id === 'plot') this.renderPlot();
    }

    mountTool(id) {
      const pane = this.panes[id];
      if (this.tools[id]) { try { this.tools[id].update(); } catch (e) { /* tool errors stay in the tool */ } return; }
      pane.textContent = '';
      const MT = Vectura.PlotterMachineTools;
      const fn = MT && MT[id === 'machine' ? 'mountMachine' : 'mountConsole'];
      if (typeof fn !== 'function') {
        pane.appendChild(h('div', { class: 'stp-placeholder', text: 'Machine tools unavailable' }));
        return;
      }
      const host = h('div', { class: 'stp-tool-host' });
      pane.appendChild(host);
      try {
        this.tools[id] = fn.call(MT, host, this.ctx);
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('[SendToPlotter] tool mount failed', err);
        pane.textContent = '';
        pane.appendChild(h('div', { class: 'stp-placeholder', text: 'Machine tools unavailable' }));
      }
    }

    // ---- header: state pill, Stop, run bar, close ----
    renderHeader() {
      if (!this.head) return;
      const c = liveController();
      const state = c ? c.state : 'disconnected';
      const profile = this.profile();
      this.head.textContent = '';
      this.pill = h('span', { class: `stp-pill is-${state}`, role: 'status', 'aria-live': 'polite', dataset: { state }, text: STATE_LABEL[state] || state });
      const stop = btn('Stop', () => this.stopJob(), 'stp-stop', { 'aria-label': 'Stop the plot (Escape)', hidden: !ACTIVE_STATES.includes(state) && state !== 'stopping', disabled: state === 'stopping' });
      stop.id = 'stp-stop';
      this.head.append(
        h('h2', { class: 'stp-title', text: 'Send to Plotter' }),
        h('span', { class: 'stp-profile-name', text: session.kind === 'sim' && c ? `${profile.name} (simulator)` : profile.name }),
        this.pill,
        h('span', { class: 'stp-spacer' }),
        stop,
        btn('Close', () => this.requestClose(), 'stp-close', { 'aria-label': 'Close Send to Plotter' }),
      );
      if (this.s.confirmClose) {
        this.head.appendChild(h('div', { class: 'stp-confirm', role: 'alertdialog', 'aria-label': 'Close while plotting' },
          h('span', { text: 'A plot is running. Closing this panel does not stop it; reopen Send to Plotter to watch or stop it.' }),
          btn('Keep open', () => { this.s.confirmClose = false; this.renderHeader(); }, ''),
          btn('Close panel', () => { this.s.confirmClose = false; this.close(); }, 'is-warn', { id: 'stp-confirm-close' })));
      }
      this.renderRunbar();
    }

    renderRunbar() {
      const c = liveController();
      const active = !!(c && (ACTIVE_STATES.includes(c.state) || c.state === 'stopping'));
      this.runbar.hidden = !active;
      if (!active) { this.runbar.textContent = ''; return; }
      const p = session.progress || {};
      const pct = clampNum(p.percent, 0, 100, 0);
      this.runbar.textContent = '';
      this.runbar.append(
        h('div', { class: 'stp-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, h('div', { class: 'stp-bar-fill', style: `width:${pct}%` })),
        h('span', { class: 'stp-runtext', text: `${pct}% · path ${Math.min((p.pathIndex || 0) + 1, p.pathCount || 0)}/${p.pathCount || 0}` }),
      );
    }

    stopJob() {
      const c = liveController();
      if (!c) return Promise.resolve();
      return c.stop().catch((e) => { session.lastError = { message: e.message }; notify('error'); });
    }

    // ---- refresh orchestration ----
    queueRefresh(what) {
      if (this.destroyed) return;
      if (what === 'status') { this.refreshLive(); return; }
      if (this.refreshQueued) { this.refreshQueued.add(what); return; }
      this.refreshQueued = new Set([what]);
      setTimeout(() => {
        const whats = this.refreshQueued;
        this.refreshQueued = null;
        if (this.destroyed) return;
        this.refreshAll(whats);
      }, 0);
    }

    refreshLive() {
      this.previews.forEach((p) => p.invalidate());
      this.renderRunbar();
      ['machine', 'console'].forEach((k) => { if (this.tools[k] && this.tab === k) { try { this.tools[k].update(); } catch (e) { /* ignore */ } } });
      if (this.tab === 'plot') this.renderPlotLive();
    }

    refreshAll(whats) {
      if (this.destroyed) return;
      const w = whats || new Set(['all']);
      this.renderHeader();
      if (w.has('all') || w.has('state') || w.has('connected') || w.has('disconnected') || w.has('connecting') || w.has('error') || w.has('origin') || w.has('profile') || w.has('alarm')) {
        this.renderConnect();
      }
      if (w.has('connected') || w.has('disconnected') || w.has('origin') || w.has('profile') || w.has('all')) this.scheduleRecompute();
      this.renderPlot();
      this.renderStats();
      ['machine', 'console'].forEach((k) => { if (this.tools[k]) { try { this.tools[k].update(); } catch (e) { /* ignore */ } } });
      this.previews.forEach((p) => p.invalidate());
      // Needs attention: bring Plot forward for a pen change or alarm.
      if ((w.has('penChange') || w.has('alarm')) && this.tab !== 'plot') this.showTab('plot');
    }

    // ---- geometry + job ----
    refreshGeometry() {
      try {
        this.s.geometry = readGeometry(this.ui);
        this.s.jobError = this.s.geometry.error;
      } catch (err) {
        this.s.geometry = { groups: [], docSize: { width: 0, height: 0 } };
        this.s.jobError = `Could not read the document: ${err.message}`;
      }
      this.recompute();
      if (this.setupPens) this.renderPens();
    }

    scheduleRecompute() {
      if (this.destroyed) return;
      clearTimeout(this.timers.recompute);
      this.s.building = true;
      this.timers.recompute = setTimeout(() => this.recompute(), 120);
    }

    recompute() {
      clearTimeout(this.timers.recompute);
      this.s.building = false;
      const g = this.s.geometry;
      if (!g) return;
      try {
        this.s.job = buildJobFor(g, this.settings(), this.profile(), liveController());
        if (!this.s.jobError || /^Could not build/.test(this.s.jobError)) this.s.jobError = null;
      } catch (err) {
        this.s.job = null;
        this.s.jobError = `Could not build the plot: ${err.message}`;
      }
      if (!this.destroyed) { this.renderStats(); this.renderPlot(); this.previews.forEach((p) => p.invalidate()); }
    }

    view() {
      const c = liveController();
      const profile = this.profile();
      const wco = originOffsetOf(c);
      const eff = PS().effectiveWorkArea(profile, c ? c.fw : null);
      const alt = this.s.altJob;
      const job = alt ? alt.job : this.s.job;
      const g = this.s.geometry;
      let doc = null;
      if (!alt && g && g.docSize.width > 0 && g.docSize.height > 0) {
        try {
          const w = g.docSize.width; const hh = g.docSize.height;
          doc = PJ().placePolylines([[{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: hh }, { x: 0, y: hh }, { x: 0, y: 0 }]], g.docSize, eff, this.settings().placement, profile.axes)[0];
        } catch (e) { doc = null; }
      }
      let live = null;
      const st = session.status;
      if (c && st && st.wpos && isNum(st.wpos.x)) {
        live = { x: st.wpos.x, y: st.wpos.y, down: !!(st.mpos && isNum(st.mpos.z) && st.mpos.z > profile.pen.up + 0.3) };
      }
      return {
        area: { x: -wco.x, y: -wco.y, w: eff.width, h: eff.height },
        job, doc, live,
        showTravel: this.settings().showTravel,
        overflow: !!(job && job.bounds && !job.bounds.ok),
      };
    }

    // Why Start is unavailable; empty array = ready.
    startBlockers() {
      const c = liveController();
      const out = [];
      const sim = session.kind === 'sim';
      if (!c) { out.push('Connect to a plotter first (Connect tab).'); return out; }
      if (c.state !== 'idle') out.push(`The plotter is ${STATE_LABEL[c.state] ? STATE_LABEL[c.state].toLowerCase() : c.state}.`);
      const job = this.s.job;
      if (!job || !job.pens || !job.pens.length) out.push('There is nothing to plot. Add geometry or enable a pen.');
      if (job && job.bounds && !job.bounds.ok) out.push(this.overflowMessage(job.bounds));
      if (!c.originSet && !sim && !session.useMachineZero) out.push('Set the origin first (Machine tab), or tick "Use machine zero".');
      if (!sim) {
        const cal = this.calibration();
        if (!cal.axisChecked) out.push('Run the Axis check once (Machine tab).');
        if (!cal.penHeightChecked) out.push('Run the Pen height check once (Machine tab).');
      }
      if (this.s.altJob && this.s.altJob.job.bounds && !this.s.altJob.job.bounds.ok) out.push('The test pattern does not fit the work area.');
      return out;
    }

    overflowMessage(b) {
      const parts = [];
      ['left', 'right', 'top', 'bottom'].forEach((k) => { if (b.overflow && b.overflow[k] > 0) parts.push(`${k} ${fmtN(b.overflow[k], 1)} mm`); });
      return `Out of bounds: the plot extends past the work area (${parts.join(', ')}). Move, scale or rotate it.`;
    }
  }

  // ---------------------------------------------------------------------------
  // Connect tab
  // ---------------------------------------------------------------------------
  const CARD_COLORS = { tested: '#7bc98f', untested: '#e8b25a', custom: '#6aa9ff' };
  const FW_ROWS = [
    [110, 'X max rate', 'mm/min'], [111, 'Y max rate', 'mm/min'], [112, 'Z max rate', 'mm/min'],
    [130, 'X travel', 'mm'], [131, 'Y travel', 'mm'], [132, 'Z travel', 'mm'], [22, 'Homing', ''],
  ];
  const EDIT_FIELDS = [
    { k: 'name', label: 'Name', type: 'text', wide: true },
    { k: 'workArea.width', label: 'Work width (mm)', min: 10, max: 4000 },
    { k: 'workArea.height', label: 'Work height (mm)', min: 10, max: 4000 },
    { k: 'motion.drawFeed', label: 'Draw feed (mm/min)', min: 10, max: 20000 },
    { k: 'motion.travelFeed', label: 'Travel feed (mm/min)', min: 10, max: 20000 },
    { k: 'motion.jogFeed', label: 'Jog feed (mm/min)', min: 10, max: 20000 },
    { k: 'limits.maxFeedXY', label: 'Max XY feed', min: 10, max: 20000 },
    { k: 'limits.maxFeedZ', label: 'Max Z feed', min: 10, max: 20000 },
    { k: 'limits.maxJogFeed', label: 'Max jog feed', min: 10, max: 20000 },
    { k: 'pen.mechanism', label: 'Pen mechanism', type: 'select', options: ['z', 'servo', 'custom'] },
    { k: 'pen.up', label: 'Pen up Z (mm)', min: 0, max: 12 },
    { k: 'pen.down', label: 'Pen down Z (mm)', min: 0, max: 12 },
    { k: 'pen.zMin', label: 'Z min (mm)', min: 0, max: 12 },
    { k: 'pen.zMax', label: 'Z max (mm)', min: 0, max: 12 },
    { k: 'pen.zFeed', label: 'Z feed (mm/min)', min: 10, max: 20000 },
    { k: 'pen.downDelay', label: 'Pen-down delay (s)', min: 0, max: 10 },
    { k: 'pen.upDelay', label: 'Pen-up delay (s)', min: 0, max: 10 },
    { k: 'pen.servoUp', label: 'Servo up command', type: 'text' },
    { k: 'pen.servoDown', label: 'Servo down command', type: 'text' },
    { k: 'gcode.preamble', label: 'Preamble (one line each)', type: 'lines', wide: true },
    { k: 'gcode.postamble', label: 'Postamble (one line each)', type: 'lines', wide: true },
  ];

  const bedIcon = (p) => {
    const w = Math.max(1, p.workArea.width); const hh = Math.max(1, p.workArea.height);
    const sc = Math.min(96 / w, 52 / hh);
    const rw = (w * sc).toFixed(1); const rh = (hh * sc).toFixed(1);
    const x = ((120 - w * sc) / 2).toFixed(1); const y = ((64 - hh * sc) / 2 + 2).toFixed(1);
    return svgEl(`<svg viewBox="0 0 120 68" aria-hidden="true" focusable="false"><rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="${(Number(x) + 4).toFixed(1)}" cy="${(Number(y) + 4).toFixed(1)}" r="2.2" fill="currentColor"/><path d="M${(Number(x) + 4).toFixed(1)} ${(Number(y) + 4).toFixed(1)}h14M${(Number(x) + 4).toFixed(1)} ${(Number(y) + 4).toFixed(1)}v10" stroke="currentColor" stroke-width="1" opacity=".6"/></svg>`);
  };

  Object.assign(Panel.prototype, {
    buildConnect() {
      const pane = this.panes.connect;
      this.connectEl = h('div', { class: 'stp-connect stp-scroll' });
      pane.appendChild(this.connectEl);
      this.renderConnect();
      this.refreshGranted();
    },

    async refreshGranted() {
      try {
        const T = Vectura.PlotterTransports;
        if (!T || !T.WebSerialTransport || !T.WebSerialTransport.isSupported()) { this.s.granted = []; return; }
        const t = new T.WebSerialTransport({ profile: this.profile() });
        this.s.granted = await t.getGrantedPorts();
      } catch (e) { this.s.granted = []; }
      if (!this.destroyed && !liveController()) this.renderConnect();
    },

    renderConnect() {
      if (!this.connectEl || this.destroyed) return;
      const keepScroll = this.connectEl.scrollTop;
      const c = liveController();
      const el = this.connectEl;
      el.textContent = '';
      const T = Vectura.PlotterTransports;
      const supported = !!(T && T.WebSerialTransport && T.WebSerialTransport.isSupported());

      if (!supported) {
        el.appendChild(h('div', { class: 'stp-note is-warn', id: 'stp-support-note' },
          h('strong', { text: 'Send to Plotter needs Chrome or Edge on Windows or macOS.' }),
          h('span', { text: ' This browser has no Web Serial support. You can still try everything with the simulator.' })));
      }

      // profile cards
      const profiles = Store.allProfiles();
      const cur = this.profile();
      const cards = h('div', { class: 'stp-cards', role: 'radiogroup', 'aria-label': 'Plotter profile' });
      profiles.forEach((p) => {
        const kind = p.user ? 'custom' : (p.tested ? 'tested' : 'untested');
        const selected = p.id === cur.id;
        const card = h('button', {
          type: 'button', class: `stp-card${selected ? ' is-current' : ''}`, role: 'radio', 'aria-checked': String(selected),
          style: `--stp-card-color:${CARD_COLORS[kind]}`, dataset: { profileId: p.id }, disabled: !!c && !selected,
          title: c && !selected ? 'Disconnect to change the plotter profile' : null,
          onclick: () => { this.saveSettings({ profileId: p.id }); this.s.profileErrors = null; this.renderConnect(); this.renderHeader(); this.previews.forEach((x) => x.invalidate()); },
        },
        h('span', { class: 'stp-card-preview' }, bedIcon(p)),
        h('span', { class: 'stp-card-name' }, h('i', { class: 'stp-card-dot' }), p.name),
        h('span', { class: 'stp-card-tag', text: `${fmtN(p.workArea.width, 0)} × ${fmtN(p.workArea.height, 0)} mm · ${p.pen.mechanism === 'z' ? 'Z-axis pen' : p.pen.mechanism === 'servo' ? 'Servo pen' : 'Custom pen'}` }),
        h('span', { class: `stp-badge is-${kind}`, text: kind === 'tested' ? 'Tested' : kind === 'custom' ? 'Custom' : 'Untested profile' }),
        h('span', { class: 'stp-current-marker', text: 'SELECTED' }));
        cards.appendChild(card);
      });
      el.appendChild(section('Plotter profile', cards, this.profileTools(cur, !!c)));

      el.appendChild(this.connectionSection(c, supported, cur));
      el.scrollTop = keepScroll;
    },

    profileTools(cur, connected) {
      const wrap = h('div', { class: 'stp-ptools' });
      const bar = h('div', { class: 'stp-btnrow' });
      bar.appendChild(btn('Duplicate profile', () => {
        const dup = Store.duplicate(cur.id);
        if (dup) { this.saveSettings({ profileId: dup.id }); this.s.profileOpen = true; this.renderConnect(); this.renderHeader(); }
      }, '', { id: 'stp-duplicate', disabled: connected }));
      if (cur.user) {
        bar.appendChild(btn('Delete profile', () => {
          Store.deleteUserProfile(cur.id);
          this.saveSettings({ profileId: Store.builtIns()[0].id });
          this.renderConnect(); this.renderHeader();
        }, 'is-warn', { id: 'stp-delete-profile', disabled: connected }));
      }
      wrap.appendChild(bar);
      if (!cur.user) {
        wrap.appendChild(h('p', { class: 'stp-hint', text: 'Built-in profiles are read-only. Duplicate one to change its speeds, limits, pen heights or G-code.' }));
        return wrap;
      }
      const errBox = h('div', { class: 'stp-errors', role: 'alert', id: 'stp-profile-errors' });
      const showErrors = (errs) => { errBox.textContent = ''; (errs || []).forEach((e) => errBox.appendChild(h('div', { class: 'stp-error', text: e }))); };
      showErrors(this.s.profileErrors);
      const grid = h('div', { class: 'stp-editgrid' });
      EDIT_FIELDS.forEach((f) => {
        const raw = getPath(cur, f.k);
        const apply = (value) => {
          const base = Store.userProfiles().find((p) => p.id === cur.id) || cur;
          const cand = merge(base, patchFromPath(f.k, value));
          const v = PS().validateProfile(PS().normalizeProfile(cand));
          if (!v.ok) { this.s.profileErrors = v.errors; showErrors(v.errors); return false; }
          const r = Store.saveUserProfile(cand);
          if (!r.ok) { this.s.profileErrors = r.errors; showErrors(r.errors); return false; }
          this.s.profileErrors = null; showErrors([]);
          this.scheduleRecompute(); this.renderHeader(); this.previews.forEach((x) => x.invalidate());
          return true;
        };
        let control;
        if (f.type === 'text') {
          control = h('input', { type: 'text', class: 'stp-in', maxlength: 80, 'aria-label': f.label });
          control.value = raw == null ? '' : String(raw);
          control.addEventListener('change', () => { if (!apply(control.value)) control.value = String(getPath(Store.baseProfile(cur.id) || cur, f.k) || ''); });
        } else if (f.type === 'select') {
          control = h('select', { class: 'stp-in', 'aria-label': f.label }, f.options.map((o) => h('option', { value: o, text: o })));
          control.value = raw;
          control.addEventListener('change', () => { if (!apply(control.value)) control.value = raw; });
        } else if (f.type === 'lines') {
          control = h('textarea', { class: 'stp-in stp-lines', rows: 2, 'aria-label': f.label, spellcheck: 'false' });
          control.value = (raw || []).join('\n');
          control.addEventListener('change', () => { apply(control.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)); });
        } else {
          control = ctlNum(raw, { ariaLabel: f.label, min: f.min, max: f.max, fallback: raw }, (n) => { if (!apply(n)) control.value = String(raw); });
        }
        grid.appendChild(h('label', { class: `stp-field${f.wide ? ' is-wide' : ''}` }, h('span', { class: 'stp-field-lbl', text: f.label }), control));
      });
      const det = h('details', { class: 'stp-details', id: 'stp-profile-editor' }, h('summary', { text: 'Edit profile' }), grid, errBox);
      if (this.s.profileOpen) det.open = true;
      det.addEventListener('toggle', () => { this.s.profileOpen = det.open; });
      wrap.appendChild(det);
      return wrap;
    },

    connectionSection(c, supported, cur) {
      const sec = h('section', { class: 'stp-sec', id: 'stp-connection' }, h('h3', { class: 'stp-sec-h', text: 'Connection' }));
      const state = c ? c.state : 'disconnected';
      if (this.s.connectMsg) sec.appendChild(h('div', { class: 'stp-note is-error', role: 'alert', id: 'stp-connect-error', text: this.s.connectMsg }));

      if (!c) {
        const busy = this.s.connectBusy;
        const bar = h('div', { class: 'stp-btnrow' });
        bar.appendChild(btn(busy ? 'Connecting…' : 'Connect (USB)', () => this.connectUsb({}), 'is-primary', { id: 'stp-connect-usb', disabled: !supported || busy }));
        (this.s.granted || []).forEach((port, i) => {
          let label = 'previous port';
          try { const i2 = port.getInfo(); if (i2 && i2.usbVendorId != null) label = `USB ${i2.usbVendorId.toString(16)}:${(i2.usbProductId || 0).toString(16)}`; } catch (e) { /* ignore */ }
          bar.appendChild(btn(`Reconnect ${label}`, () => this.connectUsb({ port }), '', { disabled: busy, dataset: { portIndex: String(i) } }));
        });
        if (supported) bar.appendChild(btn('Plotter not listed?', () => this.connectUsb({ showAll: true }), 'is-link', { disabled: busy }));
        sec.appendChild(bar);
        sec.appendChild(h('p', { class: 'stp-hint', id: 'stp-uuna-hint', text: "Close the UUNA app first — only one program can use the plotter's port." }));

        const speed = h('input', { type: 'range', min: 1, max: 200, step: 1, value: String(session.simSpeed), 'aria-label': 'Simulator speed' });
        const speedLbl = h('span', { class: 'stp-speed', text: `${session.simSpeed}×` });
        speed.addEventListener('input', () => { session.simSpeed = Number(speed.value); speedLbl.textContent = `${session.simSpeed}×`; });
        sec.appendChild(h('div', { class: 'stp-sim' },
          h('div', { class: 'stp-btnrow' }, btn('Use simulator', () => this.connectSim(), '', { id: 'stp-connect-sim', disabled: busy })),
          h('label', { class: 'stp-simspeed' }, h('span', { text: 'Speed' }), speed, speedLbl),
          h('span', { class: 'stp-hint', text: 'The simulator is a virtual plotter. Nothing moves and no port is opened.' })));
        return sec;
      }

      if (state === 'connecting') {
        sec.appendChild(h('p', { class: 'stp-note', text: 'Connecting… The board restarts when the port opens, which takes a couple of seconds.' }));
        return sec;
      }
      sec.appendChild(h('p', { class: 'stp-connected', id: 'stp-connected', text: `Connected to ${cur.name} ${session.kind === 'sim' ? '(simulator)' : 'over USB'}.` }));
      if (!c.originSet) {
        sec.appendChild(h('div', { class: 'stp-note is-warn', id: 'stp-origin-note' },
          h('strong', { text: 'Set the origin before plotting. ' }),
          h('span', { text: 'The board resets when the port opens, so the origin is never remembered. ' }),
          btn('Open Machine tab', () => this.showTab('machine'), 'is-link', { id: 'stp-goto-machine' })));
      } else {
        const o = c.originMachine || { x: 0, y: 0 };
        sec.appendChild(h('p', { class: 'stp-hint', text: `Origin set at machine position ${fmtN(o.x, 2)}, ${fmtN(o.y, 2)} mm.` }));
      }
      const fw = c.firmware || {};
      const table = h('table', { class: 'stp-fw', 'aria-label': 'Firmware information' });
      const add = (k, v) => table.appendChild(h('tr', {}, h('th', { scope: 'row', text: k }), h('td', { text: v })));
      add('Firmware', fw.banner || fw.version || 'not reported');
      if (fw.ver) add('Version', String(fw.ver));
      if (fw.opt) add('Options', String(fw.opt));
      FW_ROWS.forEach(([n, label, unit]) => {
        const v = c.fw ? c.fw[n] : undefined;
        add(`$${n} ${label}`, v === undefined ? 'not reported' : `${v}${unit ? ` ${unit}` : ''}`);
      });
      sec.appendChild(table);
      const active = isActiveJob();
      sec.appendChild(h('div', { class: 'stp-btnrow' }, btn('Disconnect', () => this.disconnect(), 'is-warn', { id: 'stp-disconnect', disabled: active || state === 'stopping', title: active ? 'Stop the job before disconnecting' : null })));
      return sec;
    },

    errorText(err) {
      const msg = (err && err.message) || String(err);
      return /open|busy|access|denied|in use|lock/i.test(msg) && !/Another plotter/.test(msg)
        ? `${msg} Close the UUNA app (or any other program using the port) and try again.` : msg;
    },

    connectUsb(opts) {
      if (this.s.connectBusy) return null;
      this.s.connectMsg = null;
      // requestPort() runs synchronously inside connectSession so the click's user activation still counts.
      const p = connectSession('usb', this.profile(), opts || {});
      this.s.connectBusy = true;
      this.renderConnect();
      return p.then((c) => { if (!c) this.s.connectMsg = null; }).catch((err) => { this.s.connectMsg = this.errorText(err); })
        .finally(() => { this.s.connectBusy = false; if (!this.destroyed) { this.renderConnect(); this.renderHeader(); this.scheduleRecompute(); } });
    },

    connectSim() {
      if (this.s.connectBusy) return null;
      this.s.connectMsg = null;
      const p = connectSession('sim', this.profile(), {});
      this.s.connectBusy = true;
      this.renderConnect();
      return p.catch((err) => { this.s.connectMsg = this.errorText(err); })
        .finally(() => { this.s.connectBusy = false; if (!this.destroyed) { this.renderConnect(); this.renderHeader(); this.scheduleRecompute(); } });
    },

    async disconnect() {
      await disconnectSession();
      if (!this.destroyed) { this.renderConnect(); this.renderHeader(); this.refreshGranted(); this.scheduleRecompute(); }
    },
  });

  // ---------------------------------------------------------------------------
  // Setup tab
  // ---------------------------------------------------------------------------
  const rotIcon = (deg) => svgEl(`<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g transform="rotate(${deg} 20 20)"><rect x="11" y="6" width="18" height="26" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 14h10M15 19h10M15 24h6" stroke="currentColor" stroke-width="1.2" opacity=".6"/><path d="M20 2.5l3 3.2h-6z" fill="currentColor"/></g></svg>`);

  Object.assign(Panel.prototype, {
    buildSetup() {
      const pane = this.panes.setup;
      const left = h('div', { class: 'stp-controls stp-scroll' });
      this.penBox = h('div', { class: 'stp-pens', id: 'stp-pens' });
      this.statsEl = h('div', { class: 'stp-stats', id: 'stp-stats', 'aria-live': 'polite' });
      this.oobEl = h('div', { class: 'stp-oob', id: 'stp-oob', role: 'alert' });
      const s = this.settings();

      // placement
      const pl = s.placement;
      const modeSeg = ctlSeg([{ value: 'document', label: 'Document' }, { value: 'fit', label: 'Fit' }, { value: 'center', label: 'Center' }], pl.mode,
        (v) => { this.saveSettings({ placement: { mode: v } }); }, 'Placement mode');
      modeSeg.id = 'stp-place-mode';
      const rotRow = h('div', { class: 'stp-rotcards', role: 'radiogroup', 'aria-label': 'Rotation' });
      [0, 90, 180, 270].forEach((deg) => {
        const b = h('button', { type: 'button', class: `stp-rotcard${pl.rotate === deg ? ' is-current' : ''}`, role: 'radio', 'aria-checked': String(pl.rotate === deg), 'aria-label': `Rotate ${deg} degrees`, dataset: { rotate: String(deg) }, onclick: () => {
          this.saveSettings({ placement: { rotate: deg } });
          rotRow.querySelectorAll('.stp-rotcard').forEach((x) => { const on = x.dataset.rotate === String(deg); x.classList.toggle('is-current', on); x.setAttribute('aria-checked', String(on)); });
        } }, rotIcon(deg), h('span', { text: `${deg}°` }));
        rotRow.appendChild(b);
      });
      const place = section('Placement',
        field('Mode', modeSeg, 'Document keeps the sheet corner at the origin. Fit and Center scale or center it in the work area.'),
        h('div', { class: 'stp-fields' },
          field('Offset X (mm)', ctlStep(pl.offsetX, { min: -5000, max: 5000, step: 1, ariaLabel: 'Offset X' }, (v) => this.saveSettings({ placement: { offsetX: v } }))),
          field('Offset Y (mm)', ctlStep(pl.offsetY, { min: -5000, max: 5000, step: 1, ariaLabel: 'Offset Y' }, (v) => this.saveSettings({ placement: { offsetY: v } }))),
          field('Scale', ctlStep(pl.scale, { min: 0.01, max: 100, step: 0.05, precision: 2, ariaLabel: 'Scale' }, (v) => this.saveSettings({ placement: { scale: v } })))),
        field('Rotation', rotRow));

      // optimize
      const op = s.optimize;
      const optBody = h('div', { class: 'stp-optbody' });
      const optToggle = (key, label) => row(label, ctlSwitch(op[key], (v) => this.saveSettings({ optimize: { [key]: v } }), label));
      optBody.append(
        optToggle('enabled', 'Optimize paths'),
        h('div', { class: 'stp-fields' },
          field('Simplify (mm)', ctlNum(op.simplify, { ariaLabel: 'Simplify tolerance', min: 0, max: 5, step: 0.01, fallback: 0 }, (v) => this.saveSettings({ optimize: { simplify: v } }))),
          field('Drop shorter than (mm)', ctlNum(op.minLength, { ariaLabel: 'Minimum path length', min: 0, max: 100, step: 0.1, fallback: 0 }, (v) => this.saveSettings({ optimize: { minLength: v } }))),
          field('Merge tolerance (mm)', ctlNum(op.mergeTol, { ariaLabel: 'Merge tolerance', min: 0, max: 5, step: 0.05, fallback: 0.1 }, (v) => this.saveSettings({ optimize: { mergeTol: v } })))),
        optToggle('dedupe', 'Remove duplicate paths'),
        optToggle('sort', 'Sort to shorten travel'),
        optToggle('merge', 'Merge touching paths'));
      const optimize = section('Optimize', optBody);

      const options = section('Options',
        row('Registration mark', ctlSwitch(s.registrationMark, (v) => this.saveSettings({ registrationMark: v }), 'Registration mark'), 'A 10 mm cross at the top-left, drawn by every pen, to check color alignment.'),
        row('Air plot', ctlSwitch(s.airPlot, (v) => this.saveSettings({ airPlot: v }), 'Air plot'), 'Runs the whole job with the pen held up.'),
        row('Return to origin', ctlSwitch(s.returnToOrigin, (v) => this.saveSettings({ returnToOrigin: v }), 'Return to origin'), 'After the last path, with the pen up.'),
        field('Between pens', ctlSeg([{ value: 'pause', label: 'Pause for pen change' }, { value: 'continue', label: 'Keep going' }], s.penChange, (v) => this.saveSettings({ penChange: v }), 'Pen change behavior')));

      left.append(place, section('Pens', this.penBox), optimize, options, section('Estimate', this.statsEl));

      // preview column
      this.setupPreview = new Preview(this);
      this.previews.push(this.setupPreview);
      const travel = ctlSwitch(s.showTravel, (v) => this.saveSettings({ showTravel: v }), 'Show travel moves');
      const bar = h('div', { class: 'stp-previewbar' },
        h('label', { class: 'stp-inline' }, h('span', { text: 'Travel moves' }), travel),
        h('span', { class: 'stp-spacer' }),
        btn('Refresh from canvas', () => this.refreshGeometry(), '', { id: 'stp-refresh', title: 'Re-read the document after changing it' }));
      const right = h('div', { class: 'stp-previewcol' }, bar, this.oobEl, this.setupPreview.el,
        h('p', { class: 'stp-hint', text: 'Machine view, relative to the origin (cross). Dashed rectangle: the sheet at its placement. Red: outside the work area.' }));
      pane.appendChild(h('div', { class: 'stp-setup' }, left, right));
      this.setupPens = true;
      this.renderPens();
      this.renderStats();
    },

    orderedPenIds() {
      const g = this.s.geometry;
      const ids = g ? g.groups.map((x) => x.penId) : [];
      const ord = this.settings().penOrder;
      if (!Array.isArray(ord)) return ids;
      const rank = new Map(ord.map((id, i) => [id, i]));
      return ids.map((id, i) => ({ id, i })).sort((a, b) => {
        const ra = rank.has(a.id) ? rank.get(a.id) : Infinity; const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
        if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
        return a.i - b.i;
      }).map((x) => x.id);
    },

    renderPens() {
      if (!this.penBox) return;
      const box = this.penBox;
      box.textContent = '';
      const g = this.s.geometry;
      if (!g || !g.groups.length) {
        box.appendChild(h('p', { class: 'stp-hint', text: 'No drawn paths yet. Add a layer, then press Refresh from canvas.' }));
        return;
      }
      const prof = this.profile();
      const s = this.settings();
      const ids = this.orderedPenIds();
      ids.forEach((id, idx) => {
        const grp = g.groups.find((x) => x.penId === id);
        const pen = (grp && grp.pen) || { id, name: id, color: '#000000' };
        const cfg = sanitizePen(s.pens[id] || {});
        const rl = cfg.reload || { everyMm: 0, position: { x: 0, y: 0 }, dips: 1, dipDepth: null, dwell: 0 };
        const save = (patch) => {
          const cur = sanitizePen((this.settings().pens || {})[id] || {});
          const next = Object.assign({}, cur, patch);
          this.saveSettings({ pens: { [id]: next } });
        };
        const saveReload = (patch) => {
          const cur = sanitizePen((this.settings().pens || {})[id] || {});
          const base = cur.reload || { everyMm: 0, position: { x: 0, y: 0 }, dips: 1, dipDepth: null, dwell: 0 };
          const next = Object.assign({}, base, patch);
          save({ reload: next.everyMm > 0 ? next : null });
        };
        const move = (dir) => {
          const order = this.orderedPenIds();
          const i = order.indexOf(id); const j = i + dir;
          if (j < 0 || j >= order.length) return;
          [order[i], order[j]] = [order[j], order[i]];
          this.saveSettings({ penOrder: order });
          this.renderPens();
        };
        const card = h('div', { class: `stp-pen${cfg.enabled ? '' : ' is-off'}`, dataset: { penId: id } },
          h('div', { class: 'stp-pen-head' },
            ctlSwitch(cfg.enabled, (v) => { save({ enabled: v }); card.classList.toggle('is-off', !v); }, `Plot ${pen.name || id}`),
            h('span', { class: 'stp-swatch', style: `background:${safeColor(pen.color)}`, 'aria-hidden': 'true' }),
            h('span', { class: 'stp-pen-name', text: pen.name || id }),
            h('span', { class: 'stp-hint', text: `${(grp && grp.polylines.length) || 0} paths` }),
            h('span', { class: 'stp-spacer' }),
            btn('↑', () => move(-1), 'stp-icon', { 'aria-label': `Move ${pen.name || id} earlier`, disabled: idx === 0 }),
            btn('↓', () => move(1), 'stp-icon', { 'aria-label': `Move ${pen.name || id} later`, disabled: idx === ids.length - 1 })),
          h('div', { class: 'stp-pen-grid' },
            field('Draw speed (mm/min)', ctlNum(cfg.drawFeed, { ariaLabel: `${pen.name} draw speed`, min: 50, max: 20000, nullable: true, placeholder: prof.motion.drawFeed }, (v) => save({ drawFeed: v }))),
            field('Pen-down height (mm)', ctlNum(cfg.down, { ariaLabel: `${pen.name} pen-down height`, min: 0, max: 12, step: 0.05, nullable: true, placeholder: prof.pen.down }, (v) => save({ down: v }))),
            field('Down dwell (s)', ctlNum(cfg.downDelay, { ariaLabel: `${pen.name} down dwell`, min: 0, max: 10, step: 0.05, nullable: true, placeholder: prof.pen.downDelay }, (v) => save({ downDelay: v }))),
            field('Passes', ctlNum(cfg.passes, { ariaLabel: `${pen.name} passes`, min: 1, max: 10, step: 1, fallback: 1 }, (v) => save({ passes: Math.round(v) }))),
            field('Path order', (() => {
              const sel = h('select', { class: 'stp-in', 'aria-label': `${pen.name} path order` }, ORDER_MODES.map((m) => h('option', { value: m, text: m[0].toUpperCase() + m.slice(1) })));
              sel.value = cfg.order;
              sel.addEventListener('change', () => save({ order: sel.value }));
              return sel;
            })())),
          h('details', { class: 'stp-details' }, h('summary', { text: 'Reload / dip (brush, ink)' }),
            h('div', { class: 'stp-pen-grid' },
              field('Reload every (mm, 0 = off)', ctlNum(rl.everyMm, { ariaLabel: `${pen.name} reload distance`, min: 0, max: 100000, fallback: 0 }, (v) => saveReload({ everyMm: v }))),
              field('Dips', ctlNum(rl.dips, { ariaLabel: `${pen.name} dips`, min: 1, max: 20, step: 1, fallback: 1 }, (v) => saveReload({ dips: Math.round(v) }))),
              field('Dip dwell (s)', ctlNum(rl.dwell, { ariaLabel: `${pen.name} dip dwell`, min: 0, max: 30, step: 0.1, fallback: 0 }, (v) => saveReload({ dwell: v }))),
              field('Dip X (mm)', ctlNum(rl.position.x, { ariaLabel: `${pen.name} reload X`, fallback: 0 }, (v) => saveReload({ position: Object.assign({}, rl.position, { x: v }) }))),
              field('Dip Y (mm)', ctlNum(rl.position.y, { ariaLabel: `${pen.name} reload Y`, fallback: 0 }, (v) => saveReload({ position: Object.assign({}, rl.position, { y: v }) }))))));
        box.appendChild(card);
      });
    },

    renderStats() {
      if (!this.statsEl) return;
      const alt = this.s.altJob;
      const job = alt ? alt.job : this.s.job;
      const el = this.statsEl;
      el.textContent = '';
      this.oobEl.textContent = '';
      this.oobEl.className = 'stp-oob';
      if (this.s.jobError) el.appendChild(h('div', { class: 'stp-note is-error', text: this.s.jobError }));
      if (this.s.building) el.appendChild(h('p', { class: 'stp-hint', text: 'Updating…' }));
      if (!job || !job.stats) { if (!this.s.jobError) el.appendChild(h('p', { class: 'stp-hint', text: 'No plot yet.' })); return; }
      const st = job.stats;
      if (alt) el.appendChild(h('p', { class: 'stp-hint', text: `Showing the ${alt.label}. Clear it on the Plot tab to see your artwork again.` }));
      const dl = h('dl', { class: 'stp-statlist' });
      const add = (k, v, id) => dl.append(h('dt', { text: k }), h('dd', { text: v, id }));
      add('Draw length', fmtMm(st.drawLength), 'stp-stat-draw');
      add('Travel', fmtMm(st.travelLength), 'stp-stat-travel');
      add('Pen lifts', String(st.penLifts), 'stp-stat-lifts');
      add('Paths', String(st.pathCount), 'stp-stat-paths');
      add('Estimated time', fmtTime(st.estSeconds), 'stp-stat-time');
      el.appendChild(dl);
      (job.warnings || []).forEach((w) => el.appendChild(h('p', { class: 'stp-hint', text: String(w) })));
      if (job.bounds && !job.bounds.ok) {
        const msg = this.overflowMessage(job.bounds);
        this.oobEl.className = 'stp-oob is-visible';
        this.oobEl.appendChild(h('strong', { text: msg }));
        el.appendChild(h('div', { class: 'stp-note is-error', text: msg }));
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Plot tab
  // ---------------------------------------------------------------------------
  const parseList = (txt, lo, hi) => String(txt || '').split(/[,\s]+/).map((s) => parseFloat(s)).filter((n) => Number.isFinite(n) && n >= lo && n <= hi).slice(0, 12);

  Object.assign(Panel.prototype, {
    buildPlot() {
      const pane = this.panes.plot;
      this.plotDyn = h('div', { class: 'stp-plotdyn', id: 'stp-plotdyn' });
      const s = this.settings();
      const sw = s.swatch;
      const mzRow = row('Use machine zero', ctlSwitch(session.useMachineZero, (v) => { session.useMachineZero = v; this.renderPlot(); }, 'Use machine zero'),
        'Plot from where the carriage was powered on instead of a set origin. Only if you know it is at the sheet corner.');
      mzRow.id = 'stp-machine-zero-row';
      const inp = (key, label, o) => field(label, (() => {
        const i = h('input', { type: 'text', class: 'stp-in', id: `stp-swatch-${key}`, 'aria-label': label, value: String(sw[key]) });
        i.addEventListener('change', () => this.saveSettings({ swatch: { [key]: o && o.num ? parseFloat(i.value) : i.value } }));
        return i;
      })());
      const pattern = h('select', { class: 'stp-in', id: 'stp-swatch-pattern', 'aria-label': 'Swatch pattern' }, SWATCH_PATTERNS.map((p) => h('option', { value: p, text: p[0].toUpperCase() + p.slice(1) })));
      pattern.value = sw.pattern;
      pattern.addEventListener('change', () => this.saveSettings({ swatch: { pattern: pattern.value } }));
      this.swatchBtns = {
        preview: btn('Preview swatches', () => this.previewSwatch(), '', { id: 'stp-swatch-preview' }),
        plot: btn('Plot swatches', () => this.plotSwatch(), '', { id: 'stp-swatch-plot' }),
        clear: btn('Clear preview', () => { this.s.altJob = null; this.renderStats(); this.renderPlot(); this.previews.forEach((p) => p.invalidate()); }, 'is-link', { id: 'stp-swatch-clear', hidden: true }),
      };
      this.auxBtns = {
        frame: btn('Frame', () => this.runFrame(), '', { id: 'stp-frame', title: 'Trace the plot outline with the pen up' }),
        scale: btn('Scale check', () => this.runScaleCheck(), '', { id: 'stp-scale-check', title: 'Draw a 100 mm square with a cross, to measure with a ruler' }),
      };
      const tools = section('Test and check',
        h('div', { class: 'stp-btnrow' }, this.auxBtns.frame, this.auxBtns.scale),
        h('p', { class: 'stp-hint', text: 'Frame moves the pen up around the outline of your plot. Scale check draws a 100 mm square and a cross.' }),
        h('h4', { class: 'stp-sub', text: 'Test swatches (speed × pen-down height)' }),
        h('div', { class: 'stp-fields' },
          inp('rows', 'Speeds (mm/min, rows)'), inp('cols', 'Pen-down heights (mm, columns)'), field('Pattern', pattern),
          inp('size', 'Patch size (mm)', { num: true }), inp('offsetX', 'Offset X (mm)', { num: true }), inp('offsetY', 'Offset Y (mm)', { num: true })),
        h('div', { class: 'stp-btnrow' }, this.swatchBtns.preview, this.swatchBtns.plot, this.swatchBtns.clear));

      this.plotPreview = new Preview(this);
      this.previews.push(this.plotPreview);
      const left = h('div', { class: 'stp-plotcol stp-scroll' },
        this.plotDyn,
        section('Run options',
          row('Air plot', ctlSwitch(s.airPlot, (v) => this.saveSettings({ airPlot: v }), 'Air plot'), 'Pen stays up. Good for a dry run.'),
          row('Return to origin', ctlSwitch(s.returnToOrigin, (v) => this.saveSettings({ returnToOrigin: v }), 'Return to origin')),
          mzRow),
        tools);
      pane.appendChild(h('div', { class: 'stp-plot' }, left, h('div', { class: 'stp-previewcol' }, this.plotPreview.el)));
      this.renderPlot();
    },

    checkItem(ok, text, extra) {
      return h('li', { class: `stp-check ${ok ? 'is-ok' : 'is-bad'}` }, h('span', { class: 'stp-check-mark', 'aria-hidden': 'true', text: ok ? '✓' : '✗' }), h('span', { text }), extra || null);
    },

    renderPlot() {
      if (!this.plotDyn || this.destroyed) return;
      const el = this.plotDyn;
      const c = liveController();
      const state = c ? c.state : 'disconnected';
      const sim = session.kind === 'sim';
      const job = this.s.altJob ? this.s.altJob.job : this.s.job;
      el.textContent = '';

      if (this.swatchBtns) this.swatchBtns.clear.hidden = !this.s.altJob;
      const blockers = this.startBlockers();
      const idle = state === 'idle';
      if (this.auxBtns) {
        const auxOk = !!c && idle && (c.originSet || sim || session.useMachineZero) && (sim || (this.calibration().axisChecked && this.calibration().penHeightChecked));
        this.auxBtns.frame.disabled = !auxOk || !(this.s.job && this.s.job.bbox);
        this.auxBtns.scale.disabled = !auxOk;
        this.swatchBtns.plot.disabled = !auxOk;
      }

      if (this.s.plotMsg) el.appendChild(h('div', { class: 'stp-note is-error', role: 'alert', id: 'stp-plot-error', text: this.s.plotMsg }));
      if (session.lastError && session.lastError.message && state !== 'running') {
        el.appendChild(h('div', { class: 'stp-note is-error', role: 'alert', text: session.lastError.message }));
      }
      if (this.s.altJob) el.appendChild(h('div', { class: 'stp-note', text: `Previewing the ${this.s.altJob.label}. Start plots your artwork; "Plot swatches" plots this pattern.` }));

      if (job && job.stats) {
        el.appendChild(h('p', { class: 'stp-summary', id: 'stp-plot-summary', text: `${job.stats.pathCount} paths · ${fmtMm(job.stats.drawLength)} drawn · about ${fmtTime(job.stats.estSeconds)}${job.airPlot ? ' · air plot' : ''}` }));
      }

      const active = ACTIVE_STATES.includes(state);
      if (!active && state !== 'stopping') {
        // readiness checklist
        const cal = this.calibration();
        const list = h('ul', { class: 'stp-checklist', id: 'stp-checklist' });
        list.appendChild(this.checkItem(!!c, c ? 'Connected' : 'Not connected', c ? null : btn('Connect', () => this.showTab('connect'), 'is-link')));
        list.appendChild(this.checkItem(!!(c && (c.originSet || sim || session.useMachineZero)), sim ? 'Origin (not needed in the simulator)' : 'Origin set', (!c || c.originSet || sim) ? null : btn('Set origin', () => this.showTab('machine'), 'is-link')));
        list.appendChild(this.checkItem(!(job && job.bounds && !job.bounds.ok), 'Plot fits the work area', job && job.bounds && !job.bounds.ok ? btn('Adjust placement', () => this.showTab('setup'), 'is-link') : null));
        list.appendChild(this.checkItem(sim || cal.axisChecked, sim ? 'Axis check (skipped in the simulator)' : 'Axis check done', (sim || cal.axisChecked) ? null : btn('Open Machine tab', () => this.showTab('machine'), 'is-link')));
        list.appendChild(this.checkItem(sim || cal.penHeightChecked, sim ? 'Pen height check (skipped in the simulator)' : 'Pen height check done', (sim || cal.penHeightChecked) ? null : btn('Open Machine tab', () => this.showTab('machine'), 'is-link')));
        el.appendChild(list);

        const startBtn = btn(this.s.altJob ? 'Start artwork plot' : 'Start plot', () => this.startPlot(), 'is-primary stp-start', { id: 'stp-start', disabled: blockers.length > 0 });
        el.appendChild(h('div', { class: 'stp-btnrow' }, startBtn));
        if (blockers.length) {
          const why = h('ul', { class: 'stp-why', id: 'stp-start-why' });
          blockers.forEach((b) => why.appendChild(h('li', { text: b })));
          el.appendChild(why);
        }
      }

      if (active || state === 'stopping') {
        const p = session.progress || {};
        const run = session.run;
        const bar = h('div', { class: 'stp-bar is-big', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': clampNum(p.percent, 0, 100, 0) },
          h('div', { class: 'stp-bar-fill', id: 'stp-prog-fill', style: `width:${clampNum(p.percent, 0, 100, 0)}%` }));
        const pens = run ? run.job.pens : [];
        const curPen = pens[Math.min(p.penOrdinal || 0, Math.max(0, pens.length - 1))];
        const controls = h('div', { class: 'stp-btnrow' },
          state === 'paused'
            ? btn('Resume', () => this.guard(() => c.resume()), 'is-primary', { id: 'stp-resume-run' })
            : btn('Pause', () => this.guard(() => c.pause()), '', { id: 'stp-pause', disabled: state !== 'running' }),
          btn('Stop', () => this.stopJob(), 'stp-stop-big', { id: 'stp-stop-big', disabled: state === 'stopping' }));
        el.append(
          controls, bar,
          h('div', { class: 'stp-runstats' },
            h('span', { id: 'stp-prog-text', text: `${clampNum(p.percent, 0, 100, 0)}%` }),
            curPen ? h('span', { class: 'stp-runpen' }, h('i', { class: 'stp-swatch', style: `background:${safeColor(curPen.pen && curPen.pen.color)}` }), ` Pen ${Math.min((p.penOrdinal || 0) + 1, pens.length)} of ${pens.length}: ${(curPen.pen && curPen.pen.name) || curPen.penId}`) : null,
            h('span', { id: 'stp-path-text', text: `Path ${Math.min((p.pathIndex || 0) + 1, p.pathCount || 0)} of ${p.pathCount || 0}` }),
            h('span', { id: 'stp-elapsed', text: 'Elapsed 00:00' }),
            h('span', { id: 'stp-eta', text: 'ETA –' })));
        this.renderPlotLive();
      }

      if (state === 'penChange' && session.penChange) el.appendChild(this.penChangeCard(c));
      if (!active && state !== 'stopping') this.appendEndCards(el, c, state, sim);
    },

    guard(fn) {
      try { const r = fn(); if (r && typeof r.catch === 'function') r.catch((e) => { this.s.plotMsg = e.message; this.renderPlot(); }); } catch (e) { this.s.plotMsg = e.message; this.renderPlot(); }
    },

    renderPlotLive() {
      const c = liveController();
      const run = session.run;
      const q = (id) => this.plotDyn && this.plotDyn.querySelector(`#${id}`);
      const fill = q('stp-prog-fill');
      if (!fill || !c) return;
      const p = session.progress || {};
      const pct = clampNum(p.percent, 0, 100, 0);
      fill.style.width = `${pct}%`;
      const set = (id, t) => { const n = q(id); if (n) n.textContent = t; };
      set('stp-prog-text', `${pct}%`);
      set('stp-path-text', `Path ${Math.min((p.pathIndex || 0) + 1, p.pathCount || 0)} of ${p.pathCount || 0}`);
      const elapsed = run ? (Date.now() - run.startedAt) / 1000 : 0;
      set('stp-elapsed', `Elapsed ${fmtTime(elapsed)}`);
      const est = run && run.job.stats ? run.job.stats.estSeconds : null;
      set('stp-eta', est != null ? `ETA ${fmtTime(pct >= 3 ? Math.max(0, elapsed * (100 - pct) / pct) : est)}` : 'ETA –');
    },

    penChangeCard(c) {
      const pc = session.penChange;
      const pen = pc.pen && pc.pen.pen ? pc.pen.pen : (pc.pen || {});
      const prof = this.profile();
      const down = !!this.s.pcDown;
      return h('div', { class: 'stp-pencard', id: 'stp-pen-change', role: 'group', 'aria-label': 'Pen change' },
        h('h3', { class: 'stp-sec-h', text: 'Change pen' }),
        h('p', { class: 'stp-pc-pen' }, h('i', { class: 'stp-swatch is-big', style: `background:${safeColor(pen.color)}` }), h('strong', { text: pen.name || pen.id || 'Next pen' })),
        h('p', { class: 'stp-hint', text: 'The carriage is parked at the origin with the pen up. Swap the pen, then continue. Re-check the height if the new pen is a different length.' }),
        h('div', { class: 'stp-btnrow' },
          down
            ? btn('Raise pen', () => this.penCheck(false, c, prof), '', { id: 'stp-pc-raise' })
            : btn('Re-check pen height', () => this.penCheck(true, c, prof), '', { id: 'stp-pc-check' }),
          btn('Continue', () => this.guard(() => c.continuePenChange()), 'is-primary', { id: 'stp-pc-continue', disabled: down, title: down ? 'Raise the pen first' : null })));
    },

    // Lowers/raises the pen at the pen-change position for a touch test. The line goes through the
    // controller's safety filter (classifyCommand) using the profile's own clamped heights.
    async penCheck(lower, c, prof) {
      try {
        const MT = Vectura.PlotterMachineTools;
        if (MT && typeof MT.penCheck === 'function') {
          await MT.penCheck(this.ctx, lower);
        } else {
          const pen = prof.pen;
          let line;
          if (!lower) line = c._penUpLine();
          else if (pen.mechanism === 'z') line = `G1 Z${Number(PS().clampZ(pen.down, prof, c.fw).toFixed(3))} F${Math.round(PS().clampFeedZ(pen.zFeed, prof, c.fw))}`;
          else line = pen.servoDown;
          await c._cmd(line);
          if (c.pen) c.pen = { state: lower ? 'down' : 'up', z: c.pen.z };
        }
        this.s.pcDown = lower;
        this.s.plotMsg = null;
      } catch (err) { this.s.plotMsg = err.message; }
      this.renderPlot();
    },

    appendEndCards(el, c, state, sim) {
      const res = session.lastResult;
      const alarm = session.alarm;
      const lost = !!((res && res.positionLost) || (alarm && alarm.positionLost));
      if (res && !res.aborted) {
        el.appendChild(h('div', { class: 'stp-note is-ok', id: 'stp-done', role: 'status' },
          h('strong', { text: 'Plot complete. ' }),
          h('span', { text: `${res.pathCount || 0} paths in ${fmtTime((res.elapsedMs || 0) / 1000)}.` })));
        return;
      }
      if (!res && !alarm) return;
      const msg = (alarm && alarm.message) || (res && res.message) || 'The plot stopped.';
      const box = h('div', { class: 'stp-resume', id: 'stp-resume', role: 'group', 'aria-label': 'Resume' },
        h('h3', { class: 'stp-sec-h', text: state === 'alarm' ? 'Alarm' : 'Stopped' }),
        h('p', { class: 'stp-resume-msg', text: msg }));
      if (lost) {
        box.appendChild(h('p', { class: 'stp-hint', id: 'stp-lost', text: 'Resume is disabled: the position was lost. Power-cycle the plotter, reconnect, and set the origin again.' }));
        el.appendChild(box);
        return;
      }
      const rp = (res && res.resumePoint) || (alarm && alarm.resumePoint) || (c && c.getResumePoint && c.getResumePoint());
      if (rp && c && c._lastJob) {
        const total = rp.pathCount || (session.progress && session.progress.pathCount) || 0;
        const input = h('input', { type: 'number', class: 'stp-in stp-resume-input', id: 'stp-resume-path', min: 1, max: Math.max(1, total), step: 1, 'aria-label': 'Resume from path number' });
        input.value = String((rp.pathIndex || 0) + 1);
        const can = state === 'idle' && (c.originSet || sim || session.useMachineZero);
        box.appendChild(h('div', { class: 'stp-fields' }, field(`Resume from path (1–${total})`, input)));
        box.appendChild(h('div', { class: 'stp-btnrow' },
          btn(`Resume from path ${(rp.pathIndex || 0) + 1}`, () => {
            const n = Math.round(clampNum(parseFloat(input.value), 1, Math.max(1, total), (rp.pathIndex || 0) + 1));
            this.s.plotMsg = null;
            if (session.run) session.run.startedAt = Date.now();
            this.guard(() => c.resumeFrom(n - 1));
          }, 'is-primary', { id: 'stp-resume-btn', disabled: !can }),
          btn('Start over', () => { session.lastResult = null; session.alarm = null; this.startPlot(); }, '', { id: 'stp-start-over', disabled: !!this.startBlockers().length })));
        if (!can) box.appendChild(h('p', { class: 'stp-hint', text: state === 'alarm' ? 'Unlock the plotter on the Machine tab, check the pen is clear of the paper, then resume.' : 'Set the origin again on the Machine tab to resume.' }));
      }
      el.appendChild(box);
    },

    // ---- running jobs ----
    startPlot() {
      const c = liveController();
      const why = this.startBlockers();
      if (!c || why.length) { this.s.plotMsg = why[0] || 'Not ready.'; this.renderPlot(); return null; }
      this.s.plotMsg = null;
      const settings = this.settings();
      const profile = this.profile();
      let job;
      let gcode;
      try {
        // Rebuild against the live origin so the bounds check matches what the controller will test.
        job = buildJobFor(this.s.geometry, settings, profile, c);
        if (!job.bounds.ok) throw new Error(this.overflowMessage(job.bounds));
        if (!job.pens.length) throw new Error('There is nothing to plot.');
        gcode = PJ().toGcode(job, profile, { airPlot: settings.airPlot });
      } catch (err) { this.s.plotMsg = err.message; this.renderPlot(); return null; }
      if (this.s.altJob) this.s.altJob = null;
      return this.runGcode('plot', job, gcode, { penChange: settings.penChange });
    },

    runGcode(kind, job, gcode, extra) {
      const c = liveController();
      if (!c) return null;
      const sim = session.kind === 'sim';
      const runOpts = Object.assign({
        penChange: 'continue',
        pens: (job.pens || []).map((p) => p.pen),
        useMachineZero: !c.originSet && (sim || session.useMachineZero),
      }, extra || {});
      session.run = { kind, job, gcode, startedAt: Date.now(), runOpts };
      session.progress = { percent: 0, pathIndex: 0, pathCount: (gcode.pathStartIndices || []).length, penOrdinal: 0 };
      session.lastResult = null;
      session.alarm = null;
      session.lastError = null;
      this.s.pcDown = false;
      let p;
      try { p = c.run(gcode, runOpts); } catch (err) { p = Promise.reject(err); }
      this.renderPlot();
      return Promise.resolve(p).catch((err) => {
        session.run = null;
        this.s.plotMsg = err.message;
        if (!this.destroyed) { this.renderPlot(); this.renderHeader(); }
      });
    },

    auxProfileArgs() {
      const c = liveController();
      return { originOffset: originOffsetOf(c), firmware: c ? c.fw : null };
    },

    runFrame() {
      const c = liveController();
      const job0 = this.s.job;
      if (!c || !job0 || !job0.bbox) return null;
      const profile = this.profile();
      try {
        const frame = PJ().frameJob(job0.bbox, profile, this.auxProfileArgs());
        if (!frame.bounds.ok) throw new Error(this.overflowMessage(frame.bounds));
        const gcode = PJ().toGcode(frame, profile, {});
        this.s.plotMsg = null;
        return this.runGcode('frame', frame, gcode);
      } catch (err) { this.s.plotMsg = err.message; this.renderPlot(); return null; }
    },

    runScaleCheck() {
      const c = liveController();
      if (!c) return null;
      const profile = this.profile();
      const sw = this.settings().swatch;
      try {
        const job = PJ().scaleCheckJob(profile, Object.assign({ offsetX: sw.offsetX, offsetY: sw.offsetY }, this.auxProfileArgs()));
        if (!job.bounds.ok) throw new Error(this.overflowMessage(job.bounds));
        const gcode = PJ().toGcode(job, profile, { airPlot: this.settings().airPlot });
        this.s.plotMsg = null;
        return this.runGcode('scale', job, gcode);
      } catch (err) { this.s.plotMsg = err.message; this.renderPlot(); return null; }
    },

    buildSwatch() {
      const profile = this.profile();
      const sw = this.settings().swatch;
      const rows = parseList(sw.rows, 50, 20000);
      const cols = parseList(sw.cols, 0, 12);
      if (!rows.length || !cols.length) throw new Error('Enter at least one speed and one pen-down height (numbers separated by commas).');
      const spec = Object.assign({ rows, cols, size: sw.size, gap: 5, pattern: sw.pattern, offsetX: sw.offsetX, offsetY: sw.offsetY, airPlot: this.settings().airPlot, returnToOrigin: true }, this.auxProfileArgs());
      return { profile, job: PJ().testSwatchJob(spec, profile) };
    },

    previewSwatch() {
      try {
        const { job } = this.buildSwatch();
        this.s.altJob = { kind: 'swatch', label: 'test swatches', job };
        this.s.plotMsg = null;
      } catch (err) { this.s.plotMsg = err.message; }
      this.renderStats(); this.renderPlot(); this.previews.forEach((p) => p.invalidate());
    },

    plotSwatch() {
      try {
        const { profile, job } = this.buildSwatch();
        if (!job.bounds.ok) throw new Error(this.overflowMessage(job.bounds));
        this.s.altJob = { kind: 'swatch', label: 'test swatches', job };
        const gcode = PJ().toGcode(job, profile, { airPlot: this.settings().airPlot });
        this.s.plotMsg = null;
        this.runGcode('swatch', job, gcode);
      } catch (err) { this.s.plotMsg = err.message; this.renderPlot(); }
      this.renderStats(); this.previews.forEach((p) => p.invalidate());
    },
  });

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function bindSendToPlotterButton() {
    const { getEl } = requireDeps('bindSendToPlotterButton');
    const btnEl = getEl('btn-send-to-plotter', { silent: true });
    if (btnEl) btnEl.onclick = () => this.openSendToPlotter();
  }

  function openSendToPlotter() {
    requireDeps('openSendToPlotter');
    if (typeof this.setTopMenuOpen === 'function') this.setTopMenuOpen(null, false);
    if (activePanel && !activePanel.destroyed) return activePanel;
    const panel = new Panel(this);
    activePanel = panel;
    try { panel.open(); } catch (err) { activePanel = null; throw err; }
    return panel;
  }

  Modals.SendToPlotter = {
    bind(deps) { DEPS = deps || {}; },
    bindSendToPlotterButton,
    openSendToPlotter,
    sanitizeSettings,
    Store,
    getSession: () => session,
    getPanel: () => activePanel,
    connectSession,
    disconnectSession,
    simOptions: null,
    installOn(proto) {
      proto.bindSendToPlotterButton = function () { return bindSendToPlotterButton.call(this); };
      proto.openSendToPlotter = function () { return openSendToPlotter.call(this); };
    },
  };
})();
