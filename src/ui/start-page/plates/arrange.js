/**
 * Start Page Arrange mode — window.Vectura.UI.StartPageArrange.
 *
 * The Plates section's Arrange button turns the plate list into one row per plate (every plate, the hidden ones
 * marked "Hidden on the page"), each on its own paper so the color rhythm stays visible.
 *
 *   enter(listEl, { plates, onMove(ids), onResetOrder(), onExit(), scroller? }) -> { exit(), update(plates) }
 *     plates          [{ id, name, colorway: { ground|paper, ink, text?, class? }, hidden? }] in page order
 *     onMove(ids)     the full new order, after every drag / keyboard move and after Undo (the caller persists it)
 *     onResetOrder()  restores the suggested order; may return the ids (or a Promise of them) so rows follow
 *     onExit()        once, when the user presses Done / Esc or exit() runs
 *     scroller        optional element that scrolls during a drag (default: nearest scrolling ancestor, else window)
 *
 *   Drag: grab a row's handle with a mouse, pen or finger; the row follows the pointer, a labelled drop line shows
 *   the target, the list autoscrolls near the edges, and the other rows reflow with a FLIP transition on drop.
 *   Keyboard: Alt+Up / Alt+Down on a row (or the Up / Down buttons) with an aria-live announcement, including
 *   "Two dark plates are now next to each other". Every move offers Undo through the app toast. FLIP and the
 *   fan-out transitions are skipped under reduced motion and the Start Page "still" setting.
 *   listEl's other children are hidden while arranging and restored on exit.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const SLOP = 4;
  const EDGE = 80;
  const MAX_SPEED = 28;
  const FLIP_MS = 260;

  /** Signed autoscroll speed (px / frame) for a pointer at y inside a viewport band [top, bottom]. */
  const edgeVelocity = (y, top, bottom) => {
    const edge = Math.min(EDGE, Math.max(24, (bottom - top) / 3));
    let v = 0;
    if (y < top + edge) v = -Math.ceil((top + edge - y) / 4);
    else if (y > bottom - edge) v = Math.ceil((y - (bottom - edge)) / 4);
    return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
  };

  const luminance = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return 1;
    let s = m[1];
    if (s.length === 3) s = s.replace(/./g, (c) => c + c);
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(parseInt(s.slice(0, 2), 16)) + 0.7152 * lin(parseInt(s.slice(2, 4), 16)) + 0.0722 * lin(parseInt(s.slice(4, 6), 16));
  };
  const groundOf = (cw) => (cw && (cw.ground || cw.paper)) || '#f4efe6';
  const isDark = (p) => {
    const cw = p && p.colorway;
    if (cw && cw.class) return cw.class === 'dark';
    return luminance(groundOf(cw)) < 0.18;
  };

  const reducedMotion = () => {
    try {
      const ink = Vectura.StartPageInk;
      if (ink && typeof ink.isStill === 'function' && ink.isStill()) return true;
    } catch (_) { /* fall through */ }
    try { return !!G.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  };

  const toast = (message, onUndo, undoLabel) => {
    const T = Vectura.UI && Vectura.UI.overlays && Vectura.UI.overlays.Toast;
    if (!T || typeof T.show !== 'function') return null;
    try {
      return T.show({
        message, variant: 'info', duration: 8000,
        action: { label: 'Undo', ariaLabel: undoLabel || 'Undo', onAction: () => onUndo() },
      });
    } catch (_) { return null; }
  };

  const findScroller = (el) => {
    let node = el && el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      let oy = '';
      try { oy = G.getComputedStyle(node).overflowY; } catch (_) { /* noop */ }
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return null;
  };

  const enter = (listEl, opts = {}) => {
    const { h, pad2 } = Vectura.StartPageDom;
    let plates = Array.isArray(opts.plates) ? opts.plates.slice() : [];
    let order = plates.map((p) => p.id);
    let exited = false;
    let drag = null;
    let liveFlip = 0;
    let liveToggle = false;
    const timers = [];
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const byId = () => new Map(plates.map((p) => [p.id, p]));
    const nameOf = (id) => { const p = byId().get(id); return (p && p.name) || 'Plate'; };

    /* ---------------------------------------------------------------- DOM */
    const hiddenBefore = new Map();
    [...listEl.children].forEach((c) => { hiddenBefore.set(c, c.hidden); c.hidden = true; });
    listEl.dataset.arranging = 'true';

    const root = h('div', { class: 'sp-arr', role: 'region', 'aria-label': 'Arrange plates' });
    const title = h('span', { class: 'sp-arr-title' });
    const hint = h('span', { class: 'sp-arr-hint', text: 'Drag a handle, or press Alt with the up or down arrow on a plate.' });
    const resetBtn = h('button', { type: 'button', class: 'sp-arr-btn', 'data-arr-reset': '', text: 'Reset to suggested order' });
    const doneBtn = h('button', { type: 'button', class: 'sp-arr-btn sp-arr-done', 'data-arr-done': '', text: 'Done arranging' });
    const bar = h('div', { class: 'sp-arr-bar' }, h('span', { class: 'sp-arr-lead' }, title, hint), h('span', { class: 'sp-arr-acts' }, resetBtn, doneBtn));
    const list = h('div', { class: 'sp-arr-list', role: 'list', 'aria-label': 'Plates in page order' });
    const dropLine = h('div', { class: 'sp-arr-drop', 'aria-hidden': 'true', hidden: true });
    const live = h('span', { class: 'sp-arr-live sp-sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    list.append(dropLine);
    root.append(bar, list, live);
    listEl.append(root);

    const rowEls = () => [...list.querySelectorAll(':scope > .sp-arr-row')];
    const rowOf = (id) => rowEls().find((r) => r.dataset.plateId === id);

    const announce = (msg) => {
      liveToggle = !liveToggle;
      live.textContent = liveToggle ? msg : `${msg} `; // a repeated message still re-announces
    };

    const buildRow = (p) => {
      const cw = p.colorway || {};
      const row = h('div', { class: 'sp-arr-row', role: 'listitem', tabindex: '0', 'data-plate-id': p.id, 'data-dark': String(isDark(p)) });
      row.style.setProperty('--spa-paper', groundOf(cw));
      row.style.setProperty('--spa-ink', cw.ink || '#111111');
      row.style.setProperty('--spa-text', cw.text || cw.ink || '#111111');
      if (p.hidden) row.dataset.hidden = 'true';
      const grip = h('button', { type: 'button', class: 'sp-arr-grip', 'data-arr-grip': '', title: 'Drag to move' },
        h('span', { class: 'sp-arr-dots', 'aria-hidden': 'true' }));
      const no = h('span', { class: 'sp-arr-no' });
      const nm = h('span', { class: 'sp-arr-name', text: p.name || 'Untitled' });
      const sw = h('i', { class: 'sp-arr-sw', 'aria-hidden': 'true' });
      const tag = p.hidden ? h('span', { class: 'sp-arr-hid', text: 'Hidden on the page' }) : null;
      const up = h('button', { type: 'button', class: 'sp-arr-mv', 'data-arr-up': '' }, h('span', { 'aria-hidden': 'true', text: '↑' }));
      const dn = h('button', { type: 'button', class: 'sp-arr-mv', 'data-arr-down': '' }, h('span', { 'aria-hidden': 'true', text: '↓' }));
      row.append(...[grip, no, nm, tag, sw, h('span', { class: 'sp-arr-mvs' }, up, dn)].filter(Boolean));
      return row;
    };

    // Position-dependent text: numbers, aria labels, disabled ends.
    const label = () => {
      const rows = rowEls();
      const n = rows.length;
      title.textContent = `Arranging ${n} plate${n === 1 ? '' : 's'}`;
      rows.forEach((row, i) => {
        const nm = nameOf(row.dataset.plateId);
        row.querySelector('.sp-arr-no').textContent = `Plate ${pad2(i + 1)} / ${pad2(n)}`;
        row.setAttribute('aria-label', `Plate ${i + 1} of ${n}, ${nm}${row.dataset.hidden ? ', hidden on the page' : ''}. Press Alt with the up or down arrow to move it.`);
        const grip = row.querySelector('.sp-arr-grip');
        grip.setAttribute('aria-label', `Drag plate ${i + 1}, ${nm}`);
        const up = row.querySelector('[data-arr-up]');
        const dn = row.querySelector('[data-arr-down]');
        up.setAttribute('aria-label', `Move plate ${i + 1} up`);
        dn.setAttribute('aria-label', `Move plate ${i + 1} down`);
        up.disabled = i === 0;
        dn.disabled = i === n - 1;
      });
    };

    const build = () => {
      rowEls().forEach((r) => r.remove());
      const map = byId();
      order.forEach((id) => { const p = map.get(id); if (p) list.append(buildRow(p)); });
      label();
    };
    build();

    /* ---------------------------------------------------------------- order changes */
    const darkPairs = (ids) => {
      const map = byId();
      const vis = ids.filter((id) => map.get(id) && !map.get(id).hidden);
      const out = new Set();
      for (let i = 0; i < vis.length - 1; i++) if (isDark(map.get(vis[i])) && isDark(map.get(vis[i + 1]))) out.add(`${vis[i]}|${vis[i + 1]}`);
      return out;
    };
    const newDarkPair = (before, after) => {
      const was = darkPairs(before);
      for (const k of darkPairs(after)) if (!was.has(k)) return true;
      return false;
    };

    const flipPlay = (firsts) => {
      if (reducedMotion()) return;
      const moved = [];
      rowEls().forEach((r) => {
        const f = firsts.get(r);
        if (!f) return;
        const dy = f.top - r.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        r.style.transition = 'none';
        r.style.transform = `translateY(${dy}px)`;
        moved.push(r);
      });
      if (!moved.length) return;
      void list.offsetHeight; // commit the inverted position before it animates away
      const run = () => moved.forEach((r) => { r.style.transition = `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1)`; r.style.transform = ''; });
      if (typeof G.requestAnimationFrame === 'function') liveFlip = G.requestAnimationFrame(run); else run();
      later(() => moved.forEach((r) => { r.style.transition = ''; r.style.transform = ''; }), FLIP_MS + 60);
    };

    // Reorder the existing row elements (focus-safe: only the rows that change place move) and play FLIP.
    const applyOrder = (ids, { focusId = null, focusGrip = false } = {}) => {
      const firsts = new Map(rowEls().map((r) => [r, r.getBoundingClientRect()]));
      const map = new Map(rowEls().map((r) => [r.dataset.plateId, r]));
      rowEls().forEach((r) => { r.style.transition = ''; r.style.transform = ''; r.classList.remove('dragging'); });
      ids.forEach((id) => { const r = map.get(id); if (r) list.append(r); });
      list.append(dropLine);
      order = ids.slice();
      label();
      flipPlay(firsts);
      if (focusId) {
        const r = rowOf(focusId);
        const target = r && (focusGrip ? r.querySelector('.sp-arr-grip') : r);
        if (target) { try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); } }
        if (r && !focusGrip && typeof r.scrollIntoView === 'function') { try { r.scrollIntoView({ block: 'nearest' }); } catch (_) { /* noop */ } }
      }
    };

    const emit = (ids) => { try { if (typeof opts.onMove === 'function') opts.onMove(ids.slice()); } catch (err) { if (G.console) G.console.warn('[Arrange] onMove failed', err); } };

    const move = (from, to, how, grip) => {
      const n = order.length;
      if (to < 0 || to >= n || to === from) return;
      const prev = order.slice();
      const next = order.slice();
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      applyOrder(next, { focusId: id, focusGrip: how === 'drag' && !!grip });
      emit(next);
      const msg = `Moved Plate ${from + 1} to position ${to + 1}.`;
      const warn = newDarkPair(prev, next) ? ' Two dark plates are now next to each other.' : '';
      announce(msg + warn);
      toast(msg + warn, () => {
        applyOrder(prev, { focusId: id });
        emit(prev);
        announce('Order restored.');
      }, 'Undo move');
    };

    /* ---------------------------------------------------------------- reset */
    resetBtn.addEventListener('click', async () => {
      const prev = order.slice();
      let ids = null;
      try { ids = await (typeof opts.onResetOrder === 'function' ? opts.onResetOrder() : null); } catch (_) { ids = null; }
      if (exited) return;
      if (Array.isArray(ids) && ids.length === prev.length && ids.every((id) => prev.includes(id))) {
        const changed = ids.some((id, i) => id !== prev[i]);
        applyOrder(ids);
        announce('Plates reset to the suggested order.');
        if (changed) {
          toast('Plates are back in the suggested order.', () => {
            applyOrder(prev);
            emit(prev);
            announce('Order restored.');
          }, 'Undo reset');
        }
      } else {
        announce('Plates reset to the suggested order.');
      }
    });

    /* ---------------------------------------------------------------- exit */
    const exit = () => {
      if (exited) return;
      exited = true;
      abortDrag();
      timers.forEach((t) => clearTimeout(t));
      if (liveFlip && typeof G.cancelAnimationFrame === 'function') G.cancelAnimationFrame(liveFlip);
      G.removeEventListener('keydown', onWinKey, true);
      root.remove();
      hiddenBefore.forEach((was, el) => { el.hidden = was; });
      delete listEl.dataset.arranging;
      try { if (typeof opts.onExit === 'function') opts.onExit(); } catch (err) { if (G.console) G.console.warn('[Arrange] onExit failed', err); }
    };
    doneBtn.addEventListener('click', () => exit());

    /* ---------------------------------------------------------------- keyboard */
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (drag) return; e.preventDefault(); e.stopPropagation(); exit(); return; }
      const row = e.target.closest && e.target.closest('.sp-arr-row');
      if (!row || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const i = rowEls().indexOf(row);
      move(i, i + (e.key === 'ArrowUp' ? -1 : 1), 'key');
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-arr-up], [data-arr-down]');
      if (!b || b.disabled) return;
      const row = b.closest('.sp-arr-row');
      const i = rowEls().indexOf(row);
      move(i, i + (b.hasAttribute('data-arr-up') ? -1 : 1), 'key');
      const again = rowOf(row.dataset.plateId);
      const same = again && again.querySelector(b.hasAttribute('data-arr-up') ? '[data-arr-up]' : '[data-arr-down]');
      if (same && !same.disabled) same.focus({ preventScroll: true });
    });
    // Escape during a drag cancels the drag only, wherever focus is.
    const onWinKey = (e) => {
      if (drag && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); abortDrag(); }
    };
    G.addEventListener('keydown', onWinKey, true);

    /* ---------------------------------------------------------------- pointer drag */
    const scrollerEl = () => opts.scroller || findScroller(listEl);
    const bounds = (sc) => {
      if (sc) { const r = sc.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }
      return { top: 0, bottom: G.innerHeight || 800 };
    };
    const scrollPos = (sc) => (sc ? sc.scrollTop : (G.scrollY || G.pageYOffset || 0));
    const scrollBy = (sc, dy) => { if (sc) sc.scrollTop += dy; else if (typeof G.scrollBy === 'function') { try { G.scrollBy(0, dy); } catch (_) { /* noop */ } } };

    const update = () => {
      const d = drag;
      if (!d || !d.lifted) return;
      const dy = d.y - d.y0 + (scrollPos(d.sc) - d.s0);
      d.row.style.transform = `translateY(${dy}px)`;
      const others = rowEls().filter((r) => r !== d.row);
      let to = others.length;
      for (let k = 0; k < others.length; k++) {
        const r = others[k].getBoundingClientRect();
        if (d.y < r.top + r.height / 2) { to = k; break; }
      }
      d.to = to;
      const ref = others[to] || others[others.length - 1];
      if (!ref) return;
      const rr = ref.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      const y = (others[to] ? rr.top - 4 : rr.bottom + 4) - lr.top;
      dropLine.hidden = to === d.from;
      dropLine.style.top = `${y}px`;
      dropLine.dataset.label = `Drop as plate ${pad2(to + 1)}`;
    };

    const tick = () => {
      const d = drag;
      if (!d || !d.lifted) return;
      d.raf = 0;
      const b = bounds(d.sc);
      const v = edgeVelocity(d.y, b.top, b.bottom);
      if (v) { scrollBy(d.sc, v); update(); }
      if (typeof G.requestAnimationFrame === 'function') d.raf = G.requestAnimationFrame(tick);
    };

    const stopDrag = () => {
      const d = drag;
      if (!d) return null;
      drag = null;
      if (d.raf && typeof G.cancelAnimationFrame === 'function') G.cancelAnimationFrame(d.raf);
      G.removeEventListener('pointermove', d.onMove);
      G.removeEventListener('pointerup', d.onUp);
      G.removeEventListener('pointercancel', d.onCancel);
      d.grip.removeEventListener('lostpointercapture', d.onLost);
      try { d.grip.releasePointerCapture(d.pid); } catch (_) { /* noop */ }
      list.classList.remove('dnd');
      dropLine.hidden = true;
      return d;
    };
    function abortDrag() {
      const d = stopDrag();
      if (!d) return;
      d.row.classList.remove('dragging');
      d.row.style.transform = '';
    }

    list.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest && e.target.closest('.sp-arr-grip');
      if (!grip) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (drag) abortDrag();
      const row = grip.closest('.sp-arr-row');
      const d = {
        row, grip, pid: e.pointerId, y0: e.clientY, y: e.clientY, x0: e.clientX, lifted: false, from: rowEls().indexOf(row), to: 0, raf: 0,
        sc: scrollerEl(), s0: 0,
      };
      d.to = d.from;
      d.s0 = scrollPos(d.sc);
      d.onMove = (ev) => {
        if (ev.pointerId !== d.pid) return;
        d.y = ev.clientY;
        if (!d.lifted) {
          if (Math.abs(ev.clientY - d.y0) < SLOP && Math.abs(ev.clientX - d.x0) < SLOP) return;
          d.lifted = true;
          row.classList.add('dragging');
          list.classList.add('dnd');
          if (typeof G.requestAnimationFrame === 'function') d.raf = G.requestAnimationFrame(tick);
        }
        if (ev.cancelable) ev.preventDefault();
        update();
      };
      d.onUp = (ev) => {
        if (ev.pointerId !== d.pid) return;
        d.y = ev.clientY;
        update();
        const was = stopDrag();
        if (!was) return;
        if (!was.lifted) return;
        if (was.to === was.from) { was.row.classList.remove('dragging'); was.row.style.transform = ''; return; }
        move(was.from, was.to, 'drag', was.grip);
      };
      d.onCancel = (ev) => { if (ev.pointerId === d.pid) abortDrag(); };
      d.onLost = () => { if (drag === d && !d.lifted) abortDrag(); };
      drag = d;
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* synthetic / unsupported */ }
      G.addEventListener('pointermove', d.onMove);
      G.addEventListener('pointerup', d.onUp);
      G.addEventListener('pointercancel', d.onCancel);
      grip.addEventListener('lostpointercapture', d.onLost);
    });

    announce(`Arranging ${order.length} plates. Drag the handles, or focus a plate and press Alt with the up or down arrow.`);
    const first = rowEls()[0];
    if (first) { try { first.focus({ preventScroll: true }); } catch (_) { /* noop */ } }

    return {
      exit,
      /** Replace the plates (e.g. the store changed elsewhere). Keeps arrange mode open. */
      update(next) {
        if (exited || !Array.isArray(next)) return;
        plates = next.slice();
        order = plates.map((p) => p.id);
        build();
      },
      order: () => order.slice(),
    };
  };

  UI.StartPageArrange = { enter, edgeVelocity, MAX_SPEED, EDGE };
})();
