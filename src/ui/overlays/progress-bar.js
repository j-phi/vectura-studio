/*
 * Vectura Studio — Indeterminate progress bar (Phase 4).
 *
 * A skinnable indeterminate progress strip that pins to the bottom of the
 * app shell. The DOM is created lazily on first show() and reused.
 *
 * Use it for any I/O the user has triggered but cannot cancel: SVG export,
 * `.vectura` save/open, large-algorithm regenerations.
 *
 * Usage:
 *   const handle = UI.overlays.ProgressBar.show({ label: 'Exporting…' });
 *   ... do work ...
 *   handle.done(); // or UI.overlays.ProgressBar.hide();
 *
 * The factory tracks an internal stack of active jobs — show() pushes a job
 * and returns a per-job handle; handle.done() pops it. The bar stays visible
 * while the stack depth is > 0. Concurrent operations all share a single
 * physical bar (only the most recent label is shown).
 *
 * Accessibility: role="progressbar", aria-busy on host, label echoed into
 * aria-label of the bar.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const HOST_ID = 'vectura-progress-bar-host';
  const stack = []; // [{ id, label }]
  let host = null;
  let bar = null;
  let labelEl = null;
  let nextId = 1;

  const ensureHost = () => {
    if (host) return host;
    if (typeof document === 'undefined') return null;
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.cssText = [
        'position: fixed',
        'left: 0', 'right: 0', 'bottom: 0',
        'z-index: 9999',
        'display: none',
        'flex-direction: column',
        'gap: 4px',
        'padding: 0 8px 6px',
        'pointer-events: none',
      ].join(';');
      labelEl = document.createElement('div');
      labelEl.className = 'vectura-progress-bar-label';
      labelEl.style.cssText = [
        'font-family: var(--font-ui, system-ui)',
        'font-size: var(--font-size-sm, 11px)',
        'color: var(--ui-muted, #888)',
        'text-align: center',
      ].join(';');
      bar = document.createElement('div');
      bar.className = 'vectura-progress-bar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuetext', 'In progress');
      const fill = document.createElement('div');
      fill.className = 'vectura-progress-bar-fill';
      bar.appendChild(fill);
      host.appendChild(labelEl);
      host.appendChild(bar);
      (document.body || document.documentElement).appendChild(host);
    } else {
      labelEl = host.querySelector('.vectura-progress-bar-label');
      bar = host.querySelector('.vectura-progress-bar');
    }
    return host;
  };

  const refresh = () => {
    ensureHost();
    if (!host) return;
    if (stack.length === 0) {
      host.style.display = 'none';
      host.removeAttribute('aria-busy');
      if (labelEl) labelEl.textContent = '';
      if (bar) bar.setAttribute('aria-label', '');
      return;
    }
    const top = stack[stack.length - 1];
    host.style.display = 'flex';
    host.setAttribute('aria-busy', 'true');
    if (labelEl) {
      labelEl.textContent = top.label || '';
      labelEl.style.display = top.label ? '' : 'none';
    }
    if (bar) bar.setAttribute('aria-label', top.label || 'In progress');
  };

  const show = (opts = {}) => {
    const id = nextId++;
    stack.push({ id, label: typeof opts === 'string' ? opts : (opts.label || '') });
    refresh();
    return {
      id,
      done() {
        const idx = stack.findIndex((j) => j.id === id);
        if (idx === -1) return;
        stack.splice(idx, 1);
        refresh();
      },
      update(newOpts = {}) {
        const job = stack.find((j) => j.id === id);
        if (!job) return;
        if (typeof newOpts === 'string') job.label = newOpts;
        else if (newOpts.label != null) job.label = newOpts.label;
        refresh();
      },
    };
  };

  const hide = () => {
    stack.length = 0;
    refresh();
  };

  /**
   * Wrap an async operation: shows the bar before the work, dones it after.
   * Always dones, even if the work throws.
   */
  const wrap = async (opts, fn) => {
    const handle = show(opts);
    try {
      return await fn();
    } finally {
      handle.done();
    }
  };

  /**
   * Wrap a synchronous operation but only show the bar if it exceeds
   * `thresholdMs`. Useful for engine.generate() which is usually fast.
   * Returns the operation result. Note: because JS is single-threaded the
   * bar can't paint mid-sync-work — this still emits the bar synchronously
   * around the callback so external observers (tests, e2e) can verify the
   * `aria-busy` window.
   */
  const wrapSync = (opts, fn) => {
    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const handle = show(opts);
    let result;
    let threw;
    try {
      result = fn();
    } catch (err) {
      threw = err;
    }
    handle.done();
    const elapsed = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start;
    if (threw) throw threw;
    // Threshold metadata is informational — we already showed/done'd.
    if (typeof opts === 'object' && opts && typeof opts.onElapsed === 'function') {
      try { opts.onElapsed(elapsed); } catch (_) { /* swallow */ }
    }
    return result;
  };

  UI.overlays.ProgressBar = {
    show, hide, wrap, wrapSync,
    /** @internal — used by tests. */
    _stackDepth() { return stack.length; },
    _hostId: HOST_ID,
  };
})();
