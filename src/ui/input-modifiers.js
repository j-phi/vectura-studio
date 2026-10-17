/**
 * TUX-045: shared modifier reader for canvas, designers and the touch modifier bar.
 * Task state is runtime-only ('off' | 'latched' | 'locked'); it is never saved or put in history.
 * Mouse input (and any event with no pointerType) ignores every task, so the desktop result is
 * the plain keyboard result. Touch and pen apply tasks. The last pointer of a gesture that began
 * on a consuming surface turns every 'latched' task off (setTimeout 0, after the pointerup readers).
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const CFG = Vectura.TOUCH_MODIFIERS || { lockMs: 300, consumeSurfaces: ['#main-canvas'], tasks: [] };
  const TASKS = (CFG.tasks || []).map((t) => t.id);
  const state = {};
  const latchedAt = {};
  TASKS.forEach((t) => { state[t] = 'off'; });
  const subs = new Set();
  const emit = () => subs.forEach((fn) => { try { fn(); } catch (err) { /* a listener must not break input */ } });
  const isApplied = (pt) => pt === 'touch' || pt === 'pen';
  const on = (task) => state[task] !== undefined && state[task] !== 'off';

  // TUX-033: click-class events (click, dblclick, auxclick) fire AFTER pointerup, when a one-shot
  // latch may already be released, and WebKit reports pointerType 'mouse' on the click that follows
  // a tap. So a click reads the task snapshot taken at the most recent touch/pen pointerdown
  // (<= SNAP_MS old). A later mouse pointerdown clears it, so a hybrid mouse click stays plain.
  // Keyboard, wheel and pointer events never read the snapshot. Keep this when changing release.
  const SNAP_MS = 1000;
  const CLICK_TYPES = { click: 1, dblclick: 1, auxclick: 1 };
  let snap = null; // { at, tasks:{id:boolean} }
  const takeSnap = () => {
    const tasks = {};
    TASKS.forEach((t) => { tasks[t] = on(t); });
    snap = { at: Date.now(), tasks };
  };
  const taskOn = (task, ev) => {
    if (ev && CLICK_TYPES[ev.type] && snap && Date.now() - snap.at <= SNAP_MS) return Boolean(snap.tasks[task]);
    return on(task);
  };

  const readModifiers = (e) => {
    const ev = e || {};
    const base = {
      shift: Boolean(ev.shiftKey),
      alt: Boolean(ev.altKey),
      meta: Boolean(ev.metaKey || ev.ctrlKey),
      ctrl: Boolean(ev.ctrlKey),
      pan: false,
      // Task-only flags: a hardware Shift counts for rawShift, never a Constrain latch.
      rawShift: Boolean(ev.shiftKey),
      // Meta alone (Cmd). `meta` merges Meta and Ctrl; a wheel needs them apart because Ctrl+wheel is a pinch-zoom.
      rawMeta: Boolean(ev.metaKey),
      multiSelect: false,
      additive: Boolean(ev.shiftKey || ev.metaKey || ev.ctrlKey),
    };
    const fromSnap = Boolean(CLICK_TYPES[ev.type] && snap && Date.now() - snap.at <= SNAP_MS);
    if (!isApplied(ev.pointerType) && !fromSnap) return base;
    base.shift = base.shift || taskOn('constrain', ev);
    base.alt = base.alt || taskOn('duplicate', ev);
    base.pan = taskOn('pan', ev);
    base.multiSelect = taskOn('multiSelect', ev);
    base.additive = base.additive || base.multiSelect;
    return base;
  };

  const getTaskState = (task) => state[task] || 'off';

  const tap = (task, now = Date.now()) => {
    if (!(task in state)) return 'off';
    const cur = state[task];
    if (cur === 'off') { state[task] = 'latched'; latchedAt[task] = now; }
    else if (cur === 'latched' && now - latchedAt[task] <= (CFG.lockMs || 300)) state[task] = 'locked';
    else state[task] = 'off';
    emit();
    return state[task];
  };

  const consumeOneShot = () => {
    let changed = false;
    TASKS.forEach((t) => { if (state[t] === 'latched') { state[t] = 'off'; changed = true; } });
    if (changed) emit();
    return changed;
  };

  const clearAll = () => {
    let changed = false;
    TASKS.forEach((t) => { if (state[t] !== 'off') { state[t] = 'off'; changed = true; } });
    if (changed) emit();
  };

  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  // Gesture sequence tracker (capture phase, document level).
  let seq = null; // { ids:Set, nav:boolean, aborted:boolean, at:number }
  let installedOn = null;
  const install = (doc = (typeof document !== 'undefined' ? document : null)) => {
    if (!doc || installedOn === doc) return false;
    installedOn = doc;
    const surfaces = () => (CFG.consumeSurfaces || []).join(',');
    const inSurface = (target) => {
      try { return Boolean(target && target.closest && surfaces() && target.closest(surfaces())); } catch (err) { return false; }
    };
    const idOf = (e) => (e.pointerId === undefined ? 0 : e.pointerId);
    const finish = (e, cancelled) => {
      if (!seq) return;
      seq.ids.delete(idOf(e));
      if (cancelled) seq.aborted = true;
      if (seq.ids.size > 0) return;
      const consume = !seq.nav && !seq.aborted;
      seq = null;
      if (consume) setTimeout(consumeOneShot, 0);
    };
    const opts = { capture: true };
    doc.addEventListener('pointerdown', (e) => {
      if (isApplied(e.pointerType)) takeSnap(); else snap = null;
      if (!isApplied(e.pointerType)) return;
      if (seq && Date.now() - seq.at > 15000) seq = null; // lost pointerup safety
      if (seq) { seq.ids.add(idOf(e)); seq.nav = true; return; }
      if (!inSurface(e.target)) return;
      seq = { ids: new Set([idOf(e)]), nav: false, aborted: false, at: Date.now() };
    }, opts);
    doc.addEventListener('pointerup', (e) => { if (seq && isApplied(e.pointerType)) finish(e, false); }, opts);
    doc.addEventListener('pointercancel', (e) => { if (seq && isApplied(e.pointerType)) finish(e, true); }, opts);
    return true;
  };

  Vectura.InputModifiers = { TASKS, readModifiers, getTaskState, tap, consumeOneShot, clearAll, subscribe, install };
  install();
})();
