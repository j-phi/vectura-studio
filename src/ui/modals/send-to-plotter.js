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

  // ---- length formatting: metric + imperial side by side ----
  // documentUnits 'imperial' leads with inches and shows mm in parentheses; anything else leads with mm.
  const MM_PER_IN = 25.4;
  const unitsMode = () => {
    const S = (typeof Vectura !== 'undefined' && Vectura && Vectura.SETTINGS) || {};
    const UU = (Vectura && Vectura.UnitUtils) || {};
    const u = UU.normalizeDocumentUnits ? UU.normalizeDocumentUnits(S.documentUnits) : (`${S.documentUnits || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric');
    return u;
  };
  const trimNum = (n, d) => String(Number(n.toFixed(d)));
  const inchDecimals = (precision) => (precision >= 2 ? 4 : precision > 0 ? 2 : 1);
  // [mm text, in text] for one or several values, no units attached.
  const lenPair = (vals, precision) => ({
    mm: vals.map((v) => trimNum(v, precision)).join(' \u00d7 '),
    inch: vals.map((v) => (v / MM_PER_IN).toFixed(inchDecimals(precision))).join(' \u00d7 '),
  });
  const fmtSize = (w, hh, o) => {
    const precision = o && isNum(o.precision) ? o.precision : 0;
    const t = lenPair([w, hh], precision);
    return unitsMode() === 'imperial' ? `${t.inch} in (${t.mm} mm)` : `${t.mm} mm (${t.inch} in)`;
  };
  const fmtDims = (arr, o) => {
    const precision = o && isNum(o.precision) ? o.precision : 0;
    const t = lenPair(arr, precision);
    return unitsMode() === 'imperial' ? `${t.inch} in (${t.mm} mm)` : `${t.mm} mm (${t.inch} in)`;
  };
  const dualText = (metric, imperial) => (unitsMode() === 'imperial' ? `${imperial} (${metric})` : `${metric} (${imperial})`);
  const fmtFeed = (mmMin) => dualText(`${trimNum(mmMin, 0)} mm/min`, `${trimNum(mmMin / MM_PER_IN, 0)} in/min`);
  const fmtAccel = (a) => dualText(`${trimNum(a, 0)} mm/s\u00b2`, `${trimNum(a / MM_PER_IN, 0)} in/s\u00b2`);
  const fmtMass = (kg) => dualText(`${trimNum(kg, 2)} kg`, `${(kg * 2.20462262).toFixed(2)} lb`);
  const cToF = (c) => (c * 9) / 5 + 32;
  const fmtTempRange = (t) => dualText(`${t.min} \u00b0C to ${t.max} \u00b0C`, `${trimNum(cToF(t.min), 0)} \u00b0F to ${trimNum(cToF(t.max), 0)} \u00b0F`);
  const fmtLen = (mm, o) => {
    if (!isNum(mm)) return '–';
    const precision = o && isNum(o.precision) ? o.precision : 0;
    const t = lenPair([mm], precision);
    return unitsMode() === 'imperial' ? `${t.inch} in (${t.mm} mm)` : `${t.mm} mm (${t.inch} in)`;
  };
  // Vendor speed mode whose per-axis max feed and acceleration are nearest the firmware's $110-$112 / $120-$122.
  const closestSpeedMode = (modes, fw) => {
    const keys = [[110, 'x', 'maxFeed'], [111, 'y', 'maxFeed'], [112, 'z', 'maxFeed'], [120, 'x', 'maxAccel'], [121, 'y', 'maxAccel'], [122, 'z', 'maxAccel']];
    if (!Array.isArray(modes) || !fw || !keys.every(([n]) => isNum(fw[n]) && fw[n] > 0)) return null;
    let best = null; let bestD = Infinity;
    modes.forEach((m) => {
      const d = keys.reduce((a, [n, ax, k]) => { const v = m.axes[ax][k]; return a + Math.abs(fw[n] - v) / Math.max(fw[n], v); }, 0);
      if (d < bestD) { bestD = d; best = m; }
    });
    return best;
  };
  // Distances that can get long (draw/travel): mm and in below 1 m, m and ft above.
  const fmtDist = (mm) => {
    if (!isNum(mm)) return '–';
    if (Math.abs(mm) < 1000) return fmtLen(mm);
    const d = mm >= 10000 ? 1 : 2;
    const m = `${(mm / 1000).toFixed(d)} m`;
    const ft = `${(mm / 304.8).toFixed(d)} ft`;
    return unitsMode() === 'imperial' ? `${ft} (${m})` : `${m} (${ft})`;
  };
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

  const penPresets = () => Vectura.PLOTTER_PEN_PRESETS || [];
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
      preset: penPresets().some((x) => x.id === r.preset) ? r.preset : null,
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
    // Simulator practice overrides live in memory only and never touch the real profile's overrides.
    simOverrides: {},
    overrides(id, sim) {
      if (sim) { const o = Store.simOverrides[id]; return o && typeof o === 'object' ? o : {}; }
      const all = lsRead(OVERRIDES_KEY, {});
      return all && typeof all === 'object' && all[id] && typeof all[id] === 'object' ? all[id] : {};
    },
    // Validates the merged result; never persists an invalid override.
    setOverride(id, patch, sim) {
      const base = Store.baseProfile(id);
      if (!base) return { ok: false, errors: ['Unknown profile.'] };
      const next = merge(Store.overrides(id, sim), patch);
      const eff = PS().normalizeProfile(merge(base, next));
      const v = PS().validateProfile(eff);
      if (!v.ok) return { ok: false, errors: v.errors };
      if (sim) { Store.simOverrides[id] = next; return { ok: true, profile: Store.effectiveProfile(id, true) }; }
      const all = lsRead(OVERRIDES_KEY, {});
      const root = all && typeof all === 'object' ? all : {};
      root[id] = next;
      lsWrite(OVERRIDES_KEY, root);
      return { ok: true, profile: eff };
    },
    effectiveProfile(id, sim) {
      const base = Store.baseProfile(id);
      if (!base) return null;
      if (!sim) return PS().normalizeProfile(merge(base, Store.overrides(id)));
      // Simulator: real axes/pen/etc. are readable, but real calibration flags never show and sim writes stay in memory.
      const real = Object.assign({}, Store.overrides(id));
      delete real.calibration;
      return PS().normalizeProfile(merge(merge(base, real), Store.overrides(id, true)));
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
    wcoMismatch: null,
    estop: null,
    jogStop: null,
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
      if (state === 'running' || state === 'paused' || state === 'penChange') session.jobSeen = true;
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
      // Remember whether a JOB (not a manual jog / pen move) produced this result: only jobs get a Resume card.
      r = Object.assign({}, r, { fromJob: !!session.jobSeen });
      session.jobSeen = false;
      session.lastResult = r;
      if (!r.aborted) {
        const total = (session.progress && session.progress.pathCount) || (r.pathCount || 0);
        session.progress = Object.assign({}, session.progress, { percent: 100, pathIndex: Math.max(0, total - 1), pathCount: total });
      }
      notify('done');
    });
    on('alarm', (a) => { session.alarm = a; notify('alarm'); });
    on('error', (e) => { session.lastError = e; notify('error'); });
    on('origin', () => { if (c.originSet) session.wcoMismatch = null; notify('origin'); });
    on('corner', () => notify('corner'));
    on('wco-mismatch', (e) => { session.wcoMismatch = e || {}; notify('wco'); });
    on('estop', (e) => { session.estop = e || {}; notify('estop'); });
    on('jogstop', (e) => { session.jogStop = e || {}; notify('jogstop'); });
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
    Store.simOverrides = {}; // simulator practice state never carries over
    session.profileId = profile.id;
    session.lastError = null;
    session.lastResult = null;
    session.jobSeen = false;
    session.alarm = null;
    session.progress = null;
    session.run = null;
    session.useMachineZero = false;
    session.wcoMismatch = null;
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
    Store.simOverrides = {};
    session.controller = null;
    session.transport = null;
    session.kind = null;
    session.run = null;
    session.progress = null;
    session.alarm = null;
    session.lastResult = null;
    session.status = null;
    session.wcoMismatch = null;
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

  // Firmware $I "[OPT:...]" parsed as { flags, blocks, rxBuffer } (or a raw string). Never print an object.
  const formatFwOpt = (opt) => {
    if (opt === null || opt === undefined) return '';
    if (typeof opt !== 'object') return String(opt);
    const parts = [];
    if (opt.flags) parts.push(String(opt.flags));
    if (isNum(opt.blocks)) parts.push(`${opt.blocks} blocks`);
    if (isNum(opt.rxBuffer)) parts.push(`RX ${opt.rxBuffer} bytes`);
    return parts.join(' \u00b7 ') || 'not reported';
  };

  // Preview framing: union of work area, origin, sheet outline and path bbox, in paper space.
  const previewBounds = (v) => {
    const a = v.area;
    let minX = Math.min(a.x, 0); let minY = Math.min(a.y, 0);
    let maxX = Math.max(a.x + a.w, 0); let maxY = Math.max(a.y + a.h, 0);
    if (v.job && v.job.bbox) {
      minX = Math.min(minX, v.job.bbox.minX); minY = Math.min(minY, v.job.bbox.minY);
      maxX = Math.max(maxX, v.job.bbox.maxX); maxY = Math.max(maxY, v.job.bbox.maxY);
    }
    (v.doc || []).forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const m = Math.max(2, 0.02 * Math.max(maxX - minX, maxY - minY));
    return { minX: minX - m, minY: minY - m, maxX: maxX + m, maxY: maxY + m };
  };

  const originOffsetOf = (c) => (c && c.wco ? { x: c.wco.x, y: c.wco.y } : { x: 0, y: 0 });

  // ---- paper space (the sheet as the user sees it: origin top-left, x right, y down the page) ----
  // PlotJob.applyAxes maps paper -> machine work coordinates (invert, then swap); these are its inverse.
  const axesOf = (profile) => {
    const a = (profile && profile.axes) || {};
    return { invertX: !!a.invertX, invertY: !!a.invertY, swapXY: !!a.swapXY };
  };
  const axesAreIdentity = (ax) => !ax.invertX && !ax.invertY && !ax.swapXY;
  const toPaper = (pt, ax) => {
    let x = pt.x; let y = pt.y;
    if (ax.swapXY) { const t = x; x = y; y = t; }
    if (ax.invertX) x = -x;
    if (ax.invertY) y = -y;
    return { x: x + 0, y: y + 0 };
  };
  const fromPaper = (pt, ax) => {
    let x = ax.invertX ? -pt.x : pt.x;
    let y = ax.invertY ? -pt.y : pt.y;
    if (ax.swapXY) { const t = x; x = y; y = t; }
    return { x: x + 0, y: y + 0 };
  };
  // Work area rectangle (machine work coordinates, offset by the work-origin position wco) in paper space.
  const paperAreaRect = (eff, wco, ax) => {
    const c1 = toPaper({ x: -wco.x, y: -wco.y }, ax);
    const c2 = toPaper({ x: eff.width - wco.x, y: eff.height - wco.y }, ax);
    const x = Math.min(c1.x, c2.x); const y = Math.min(c1.y, c2.y);
    return { x, y, w: Math.abs(c2.x - c1.x), h: Math.abs(c2.y - c1.y) };
  };
  // Disconnected: no WCO is known, so assume the origin sits at the work area's top-left corner in paper
  // space. Returns the matching machine-space origin offset (so bounds checks agree with the preview).
  const assumedOriginOffset = (eff, ax) => {
    const pw = ax.swapXY ? eff.height : eff.width;
    const ph = ax.swapXY ? eff.width : eff.height;
    const a = fromPaper({ x: 0, y: 0 }, ax); const b = fromPaper({ x: pw, y: ph }, ax);
    return { x: -Math.min(a.x, b.x) + 0, y: -Math.min(a.y, b.y) + 0 };
  };
  const jobOriginOffset = (c, profile, fw) => (c && c.wco ? originOffsetOf(c)
    : assumedOriginOffset(PS().effectiveWorkArea(profile, fw || null), axesOf(profile)));

  // Job geometry in paper space for the preview (cached per job object and axes).
  const paperJobCache = new WeakMap();
  const paperJobOf = (job, ax) => {
    const key = `${ax.invertX}${ax.invertY}${ax.swapXY}`;
    const hit = paperJobCache.get(job);
    if (hit && hit.key === key) return hit.value;
    const map = axesAreIdentity(ax) ? (p) => p : (p) => toPaper(p, ax);
    const pens = (job.pens || []).map((pen) => ({ pen: pen.pen, paths: (pen.paths || []).map((path) => (path || []).map(map)) }));
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    pens.forEach((pen) => pen.paths.forEach((path) => path.forEach((pt) => {
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    })));
    const value = {
      pens,
      bbox: minX === Infinity ? null : { minX, minY, maxX, maxY },
      travel: travelOf(job).map(([p, q]) => [map(p), map(q)]),
    };
    paperJobCache.set(job, { key, value });
    return value;
  };

  function jobContextFor(geometry, settings, profile, controller) {
    const s = clone(settings);
    s.profileOverrides = {};
    return {
      settings: s,
      profile,
      docSize: geometry.docSize,
      firmware: controller ? controller.fw : null,
      originOffset: jobOriginOffset(controller, profile, controller ? controller.fw : null),
    };
  }
  function buildJobFor(geometry, settings, profile, controller) {
    return PJ().buildJob(geometry.groups, jobContextFor(geometry, settings, profile, controller));
  }

  // Documents with more points than this are optimized in time slices (measured: ~160k points cost
  // ~70 ms in one block). Override through Modals.SendToPlotter.jobOptions in tests.
  const ASYNC_POINT_THRESHOLD = 15000;
  const jobOptions = () => (Modals.SendToPlotter && Modals.SendToPlotter.jobOptions) || {};
  const defaultYield = (cb) => {
    if (typeof G.requestIdleCallback === 'function') G.requestIdleCallback(() => cb(), { timeout: 40 });
    else setTimeout(cb, 0);
  };

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
      this.canvas = h('canvas', { class: 'stp-canvas', role: 'img', 'aria-label': 'Plot preview, sheet orientation (origin at the top-left of the sheet)' });
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
      const { minX, minY, maxX, maxY } = previewBounds(v);
      const pad = 12;
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
      if (isNum(v.margin) && v.margin > 0 && a.w > 2 * v.margin && a.h > 2 * v.margin) {
        // thin inner dashed line: the safety margin kept from the frame for manual moves and jobs
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = cBorder;
        ctx.strokeRect(X(a.x + v.margin) + 0.5, Y(a.y + v.margin) + 0.5, (a.w - 2 * v.margin) * sc, (a.h - 2 * v.margin) * sc);
        ctx.setLineDash([]);
      }

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
        v.job.travel.forEach(([p, q]) => { ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(q.x), Y(q.y)); });
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
    h('span', { class: 'stp-field-lbl', text: label }), control, hint ? (typeof hint === 'object' ? hint : h('span', { class: 'stp-hint', text: hint })) : null);
  const row = (label, control, hint) => h('div', { class: 'stp-row' },
    h('span', { class: 'stp-row-lbl' }, label, hint ? h('span', { class: 'stp-hint', text: hint }) : null), control);
  const section = (title, ...kids) => h('section', { class: 'stp-sec' }, h('h3', { class: 'stp-sec-h', text: title }), ...kids);
  // Collapsed "Advanced" disclosure; the open state is remembered for the browser session (not persisted).
  const ADV_OPEN = {};
  const adv = (id, title, ...kids) => {
    const d = h('details', { class: 'stp-details stp-adv', dataset: { adv: id } }, h('summary', { text: title }), ...kids);
    d.open = ADV_OPEN[id] === true;
    d.addEventListener('toggle', () => { ADV_OPEN[id] = d.open; });
    return d;
  };
  // Controller safety API (feature-detected: the panel works with controllers that lack any of these).
  const MOVING_STATES = ['jogging', 'running', 'paused', 'penChange', 'stopping'];
  const cornerUnconfirmed = (c) => !!c && typeof c.confirmMachineCorner === 'function' && c.machineCornerConfirmed === false;
  const callSafe = (fn) => { try { return Promise.resolve(fn()).catch(() => null); } catch (e) { return Promise.resolve(null); } };
  const emergencyStopOf = (c) => {
    if (!c) return Promise.resolve();
    if (typeof c.emergencyStop === 'function') return callSafe(() => c.emergencyStop());
    // Fallback for controllers without emergencyStop(): cancel any jog first, then stop what is still active.
    return (typeof c.jogCancel === 'function' ? callSafe(() => c.jogCancel()) : Promise.resolve())
      .then(() => (typeof c.stop === 'function' && c.state !== 'idle' && c.state !== 'disconnected' ? callSafe(() => c.stop()) : null));
  };
  const isTypingTarget = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable === true);
  const btn = (label, onClick, cls, attrs) => h('button', Object.assign({ type: 'button', class: `stp-btn ${cls || ''}`.trim(), onclick: onClick }, attrs || {}), label);

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------
  // Session order: Connect -> Machine -> Setup -> Plot, then Console (Advanced) after a divider.
  const TABS = [
    { id: 'connect', label: 'Connect', n: 1 },
    { id: 'machine', label: 'Machine', n: 2 },
    { id: 'setup', label: 'Setup', n: 3 },
    { id: 'plot', label: 'Plot', n: 4 },
    { id: 'console', label: 'Console', sub: 'Advanced' },
  ];
  const GLYPH = { done: '\u2713', attention: '\u25cf', idle: '\u2013' };
  const GLYPH_WORD = { done: 'done', attention: 'needs attention', idle: 'not reachable yet' };
  let activePanel = null;

  class Panel {
    constructor(ui) {
      this.ui = ui;
      this.tab = 'connect';
      this.panes = {};
      this.tools = { machine: null, console: null };
      this.previews = [];
      this.timers = {};
      this.s = { geometry: null, job: null, jobError: null, building: false, altJob: null, connectMsg: null, connectBusy: false, plotMsg: null, confirmClose: false, profileErrors: null, simSpeedLabel: null, manualMoving: false, bannerErr: null, cornerHelp: false, pendingOriginAdvance: false, profilePicker: false };
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
      const sim = this.isSim();
      return Store.effectiveProfile(id, sim) || Store.effectiveProfile(Store.builtIns()[0] && Store.builtIns()[0].id, sim);
    }

    isSim() {
      return !!(session.controller && session.controller.state !== 'disconnected' && session.kind === 'sim');
    }

    calibration() {
      const o = Store.overrides(this.profile().id, this.isSim());
      const c = (o && o.calibration) || {};
      return { axisChecked: c.axisChecked === true, penHeightChecked: c.penHeightChecked === true };
    }

    setProfileOverride(patch) {
      const p = this.profile();
      const r = Store.setOverride(p.id, patch, this.isSim());
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
        isSimulator: () => self.isSim(),
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
        emergencyStop: () => emergencyStopOf(liveController()),
        reportMotion: (m) => { self.s.manualMoving = !!m; self.updateStop(); },
        reportError: (e) => { self.s.bannerErr = (e && e.message) || String(e); if (!self.destroyed) self.renderBanner(); },
        requestCorner: () => { self.s.cornerHelp = false; if (!self.destroyed) self.renderBanner(); },
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
      // Land on the most useful tab: Plot when a job is live, Connect when not connected, else the next step.
      const c = liveController();
      this.showTab(isActiveJob() ? 'plot' : (c ? (this.nextStep().tab || 'machine') : 'connect'));
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
      this.liveNote = h('div', { class: 'stp-livenote sr-only', id: 'stp-live-note', role: 'status', 'aria-live': 'polite' });
      this.banner = h('div', { class: 'stp-banner', id: 'stp-banner' });
      this.runbar = h('div', { class: 'stp-runbar', hidden: true });
      this.rail = h('nav', { class: 'stp-rail', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'Send to Plotter sections' });
      this.stage = h('div', { class: 'stp-stage' });
      TABS.forEach((t) => {
        if (t.id === 'console') this.rail.appendChild(h('div', { class: 'stp-rail-div', role: 'separator' }));
        const b = h('button', { type: 'button', class: 'stp-tab', role: 'tab', id: `stp-tab-${t.id}`, 'aria-controls': `stp-pane-${t.id}`, dataset: { tab: t.id }, onclick: () => this.showTab(t.id) },
          t.n ? h('span', { class: 'stp-tab-num', 'aria-hidden': 'true', text: String(t.n) }) : null,
          h('span', { class: 'stp-tab-lbl' }, t.label, t.sub ? h('small', { class: 'stp-tab-sub', text: t.sub }) : null),
          t.n ? h('span', { class: 'stp-tab-glyph', 'aria-hidden': 'true' }) : null);
        this.rail.appendChild(b);
        const pane = h('div', { class: 'stp-pane', role: 'tabpanel', id: `stp-pane-${t.id}`, 'aria-labelledby': `stp-tab-${t.id}`, dataset: { pane: t.id }, hidden: true });
        this.panes[t.id] = pane;
        this.stage.appendChild(pane);
      });
      this.root.append(this.head, this.banner, this.runbar, h('div', { class: 'stp-main' }, this.rail, this.stage));
      body.appendChild(this.root);
      // The next user action (pointer or key) dismisses the persistent emergency-stop note; capture runs
      // before the handler that may set a fresh one.
      this.root.addEventListener('pointerdown', () => this.clearPersistentNote(), true);
      this.root.addEventListener('keydown', () => this.clearPersistentNote(), true);
      this.root.addEventListener('keydown', (e) => this.onKey(e));
      this.root.addEventListener('keyup', (e) => { if (this.isSpace(e) && !isTypingTarget(e.target) && liveController()) e.preventDefault(); });
      this.buildConnect();
      this.buildSetup();
      this.buildPlot();
      this.renderHeader();
      this.renderTabs();
    }

    isSpace(e) { return e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space'; }

    // Space and Escape are the emergency stop while the panel has focus and nobody is typing in a field.
    onKey(e) {
      // Keep app shortcuts (Delete, undo, tool keys) out while the panel holds focus.
      e.stopPropagation();
      const c = liveController();
      const typing = isTypingTarget(e.target) || isTypingTarget(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        const ae = document.activeElement;
        if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) { ae.blur(); return; }
        if (c && (c.state !== 'idle' || this.s.manualMoving)) { this.emergencyStop(); return; }
        this.requestClose();
        return;
      }
      if (this.isSpace(e) && !typing && !e.repeat && c) {
        e.preventDefault();
        this.emergencyStop();
      }
    }

    // Transient note: screen-reader live region always, plus a small secondary line inside the banner for 6 s
    // (then it fades). Persistent notes (emergency stop) stay until the user's next action.
    note(text, o) {
      if (this.destroyed || !this.liveNote) return;
      const persist = !!(o && o.persist);
      this.liveNote.textContent = text || '';
      clearTimeout(this.noteFadeTimer); clearTimeout(this.noteTimer);
      this.noteFadeTimer = this.noteTimer = null;
      this.s.note = text ? { text, persist } : null;
      if (text && !persist) {
        this.noteFadeTimer = setTimeout(() => { const el = this.banner && this.banner.querySelector('.stp-step-note'); if (el) el.classList.add('is-fading'); }, 5600);
        this.noteTimer = setTimeout(() => { this.s.note = null; this.renderBanner(); }, 6000);
      }
      this.renderBanner();
    }

    clearPersistentNote() {
      if (this.s.note && this.s.note.persist) { this.s.note = null; this.renderBanner(); }
    }

    emergencyStop() {
      const c = liveController();
      const tool = this.tools.machine;
      this.note('Emergency stop sent.', { persist: true });
      if (tool && typeof tool.emergencyStop === 'function') return tool.emergencyStop();
      return emergencyStopOf(c);
    }

    isMoving() {
      const c = liveController();
      return !!c && (MOVING_STATES.includes(c.state) || this.s.manualMoving);
    }

    // ---- session flow (tab status glyphs, next step) ----
    flow() {
      const c = liveController();
      const sim = session.kind === 'sim';
      const job = this.s.job;
      const cal = this.calibration();
      const calDone = sim || (cal.axisChecked && cal.penHeightChecked);
      const connectDone = !!c && !cornerUnconfirmed(c);
      const originDone = !!(c && c.originSet);
      const machineDone = !!c && calDone && originDone;
      const oob = !!(job && job.bounds && !job.bounds.ok);
      const setupDone = !!job && !oob && !this.s.building && !!(job.pens && job.pens.length);
      return { c, sim, calDone, cal, connectDone, originDone, machineDone, oob, setupDone, cornerBlocked: cornerUnconfirmed(c) };
    }

    tabStatus() {
      const f = this.flow();
      return {
        connect: f.connectDone ? 'done' : 'attention',
        machine: !f.c ? 'idle' : (f.machineDone ? 'done' : 'attention'),
        setup: f.oob ? 'attention' : (f.setupDone ? 'done' : 'idle'),
        plot: f.connectDone && f.machineDone && f.setupDone ? 'attention' : 'idle',
      };
    }

    renderTabs() {
      if (!this.rail || this.destroyed) return;
      const st = this.tabStatus();
      TABS.forEach((t) => {
        if (!t.n) return;
        const b = this.rail.querySelector(`[data-tab="${t.id}"]`);
        if (!b) return;
        b.dataset.status = st[t.id];
        const g = b.querySelector('.stp-tab-glyph');
        if (g) g.textContent = GLYPH[st[t.id]];
        b.setAttribute('aria-label', `${t.n} ${t.label}, ${GLYPH_WORD[st[t.id]]}`);
      });
    }

    // One line + one primary button for whatever the user should do next.
    nextStep() {
      const f = this.flow();
      const c = f.c;
      const p = session.progress || {};
      const go = (tab) => () => this.showTab(tab);
      const startCheck = (key) => () => { this.showTab('machine'); const t = this.tools.machine; if (t && typeof t.startWizard === 'function') t.startWizard(key); };
      const T = (kind, text, label, onClick, tab) => ({ kind, text, label: label || null, onClick: onClick || null, tab: tab || null });
      if (!c) {
        const T0 = Vectura.PlotterTransports;
        const supported = !!(T0 && T0.WebSerialTransport && T0.WebSerialTransport.isSupported());
        // The header button is the one canonical Connect: while disconnected the banner is text only.
        return supported
          ? T('connect', 'Connect your plotter', null, null, 'connect')
          : T('connect', 'Connect your plotter, or practice with the simulator', this.tab === 'connect' ? null : 'Go to Connect', this.tab === 'connect' ? null : go('connect'), 'connect');
      }
      if (c.state === 'connecting') return T('connecting', 'Connecting…', null, null, 'connect');
      if (c.state === 'alarm') {
        const a = session.alarm || {};
        return a.positionLost
          ? T('alarm', 'Position lost. Power-cycle the plotter, reconnect, then set the origin again.', null, null, 'plot')
          : T('alarm', `${a.message || 'The plotter is in alarm.'} Check the pen is clear of the paper, then unlock.`, 'Unlock', () => this.guard(() => c.unlock()), 'plot');
      }
      if (c.state === 'penChange') {
        const pc = session.penChange;
        const pen = pc && (pc.pen && pc.pen.pen ? pc.pen.pen : (pc.pen || {}));
        return T('penChange', `Insert ${(pen && (pen.name || pen.id)) || 'the next pen'}`, 'Continue', () => this.guard(() => c.continuePenChange()), 'plot');
      }
      if (c.state === 'running' || c.state === 'paused') {
        const pct = clampNum(p.percent, 0, 100, 0);
        const txt = `${c.state === 'paused' ? 'Paused' : 'Plotting'}: ${pct}% · path ${Math.min((p.pathIndex || 0) + 1, p.pathCount || 0)} of ${p.pathCount || 0}`;
        if (this.tab === 'plot') return T('running', txt, null, null, 'plot'); // Pause/Resume/Stop are in the pane
        return c.state === 'paused'
          ? T('running', txt, 'Resume', () => this.guard(() => c.resume()), 'plot')
          : T('running', txt, 'Pause', () => this.guard(() => c.pause()), 'plot');
      }
      if (c.state === 'stopping') return T('stopping', 'Stopping…', null, null, 'plot');
      if (f.cornerBlocked) return T('corner', 'Confirm the start corner before moving the plotter.', null, null, 'connect');
      if (session.wcoMismatch) {
        return this.tab === 'machine'
          ? T('wco', "The plotter's origin doesn't match what was set. Set the origin again.", null, null, 'machine')
          : T('wco', "The plotter's origin doesn't match what was set. Set the origin again.", 'Set origin here', () => this.guard(() => c.setOrigin()), 'machine');
      }
      if (!f.sim && !f.cal.axisChecked) return T('axis', 'Check the axes (one-time)', 'Start axis check', startCheck('axis'), 'machine');
      if (!f.sim && !f.cal.penHeightChecked) return T('pen', 'Find the pen height (one-time)', 'Start pen height check', startCheck('pen'), 'machine');
      if (!f.originDone && !session.useMachineZero) {
        const text = "Jog the pen to the sheet's top-left corner, then set the origin";
        // On the Machine tab "Set origin here" is already in view, so the banner is text only.
        return this.tab === 'machine'
          ? T('origin', text, null, null, 'machine')
          : T('origin', text, 'Go to Machine', go('machine'), 'machine');
      }
      if (f.oob) return this.tab === 'setup' ? T('oob', "The plot doesn't fit — adjust placement", null, null, 'setup') : T('oob', "The plot doesn't fit — adjust placement", 'Go to Setup', go('setup'), 'setup');
      if (this.s.building) return T('building', 'Preparing the plot…', null, null, 'setup');
      if (!this.s.job || !this.s.job.pens || !this.s.job.pens.length) return T('empty', 'Nothing to plot yet. Add a layer in the main window, then refresh.', 'Go to Setup', go('setup'), 'setup');
      const why = this.startBlockers();
      if (why.length) return T('blocked', why[0], null, null, 'plot');
      // The Plot pane carries the giant Start plot button, so the banner is text only there.
      return this.tab === 'plot' ? T('ready', 'Ready to plot', null, null, 'plot') : T('ready', 'Ready to plot', 'Start plot', () => { this.showTab('plot'); this.startPlot(); }, 'plot');
    }

    headerConnect() {
      const c = liveController();
      if (c) return this.disconnect();
      const g = this.s.granted || [];
      return this.connectUsb(g.length ? { port: g[0] } : {});
    }

    // Disconnect, then connect again (the start-corner steps end here).
    async reconnect() {
      const sim = session.kind === 'sim';
      await this.disconnect();
      if (this.destroyed) return;
      if (sim) { this.connectSim(); return; }
      const g = this.s.granted || [];
      if (g.length) this.connectUsb({ port: g[0] });
      else this.note('Disconnected. Press Connect when the plotter is powered on.');
    }

    // Moves to a tab only on success, never while the user is typing in a field.
    advance(tab, msg) {
      const ae = document.activeElement;
      if (isTypingTarget(ae) && this.root && this.root.contains(ae)) return false;
      this.showTab(tab);
      if (msg) this.note(msg);
      return true;
    }

    evaluateAdvance() {
      if (!this.s.pendingOriginAdvance || this.destroyed) return;
      const c = liveController();
      if (!c || !c.originSet || this.tab !== 'machine') { this.s.pendingOriginAdvance = false; return; }
      const f = this.flow();
      if (!f.calDone) { this.s.pendingOriginAdvance = false; return; }
      if (this.s.building || (this.s.job && !this.jobReady())) return; // wait for the job to land
      this.s.pendingOriginAdvance = false;
      const job = this.s.job;
      if (!job || !job.pens || !job.pens.length || (job.bounds && !job.bounds.ok)) {
        this.advance('setup', "Origin set. The plot doesn't fit or is not ready: check placement.");
      } else this.advance('plot', 'Origin set. Moved to Plot.');
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
      this.renderBanner();
      this.renderTabs();
    }

    mountTool(id) {
      if (this.destroyed) return; // a closed panel's stale DOM must not mount tools that nobody would destroy
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

    // ---- header command bar: one row, never scrolls ----
    renderHeader() {
      if (!this.head) return;
      const c = liveController();
      const state = c ? c.state : 'disconnected';
      const profile = this.profile();
      this.head.textContent = '';
      this.pill = h('span', { class: 'stp-pill', role: 'status', 'aria-live': 'polite' });
      this.paintPill();
      // compact live readout: WPos (MPos on hover)
      const mk = (k) => h('span', { class: 'stp-ro-cell' }, h('span', { class: 'stp-ro-ax', text: k.toUpperCase() }), h('span', { class: 'stp-ro-val', dataset: { stpPos: `wpos-${k}` }, text: '–' }));
      this.readoutEl = h('span', { class: 'stp-readout', id: 'stp-readout', hidden: !c, 'aria-label': 'Work position in millimeters' }, mk('x'), mk('y'), mk('z'));
      this.originChip = h('span', { class: 'stp-chip stp-origin-chip', id: 'stp-origin-chip', hidden: !c });
      this.paintOriginChip();
      this.stopEl = h('button', { type: 'button', class: 'stp-btn stp-stop', id: 'stp-stop', 'aria-label': 'Emergency stop (Space or Escape)', hidden: !c }, 'EMERGENCY STOP');
      this.stopEl.addEventListener('pointerdown', (e) => { if (e.preventDefault) e.preventDefault(); this.stopAt = Date.now(); this.emergencyStop(); });
      this.stopEl.addEventListener('click', () => { if (Date.now() - (this.stopAt || 0) > 700) this.emergencyStop(); });
      const g = this.s.granted || [];
      const T0 = Vectura.PlotterTransports;
      const supported = !!(T0 && T0.WebSerialTransport && T0.WebSerialTransport.isSupported());
      const connLabel = c ? 'Disconnect' : (state === 'connecting' || this.s.connectBusy ? 'Connecting…' : (g.length ? 'Reconnect' : 'Connect'));
      const connBtn = btn(connLabel, () => this.headerConnect(), c ? 'stp-hdr-conn is-warn' : 'stp-hdr-conn is-primary', {
        id: c ? 'stp-hdr-disconnect' : 'stp-hdr-connect',
        disabled: c ? (isActiveJob() || state === 'stopping') : (!supported || this.s.connectBusy),
        title: c ? (isActiveJob() ? 'Stop the job before disconnecting' : null) : (!supported ? 'Use Chrome or Edge, or try the simulator on the Connect tab' : null),
      });
      this.head.append(
        h('h2', { class: 'stp-title', text: 'Send to Plotter' }),
        h('span', { class: 'stp-profile-name', text: session.kind === 'sim' && c ? `${profile.name} (simulator)` : profile.name }),
        this.pill,
        profile.highSpeed ? h('span', { class: 'stp-chip stp-hs-badge', id: 'stp-hs-badge', text: 'High-speed', title: 'High-speed mode is on: XY feed can reach 20000 mm/min if your firmware allows it' }) : null,
        this.readoutEl,
        this.originChip,
        h('span', { class: 'stp-spacer' }),
        connBtn,
        this.stopEl,
        btn('Close', () => this.requestClose(), 'stp-close', { 'aria-label': 'Close Send to Plotter' }),
      );
      this.updateStop();
      this.renderReadout();
      this.renderBanner();
      this.renderRunbar();
      this.renderTabs();
    }

    // "Moving" whenever a manual move is in flight or the controller is jogging.
    paintPill() {
      if (!this.pill) return;
      const c = liveController();
      const state = c ? c.state : 'disconnected';
      const moving = !!c && (this.s.manualMoving || state === 'jogging');
      const key = moving ? 'moving' : state;
      this.pill.className = `stp-pill is-${key}`;
      this.pill.dataset.state = key;
      this.pill.textContent = moving ? 'Moving' : (STATE_LABEL[state] || state);
    }

    paintOriginChip() {
      if (!this.originChip) return;
      const c = liveController();
      const set = !!(c && c.originSet);
      this.originChip.hidden = !c;
      this.originChip.className = `stp-chip stp-origin-chip${set ? ' is-set' : ''}`;
      this.originChip.textContent = set ? 'Origin set' : 'No origin';
    }

    // E-STOP: large red while motion is possible or in progress, neutral otherwise.
    updateStop() {
      this.paintPill();
      this.paintOriginChip();
      if (!this.stopEl) return;
      const armed = this.isMoving();
      this.stopEl.classList.toggle('is-armed', armed);
      this.stopEl.dataset.armed = armed ? 'true' : 'false';
      this.stopEl.hidden = !liveController();
      this.stopEl.disabled = false;
    }

    renderReadout() {
      if (!this.readoutEl) return;
      const st = session.status;
      const w = st && st.wpos;
      ['x', 'y', 'z'].forEach((k) => {
        const el = this.readoutEl.querySelector(`[data-stp-pos="wpos-${k}"]`);
        if (el) el.textContent = w && isNum(w[k]) ? w[k].toFixed(2) : '–';
      });
      const m = st && st.mpos;
      this.readoutEl.title = m && isNum(m.x) ? `Machine position  X ${fmtN(m.x, 2)}  Y ${fmtN(m.y, 2)}  Z ${fmtN(m.z, 2)}` : 'Machine position unknown';
    }

    // ---- next-step banner, start-corner card, close confirmation ----
    renderBanner() {
      if (!this.banner || this.destroyed) return;
      const el = this.banner;
      el.textContent = '';
      const c = liveController();
      if (this.s.confirmClose) {
        el.appendChild(h('div', { class: 'stp-confirm', role: 'alertdialog', 'aria-label': 'Close while plotting' },
          h('span', { text: 'A plot is running. Closing this panel does not stop it; reopen Send to Plotter to watch or stop it.' }),
          btn('Keep open', () => { this.s.confirmClose = false; this.renderBanner(); }, ''),
          btn('Close panel', () => { this.s.confirmClose = false; this.close(); }, 'is-warn', { id: 'stp-confirm-close' })));
      }
      if (this.s.bannerErr) {
        el.appendChild(h('div', { class: 'stp-banner-err', id: 'stp-banner-err', role: 'alert' },
          h('span', { text: this.s.bannerErr }),
          btn('Dismiss', () => { this.s.bannerErr = null; this.renderBanner(); }, 'is-link')));
      }
      if (cornerUnconfirmed(c) && c.state !== 'connecting') {
        const card = h('div', { class: 'stp-corner', id: 'stp-corner', role: 'group', 'aria-label': 'Start corner' },
          h('strong', { class: 'stp-corner-q', text: 'Was the carriage at its start corner when you connected?' }),
          h('p', { class: 'stp-hint', text: 'The plotter measures its limits from that point. Until you confirm, motion is limited to ±15 mm.' }),
          h('div', { class: 'stp-btnrow' },
            btn('Yes, it was', () => this.confirmCorner(), 'is-primary', { id: 'stp-corner-yes' }),
            btn('No / not sure', () => { this.s.cornerHelp = true; this.renderBanner(); }, '', { id: 'stp-corner-no' })));
        if (this.s.cornerHelp) {
          card.appendChild(h('ol', { class: 'stp-corner-steps', id: 'stp-corner-steps' },
            h('li', { text: 'Power the plotter off.' }),
            h('li', { text: 'Move the carriage gently to the start corner (the top-left home position).' }),
            h('li', { text: 'Power it on again.' }),
            h('li', { text: 'Press Reconnect.' })));
          card.appendChild(h('div', { class: 'stp-btnrow' }, btn('Reconnect', () => { this.s.cornerHelp = false; this.reconnect(); }, 'is-primary', { id: 'stp-corner-reconnect' })));
        }
        el.appendChild(card);
      } else {
        const step = this.nextStep();
        const row = h('div', { class: `stp-step is-${step.kind}`, id: 'stp-next-step' },
          h('span', { class: 'stp-step-lbl', text: 'Next' }),
          h('span', { class: 'stp-step-body' },
            h('span', { class: 'stp-step-text', id: 'stp-banner-text', text: step.text }),
            this.noteEl()));
        if (step.label && step.onClick) row.appendChild(btn(step.label, step.onClick, 'is-primary', { id: 'stp-banner-action' }));
        el.appendChild(row);
      }
      if (cornerUnconfirmed(c) && c.state !== 'connecting') { const n = this.noteEl(); if (n) el.appendChild(n); }
      el.appendChild(this.liveNote);
    }

    noteEl() {
      const n = this.s.note;
      return n ? h('span', { class: `stp-step-note${n.persist ? ' is-persist' : ''}`, id: 'stp-banner-note', text: n.text }) : null;
    }

    confirmCorner() {
      const c = liveController();
      if (!c || typeof c.confirmMachineCorner !== 'function') return Promise.resolve();
      let r;
      try { r = c.confirmMachineCorner(); } catch (e) { r = Promise.reject(e); }
      return Promise.resolve(r).then(async () => {
        this.s.cornerHelp = false;
        this.s.bannerErr = null;
        notify('corner');
        // The board's position resets to 0,0 at the carriage's location on connect. If the carriage has not moved
        // since (still within 0.05 mm of 0,0) and the plotter is idle, the start corner is the origin.
        const st = c.status;
        const mp = st && st.mpos;
        const atZero = !!mp && isNum(mp.x) && isNum(mp.y) && Math.abs(mp.x) <= 0.05 && Math.abs(mp.y) <= 0.05;
        if (atZero && c.state === 'idle' && !c.originSet && typeof c.setOrigin === 'function') {
          try {
            await c.setOrigin();
            this.note("Origin set at the start corner. If your sheet's top-left corner is elsewhere, jog there and press Set origin here.", { persist: true });
          } catch (e) { this.s.bannerErr = (e && e.message) || String(e); this.renderBanner(); }
        }
      }, (e) => { this.s.bannerErr = (e && e.message) || String(e); this.renderBanner(); });
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
      this.renderReadout();
      this.renderRunbar();
      ['machine', 'console'].forEach((k) => { if (this.tools[k] && this.tab === k) { try { this.tools[k].update(); } catch (e) { /* ignore */ } } });
      if (this.tab === 'plot') this.renderPlotLive();
    }

    refreshAll(whats) {
      if (this.destroyed) return;
      const w = whats || new Set(['all']);
      this.renderHeader();
      if (w.has('all') || w.has('state') || w.has('connected') || w.has('disconnected') || w.has('connecting') || w.has('error') || w.has('origin') || w.has('profile') || w.has('alarm') || w.has('corner') || w.has('wco')) {
        this.renderConnect();
      }
      if (w.has('disconnected')) { this.s.manualMoving = false; this.s.bannerErr = null; this.s.cornerHelp = false; }
      if (w.has('origin')) { const cc = liveController(); this.s.pendingOriginAdvance = !!(cc && cc.originSet); if (this.s.pendingOriginAdvance) this.s.bannerErr = null; }
      if (w.has('connected') && this.tab === 'connect' && liveController()) {
        this.advance('machine', 'Connected. Moved to Machine.');
      }
      if (w.has('connected') || w.has('disconnected') || w.has('origin') || w.has('profile') || w.has('all')) this.scheduleRecompute();
      this.renderPlot();
      this.renderStats();
      this.renderSpeedBox();
      if (w.has('profile') || w.has('connected') || w.has('disconnected') || w.has('all')) this.renderPens();
      ['machine', 'console'].forEach((k) => { if (this.tools[k]) { try { this.tools[k].update(); } catch (e) { /* ignore */ } } });
      this.previews.forEach((p) => p.invalidate());
      // Needs attention: bring Plot forward for a pen change or alarm.
      if ((w.has('penChange') || w.has('alarm')) && this.tab !== 'plot') this.showTab('plot');
      if (w.has('jogstop') && session.jogStop) {
        const why = session.jogStop.reason;
        this.note(why === 'deadman' ? 'Jog stopped: the pointer was released or lost.' : why === 'max-hold' ? 'Jog stopped: the hold reached its time limit.' : 'Jog stopped.');
      }
      if (w.has('estop')) this.note('Emergency stop active.', { persist: true });
      this.updateStop();
      this.renderTabs();
      this.evaluateAdvance();
    }

    // ---- geometry + job ----
    refreshGeometry() {
      try {
        const geo = readGeometry(this.ui);
        geo.pointCount = geo.groups.reduce((n, gr) => n + gr.polylines.reduce((m, pl) => m + pl.length, 0), 0);
        this.s.geometry = geo;
        this.s.geomVersion = (this.s.geomVersion || 0) + 1;
        this.s.jobError = this.s.geometry.error;
      } catch (err) {
        this.s.geometry = { groups: [], docSize: { width: 0, height: 0 }, pointCount: 0 };
        this.s.geomVersion = (this.s.geomVersion || 0) + 1;
        this.s.jobError = `Could not read the document: ${err.message}`;
      }
      this.updateRotIcons();
      this.recompute();
      if (this.setupPens) this.renderPens();
    }

    // Redraw the rotation pictures from the current document size (after a refresh or a size change).
    updateRotIcons() {
      if (!this.rotRow) return;
      const doc = this.s.geometry && this.s.geometry.docSize;
      this.rotRow.querySelectorAll('.stp-rotcard').forEach((b) => {
        const old = b.querySelector('svg');
        const next = rotIcon(Number(b.dataset.rotate), doc);
        if (old && next) old.replaceWith(next);
      });
    }

    // Everything the built job depends on; Start only plots a job whose key matches the current one.
    jobKey() {
      const c = liveController();
      const profile = this.profile();
      return JSON.stringify([this.s.geomVersion || 0, this.settings(), profile, jobOriginOffset(c, profile, c ? c.fw : null), c ? c.fw : null]);
    }

    jobReady() { return !this.s.building && !!this.s.job && this.s.jobKey === this.jobKey(); }

    scheduleRecompute() {
      if (this.destroyed) return;
      clearTimeout(this.timers.recompute);
      this.s.jobSeq = (this.s.jobSeq || 0) + 1; // a computation still in flight is now stale: it must not land
      this.s.jobKey = null;
      this.s.building = true;
      this.timers.recompute = setTimeout(() => this.recompute(), 120);
    }

    recompute() {
      clearTimeout(this.timers.recompute);
      const g = this.s.geometry;
      if (!g) { this.s.building = false; return; }
      const seq = (this.s.jobSeq = (this.s.jobSeq || 0) + 1);
      const key = this.jobKey();
      const land = (job, err) => {
        if (seq !== this.s.jobSeq || this.destroyed) return;
        this.s.building = false;
        if (err) {
          this.s.job = null;
          this.s.jobKey = null;
          this.s.jobError = `Could not build the plot: ${err.message}`;
        } else {
          this.s.job = job;
          this.s.jobKey = key;
          if (!this.s.jobError || /^Could not build/.test(this.s.jobError)) this.s.jobError = null;
        }
        this.renderStats(); this.renderPlot(); this.previews.forEach((p) => p.invalidate());
        this.renderTabs(); this.renderBanner(); this.evaluateAdvance();
      };
      const opts = jobOptions();
      const threshold = isNum(opts.asyncPointThreshold) ? opts.asyncPointThreshold : ASYNC_POINT_THRESHOLD;
      let ctx;
      try { ctx = jobContextFor(g, this.settings(), this.profile(), liveController()); } catch (err) { land(null, err); return; }
      if ((g.pointCount || 0) <= threshold || typeof PJ().buildJobAsync !== 'function') {
        let job = null; let error = null;
        try { job = PJ().buildJob(g.groups, ctx); } catch (err) { error = err; }
        this.s.building = false;
        land(job, error);
        return;
      }
      this.s.building = true; // stats show "Preparing…" and Start stays disabled until this lands
      this.renderStats(); this.renderPlot();
      PJ().buildJobAsync(g.groups, ctx, {
        isCancelled: () => seq !== this.s.jobSeq || this.destroyed,
        sliceMs: isNum(opts.sliceMs) ? opts.sliceMs : 8,
        yieldFn: typeof opts.yieldFn === 'function' ? opts.yieldFn : defaultYield,
      }).then((job) => { if (job) land(job, null); }, (err) => land(null, err));
    }

    view() {
      const c = liveController();
      const profile = this.profile();
      const ax = axesOf(profile);
      const eff = PS().effectiveWorkArea(profile, c ? c.fw : null);
      const wco = jobOriginOffset(c, profile, c ? c.fw : null);
      const alt = this.s.altJob;
      const job = alt ? alt.job : this.s.job;
      const g = this.s.geometry;
      let doc = null;
      if (!alt && g && g.docSize.width > 0 && g.docSize.height > 0) {
        try {
          const w = g.docSize.width; const hh = g.docSize.height;
          doc = PJ().placePolylines([[{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: hh }, { x: 0, y: hh }, { x: 0, y: 0 }]], g.docSize, eff, this.settings().placement, profile.axes)[0]
            .map((p) => toPaper(p, ax));
        } catch (e) { doc = null; }
      }
      let live = null;
      const st = session.status;
      if (c && st && ((st.mpos && isNum(st.mpos.x)) || (st.wpos && isNum(st.wpos.x)))) {
        // Work coordinates are already origin-relative (the origin cross is paper (0,0)): never add the WCO again.
        // MPos minus the controller's current WCO is immune to a status snapshot taken before the origin moved.
        const wp = st.mpos && isNum(st.mpos.x) && isNum(st.mpos.y)
          ? { x: st.mpos.x - wco.x, y: st.mpos.y - wco.y } : st.wpos;
        const pp = toPaper(wp, ax);
        live = { x: pp.x, y: pp.y, down: !!(st.mpos && isNum(st.mpos.z) && st.mpos.z > profile.pen.up + 0.3) };
      }
      return {
        area: paperAreaRect(eff, wco, ax),
        job: job ? paperJobOf(job, ax) : null,
        doc, live,
        showTravel: this.settings().showTravel,
        margin: isNum(profile.limits && profile.limits.edgeMargin) ? profile.limits.edgeMargin : 0,
        overflow: !!(job && job.bounds && !job.bounds.ok),
      };
    }

    // Why Start is unavailable (with the tab that fixes it); empty array = ready.
    startBlockerItems() {
      const c = liveController();
      const out = [];
      const add = (text, tab) => out.push({ text, tab: tab || null });
      const sim = session.kind === 'sim';
      if (!c) { add('Connect to a plotter first (Connect tab).', 'connect'); return out; }
      if (this.s.building || (this.s.job && this.s.jobKey !== this.jobKey())) add('Preparing the plot\u2026');
      if (cornerUnconfirmed(c)) add('Confirm the plotter was at its start corner (see the card at the top).');
      if (c.state !== 'idle') add(`The plotter is ${STATE_LABEL[c.state] ? STATE_LABEL[c.state].toLowerCase() : c.state}.`);
      const job = this.s.job;
      if (!job || !job.pens || !job.pens.length) add('There is nothing to plot. Add geometry or enable a pen.', 'setup');
      if (job && job.bounds && !job.bounds.ok) add(this.overflowMessage(job.bounds), 'setup');
      if (!c.originSet && !sim && !session.useMachineZero) add('Set the origin first (Machine tab), or tick "Use machine zero".', 'machine');
      if (!sim) {
        const cal = this.calibration();
        if (!cal.axisChecked) add('Run the Axis check once (Machine tab).', 'machine');
        if (!cal.penHeightChecked) add('Run the Pen height check once (Machine tab).', 'machine');
      }
      if (this.s.altJob && this.s.altJob.job.bounds && !this.s.altJob.job.bounds.ok) add('The test pattern does not fit the work area.', 'setup');
      return out;
    }

    startBlockers() { return this.startBlockerItems().map((i) => i.text); }

    overflowMessage(b) {
      const parts = [];
      ['left', 'right', 'top', 'bottom'].forEach((k) => { if (b.overflow && b.overflow[k] > 0) parts.push(`${k} ${fmtLen(b.overflow[k], { precision: 1 })}`); });
      const lim = (this.profile() || {}).limits || {};
      const margin = isNum(lim.edgeMargin) && lim.edgeMargin > 0 ? lim.edgeMargin : 0;
      const within = margin > 0 && ['left', 'right', 'top', 'bottom'].every((k) => !(b.overflow && b.overflow[k] > margin + 1e-6));
      const note = within ? ` (${fmtLen(margin, { precision: 1 })} safety margin from the frame)` : '';
      return `Out of bounds: the plot extends past the work area${note} (${parts.join(', ')}). Move, scale or rotate it.`;
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
      if (!this.destroyed && !liveController()) { this.renderConnect(); this.renderHeader(); }
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

      // selected profile: one compact row; [Change] opens a small card grid
      const profiles = Store.allProfiles();
      const cur = this.profile();
      const kindOf = (p) => (p.user ? 'custom' : (p.tested ? 'tested' : 'untested'));
      const kindText = (k) => (k === 'tested' ? 'Tested' : k === 'custom' ? 'Custom' : 'Untested profile');
      const sizeText = (p) => `${fmtSize(p.workArea.width, p.workArea.height)} \u00b7 ${p.pen.mechanism === 'z' ? 'Z-axis pen' : p.pen.mechanism === 'servo' ? 'Servo pen' : 'Custom pen'}`;
      const curKind = kindOf(cur);
      const selRow = h('div', { class: 'stp-selrow', id: 'stp-selected-profile', style: `--stp-card-color:${CARD_COLORS[curKind]}` },
        h('span', { class: 'stp-selrow-icon' }, bedIcon(cur)),
        h('span', { class: 'stp-selrow-name', text: cur.name }),
        h('span', { class: 'stp-hint', text: sizeText(cur) }),
        h('span', { class: `stp-badge is-${curKind}`, text: kindText(curKind) }),
        h('span', { class: 'stp-spacer' }),
        cur.specs ? btn('\u24d8 Specs', () => this.openSpecs(cur, 'row'), '', { id: 'stp-specs-btn', title: `Manufacturer specifications for ${cur.name}`, 'aria-label': `Specifications for ${cur.name}`, dataset: { specsFor: cur.id } }) : null,
        btn(this.s.profilePicker ? 'Done' : 'Change', () => { this.s.profilePicker = !this.s.profilePicker; this.renderConnect(); }, '', { id: 'stp-change-profile', disabled: !!c, title: c ? 'Disconnect to change the plotter profile' : null, 'aria-expanded': String(!!this.s.profilePicker) }));
      const profSec = section('Plotter', selRow);
      if (this.s.profilePicker && !c) {
        const cards = h('div', { class: 'stp-cards', role: 'radiogroup', 'aria-label': 'Plotter profile' });
        profiles.forEach((p) => {
          const kind = kindOf(p);
          const selected = p.id === cur.id;
          const cardBtn = h('button', {
            type: 'button', class: `stp-card${selected ? ' is-current' : ''}`, role: 'radio', 'aria-checked': String(selected),
            style: `--stp-card-color:${CARD_COLORS[kind]}`, dataset: { profileId: p.id },
            onclick: () => { this.saveSettings({ profileId: p.id }); this.s.profileErrors = null; this.s.profilePicker = false; this.renderConnect(); this.renderHeader(); this.previews.forEach((x) => x.invalidate()); },
          },
          h('span', { class: 'stp-card-preview' }, bedIcon(p)),
          h('span', { class: 'stp-card-name' }, h('i', { class: 'stp-card-dot' }), p.name),
          h('span', { class: 'stp-card-tag', text: sizeText(p) }),
          h('span', { class: `stp-badge is-${kind}`, text: kindText(kind) }),
          h('span', { class: 'stp-current-marker', text: 'SELECTED' }));
          cards.appendChild(h('div', { class: 'stp-cardwrap' }, cardBtn,
            p.specs ? btn('\u24d8', () => this.openSpecs(p, 'card'), 'stp-card-specs', { title: `Manufacturer specifications for ${p.name}`, 'aria-label': `Specifications for ${p.name}`, dataset: { specsFor: p.id } }) : null));
        });
        profSec.appendChild(cards);
      }
      el.appendChild(profSec);

      el.appendChild(this.connectionSection(c, supported, cur));
      el.appendChild(adv('profile', 'Profile settings', this.profileTools(cur, !!c)));
      el.scrollTop = keepScroll;
    },

    // ---- manufacturer specs panel (read-only; display of the vendor's claims) ----
    openSpecs(profile, kind) {
      if (!profile || !profile.specs) return;
      this.closeSpecs(false);
      const sp = profile.specs;
      const c = liveController();
      const fw = (c && c.fw) || {};
      const fwVals = (ids) => ids.map((n) => (isNum(fw[n]) ? fmtN(fw[n], 0) : '\u2014')).join(' / ');
      const dl = (rows) => h('dl', { class: 'stp-spec-list' }, ...rows.filter(Boolean).flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
      const sec = (title, ...kids) => h('section', { class: 'stp-spec-sec' }, h('h3', { class: 'stp-spec-h', text: title }), ...kids);
      const perf = sp.performance || {}; const tool = sp.tool || {}; const phys = sp.physical || {}; const el = sp.electronics || {}; const sw = sp.software || {};
      const body = h('div', { class: 'stp-spec-body' });
      body.appendChild(sec('Performance & precision', dl([
        ...(perf.repeatAccuracy || []).map((r) => [`Repeat positioning accuracy, ${r.label}`, `\u00b1${fmtLen(r.mm, { precision: 2 })}`]),
        isNum(perf.maxWritingSpeedMmMin) ? ['Max writing speed (X/Y/Z)', fmtFeed(perf.maxWritingSpeedMmMin)] : null,
        perf.sizesAvailable ? ['Sizes available', perf.sizesAvailable] : null,
        perf.noise ? ['Noise', perf.noise] : null,
      ])));
      body.appendChild(sec('Tool & hardware', dl([
        isNum(tool.maxWritingThicknessMm) ? ['Max writing thickness', `${fmtLen(tool.maxWritingThicknessMm, { precision: 1 })}${isNum(tool.maxWritingThicknessModifiedMm) ? `, up to ${fmtLen(tool.maxWritingThicknessModifiedMm, { precision: 1 })} with modification` : ''}`] : null,
        isNum(tool.penDiameterMaxMm) ? ['Pen diameter', `Up to ${fmtLen(tool.penDiameterMaxMm, { precision: 1 })}`] : null,
        tool.penAngleDeg ? ['Adjustable pen angle', `${tool.penAngleDeg.min}\u00b0\u2013${tool.penAngleDeg.max}\u00b0${tool.penAngleNote ? ` (${tool.penAngleNote.toLowerCase()})` : ''}`] : null,
        tool.motors ? ['Stepper motors', `X: ${tool.motors.x}; Y: ${tool.motors.y}; Z: ${tool.motors.z}`] : null,
        tool.limitSwitches ? ['Limit switches', tool.limitSwitches] : null,
        tool.laser ? ['Laser', tool.laser] : null,
      ]), h('p', { class: 'stp-hint', text: 'Limit switches: integrated \u2014 Vectura only homes when the firmware reports homing enabled ($22=1).' })));
      body.appendChild(sec('Physical (this model)', dl([
        phys.writingAreaMm ? ['Writing area', fmtSize(phys.writingAreaMm.width, phys.writingAreaMm.height)] : null,
        phys.paperEquivalents ? ['Paper equivalents', phys.paperEquivalents] : null,
        phys.productMm ? ['Product size (L \u00d7 W \u00d7 H)', fmtDims([phys.productMm.l, phys.productMm.w, phys.productMm.h])] : null,
        phys.tableMm ? ['Recommended table (L \u00d7 W)', fmtDims([phys.tableMm.l, phys.tableMm.w])] : null,
        phys.packageMm ? ['Package (L \u00d7 W \u00d7 H)', fmtDims([phys.packageMm.l, phys.packageMm.w, phys.packageMm.h])] : null,
        isNum(phys.netWeightKg) ? ['Net weight', fmtMass(phys.netWeightKg)] : null,
      ])));
      body.appendChild(sec('Electronics & power', dl([
        el.frame ? ['Frame', el.frame] : null,
        el.basePlate ? ['Base plate', el.basePlate] : null,
        el.board ? ['Motherboard', el.board] : null,
        isNum(el.ratedPowerW) ? ['Rated power', `${el.ratedPowerW} W${el.ratedPowerNote ? ` (${el.ratedPowerNote})` : ''}`] : null,
        el.operatingVoltage ? ['Operating voltage', el.operatingVoltage] : null,
        el.adapterInput ? ['Adapter input', el.adapterInput] : null,
        el.adapterOutput ? ['Adapter output', el.adapterOutput] : null,
        el.operatingTempC ? ['Operating temperature', fmtTempRange(el.operatingTempC)] : null,
        el.design ? ['Design & build', el.design] : null,
      ])));
      body.appendChild(sec('Software & control', dl([
        sw.controlSoftware ? ['Control software', sw.controlSoftware.join(', ')] : null,
        sw.os ? ['Operating systems', sw.os] : null,
        sw.connectivity ? ['Connectivity', sw.connectivity] : null,
        sw.memoryCard ? ['Memory card', sw.memoryCard] : null,
        sw.protocol ? ['Control protocol', sw.protocol] : null,
        sw.fileFormats ? ['File formats', sw.fileFormats.join(', ')] : null,
      ])));
      if (Array.isArray(sp.speedModes) && sp.speedModes.length) {
        const closest = closestSpeedMode(sp.speedModes, fw);
        const table = h('table', { class: 'stp-spec-speeds', id: 'stp-spec-speeds' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Mode' }), ...['X', 'Y', 'Z'].map((a) => h('th', { scope: 'col', text: `${a} max speed / acceleration` })))),
          h('tbody', {}, ...sp.speedModes.map((m) => h('tr', { class: closest && closest.id === m.id ? 'is-closest' : '' },
            h('th', { scope: 'row' }, h('strong', { text: m.name }), closest && closest.id === m.id ? h('span', { class: 'stp-spec-closest', text: 'Closest to your firmware' }) : null, m.note ? h('span', { class: 'stp-hint', text: m.note }) : null),
            ...['x', 'y', 'z'].map((a) => h('td', {}, h('span', { text: fmtFeed(m.axes[a].maxFeed) }), h('span', { text: fmtAccel(m.axes[a].maxAccel) })))))));
        const cap = profile.limits && isNum(profile.limits.maxFeedXY) ? profile.limits.maxFeedXY : null;
        body.appendChild(sec('Speed modes', table,
          h('p', { class: 'stp-hint', id: 'stp-spec-fw', text: `Your plotter's firmware: max rates $110/$111/$112 = ${fwVals([110, 111, 112])}, acceleration $120/$121/$122 = ${fwVals([120, 121, 122])}` }),
          h('p', { class: 'stp-hint', text: `Vectura never changes firmware speed or acceleration settings. Its own limits stay at or below your firmware's rates${cap ? ` (currently capped at ${fmtFeed(cap)} for safety)` : ''}.` })));
      }
      body.appendChild(h('p', { class: 'stp-hint stp-spec-foot', text: `Source: ${sp.source || 'Manufacturer'}. ${sp.note || ''}` }));
      const closeBtn = btn('Close', () => this.closeSpecs(true), 'is-primary', { id: 'stp-specs-close' });
      const dlg = h('div', { class: 'stp-specs', id: 'stp-specs', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${profile.name} specifications`, tabindex: '-1' },
        h('div', { class: 'stp-specs-card' },
          h('div', { class: 'stp-specs-head' }, h('strong', { class: 'stp-specs-title', text: `${profile.name} \u2014 specifications` }), h('span', { class: 'stp-spacer' }), closeBtn),
          body));
      dlg.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); this.closeSpecs(true); return; }
        if (e.key === 'Tab') { // keep focus inside the dialog
          const f = Array.from(dlg.querySelectorAll('button, [tabindex="0"]'));
          if (!f.length) return;
          const first = f[0]; const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
      this.specsOpener = { id: profile.id, kind };
      this.root.appendChild(dlg);
      closeBtn.focus();
    },

    closeSpecs(restoreFocus) {
      const d = this.root && this.root.querySelector('#stp-specs');
      if (d) d.remove();
      const o = this.specsOpener;
      this.specsOpener = null;
      if (restoreFocus && o) {
        const sel = o.kind === 'row' ? `#stp-specs-btn[data-specs-for="${o.id}"]` : `.stp-card-specs[data-specs-for="${o.id}"]`;
        const b = this.root.querySelector(sel) || this.root.querySelector('#stp-specs-btn');
        if (b && typeof b.focus === 'function') b.focus();
      }
    },

    profileTools(cur, connected) {
      const wrap = h('div', { class: 'stp-ptools' });
      const bar = h('div', { class: 'stp-btnrow' });
      bar.appendChild(btn('Duplicate profile', () => {
        const dup = Store.duplicate(cur.id);
        if (dup) { this.saveSettings({ profileId: dup.id }); ADV_OPEN.profile = true; this.renderConnect(); this.renderHeader(); }
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
      wrap.appendChild(h('div', { id: 'stp-profile-editor' }, grid, errBox));
      return wrap;
    },

    connectionSection(c, supported, cur) {
      const sec = h('section', { class: 'stp-sec', id: 'stp-connection' }, h('h3', { class: 'stp-sec-h', text: 'Connection' }));
      const state = c ? c.state : 'disconnected';
      if (this.s.connectMsg) sec.appendChild(h('div', { class: 'stp-note is-error', role: 'alert', id: 'stp-connect-error', text: this.s.connectMsg }));

      if (!c) {
        const busy = this.s.connectBusy;
        // The header button is the one canonical Connect / Reconnect; this pane only names the last port.
        const g = this.s.granted || [];
        if (g.length) {
          let label = 'previous port';
          try { const i2 = g[0].getInfo(); if (i2 && i2.usbVendorId != null) label = `USB ${i2.usbVendorId.toString(16)}:${(i2.usbProductId || 0).toString(16)}`; } catch (e) { /* ignore */ }
          sec.appendChild(h('p', { class: 'stp-lastport', id: 'stp-last-port', text: `Last port: ${label}` }));
        } else if (supported) {
          sec.appendChild(h('p', { class: 'stp-hint', id: 'stp-connect-hint', text: 'Press Connect at the top right and pick your plotter.' }));
        }
        const bar = h('div', { class: 'stp-btnrow' });
        if (supported && g.length) bar.appendChild(btn('Choose a different port\u2026', () => this.connectUsb({}), 'is-link', { id: 'stp-choose-port', disabled: busy }));
        if (supported) bar.appendChild(btn('Plotter not listed?', () => this.connectUsb({ showAll: true }), 'is-link', { id: 'stp-show-all', disabled: busy }));
        sec.appendChild(bar);
        sec.appendChild(h('p', { class: 'stp-hint', id: 'stp-uuna-hint', text: "Close the UUNA app first — only one program can use the plotter's port." }));

        sec.appendChild(this.simAdv(busy));
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
        sec.appendChild(h('p', { class: 'stp-hint', text: `Origin set at machine position ${fmtN(o.x, 2)}, ${fmtN(o.y, 2)} mm (${fmtN(o.x / MM_PER_IN, 3)}, ${fmtN(o.y / MM_PER_IN, 3)} in).` }));
      }
      sec.appendChild(this.fwAdv(c));
      const active = isActiveJob();
      sec.appendChild(h('div', { class: 'stp-btnrow' }, btn('Disconnect', () => this.disconnect(), 'is-warn', { id: 'stp-disconnect', disabled: active || state === 'stopping', title: active ? 'Stop the job before disconnecting' : null })));
      return sec;
    },

    simAdv(busy) {
        const speed = h('input', { type: 'range', min: 1, max: 200, step: 1, value: String(session.simSpeed), 'aria-label': 'Simulator speed' });
        const speedLbl = h('span', { class: 'stp-speed', text: `${session.simSpeed}×` });
        speed.addEventListener('input', () => { session.simSpeed = Number(speed.value); speedLbl.textContent = `${session.simSpeed}×`; });
        return adv('sim', 'Practice with the simulator', h('div', { class: 'stp-sim' },
          h('div', { class: 'stp-btnrow' }, btn('Use simulator', () => this.connectSim(), '', { id: 'stp-connect-sim', disabled: busy })),
          h('label', { class: 'stp-simspeed' }, h('span', { text: 'Speed' }), speed, speedLbl),
          h('span', { class: 'stp-hint', text: 'The simulator is a virtual plotter. Nothing moves and no port is opened.' })));
    },

    fwAdv(c) {
      const fw = c.firmware || {};
      const table = h('table', { class: 'stp-fw', 'aria-label': 'Firmware information' });
      const add = (k, v) => table.appendChild(h('tr', {}, h('th', { scope: 'row', text: k }), h('td', { text: v })));
      add('Firmware', fw.banner || fw.version || 'not reported');
      if (fw.ver) add('Version', String(fw.ver));
      if (fw.opt) add('Options', formatFwOpt(fw.opt));
      FW_ROWS.forEach(([n, label, unit]) => {
        const v = c.fw ? c.fw[n] : undefined;
        add(`$${n} ${label}`, v === undefined ? 'not reported' : (unit === 'mm' && isNum(Number(v)) ? fmtLen(Number(v), { precision: 1 }) : `${v}${unit ? ` ${unit}` : ''}`));
      });
      return adv('fw', 'Firmware details', table);
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
  // Page picture for a rotation option, drawn from the real document aspect ratio. The rect is drawn at its
  // rotated size (so 90/270 swap width and height); a small triangle on the page's original top edge shows which
  // way the artwork's top ends up. Square documents draw squares; an unknown size falls back to a portrait page.
  const rotIconMarkup = (deg, docW, docH) => {
    const known = isNum(docW) && isNum(docH) && docW > 0 && docH > 0;
    const aspect = known ? docW / docH : 0.7;
    const MAX = 28;
    const uw = aspect >= 1 ? MAX : MAX * aspect; // unrotated page size
    const uh = aspect >= 1 ? MAX / aspect : MAX;
    const swap = deg === 90 || deg === 270;
    const rw = swap ? uh : uw; const rh = swap ? uw : uh;
    const f = (n) => Number(n.toFixed(2));
    const x = f(20 - rw / 2); const y = f(20 - rh / 2);
    const top = f(20 - uh / 2); // original top edge, rotated about the centre by the marker group
    return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="${x}" y="${y}" width="${f(rw)}" height="${f(rh)}" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><g data-top-marker="${deg}" transform="rotate(${deg} 20 20)"><path d="M20 ${f(top + 1.5)}l3 3.4h-6z" fill="currentColor"/></g></svg>`;
  };
  const rotIcon = (deg, docSize) => svgEl(rotIconMarkup(deg, docSize && docSize.width, docSize && docSize.height));

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
      this.rotRow = rotRow;
      [0, 90, 180, 270].forEach((deg) => {
        const b = h('button', { type: 'button', class: `stp-rotcard${pl.rotate === deg ? ' is-current' : ''}`, role: 'radio', 'aria-checked': String(pl.rotate === deg), 'aria-label': `Rotate ${deg} degrees`, dataset: { rotate: String(deg) }, onclick: () => {
          this.saveSettings({ placement: { rotate: deg } });
          rotRow.querySelectorAll('.stp-rotcard').forEach((x) => { const on = x.dataset.rotate === String(deg); x.classList.toggle('is-current', on); x.setAttribute('aria-checked', String(on)); });
        } }, rotIcon(deg, this.s.geometry && this.s.geometry.docSize), h('span', { text: `${deg}°` }));
        rotRow.appendChild(b);
      });
      const place = section('Placement',
        field('Mode', modeSeg, 'Fit and Center scale to the work area.'),
        h('div', { class: 'stp-placerow', id: 'stp-place-row' },
          field('Offset X (mm)', ctlNum(pl.offsetX, { min: -5000, max: 5000, step: 1, ariaLabel: 'Offset X', fallback: 0 }, (v) => this.saveSettings({ placement: { offsetX: v } }))),
          field('Offset Y (mm)', ctlNum(pl.offsetY, { min: -5000, max: 5000, step: 1, ariaLabel: 'Offset Y', fallback: 0 }, (v) => this.saveSettings({ placement: { offsetY: v } }))),
          field('Scale', ctlNum(pl.scale, { min: 0.01, max: 100, step: 0.05, ariaLabel: 'Scale', fallback: 1 }, (v) => this.saveSettings({ placement: { scale: v } })))),
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
      const optimize = adv('optimize', 'Optimization', optBody);

      this.speedBox = h('div', { class: 'stp-speedbox', id: 'stp-speedbox' });
      this.renderSpeedBox();
      const speedAdv = adv('speed', 'Speed', this.speedBox);
      const regmark = adv('regmark', 'Registration marks',
        row('Registration mark', ctlSwitch(s.registrationMark, (v) => this.saveSettings({ registrationMark: v }), 'Registration mark'), `A ${fmtLen(10)} cross at the top-left, drawn by every pen, to check color alignment.`));
      const betweenPens = field('Between pens', ctlSeg([{ value: 'pause', label: 'Pause for pen change' }, { value: 'continue', label: 'Keep going' }], s.penChange, (v) => this.saveSettings({ penChange: v }), 'Pen change behavior'));

      left.append(place, section('Pens', this.penBox, betweenPens), speedAdv, optimize, regmark, section('Estimate', this.statsEl));

      // preview column
      this.setupPreview = new Preview(this);
      this.previews.push(this.setupPreview);
      const travel = ctlSwitch(s.showTravel, (v) => this.saveSettings({ showTravel: v }), 'Show travel moves');
      const bar = h('div', { class: 'stp-previewbar' },
        h('label', { class: 'stp-inline' }, h('span', { text: 'Travel moves' }), travel),
        h('span', { class: 'stp-spacer' }),
        btn('Refresh from canvas', () => this.refreshGeometry(), '', { id: 'stp-refresh', title: 'Re-read the document after changing it' }));
      const right = h('div', { class: 'stp-previewcol' }, bar, this.oobEl, this.setupPreview.el,
        h('p', { class: 'stp-hint', text: 'Paper view: as you see the sheet. Cross = origin. Dashed: the sheet at its placement. Red: outside the work area.' }));
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

    // ---- speed range (spec 13): tips, effective feed note, High-speed mode ----
    firmwareNow() { const c = liveController(); return c && c.fw ? c.fw : null; },

    speedTip(kind, feed) {
      const t = this.profile().speedTiers || {};
      if (kind === 'draw' && isNum(t.drawQuality) && feed > t.drawQuality) return `Quality tip: above ${fmtN(t.drawQuality, 0)} mm/min fine lines may thin or skip.`;
      if (kind === 'travel' && isNum(t.travelStepLoss) && feed > t.travelStepLoss) return `Step-loss tip: above ${fmtN(t.travelStepLoss, 0)} mm/min travel moves can lose steps; watch registration.`;
      return '';
    },

    // Effective clamped draw feed plus where the cap comes from (never blocks; PlotSafety still clamps the real value).
    speedNote(requested) {
      const prof = this.profile();
      const info = PS().feedCapInfo(prof, this.firmwareNow());
      const want = isNum(requested) ? requested : prof.motion.drawFeed;
      const eff = PS().clampFeedXY(want, prof, this.firmwareNow());
      const src = info.source === 'firmware' ? 'capped by your firmware' : info.source === 'high-speed' ? 'High-speed mode' : 'profile limit';
      const base = want > info.cap + 1e-6 ? `Capped at ${fmtN(eff, 0)} mm/min (${src})` : `Effective ${fmtN(eff, 0)} mm/min`;
      const tip = this.speedTip('draw', eff);
      return tip ? `${base}. ${tip}` : base;
    },

    renderSpeedBox() {
      const box = this.speedBox;
      if (!box) return;
      box.textContent = '';
      const prof = this.profile();
      const canHs = isNum((prof.limits || {}).highSpeedXY) && prof.limits.highSpeedXY > prof.limits.maxFeedXY;
      const info = PS().feedCapInfo(prof, this.firmwareNow());
      box.appendChild(h('p', { class: 'stp-hint', id: 'stp-speed-cap', text: `XY speed limit now: ${fmtN(info.cap, 0)} mm/min (${info.source === 'firmware' ? 'your firmware' : info.source === 'high-speed' ? 'High-speed mode' : 'profile limit'}). Z: ${fmtN(prof.limits.maxFeedZ, 0)} mm/min.` }));
      const tt = this.speedTip('travel', PS().clampFeedXY(prof.motion.travelFeed, prof, this.firmwareNow()));
      if (tt) box.appendChild(h('p', { class: 'stp-hint', id: 'stp-travel-tip', text: tt }));
      if (!canHs) return;
      const sw = ctlSwitch(prof.highSpeed === true && !this.s.hsConfirm, (v) => {
        if (v) { this.s.hsConfirm = true; this.renderSpeedBox(); return; }
        this.s.hsConfirm = false;
        this.setProfileOverride({ highSpeed: false });
        this.renderSpeedBox();
      }, 'High-speed mode');
      sw.id = 'stp-highspeed';
      box.appendChild(row('High-speed mode', sw, `Raises the XY limit to ${fmtN(prof.limits.highSpeedXY, 0)} mm/min, only if your firmware's $110/$111 allow it.`));
      if (prof.highSpeed === true) {
        const fwv = this.firmwareNow();
        if (fwv && isNum(fwv[110]) && isNum(fwv[111]) && Math.min(fwv[110], fwv[111]) < prof.limits.highSpeedXY) {
          box.appendChild(h('p', { class: 'stp-hint', text: `Your firmware limits XY to ${fmtN(Math.min(fwv[110], fwv[111]), 0)} mm/min ($110/$111), so High-speed mode cannot go faster until those are raised.` }));
        }
      }
      if (this.s.hsConfirm) {
        box.appendChild(h('div', { class: 'stp-confirm', id: 'stp-hs-confirm', role: 'alertdialog', 'aria-label': 'Turn on High-speed mode' },
          h('p', { text: 'High-speed mode: high acceleration increases noise and decreases precision. Exceeding the plotter\'s limits may cause abnormal operation, positioning errors, motor step loss and stalling.' }),
          h('p', { class: 'stp-hint', text: 'Vectura never changes firmware acceleration or speed settings; it only allows faster feeds up to your firmware\'s own limit.' }),
          h('div', { class: 'stp-btnrow' },
            btn('Enable High-speed mode', () => { this.s.hsConfirm = false; this.setProfileOverride({ highSpeed: true }); this.renderSpeedBox(); }, 'is-warn', { id: 'stp-hs-enable' }),
            btn('Cancel', () => { this.s.hsConfirm = false; this.renderSpeedBox(); }, '', { id: 'stp-hs-cancel' }))));
      }
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
        const presetSel = h('select', { class: 'stp-in stp-pen-preset', 'aria-label': `${pen.name} pen type` }, penPresets().map((x) => h('option', { value: x.id, text: x.name })));
        presetSel.value = cfg.preset || 'custom';
        presetSel.addEventListener('change', () => {
          const pr = penPresets().find((x) => x.id === presetSel.value);
          if (!pr || pr.id === 'custom') { save({ preset: 'custom' }); return; }
          save({ preset: pr.id, drawFeed: pr.drawFeed, downDelay: pr.downDelay });
          this.renderPens();
        });
        const speedNoteEl = h('span', { class: 'stp-hint stp-speed-note', text: this.speedNote(cfg.drawFeed) });
        const card = h('div', { class: `stp-pen${cfg.enabled ? '' : ' is-off'}`, dataset: { penId: id } },
          h('div', { class: 'stp-pen-head' },
            ctlSwitch(cfg.enabled, (v) => { save({ enabled: v }); card.classList.toggle('is-off', !v); }, `Plot ${pen.name || id}`),
            h('span', { class: 'stp-swatch', style: `background:${safeColor(pen.color)}`, 'aria-hidden': 'true' }),
            h('span', { class: 'stp-pen-name', text: pen.name || id }),
            h('span', { class: 'stp-hint', text: `${(grp && grp.polylines.length) || 0} paths` }),
            h('span', { class: 'stp-spacer' }),
            btn('↑', () => move(-1), 'stp-icon', { 'aria-label': `Move ${pen.name || id} earlier`, disabled: idx === 0 }),
            btn('↓', () => move(1), 'stp-icon', { 'aria-label': `Move ${pen.name || id} later`, disabled: idx === ids.length - 1 })),
          h('div', { class: 'stp-pen-grid is-primary' },
            field('Pen type (starting point)', presetSel),
            field('Draw speed (mm/min)', ctlNum(cfg.drawFeed, { ariaLabel: `${pen.name} draw speed`, min: 50, max: 20000, nullable: true, placeholder: prof.motion.drawFeed }, (v) => { save({ drawFeed: v, preset: 'custom' }); presetSel.value = 'custom'; speedNoteEl.textContent = this.speedNote(v); }), speedNoteEl),
            field('Pen-down height (mm)', ctlNum(cfg.down, { ariaLabel: `${pen.name} pen-down height`, min: 0, max: 12, step: 0.05, nullable: true, placeholder: prof.pen.down }, (v) => save({ down: v })))),
          adv(`pen-more-${id}`, 'More',
            h('div', { class: 'stp-pen-grid' },
              field('Down dwell (s)', ctlNum(cfg.downDelay, { ariaLabel: `${pen.name} down dwell`, min: 0, max: 10, step: 0.05, nullable: true, placeholder: prof.pen.downDelay }, (v) => { save({ downDelay: v, preset: 'custom' }); presetSel.value = 'custom'; })),
              field('Passes', ctlNum(cfg.passes, { ariaLabel: `${pen.name} passes`, min: 1, max: 10, step: 1, fallback: 1 }, (v) => save({ passes: Math.round(v) }))),
              field('Path order', (() => {
                const sel = h('select', { class: 'stp-in', 'aria-label': `${pen.name} path order` }, ORDER_MODES.map((m) => h('option', { value: m, text: m[0].toUpperCase() + m.slice(1) })));
                sel.value = cfg.order;
                sel.addEventListener('change', () => save({ order: sel.value }));
                return sel;
              })())),
            h('p', { class: 'stp-sub-lbl', text: 'Reload / dip (brush, ink)' }),
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
      if (this.s.building) el.appendChild(h('p', { class: 'stp-hint', text: 'Preparing…' }));
      if (!job || !job.stats) { if (!this.s.jobError) el.appendChild(h('p', { class: 'stp-hint', text: 'No plot yet.' })); return; }
      const st = job.stats;
      if (alt) el.appendChild(h('p', { class: 'stp-hint', text: `Showing the ${alt.label}. Clear it on the Plot tab to see your artwork again.` }));
      const dl = h('dl', { class: 'stp-statlist' });
      const add = (k, v, id) => dl.append(h('dt', { text: k }), h('dd', { text: v, id }));
      add('Draw length', fmtDist(st.drawLength), 'stp-stat-draw');
      add('Travel', fmtDist(st.travelLength), 'stp-stat-travel');
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
        scale: btn('Scale check', () => this.runScaleCheck(), '', { id: 'stp-scale-check', title: `Draw a ${fmtLen(100)} square with a cross, to measure with a ruler` }),
      };
      const tools = adv('tests', 'Tests & checks',
        h('div', { class: 'stp-btnrow' }, this.auxBtns.frame, this.auxBtns.scale),
        h('p', { class: 'stp-hint', text: `Frame moves the pen up around the outline of your plot. Scale check draws a ${fmtLen(100)} square and a cross.` }),
        h('p', { class: 'stp-sub-lbl', text: 'Test swatches (speed × pen-down height)' }),
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
          row('Return to origin', ctlSwitch(s.returnToOrigin, (v) => this.saveSettings({ returnToOrigin: v }), 'Return to origin'))),
        tools,
        adv('plot-adv', 'Advanced', mzRow));
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
        const why = this.auxBlocker();
        const setBtn = (b, reason) => {
          if (b.dataset.defTitle === undefined) b.dataset.defTitle = b.getAttribute('title') || '';
          b.disabled = !!reason;
          if (reason) b.title = reason; else if (b.dataset.defTitle) b.title = b.dataset.defTitle; else b.removeAttribute('title');
        };
        setBtn(this.auxBtns.frame, why || (!(this.s.job && this.s.job.bbox) ? 'There is no plot to frame.' : (!this.jobReady() ? 'Preparing the plot…' : '')));
        setBtn(this.auxBtns.scale, why);
        setBtn(this.swatchBtns.plot, why);
      }

      if (this.s.plotMsg) el.appendChild(h('div', { class: 'stp-note is-error', role: 'alert', id: 'stp-plot-error', text: this.s.plotMsg }));
      if (session.lastError && session.lastError.message && state !== 'running') {
        el.appendChild(h('div', { class: 'stp-note is-error', role: 'alert', text: session.lastError.message }));
      }
      if (this.s.altJob) el.appendChild(h('div', { class: 'stp-note', text: `Previewing the ${this.s.altJob.label}. Start plots your artwork; "Plot swatches" plots this pattern.` }));

      if (job && job.stats) {
        el.appendChild(h('p', { class: 'stp-summary', id: 'stp-plot-summary', text: `${job.stats.pathCount} paths · ${fmtDist(job.stats.drawLength)} drawn · about ${fmtTime(job.stats.estSeconds)}${job.airPlot ? ' · air plot' : ''}` }));
      }

      const active = ACTIVE_STATES.includes(state);
      if (!active && state !== 'stopping') {
        // giant Start; every reason it cannot start links to the tab that fixes it
        const startBtn = btn(this.s.altJob ? 'Start artwork plot' : 'Start plot', () => this.startPlot(), 'is-primary stp-start', { id: 'stp-start', disabled: blockers.length > 0 });
        el.appendChild(h('div', { class: 'stp-btnrow' }, startBtn));
        const items = this.startBlockerItems();
        if (items.length) {
          const TAB_LABEL = { connect: 'Connect', machine: 'Machine', setup: 'Setup' };
          const why = h('ul', { class: 'stp-why', id: 'stp-start-why' });
          items.forEach((it) => {
            const li = h('li', { text: it.text });
            if (it.tab) li.appendChild(btn(`Go to ${TAB_LABEL[it.tab] || it.tab}`, () => this.showTab(it.tab), 'is-link', { dataset: { fixTab: it.tab } }));
            why.appendChild(li);
          });
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
          btn('Continue', () => { this.s.pcDown = false; return this.guard(() => c.continuePenChange()); }, 'is-primary', { id: 'stp-pc-continue', title: down ? 'The pen is raised first' : null })));
    },

    // Lowers/raises the pen at the pen-change position for a touch test, through the controller's
    // public penDown()/penUp() (profile heights, clamped, synced with G4 P0).
    async penCheck(lower, c, prof) {
      try {
        if (lower) await c.penDown(); else await c.penUp();
        this.s.pcDown = lower;
        this.s.plotMsg = null;
      } catch (err) { this.s.plotMsg = err.message; }
      this.renderPlot();
    },

    appendEndCards(el, c, state, sim) {
      let res = session.lastResult;
      const alarm = session.alarm;
      // A jog / manual-move emergency stop is not a stopped job: no Resume card (the banner note says it).
      if (res && res.aborted && !res.fromJob && !alarm) return;
      if (res && res.aborted && !res.fromJob) res = null;
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
        // Only a job built from the current settings, origin and document may be plotted: never a stale one.
        if (!this.jobReady()) {
          if (!this.s.building) this.scheduleRecompute();
          throw new Error('The plot is still being prepared. Try again in a moment.');
        }
        job = this.s.job;
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
        if (err && err.code) this.s.bannerErr = err.message; // refusals (corner, position) show in the banner
        if (!this.destroyed) { this.renderPlot(); this.renderHeader(); }
      });
    },

    // Why a helper that moves the machine (Frame, Scale check, Test swatch) cannot start; '' = it can.
    auxBlocker() {
      const c = liveController();
      const sim = session.kind === 'sim';
      if (!c) return 'Connect to a plotter first (Connect tab).';
      if (c.state !== 'idle') return `The plotter is ${STATE_LABEL[c.state] ? STATE_LABEL[c.state].toLowerCase() : c.state}.`;
      if (cornerUnconfirmed(c)) return 'Confirm the plotter was at its start corner first.';
      if (!(c.originSet || sim || session.useMachineZero)) return 'Set the origin first (Machine tab).';
      if (!sim && !(this.calibration().axisChecked && this.calibration().penHeightChecked)) return 'Run the Axis check and the Pen height check once (Machine tab).';
      return '';
    },

    auxProfileArgs() {
      const c = liveController();
      return { originOffset: originOffsetOf(c), firmware: c ? c.fw : null };
    },

    runFrame() {
      const blocked = this.auxBlocker();
      if (blocked) { this.s.plotMsg = blocked; this.renderPlot(); return null; }
      const c = liveController();
      const job0 = this.s.job;
      if (!c || !job0 || !job0.bbox) return null;
      if (!this.jobReady()) { this.s.plotMsg = 'The plot is still being prepared. Try again in a moment.'; this.renderPlot(); return null; }
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
      const blocked = this.auxBlocker();
      if (blocked) { this.s.plotMsg = blocked; this.renderPlot(); return null; }
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
      const blocked = this.auxBlocker();
      if (blocked) { this.s.plotMsg = blocked; this.renderPlot(); return; }
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
    jobOptions: null,
    formatFwOpt,
    previewBounds,
    paperSpace: { toPaper, fromPaper, paperAreaRect, assumedOriginOffset },
    connectSession,
    disconnectSession,
    closestSpeedMode,
    fmtLen,
    fmtDims,
    fmtFeed,
    fmtSize,
    fmtDist,
    simOptions: null,
    installOn(proto) {
      proto.bindSendToPlotterButton = function () { return bindSendToPlotterButton.call(this); };
      proto.openSendToPlotter = function () { return openSendToPlotter.call(this); };
    },
  };
})();
