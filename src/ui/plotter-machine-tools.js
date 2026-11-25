/*
 * Send to Plotter: machine tools (Phase B2).
 *
 * window.Vectura.PlotterMachineTools = { mountMachine(containerEl, ctx), mountConsole(containerEl, ctx) }
 * Each returns { update(), destroy() }. All motion goes through the PlotterController (which
 * clamps and bounds-checks); nothing here talks to hardware directly.
 *
 * ctx = { getController(), getProfile(), getFirmware(), getSettings(), saveSettings(patch),
 *         setProfileOverride(patch), getJobBbox(), getOriginOffset(), log(msg, level), requestTab(name),
 *         scheduler? (optional {setTimeout, clearTimeout}, used by tests) }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const HOLD_MS = 280;
  const LOG_CAP = 2000;
  const STEPS = [0.1, 1, 10, 50];
  const ALARM_WARNING = 'Position may be wrong after an alarm. Check the pen is clear of the paper edge before moving.';

  // ---------------------------------------------------------------- tiny DOM helpers
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const button = (label, cls, act) => {
    const b = h('button', 'stp-mt-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (act) b.setAttribute('data-stp-act', act);
    return b;
  };
  const numField = (opts) => {
    const wrap = h('label', 'stp-mt-field');
    wrap.appendChild(h('span', 'stp-mt-field-lbl', opts.label));
    const input = h('input', 'stp-mt-num');
    input.type = 'number';
    if (opts.min != null) input.min = String(opts.min);
    if (opts.max != null) input.max = String(opts.max);
    input.step = String(opts.step != null ? opts.step : 1);
    input.value = String(opts.value);
    if (opts.act) input.setAttribute('data-stp-field', opts.act);
    wrap.appendChild(input);
    return { wrap, input };
  };
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const fix = (v, n) => (Number.isFinite(v) ? v.toFixed(n) : '—');

  // ---------------------------------------------------------------- shared lifecycle
  const createBase = (containerEl, ctx, rootCls) => {
    const root = h('div', 'stp-mt-root ' + rootCls);
    containerEl.appendChild(root);
    const listeners = [];
    const timers = new Set();
    let ctrl = null;
    let unsubs = [];
    let destroyed = false;
    const sch = ctx.scheduler || {
      setTimeout: (f, ms) => window.setTimeout(f, ms),
      clearTimeout: (i) => window.clearTimeout(i),
    };
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners.push([target, type, fn, opts]);
    };
    const later = (fn, ms) => {
      const id = sch.setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
      timers.add(id);
      return id;
    };
    const cancel = (id) => { if (id == null) return; sch.clearTimeout(id); timers.delete(id); };
    // Returns the current controller; (re)subscribes when it changed.
    const bind = (events, handler) => {
      const c = ctx.getController ? ctx.getController() : null;
      if (c !== ctrl) {
        unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
        unsubs = [];
        ctrl = c;
        if (c && typeof c.on === 'function') {
          events.forEach((e) => { unsubs.push(c.on(e, (p) => { if (!destroyed) handler(e, p); })); });
        }
        return { c, changed: true };
      }
      return { c, changed: false };
    };
    const teardown = () => {
      destroyed = true;
      listeners.forEach(([t, ty, fn, o]) => t.removeEventListener(ty, fn, o));
      listeners.length = 0;
      timers.forEach((id) => sch.clearTimeout(id));
      timers.clear();
      unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
      unsubs = [];
      ctrl = null;
      if (root.parentNode) root.parentNode.removeChild(root);
    };
    return { root, on, later, cancel, bind, teardown, isDestroyed: () => destroyed };
  };

  // ---------------------------------------------------------------- axes helpers
  // Sheet -> machine (same convention as PlotJob.applyAxes: invert, then optional swap).
  const paperToMachine = (axes, px, py) => {
    const a = axes || {};
    let x = a.invertX ? -px : px;
    let y = a.invertY ? -py : py;
    if (a.swapXY) { const t = x; x = y; y = t; }
    return { x: x + 0, y: y + 0 };
  };
  const machineToPaper = (axes, mx, my) => {
    const a = axes || {};
    let ix = mx; let iy = my;
    if (a.swapXY) { ix = my; iy = mx; }
    return { x: (a.invertX ? -ix : ix) + 0, y: (a.invertY ? -iy : iy) + 0 };
  };
  const paperDirName = (p) => {
    if (p.x > 0) return 'right';
    if (p.x < 0) return 'left';
    if (p.y > 0) return 'down the page';
    return 'up the page';
  };

  // Axis check: where did the pen go when the machine moved +X (ansX) and +Y (ansY)?
  const ANSWERS = {
    right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 },
  };
  const deriveAxes = (ansX, ansY) => {
    const dx = ANSWERS[ansX]; const dy = ANSWERS[ansY];
    if (!dx || !dy) return { error: 'Choose what you saw for each move.' };
    if ((dx.x !== 0) === (dy.x !== 0)) {
      return { error: 'The two moves must go in different directions (one sideways, one up-down). Repeat the second move.' };
    }
    if (dx.x === 0) {
      // machine X moved along the page: X and Y are swapped
      return { axes: { swapXY: true, invertY: dx.y < 0, invertX: dy.x < 0 } };
    }
    return { axes: { swapXY: false, invertX: dx.x < 0, invertY: dy.y < 0 } };
  };

  const ICONS = {
    axis: '<svg viewBox="0 0 48 30" aria-hidden="true"><path d="M8 24 H38 M38 24 l-5 -3.5 M38 24 l-5 3.5 M8 24 V4 M8 4 l-3.5 5 M8 4 l3.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pen: '<svg viewBox="0 0 48 30" aria-hidden="true"><path d="M24 3 V18 M20 18 H28 L24 25 Z M8 27 H40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    origin: '<svg viewBox="0 0 48 30" aria-hidden="true"><path d="M8 26 V6 H40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="6" r="3" fill="currentColor"/></svg>',
    scale: '<svg viewBox="0 0 48 30" aria-hidden="true"><rect x="10" y="4" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M36 6 V24 M34 6 H38 M34 24 H38" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2 L10 8.5 H2 Z" fill="currentColor"/></svg>',
  };

  // ---------------------------------------------------------------- MACHINE TAB
  const DIRS = [
    { id: 'nw', px: -1, py: -1, rot: -45, label: 'Up and left' },
    { id: 'n', px: 0, py: -1, rot: 0, label: 'Up the page' },
    { id: 'ne', px: 1, py: -1, rot: 45, label: 'Up and right' },
    { id: 'w', px: -1, py: 0, rot: -90, label: 'Left' },
    { id: 'c', px: 0, py: 0, rot: 0, label: '' },
    { id: 'e', px: 1, py: 0, rot: 90, label: 'Right' },
    { id: 'sw', px: -1, py: 1, rot: -135, label: 'Down and left' },
    { id: 's', px: 0, py: 1, rot: 180, label: 'Down the page' },
    { id: 'se', px: 1, py: 1, rot: 135, label: 'Down and right' },
  ];
  const CAL = [
    { key: 'axis', title: 'Axis check', icon: ICONS.axis, flag: 'axisChecked', blurb: 'Confirm that right and down on the pad match the plotter.' },
    { key: 'pen', title: 'Pen height', icon: ICONS.pen, flag: 'penHeightChecked', blurb: 'Find where the pen touches the paper.' },
    { key: 'origin', title: 'Origin & paper', icon: ICONS.origin, flag: null, blurb: 'Set the sheet corner as the origin and frame it.' },
    { key: 'scale', title: 'Scale check', icon: ICONS.scale, flag: null, blurb: 'Draw a 100 mm square and measure it.' },
  ];
  const ANS4 = [['right', 'Right'], ['left', 'Left'], ['down', 'Toward me (down the page)'], ['up', 'Away from me (up the page)']];

  const mountMachine = (containerEl, ctx) => {
    const B = createBase(containerEl, ctx, 'stp-mt-machine');
    const { root } = B;
    const S = {
      alarm: null, limitTimer: null, press: null, holdPromise: null, skipClick: false,
      busy: false, homeConfirm: false, wizard: null, step: 1, feed: null, customStep: false,
    };
    const prof = () => ctx.getProfile() || {};
    const profPen = () => prof().pen || {};
    const profAxes = () => prof().axes || {};
    const ctrlOf = () => (ctx.getController ? ctx.getController() : null);
    const saved = (ctx.getSettings && ctx.getSettings()) || {};
    const savedMt = (saved && saved.machineTools) || {};
    S.step = num(savedMt.step, 1);
    S.customStep = !STEPS.includes(S.step);
    S.feed = num(savedMt.feed, null);
    const maxJog = () => num((prof().limits || {}).maxJogFeed, 6000);
    const jogFeed = () => clamp(S.feed != null ? S.feed : num((prof().motion || {}).jogFeed, 2500), 1, maxJog());

    const canMove = () => { const c = ctrlOf(); return !!c && (c.state === 'idle' || c.state === 'jogging'); };
    const reasonText = () => {
      const c = ctrlOf();
      if (!c) return 'Connect to a plotter to use the machine tools.';
      switch (c.state) {
        case 'idle': case 'jogging': return '';
        case 'alarm': return 'The plotter is in alarm. Unlock it first.';
        case 'running': case 'paused': case 'penChange': case 'stopping': return 'Machine tools are unavailable while a job is running.';
        case 'connecting': return 'Connecting to the plotter…';
        default: return 'The plotter is not ready (' + c.state + ').';
      }
    };

    // ---- message line
    const msgEl = h('div', 'stp-mt-msg');
    msgEl.setAttribute('role', 'status');
    msgEl.hidden = true;
    const setMsg = (text, level) => {
      msgEl.hidden = !text;
      msgEl.textContent = text || '';
      msgEl.className = 'stp-mt-msg' + (level ? ' is-' + level : '');
    };
    const fail = (e) => {
      const m = (e && e.message) || String(e);
      setMsg(m, 'error');
      if (ctx.log) ctx.log(m, 'warn');
    };
    const guard = async (fn) => {
      try { return await fn(); } catch (e) { fail(e); return undefined; }
    };
    const act = async (fn) => {
      if (S.busy) return undefined;
      S.busy = true; refresh();
      try { return await fn(); } catch (e) { fail(e); return undefined; } finally { S.busy = false; refresh(); }
    };

    // ---- sections
    const section = (title, cls) => {
      const s = h('section', 'stp-mt-sec' + (cls ? ' ' + cls : ''));
      s.appendChild(h('h4', 'stp-mt-sec-hdr', title));
      root.appendChild(s);
      return s;
    };
    const controls = []; // {el, need: 'move'|'origin'|'frame'|'z'}
    const reg = (el, need) => { controls.push({ el, need }); return el; };

    // alarm banner
    const alarmBox = h('div', 'stp-mt-alarm');
    alarmBox.hidden = true;
    alarmBox.setAttribute('role', 'alert');
    const alarmTitle = h('strong', 'stp-mt-alarm-title', 'Alarm');
    const alarmText = h('p', 'stp-mt-alarm-text');
    const unlockBtn = button('Unlock', 'is-danger', 'unlock');
    alarmBox.append(alarmTitle, alarmText, unlockBtn);
    root.appendChild(alarmBox);

    root.appendChild(msgEl);
    const stopBtn = button('Stop', 'is-danger stp-mt-stop', 'stop');
    stopBtn.hidden = true;
    root.appendChild(stopBtn);
    const reasonEl = h('div', 'stp-mt-reason');
    root.appendChild(reasonEl);

    // readout
    const sRead = section('Position');
    const pill = h('span', 'stp-mt-pill', 'Not connected');
    const originPill = h('span', 'stp-mt-pill stp-mt-origin-pill', 'Origin not set');
    const pillRow = h('div', 'stp-mt-row');
    pillRow.append(pill, originPill);
    const grid = h('div', 'stp-mt-readout');
    const cells = {};
    [['wpos', 'WPos'], ['mpos', 'MPos']].forEach(([k, label]) => {
      const row = h('div', 'stp-mt-readout-row');
      row.appendChild(h('span', 'stp-mt-readout-lbl', label));
      ['x', 'y', 'z'].forEach((a) => {
        const c = h('span', 'stp-mt-readout-val', '—');
        c.setAttribute('data-stp-pos', k + '-' + a);
        cells[k + a] = c;
        row.appendChild(h('span', 'stp-mt-readout-axis', a.toUpperCase()));
        row.appendChild(c);
      });
      grid.appendChild(row);
    });
    const feedRow = h('div', 'stp-mt-readout-row');
    feedRow.appendChild(h('span', 'stp-mt-readout-lbl', 'Feed'));
    const feedVal = h('span', 'stp-mt-readout-val', '—');
    feedRow.appendChild(feedVal);
    grid.appendChild(feedRow);
    sRead.append(pillRow, grid);

    // jog
    const sJog = section('Jog');
    const jogWrap = h('div', 'stp-mt-jog');
    const pad = h('div', 'stp-mt-dial');
    pad.tabIndex = 0;
    pad.setAttribute('role', 'group');
    pad.setAttribute('data-stp-pad', '1');
    pad.setAttribute('aria-label', 'Jog pad. Arrow keys move the pen; Shift moves 10 times farther, Alt a tenth. Page Up raises and Page Down lowers the pen.');
    const dirBtns = [];
    DIRS.forEach((d) => {
      if (d.id === 'c') { pad.appendChild(h('span', 'stp-mt-dial-hub')); return; }
      const b = h('button', 'stp-mt-dir stp-mt-dir-' + d.id);
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('aria-label', 'Jog ' + d.label.toLowerCase());
      b.setAttribute('data-stp-jog', d.id);
      b.innerHTML = ICONS.arrow;
      b.firstChild.style.setProperty('--stp-mt-rot', d.rot + 'deg');
      pad.appendChild(b);
      reg(b, 'move');
      dirBtns.push({ b, d });
    });
    const limitEl = h('div', 'stp-mt-limit');
    limitEl.setAttribute('role', 'status');
    limitEl.hidden = true;
    const jogSide = h('div', 'stp-mt-jog-side');
    jogSide.appendChild(h('span', 'stp-mt-field-lbl', 'Step (mm)'));
    const stepGrp = h('div', 'tog-grp stp-mt-steps');
    stepGrp.setAttribute('role', 'group');
    stepGrp.setAttribute('aria-label', 'Jog step in millimeters');
    const stepBtns = STEPS.map((v) => {
      const b = h('button', 'tog-btn', String(v));
      b.type = 'button';
      b.setAttribute('data-stp-step', String(v));
      stepGrp.appendChild(b);
      return { b, v };
    });
    jogSide.appendChild(stepGrp);
    const customStep = numField({ label: 'Custom step (mm)', min: 0.01, max: 200, step: 0.1, value: S.step, act: 'custom-step' });
    const speed = numField({ label: 'Jog speed (mm/min)', min: 1, max: maxJog(), step: 100, value: jogFeed(), act: 'jog-feed' });
    const speedNote = h('span', 'stp-mt-hint');
    jogSide.append(customStep.wrap, speed.wrap, speedNote);
    jogWrap.append(pad, jogSide);
    sJog.append(jogWrap, limitEl);
    sJog.appendChild(h('p', 'stp-mt-hint', 'Tap to step, press and hold to keep moving. Directions are relative to the paper. Click the pad, then use the arrow keys.'));

    // pen
    const sPen = section('Pen');
    const penRow = h('div', 'stp-mt-row');
    const upBtn = reg(button('Pen up', '', 'pen-up'), 'move');
    const downBtn = reg(button('Pen down', '', 'pen-down'), 'move');
    penRow.append(upBtn, downBtn);
    const zWrap = h('label', 'stp-mt-field stp-mt-zfield');
    zWrap.appendChild(h('span', 'stp-mt-field-lbl', 'Pen height (mm)'));
    const zRange = h('input', 'stp-mt-range');
    zRange.type = 'range';
    zRange.step = '0.05';
    zRange.setAttribute('data-stp-field', 'pen-z');
    zRange.setAttribute('aria-label', 'Pen height in millimeters');
    const zVal = h('span', 'stp-mt-readout-val', '—');
    zWrap.append(zRange, zVal);
    reg(zRange, 'z');
    sPen.append(penRow, zWrap, h('p', 'stp-mt-hint', 'Move the slider to set the pen height live. Release to send. Use the Pen height wizard to save the result.'));

    // origin
    const sOrigin = section('Origin');
    const originRow = h('div', 'stp-mt-row');
    const setOriginBtn = reg(button('Set origin here', 'is-primary', 'set-origin'), 'move');
    const gotoOriginBtn = reg(button('Go to origin', '', 'goto-origin'), 'origin');
    const frameBtn = reg(button('Frame', '', 'frame'), 'frame');
    const homeBtn = reg(button('Home', '', 'home'), 'move');
    originRow.append(setOriginBtn, gotoOriginBtn, frameBtn, homeBtn);
    const homeConfirmBox = h('div', 'stp-mt-confirm');
    homeConfirmBox.hidden = true;
    const homeYes = button('Home now', 'is-danger', 'home-confirm');
    const homeNo = button('Cancel', '', 'home-cancel');
    homeConfirmBox.append(h('span', '', 'Homing moves the machine until it reaches its limit switches and clears the origin. Make sure the way is clear.'), homeYes, homeNo);
    sOrigin.append(originRow, homeConfirmBox, h('p', 'stp-mt-hint', 'Frame traces the job outline with the pen raised. It needs an origin.'));

    // calibration
    const sCal = section('Calibration');
    const calHost = h('div', 'stp-mt-cal');
    const simNote = h('p', 'stp-mt-hint', 'Simulator calibration is practice only \u2014 it is not saved for your plotter.');
    simNote.setAttribute('data-stp-sim-cal-note', '');
    simNote.hidden = true;
    sCal.append(simNote, calHost);

    // ---- refresh (cheap, no DOM rebuild)
    const setEnabled = (el, ok, why) => {
      el.disabled = !ok;
      if (!ok && why) el.title = why; else el.removeAttribute('title');
    };
    const fwOf = (c) => (c && c.fw) || (ctx.getFirmware && ctx.getFirmware()) || {};
    const refresh = () => {
      if (B.isDestroyed()) return;
      const { c, changed } = B.bind(['state', 'status', 'alarm', 'limit', 'origin', 'done', 'error'], onEvent);
      if (changed) S.alarm = null;
      const st = c ? c.getState() : null;
      const move = canMove();
      const why = reasonText();
      reasonEl.textContent = why;
      reasonEl.hidden = !why;
      // readout
      const label = !c ? 'Not connected' : (c.state === 'idle' && st.machineState ? st.machineState : c.state);
      pill.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      pill.className = 'stp-mt-pill' + (c ? ' is-' + String(c.state).toLowerCase() : '');
      originPill.textContent = c && c.originSet ? 'Origin set' : 'Origin not set';
      originPill.className = 'stp-mt-pill stp-mt-origin-pill' + (c && c.originSet ? ' is-set' : '');
      ['wpos', 'mpos'].forEach((k) => {
        ['x', 'y', 'z'].forEach((a) => {
          const p = st && st[k];
          cells[k + a].textContent = fix(p ? p[a] : NaN, 3);
        });
      });
      const fs = c && c.status && c.status.fs;
      feedVal.textContent = fs && Number.isFinite(fs.feed) ? Math.round(fs.feed) + ' mm/min' : '—';
      // alarm
      const inAlarm = !!c && c.state === 'alarm';
      if (!inAlarm) S.alarm = null;
      alarmBox.hidden = !inAlarm;
      if (inAlarm) {
        const a = S.alarm || {};
        const lost = a.positionLost === true;
        alarmTitle.textContent = lost ? 'Position lost' : 'Alarm' + (a.code != null ? ' ' + a.code : '');
        alarmText.textContent = lost
          ? (a.message || 'Power-cycle the plotter, then reconnect and set the origin again.')
          : [a.message, ALARM_WARNING].filter(Boolean).join(' ');
        unlockBtn.hidden = lost;
        alarmBox.classList.toggle('is-lost', lost);
      }
      stopBtn.hidden = !(c && ['running', 'paused', 'penChange'].includes(c.state));
      // jog controls
      stepBtns.forEach(({ b, v }) => {
        const isOn = !S.customStep && S.step === v;
        b.classList.toggle('active', isOn);
        b.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      });
      speed.input.max = String(maxJog());
      speedNote.textContent = 'Max ' + maxJog() + ' mm/min for this plotter.';
      // pen slider
      const pz = profPen();
      const isZ = pz.mechanism === 'z' || pz.mechanism == null;
      zRange.min = String(num(pz.zMin, 0));
      zRange.max = String(num(pz.zMax, 10));
      const curZ = st && st.pen && Number.isFinite(st.pen.z) ? st.pen.z : NaN;
      if (document.activeElement !== zRange && Number.isFinite(curZ)) zRange.value = String(curZ);
      zVal.textContent = Number.isFinite(curZ) ? fix(Number(zRange.value), 2) : '—';
      // enablement
      const bbox = ctx.getJobBbox ? ctx.getJobBbox() : null;
      const idle = !!c && c.state === 'idle' && !S.busy;
      controls.forEach(({ el, need }) => {
        let ok = move;
        let w = why;
        if (need === 'origin') { ok = move && c.originSet; if (move && !ok) w = 'Set the origin first.'; }
        if (need === 'frame') {
          ok = idle && !!c.originSet && !!bbox;
          w = !move ? why : (!c.originSet ? 'Set the origin first.' : (!bbox ? 'There is no job to frame.' : ''));
        }
        if (need === 'z') { ok = move && isZ; if (move && !isZ) w = 'This plotter raises the pen with a servo, not a Z axis.'; }
        setEnabled(el, ok, w);
      });
      const canHome = !!c && fwOf(c)[22] === 1;
      homeBtn.hidden = !canHome;
      homeConfirmBox.hidden = !(canHome && S.homeConfirm);
      setEnabled(unlockBtn, !!c && ['alarm', 'idle', 'error'].includes(c.state), '');
      pad.setAttribute('aria-disabled', move ? 'false' : 'true');
      renderCalLaunchers();
      refreshWizardButtons();
    };

    const onEvent = (evt, p) => {
      if (evt === 'alarm') S.alarm = p || {};
      if (evt === 'limit' && p && p.atLimit) showLimit(p.atLimit);
      refresh();
    };

    // ---- jog logic
    const showLimit = (al) => {
      const parts = [];
      if (al.x) parts.push(paperDirName(machineToPaper(profAxes(), al.x === 'max' ? 1 : -1, 0)));
      if (al.y) parts.push(paperDirName(machineToPaper(profAxes(), 0, al.y === 'max' ? 1 : -1)));
      limitEl.textContent = 'At limit: the pen cannot move further ' + (parts.join(' or ') || 'that way') + '.';
      limitEl.hidden = false;
      B.cancel(S.limitTimer);
      S.limitTimer = B.later(() => { limitEl.hidden = true; }, 2500);
    };
    const single = (px, py, mult) => guard(async () => {
      const c = ctrlOf();
      if (!c || !canMove()) return;
      const dist = Math.round(num(S.step, 1) * (mult || 1) * 10000) / 10000;
      const m = paperToMachine(profAxes(), px * dist, py * dist);
      const r = await c.jog(m.x, m.y, jogFeed());
      if (r && r.atLimit && r.atLimit.any) showLimit(r.atLimit);
      else limitEl.hidden = true;
      setMsg('', '');
      refresh();
    });
    const startHold = (px, py) => {
      const c = ctrlOf();
      if (!c || !canMove()) return;
      const m = paperToMachine(profAxes(), px, py);
      S.holdPromise = Promise.resolve(c.jogContinuousStart({ x: m.x, y: m.y }, jogFeed())).catch((e) => { fail(e); });
    };
    // A release can arrive before jogContinuousStart resolved: wait for it, then cancel.
    const stopHold = () => {
      const c = ctrlOf();
      const pending = S.holdPromise;
      S.holdPromise = null;
      if (!pending || !c) return Promise.resolve();
      return pending.then(() => c.jogContinuousStop()).catch(() => null);
    };
    // jog=true performs the single step for a short press.
    const endPress = (jog) => {
      const p = S.press;
      if (!p) return;
      S.press = null;
      B.cancel(p.timer);
      if (p.mode === 'hold') { stopHold(); return; }
      if (jog) single(p.d.px, p.d.py, 1);
    };
    const stopAll = () => { endPress(false); stopHold(); };

    dirBtns.forEach(({ b, d }) => {
      B.on(b, 'pointerdown', (e) => {
        if (!canMove()) return;
        S.skipClick = false;
        endPress(false);
        try { if (b.setPointerCapture && e.pointerId != null) b.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        const p = { d, mode: 'pending', timer: null };
        S.press = p;
        p.timer = B.later(() => {
          if (S.press !== p) return;
          p.mode = 'hold';
          startHold(d.px, d.py);
        }, HOLD_MS);
      });
      B.on(b, 'click', () => {
        if (S.skipClick) { S.skipClick = false; return; }
        single(d.px, d.py, 1); // keyboard activation (Enter / Space)
      });
    });
    B.on(pad, 'pointerup', () => { if (S.press) S.skipClick = true; endPress(true); }, true);
    B.on(pad, 'pointercancel', () => { if (S.press) S.skipClick = true; endPress(false); }, true);
    B.on(window, 'blur', stopAll);
    B.on(document, 'keydown', (e) => { if (e.key === 'Escape') stopAll(); });
    B.on(pad, 'keydown', (e) => {
      const key = e.key;
      const mult = e.shiftKey ? 10 : (e.altKey ? 0.1 : 1);
      const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
      if (dirs[key]) { e.preventDefault(); single(dirs[key][0], dirs[key][1], mult); }
      else if (key === 'PageUp') { e.preventDefault(); doPen('up'); }
      else if (key === 'PageDown') { e.preventDefault(); doPen('down'); }
    });

    const persist = () => { if (ctx.saveSettings) ctx.saveSettings({ machineTools: { step: S.step, feed: S.feed } }); };
    stepBtns.forEach(({ b, v }) => B.on(b, 'click', () => { S.step = v; S.customStep = false; customStep.input.value = String(v); persist(); refresh(); }));
    B.on(customStep.input, 'change', () => {
      const v = Number(customStep.input.value);
      if (Number.isFinite(v) && v > 0) { S.step = clamp(v, 0.01, 200); S.customStep = !STEPS.includes(S.step); customStep.input.value = String(S.step); persist(); }
      refresh();
    });
    B.on(speed.input, 'change', () => {
      const v = Number(speed.input.value);
      if (Number.isFinite(v) && v > 0) { S.feed = clamp(v, 1, maxJog()); persist(); }
      speed.input.value = String(jogFeed());
      refresh();
    });

    // ---- pen / origin / misc actions
    const doPen = (which) => guard(async () => {
      const c = ctrlOf();
      if (!c || !canMove()) return;
      if (which === 'up') await c.penUp(); else await c.penDown();
      setMsg('', '');
      refresh();
    });
    B.on(upBtn, 'click', () => doPen('up'));
    B.on(downBtn, 'click', () => doPen('down'));
    B.on(zRange, 'input', () => { zVal.textContent = fix(Number(zRange.value), 2); });
    B.on(zRange, 'change', () => guard(async () => {
      const c = ctrlOf();
      if (!c || !canMove()) return;
      const r = await c.setPenHeight(Number(zRange.value));
      if (r && r.clamped) setMsg('Pen height limited to ' + fix(r.z, 2) + ' mm.', 'warn');
      refresh();
    }));
    B.on(setOriginBtn, 'click', () => act(async () => {
      await ctrlOf().setOrigin();
      setMsg('Origin set at the current position.', 'ok');
    }));
    B.on(gotoOriginBtn, 'click', () => act(async () => { await ctrlOf().goToOrigin(); setMsg('', ''); }));
    B.on(unlockBtn, 'click', () => guard(async () => {
      await ctrlOf().unlock();
      setMsg('Unlocked. Check the origin before plotting.', 'warn');
      refresh();
    }));
    B.on(stopBtn, 'click', () => guard(async () => { await ctrlOf().stop(); refresh(); }));
    B.on(homeBtn, 'click', () => { S.homeConfirm = true; refresh(); });
    B.on(homeNo, 'click', () => { S.homeConfirm = false; refresh(); });
    B.on(homeYes, 'click', () => {
      S.homeConfirm = false;
      act(async () => { await ctrlOf().home({ confirm: true }); setMsg('Homing finished. Set the origin again.', 'ok'); });
    });

    const runJob = async (job, label) => {
      const c = ctrlOf();
      const P = Vectura.PlotJob;
      if (!c || !P) throw new Error('The job builder is not available.');
      if (job.bounds && job.bounds.ok === false) throw new Error(label + ' would leave the work area. Move the origin or the offset.');
      const gcode = P.toGcode(job, prof(), { airPlot: job.airPlot === true });
      return c.run(gcode, { penChange: 'continue' });
    };
    const frame = async () => {
      const bbox = ctx.getJobBbox ? ctx.getJobBbox() : null;
      if (!bbox) throw new Error('There is no job to frame.');
      const c = ctrlOf();
      const job = Vectura.PlotJob.frameJob(bbox, prof(), {
        firmware: c ? c.fw : null, originOffset: ctx.getOriginOffset ? ctx.getOriginOffset() : null,
      });
      setMsg('Framing the job with the pen raised…', 'info');
      const r = await runJob(job, 'The frame');
      if (r && r.status && r.status !== 'done' && r.status !== 'complete') setMsg(r.message || 'Frame stopped.', 'warn');
      else setMsg('Frame finished.', 'ok');
    };
    B.on(frameBtn, 'click', () => act(frame));

    // ---- calibration wizards
    const launchers = {};
    const launcherGrid = h('div', 'stp-mt-cards');
    CAL.forEach((w) => {
      const card = h('button', 'stp-mt-card');
      card.type = 'button';
      card.setAttribute('data-stp-wizard', w.key);
      const pic = h('span', 'stp-mt-card-pic');
      pic.innerHTML = w.icon;
      const badge = h('span', 'stp-mt-card-badge');
      card.append(pic, h('span', 'stp-mt-card-name', w.title), h('span', 'stp-mt-card-tag', w.blurb), badge);
      launcherGrid.appendChild(card);
      launchers[w.key] = { card, badge, w };
      B.on(card, 'click', () => startWizard(w.key));
    });
    const wizardCard = h('div', 'stp-mt-wiz');
    wizardCard.hidden = true;
    calHost.append(launcherGrid, wizardCard);
    function renderCalLaunchers() {
      simNote.hidden = !(ctx.isSimulator && ctx.isSimulator());
      const cal = prof().calibration || {};
      const ok = canMove() && !S.busy;
      CAL.forEach((w) => {
        const l = launchers[w.key];
        const done = w.flag ? cal[w.flag] === true : false;
        l.badge.textContent = done ? 'Done \u2713' : 'Recommended';
        l.badge.hidden = !w.flag;
        l.card.classList.toggle('is-done', done);
        setEnabled(l.card, ok, reasonText() || 'Busy.');
      });
    }

    let wBtns = [];
    function startWizard(key) {
      if (!canMove()) return;
      S.wizard = { key, step: 'intro', data: {}, busy: false, error: '', token: {} };
      launcherGrid.hidden = true;
      wizardCard.hidden = false;
      renderWizard();
    }
    function endWizard() {
      S.wizard = null;
      wizardCard.hidden = true;
      launcherGrid.hidden = false;
      wBtns = [];
      refresh();
    }
    // Cancel is always safe: it raises the pen (or stops a running test job).
    const cancelWizard = async () => {
      const w = S.wizard;
      if (!w) return;
      const c = ctrlOf();
      w.token = {}; // late results of an in-flight step are ignored
      endWizard();
      if (!c) return;
      try {
        if (['running', 'paused', 'penChange'].includes(c.state)) await c.stop();
        else if (canMove()) await c.penUp();
      } catch (e) { fail(e); }
    };

    const wAct = async (fn) => {
      const w = S.wizard;
      if (!w || w.busy) return;
      const token = w.token;
      w.busy = true; w.error = ''; renderWizard();
      try { await fn(w); } catch (e) {
        if (S.wizard === w && w.token === token) { w.error = (e && e.message) || String(e); if (ctx.log) ctx.log(w.error, 'warn'); }
      } finally {
        if (S.wizard === w && w.token === token) { w.busy = false; renderWizard(); }
      }
    };
    const go = (w, step) => { w.step = step; };
    const moveRaw = async (dx, dy) => {
      const r = await ctrlOf().jog(dx, dy, jogFeed());
      if (!r || r.sent === false) throw new Error('The pen is at the edge of the work area. Move it away from the edge with the jog pad, then try again.');
      return r;
    };
    const setZ = async (w, z) => {
      const r = await ctrlOf().setPenHeight(z);
      w.data.z = r.z;
      return r;
    };
    const askBtns = (field) => ANS4.map(([val, label]) => ({
      label, act: 'answer-' + val, need: 'move',
      onClick: () => wAct(async (ww) => {
        ww.data[field] = val;
        if (field === 'ansX') { await moveRaw(-10, 0); go(ww, 'moveY'); return; }
        await moveRaw(0, -10);
        const d = deriveAxes(ww.data.ansX, ww.data.ansY);
        if (d.error) { ww.data.ansY = null; go(ww, 'askY'); throw new Error(d.error); }
        ww.data.axes = d.axes;
        go(ww, 'result');
      }),
    }));
    const finishBtn = () => ({ label: 'Finish', act: 'finish', primary: true, need: 'none', onClick: endWizard });

    const wizardView = (w) => {
      const c = ctrlOf();
      const pen = profPen();
      const next = (label, fn, need) => ({ label, act: 'next', primary: true, need: need || 'move', onClick: () => wAct(fn) });
      const back = (step) => ({ label: 'Back', act: 'back', need: 'none', onClick: () => { go(w, step); renderWizard(); } });
      if (w.key === 'axis') {
        switch (w.step) {
          case 'intro': return { n: 1, of: 6, title: 'Axis check', text: 'The pen will move 10 mm along the machine X axis, then 10 mm along Y. Leave about 10 mm of room to the right of the pen and toward you.', buttons: [next('Move X +10 mm', async (ww) => { await c.penUp(); await moveRaw(10, 0); go(ww, 'askX'); })] };
          case 'askX': return { n: 2, of: 6, title: 'Which way did the pen move?', text: 'Look at the plotter from where you sit. The top of your sheet is away from you.', buttons: askBtns('ansX') };
          case 'moveY': return { n: 3, of: 6, title: 'Now the other axis', text: 'The pen moved back. Next it moves 10 mm along the machine Y axis.', buttons: [next('Move Y +10 mm', async (ww) => { await moveRaw(0, 10); go(ww, 'askY'); })] };
          case 'askY': return { n: 4, of: 6, title: 'Which way did the pen move this time?', text: 'Same view as before.', buttons: askBtns('ansY') };
          case 'result': {
            const a = w.data.axes || {};
            const parts = [a.swapXY ? 'X and Y are swapped' : 'X and Y are not swapped'];
            if (a.invertX) parts.push('horizontal is reversed');
            if (a.invertY) parts.push('vertical is reversed');
            return { n: 5, of: 6, title: 'Result', text: 'Detected: ' + parts.join(', ') + '. Saving this makes the jog pad and your plots follow the page.', buttons: [back('moveY'), next('Save', async (ww) => {
              ctx.setProfileOverride({ axes: { invertX: !!a.invertX, invertY: !!a.invertY, swapXY: !!a.swapXY }, calibration: { axisChecked: true } });
              go(ww, 'done');
            }, 'none')] };
          }
          default: return { n: 6, of: 6, title: 'Axis check saved', text: 'The pen returned to where it started.', buttons: [finishBtn()], noCancel: true };
        }
      }
      if (w.key === 'pen') {
        const zMin = num(pen.zMin, 0); const zMax = num(pen.zMax, 10);
        switch (w.step) {
          case 'intro': return { n: 1, of: 4, title: 'Pen height', text: 'Put a sheet of paper under the pen. The pen starts at its raised height, then you lower it in small steps until it just touches the paper.', buttons: [next('Start', async (ww) => { await c.penUp(); await setZ(ww, num(pen.up, 0)); go(ww, 'lower'); })] };
          case 'lower': {
            const z = num(w.data.z, num(pen.up, 0));
            const step = (d, label, id) => ({ label, act: id, need: 'move', onClick: () => wAct(async (ww) => {
              const r = await setZ(ww, clamp(z + d, zMin, zMax));
              if (d > 0 && (r.clamped || r.z >= zMax)) throw new Error('The pen reached the end of its travel (' + fix(zMax, 2) + ' mm) without touching.');
            }) });
            return { n: 2, of: 4, title: 'Lower until it touches', text: 'Current height: ' + fix(z, 2) + ' mm. Lower a little at a time. Stop as soon as the tip touches the paper.', buttons: [step(0.25, 'Lower 0.25', 'lower-coarse'), step(0.05, 'Lower 0.05', 'lower-fine'), step(-0.05, 'Raise 0.05', 'raise-fine'), next('It is touching the paper', async (ww) => {
              ww.data.touchZ = num(ww.data.z, z);
              ww.data.down = Math.min(zMax, r2(ww.data.touchZ + 0.5));
              ww.data.up = num(pen.up, 0);
              go(ww, 'review');
            }, 'none')] };
          }
          case 'review': return { n: 3, of: 4, title: 'Confirm heights', text: 'The pen touched at ' + fix(w.data.touchZ, 2) + ' mm. A spring-loaded holder needs about 0.5 mm of extra push, so the suggested down height is ' + fix(w.data.down, 2) + ' mm (maximum ' + fix(zMax, 2) + ' mm). Adjust if you like.', fields: [{ label: 'Down (mm)', key: 'down', min: zMin, max: zMax }, { label: 'Up (mm)', key: 'up', min: zMin, max: zMax }], buttons: [back('lower'), next('Save', async (ww) => {
            const down = clamp(num(ww.data.down, 0), zMin, zMax); const up = clamp(num(ww.data.up, 0), zMin, zMax);
            if (!(down > up)) throw new Error('The down height must be larger than the up height.');
            ctx.setProfileOverride({ pen: { down, up }, calibration: { penHeightChecked: true } });
            ww.data.down = down; ww.data.up = up;
            await ctrlOf().setPenHeight(up);
            go(ww, 'done');
          }, 'none')] };
          default: return { n: 4, of: 4, title: 'Pen height saved', text: 'Down ' + fix(w.data.down, 2) + ' mm, up ' + fix(w.data.up, 2) + ' mm. The pen is raised.', buttons: [finishBtn()], noCancel: true };
        }
      }
      if (w.key === 'origin') {
        const bbox = ctx.getJobBbox ? ctx.getJobBbox() : null;
        switch (w.step) {
          case 'intro': return { n: 1, of: 3, title: 'Find the sheet corner', text: 'Tape the sheet down. Use the jog pad above to bring the pen over the top-left corner of the sheet. Try Pen down to check, then raise it again.', buttons: [next('Next', async (ww) => { go(ww, 'set'); }, 'none')] };
          case 'set': return { n: 2, of: 3, title: 'Set the origin', text: 'With the pen over the top-left corner, set the origin. The plotter then treats this point as 0, 0.', buttons: [back('intro'), { label: 'Set origin here', act: 'set-origin', primary: true, need: 'move', onClick: () => wAct(async (ww) => { await c.setOrigin(); go(ww, 'frame'); }) }] };
          default: return { n: 3, of: 3, title: 'Check with a frame', text: bbox ? 'Frame traces the outline of your job with the pen raised. Check that it stays on the sheet.' : 'Open a document to frame it. You can also finish now.', buttons: [{ label: 'Frame', act: 'frame', need: 'frame', onClick: () => wAct(async () => { await frame(); }) }, finishBtn()] };
        }
      }
      // scale
      switch (w.step) {
        case 'intro': return { n: 1, of: 3, title: 'Place the test square', text: 'The plotter draws a 100 mm square with a cross. Choose where its top-left corner goes, relative to the origin. Use fresh paper with the pen set up.', fields: [{ label: 'Offset X (mm)', key: 'ox', def: 10, min: 0 }, { label: 'Offset Y (mm)', key: 'oy', def: 10, min: 0 }], buttons: [{ label: 'Draw square', act: 'draw', primary: true, need: 'origin', onClick: () => wAct(async (ww) => {
          const job = Vectura.PlotJob.scaleCheckJob(prof(), { offsetX: num(ww.data.ox, 10), offsetY: num(ww.data.oy, 10), firmware: c.fw, originOffset: ctx.getOriginOffset ? ctx.getOriginOffset() : null });
          go(ww, 'drawing'); renderWizard();
          await runJob(job, 'The test square');
          go(ww, 'measure');
        }) }] };
        case 'drawing': return { n: 2, of: 3, title: 'Drawing', text: 'Drawing the test square. Use Stop or Cancel to abort.', buttons: [] };
        default: {
          const fw = fwOf(c);
          return { n: 3, of: 3, title: 'Measure it', text: 'Measure the square with a ruler. It should be 100 mm on each side. If it is off, steps per mm can only be changed in the vendor app or the Advanced console. This tool never writes it.', extra: 'Steps per mm (read only): $100 = ' + (fw[100] != null ? fw[100] : 'unknown') + ', $101 = ' + (fw[101] != null ? fw[101] : 'unknown'), buttons: [finishBtn()], noCancel: true };
        }
      }
    };

    function renderWizard() {
      const w = S.wizard;
      if (!w) return;
      const v = wizardView(w);
      wizardCard.textContent = '';
      wBtns = [];
      const head = h('div', 'stp-mt-wiz-head');
      head.appendChild(h('span', 'stp-mt-wiz-step', 'Step ' + v.n + ' of ' + v.of));
      head.appendChild(h('strong', 'stp-mt-wiz-title', v.title));
      wizardCard.appendChild(head);
      wizardCard.appendChild(h('p', 'stp-mt-wiz-text', v.text));
      if (v.extra) wizardCard.appendChild(h('p', 'stp-mt-wiz-extra', v.extra));
      (v.fields || []).forEach((f) => {
        if (w.data[f.key] == null) w.data[f.key] = f.def != null ? f.def : 0;
        const nf = numField({ label: f.label, min: f.min, max: f.max, step: 0.05, value: w.data[f.key], act: 'wiz-' + f.key });
        nf.input.addEventListener('change', () => { const n = Number(nf.input.value); if (Number.isFinite(n)) w.data[f.key] = n; });
        nf.input.addEventListener('input', () => { const n = Number(nf.input.value); if (Number.isFinite(n)) w.data[f.key] = n; });
        wizardCard.appendChild(nf.wrap);
      });
      if (w.error) { const er = h('p', 'stp-mt-wiz-error', w.error); er.setAttribute('role', 'alert'); wizardCard.appendChild(er); }
      const row = h('div', 'stp-mt-wiz-actions');
      v.buttons.forEach((b) => {
        const el = button(b.label, b.primary ? 'is-primary' : '', b.act);
        el.addEventListener('click', b.onClick);
        row.appendChild(el);
        wBtns.push({ el, need: b.need || 'move' });
      });
      if (!v.noCancel) {
        const cb = button('Cancel', '', 'cancel');
        cb.addEventListener('click', cancelWizard);
        row.appendChild(cb);
      }
      wizardCard.appendChild(row);
      refreshWizardButtons();
    }
    function refreshWizardButtons() {
      const w = S.wizard;
      if (!w) return;
      const c = ctrlOf();
      const move = canMove();
      const bbox = ctx.getJobBbox ? ctx.getJobBbox() : null;
      wBtns.forEach(({ el, need }) => {
        let ok = !w.busy;
        let why = '';
        if (need === 'move') ok = ok && move;
        if (need === 'origin') { ok = ok && move && !!c && c.originSet; if (move && c && !c.originSet) why = 'Set the origin first.'; }
        if (need === 'frame') ok = ok && move && !!c && c.originSet && !!bbox;
        el.disabled = !ok;
        if (!ok && why) el.title = why; else el.removeAttribute('title');
      });
    }

    refresh();
    return {
      update: refresh,
      destroy: () => {
        const c = ctrlOf();
        const hadHold = !!S.holdPromise || (S.press && S.press.mode === 'hold');
        S.press = null;
        if (hadHold && c) {
          const p = S.holdPromise;
          S.holdPromise = null;
          Promise.resolve(p).then(() => c.jogContinuousStop()).catch(() => null);
        }
        S.wizard = null;
        B.teardown();
      },
    };
  };

  // ---------------------------------------------------------------- CONSOLE TAB
  const KINDS = [['tx', 'Sent'], ['rx', 'Received'], ['info', 'Info'], ['warn', 'Warnings'], ['error', 'Errors']];
  const QUICK = ['$$', '$I', '$G', '?', '$#'];
  const TAGS = { tx: '>', rx: '<', warn: '!', error: 'x', info: 'i' };

  const mountConsole = (containerEl, ctx) => {
    const B = createBase(containerEl, ctx, 'stp-mt-console');
    const { root } = B;
    const S = { lines: [], hidden: new Set(), auto: true, advanced: false, history: [], hIdx: -1, copyTimer: null };
    const ctrlOf = () => (ctx.getController ? ctx.getController() : null);

    // toolbar
    const bar = h('div', 'stp-mt-row stp-mt-console-bar');
    KINDS.forEach(([k, label]) => {
      const b = h('button', 'tog-btn stp-mt-chip active', label);
      b.type = 'button';
      b.setAttribute('data-stp-chip', k);
      b.setAttribute('aria-pressed', 'true');
      bar.appendChild(b);
      B.on(b, 'click', () => {
        if (S.hidden.has(k)) S.hidden.delete(k); else S.hidden.add(k);
        b.classList.toggle('active', !S.hidden.has(k));
        b.setAttribute('aria-pressed', S.hidden.has(k) ? 'false' : 'true');
        logEl.classList.toggle('is-hide-' + k, S.hidden.has(k));
      });
    });
    const autoLbl = h('label', 'stp-mt-check');
    const autoBox = h('input');
    autoBox.type = 'checkbox';
    autoBox.checked = true;
    autoBox.setAttribute('data-stp-field', 'autoscroll');
    autoLbl.append(autoBox, h('span', '', 'Autoscroll'));
    const copyBtn = button('Copy log', '', 'copy');
    const clearBtn = button('Clear', '', 'clear');
    bar.append(autoLbl, copyBtn, clearBtn);
    root.appendChild(bar);

    const logEl = h('div', 'stp-mt-log');
    logEl.setAttribute('role', 'log');
    logEl.setAttribute('aria-live', 'off');
    logEl.tabIndex = 0;
    root.appendChild(logEl);
    const statusEl = h('div', 'stp-mt-msg');
    statusEl.hidden = true;
    statusEl.setAttribute('role', 'status');
    root.appendChild(statusEl);

    const quick = h('div', 'stp-mt-row stp-mt-quick');
    quick.appendChild(h('span', 'stp-mt-field-lbl', 'Read-only queries'));
    const quickBtns = QUICK.map((q) => {
      const b = button(q, 'is-compact', 'quick');
      b.setAttribute('data-stp-quick', q);
      quick.appendChild(b);
      B.on(b, 'click', () => send(q));
      return b;
    });
    root.appendChild(quick);

    const form = h('form', 'stp-mt-console-form');
    const input = h('input', 'stp-mt-console-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'G-code or $ query, then Enter';
    input.setAttribute('aria-label', 'Console command');
    input.setAttribute('data-stp-field', 'command');
    const sendBtn = button('Send', 'is-primary', 'send');
    sendBtn.type = 'submit';
    form.append(input, sendBtn);
    root.appendChild(form);

    // advanced: firmware writes need a typed ALLOW and are never carried across panels or connections
    const adv = h('div', 'stp-mt-adv');
    const advLbl = h('label', 'stp-mt-switch');
    const advBox = h('input');
    advBox.type = 'checkbox';
    advBox.setAttribute('data-stp-field', 'advanced');
    advLbl.append(advBox, h('span', 'stp-mt-switch-track'), h('span', 'stp-mt-switch-text', 'Allow firmware setting writes ($n=value)'));
    const advConfirm = h('div', 'stp-mt-adv-confirm');
    advConfirm.hidden = true;
    const advInput = h('input', 'stp-mt-console-input');
    advInput.type = 'text';
    advInput.autocomplete = 'off';
    advInput.placeholder = 'Type ALLOW';
    advInput.setAttribute('aria-label', 'Type ALLOW to enable firmware writes');
    advInput.setAttribute('data-stp-field', 'allow-text');
    const advGo = button('Enable', 'is-danger', 'adv-enable');
    advGo.disabled = true;
    advConfirm.append(h('p', 'stp-mt-hint', 'Wrong firmware settings can make the plotter move wrongly or damage it. Type ALLOW to continue. $RST stays blocked.'), advInput, advGo);
    adv.append(advLbl, advConfirm);
    root.appendChild(adv);

    // ---- log handling
    let nextId = 1;
    const addLine = (kind, text) => {
      const k = KINDS.some(([x]) => x === kind) ? kind : 'info';
      const rec = { id: nextId++, kind: k, text: String(text) };
      S.lines.push(rec);
      const row = h('div', 'stp-mt-line is-' + k);
      row.setAttribute('data-kind', k);
      row.appendChild(h('span', 'stp-mt-line-tag', TAGS[k]));
      row.appendChild(h('span', 'stp-mt-line-text', rec.text));
      logEl.appendChild(row);
      while (S.lines.length > LOG_CAP) { S.lines.shift(); if (logEl.firstChild) logEl.removeChild(logEl.firstChild); }
      if (S.auto) logEl.scrollTop = logEl.scrollHeight;
    };
    const kindOf = (dir) => {
      if (dir === 'tx' || dir === 'out') return 'tx';
      if (dir === 'rx' || dir === 'in') return 'rx';
      return dir === 'warn' || dir === 'error' ? dir : 'info';
    };
    const onEvent = (evt, p) => {
      if (evt === 'log' && p) addLine(kindOf(p.dir), p.text);
      else if (evt === 'error' && p) addLine('error', p.message || 'Error');
      else if (evt === 'alarm' && p) addLine('error', 'ALARM' + (p.code != null ? ' ' + p.code : '') + (p.message ? ': ' + p.message : ''));
      else if (evt === 'state') syncUi();
    };
    const setStatus = (text, level) => {
      statusEl.hidden = !text;
      statusEl.textContent = text || '';
      statusEl.className = 'stp-mt-msg' + (level ? ' is-' + level : '');
    };
    const setAdvanced = (isOn) => {
      S.advanced = isOn;
      advBox.checked = isOn;
      advConfirm.hidden = true;
      advInput.value = '';
      advGo.disabled = true;
      adv.classList.toggle('is-on', isOn);
    };

    async function send(raw) {
      const c = ctrlOf();
      const typed = raw == null;
      const text = String(typed ? input.value : raw).trim();
      if (!c || !text) return;
      if (typed) {
        S.history.push(text);
        if (S.history.length > 200) S.history.shift();
        S.hIdx = -1;
        input.value = '';
      }
      setStatus('', '');
      try {
        const r = await c.sendConsole(text, { allowFirmwareWrites: S.advanced });
        if (r && r.ok === false) {
          const reason = r.reason || 'The plotter rejected the command.';
          addLine(r.refused ? 'warn' : 'error', (r.refused ? 'Refused: ' : 'Error: ') + text + ' (' + reason + ')');
          setStatus(reason, r.refused ? 'warn' : 'error');
        }
      } catch (e) {
        addLine('error', 'Error: ' + ((e && e.message) || e));
        setStatus((e && e.message) || String(e), 'error');
      }
    }
    B.on(form, 'submit', (e) => { e.preventDefault(); send(); });
    B.on(input, 'keydown', (e) => {
      if (e.key === 'ArrowUp') {
        if (!S.history.length) return;
        e.preventDefault();
        S.hIdx = S.hIdx < 0 ? S.history.length - 1 : Math.max(0, S.hIdx - 1);
        input.value = S.history[S.hIdx];
      } else if (e.key === 'ArrowDown') {
        if (S.hIdx < 0) return;
        e.preventDefault();
        S.hIdx += 1;
        if (S.hIdx >= S.history.length) { S.hIdx = -1; input.value = ''; } else input.value = S.history[S.hIdx];
      }
    });
    B.on(autoBox, 'change', () => { S.auto = autoBox.checked; if (S.auto) logEl.scrollTop = logEl.scrollHeight; });
    B.on(clearBtn, 'click', () => { S.lines.length = 0; logEl.textContent = ''; });
    B.on(copyBtn, 'click', async () => {
      const text = S.lines.map((l) => (l.kind === 'tx' ? '> ' : (l.kind === 'rx' ? '< ' : '; ')) + l.text).join('\n');
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
      } catch (e) { ok = false; }
      if (!ok) {
        try {
          const ta = h('textarea');
          ta.value = text;
          root.appendChild(ta);
          ta.select();
          ok = !!(document.execCommand && document.execCommand('copy'));
          root.removeChild(ta);
        } catch (e) { ok = false; }
      }
      setStatus(ok ? 'Log copied.' : 'Could not copy the log. Select the text and copy it manually.', ok ? 'ok' : 'warn');
      B.cancel(S.copyTimer);
      S.copyTimer = B.later(() => setStatus('', ''), 2500);
    });
    B.on(advBox, 'change', () => {
      if (!advBox.checked) { setAdvanced(false); return; }
      advBox.checked = false; // stays off until ALLOW is typed
      advConfirm.hidden = false;
      advInput.focus();
    });
    B.on(advInput, 'input', () => { advGo.disabled = advInput.value !== 'ALLOW'; });
    B.on(advGo, 'click', () => {
      if (advInput.value !== 'ALLOW') return;
      setAdvanced(true);
      addLine('warn', 'Firmware setting writes are enabled. $RST stays blocked. They turn off when this panel closes.');
    });

    // ---- sync
    function syncUi() {
      if (B.isDestroyed()) return;
      const { c, changed } = B.bind(['log', 'error', 'alarm', 'state'], onEvent);
      if (changed) {
        setAdvanced(false);
        if (c) addLine('info', 'Console attached.');
      }
      if (S.advanced && !containerEl.isConnected) setAdvanced(false);
      const ok = !!c && c.state !== 'disconnected' && c.state !== 'connecting';
      input.disabled = !ok;
      sendBtn.disabled = !ok;
      quickBtns.forEach((b) => { b.disabled = !ok; });
      advBox.disabled = !ok;
      input.title = ok ? '' : 'Connect to a plotter to use the console.';
    }
    syncUi();
    return {
      update: syncUi,
      destroy: () => { S.advanced = false; B.teardown(); },
    };
  };

  Vectura.PlotterMachineTools = { mountMachine, mountConsole };
})();
