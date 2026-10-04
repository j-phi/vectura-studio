/*
 * KeyboardInset (TUX-032): the one place that reads window.visualViewport.
 *
 * iOS keeps the layout viewport fixed when the on-screen keyboard opens and shrinks
 * the visual viewport instead. This service turns that into one number:
 *   inset = max(0, round(innerHeight - (vv.height + vv.offsetTop)))
 * and publishes it as --kb-inset (px) on <html>, an `html.kb-open` class, and a
 * `vectura:kbinset` event on document. The inset is 0 unless an editable element has
 * focus and the page is not pinch-zoomed, so a collapsing browser toolbar never lifts
 * anything. Other modules read --kb-inset or KeyboardInset.inset. They never read
 * visualViewport themselves (tests/unit/keyboard-inset-single-source.test.js).
 *
 * It also owns two touch-text behaviors that must live beside the focus tracking:
 *  - ensureVisible(el): pan the nearest scrollable ancestor so a focused field clears
 *    the keyboard. The document is never scrolled (TUX-002).
 *  - Tap on a numeric field (inputmode decimal/numeric, type=number) selects the whole
 *    value so typing replaces it. Mouse focus and keyboard Tab keep native behavior.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const MARGIN = 8;
  const TOUCH_WINDOW_MS = 1000;
  const NON_TEXT_TYPES = /^(range|checkbox|radio|button|submit|reset|file|color|image)$/i;
  const NUMERIC_SEL = 'input[inputmode="decimal"], input[inputmode="numeric"], input[type="number"]';

  // Pure formula (unit-tested).
  const computeInset = ({ innerHeight, vvHeight, offsetTop = 0, scale = 1, editableFocused = false }) => {
    if (!editableFocused) return 0;
    if (Math.abs((Number(scale) || 1) - 1) > 0.01) return 0;
    const v = Math.round(innerHeight - (vvHeight + (offsetTop || 0)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };

  const isEditable = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.readOnly) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return !NON_TEXT_TYPES.test(el.type || 'text');
    return !!el.isContentEditable;
  };

  let inset = 0;
  let lastPointer = { type: '', t: 0 };
  let started = false;

  const vv = () => (typeof window !== 'undefined' ? window.visualViewport : null);

  const scrollParent = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body && n !== document.documentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
      n = n.parentElement;
    }
    return null;
  };

  // Pan inner scroll containers (never the document) until el's bottom clears the keyboard.
  const ensureVisible = (el) => {
    if (!el || !el.getBoundingClientRect || inset <= 0) return false;
    const line = window.innerHeight - inset - MARGIN;
    let moved = false;
    // Repeat for nested scrollers: each pass uses the nearest one that can still move.
    let node = el;
    for (let guard = 0; guard < 6; guard += 1) {
      const over = el.getBoundingClientRect().bottom - line;
      if (over <= 0) break;
      const sp = scrollParent(node);
      if (!sp) break;
      const before = sp.scrollTop;
      sp.scrollTop = before + over;
      if (sp.scrollTop !== before) moved = true;
      node = sp;
    }
    return moved;
  };

  // iOS keeps the keyboard up when a finger taps a button, but engines that move focus to the
  // button (and the keyboard-less case) would read "no editable focused" and drop the inset in the
  // middle of the tap, sliding a sheet out from under the finger (TUX-049). A control inside the
  // same dialog as the field that just lost focus keeps the inset until focus leaves the dialog.
  let lastEditable = null;
  const dialogOf = (el) => (el && el.closest ? el.closest('.vectura-modal') : null);
  const editableFocused = () => {
    const a = document.activeElement;
    if (isEditable(a)) { lastEditable = a; return true; }
    const d = dialogOf(a);
    return !!(d && lastEditable && lastEditable.isConnected && dialogOf(lastEditable) === d);
  };

  const recompute = () => {
    const v = vv();
    const next = v
      ? computeInset({ innerHeight: window.innerHeight, vvHeight: v.height, offsetTop: v.offsetTop, scale: v.scale, editableFocused: editableFocused() })
      : 0;
    if (next === inset) return inset;
    inset = next;
    const root = document.documentElement;
    root.style.setProperty('--kb-inset', `${inset}px`);
    root.classList.toggle('kb-open', inset > 0);
    try { document.dispatchEvent(new CustomEvent('vectura:kbinset', { detail: { inset } })); } catch (_) { /* */ }
    if (inset > 0) ensureVisible(document.activeElement);
    return inset;
  };

  // The tap's own caret placement runs after `focus` (and, on touch, after pointerup), so a
  // selection made inside focusin is undone. Wait for the tap to finish (pointerup / click),
  // then select once. A 350 ms timer covers focus that no later pointer event follows.
  const selectAllOnce = (el) => {
    let done = false;
    const cleanup = () => {
      document.removeEventListener('pointerup', onEnd, true);
      document.removeEventListener('click', onEnd, true);
    };
    const run = () => {
      if (done) return;
      done = true;
      cleanup();
      if (document.activeElement !== el || el.disabled || el.readOnly) return;
      try { el.setSelectionRange(0, el.value.length); } catch (_) { try { el.select(); } catch (__) { /* */ } }
    };
    function onEnd() { setTimeout(run, 0); }
    document.addEventListener('pointerup', onEnd, true);
    document.addEventListener('click', onEnd, true);
    setTimeout(run, 350);
  };

  const onFocusIn = (e) => {
    const el = e.target;
    recompute();
    if (inset > 0) ensureVisible(el);
    if (!el || !el.matches || !el.matches(NUMERIC_SEL)) return;
    if (el.disabled || el.readOnly) return;
    const touchLike = (lastPointer.type === 'touch' || lastPointer.type === 'pen') && (Date.now() - lastPointer.t) < TOUCH_WINDOW_MS;
    if (touchLike) selectAllOnce(el);
  };

  const start = () => {
    if (started) return;
    started = true;
    document.addEventListener('pointerdown', (e) => { lastPointer = { type: e.pointerType || '', t: Date.now() }; }, true);
    document.addEventListener('focusin', onFocusIn);
    // Deferred one frame so field-to-field focus does not flash the inset to 0.
    document.addEventListener('focusout', () => requestAnimationFrame(recompute));
    window.addEventListener('orientationchange', () => { setTimeout(recompute, 0); });
    window.addEventListener('resize', recompute);
    const v = vv();
    if (v && v.addEventListener) {
      v.addEventListener('resize', recompute);
      v.addEventListener('scroll', recompute);
    }
    recompute();
  };

  // Visual-viewport size for placement code (TUX-034 touch menus), so no other module
  // reads visualViewport. Falls back to the layout viewport.
  const viewportSize = () => {
    const v = vv();
    return v ? { width: v.width, height: v.height } : { width: window.innerWidth, height: window.innerHeight };
  };

  // Visual-viewport rect for placement code that must also honour pan offsets (TUX-035 add menu).
  const viewportRect = () => {
    const v = vv();
    return v
      ? { width: v.width, height: v.height, offsetTop: v.offsetTop || 0, offsetLeft: v.offsetLeft || 0 }
      : { width: window.innerWidth, height: window.innerHeight, offsetTop: 0, offsetLeft: 0 };
  };

  // Subscribe to visual-viewport resizes without reading visualViewport elsewhere.
  // opts.scroll also fires on visual-viewport pans (TUX-015 tools drawer).
  const onViewportChange = (cb, opts) => {
    const v = vv();
    if (!v || !v.addEventListener || typeof cb !== 'function') return () => {};
    v.addEventListener('resize', cb);
    if (opts && opts.scroll) v.addEventListener('scroll', cb);
    // Returns an unsubscribe so a floating window can stop listening when it closes (TUX-026).
    return () => {
      v.removeEventListener('resize', cb);
      if (opts && opts.scroll) v.removeEventListener('scroll', cb);
    };
  };

  Vectura.KeyboardInset = {
    get inset() { return inset; },
    viewportSize,
    viewportRect,
    onViewportChange,
    ensureVisible,
    recompute,
    computeInset,
    lastPointerType: () => lastPointer.type,
  };

  start();
})();
