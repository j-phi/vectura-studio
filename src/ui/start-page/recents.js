/**
 * Recents controller (Start Page P0).
 *
 * Bridges the app and Vectura.RecentsStore: records every successful Open and Save (a full copy of the
 * .vectura payload plus a thumbnail), keeps a cached newest-first list, reopens an entry (file handle first,
 * stored copy as the fallback), and renders the File > Open Recent submenu. Start Page rails subscribe to it
 * through `subscribe(fn)`.
 *
 * window.Vectura.UI.RecentsController.create(app) -> controller
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const SVG_LIMIT = 250 * 1024; // beyond this the thumbnail is a 512 px PNG instead
  const PNG_SIZE = 512;
  const MENU_MAX_DIGITS = 8;

  const relativeTime = (ms, now = Date.now()) => {
    const diff = Math.max(0, now - ms);
    const min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} h ago`;
    const day = Math.round(hr / 24);
    if (day < 7) return `${day} d ago`;
    try {
      return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) { return `${day} d ago`; }
  };

  const toast = (message, variant = 'info', action = null) => {
    const T = Vectura.UI?.overlays?.Toast;
    if (!T || typeof T.show !== 'function') return null;
    try { return T.show({ message, variant, duration: action ? 8000 : 3500, ...(action ? { action } : {}) }); } catch (_) { return null; }
  };

  // Encoding a thumbnail SVG (up to 250 KB) is costly and list() hands out the same immutable string on every render,
  // so the encoded URI is cached per SVG string (small LRU).
  const URI_CACHE_MAX = 64;
  const uriCache = new Map();
  const svgToDataUri = (svg) => {
    if (uriCache.has(svg)) { const hit = uriCache.get(svg); uriCache.delete(svg); uriCache.set(svg, hit); return hit; }
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    uriCache.set(svg, uri);
    if (uriCache.size > URI_CACHE_MAX) uriCache.delete(uriCache.keys().next().value);
    return uri;
  };

  // Re-shape the export SVG into a thumbnail: no mm size (it scales to its box) and a paper-colored ground.
  const thumbSvg = (svg, paperColor) => {
    const m = /<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>/.exec(svg);
    if (!m) return svg;
    const vb = m[1].split(/\s+/).map(Number);
    const bg = /^#[0-9a-f]{3,8}$/i.test(paperColor || '') ? paperColor : '#ffffff';
    const open = `<svg viewBox="${m[1]}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`
      + `<rect x="${vb[0] || 0}" y="${vb[1] || 0}" width="${vb[2]}" height="${vb[3]}" fill="${bg}"/>`;
    return svg.replace(m[0], open).replace(/^<\?xml[^>]*\?>/, '');
  };

  const svgToPng = (svg, size = PNG_SIZE) => new Promise((resolve) => {
    try {
      if (typeof G.Image !== 'function' || typeof document === 'undefined') { resolve(null); return; }
      const img = new G.Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = img.naturalWidth || size;
          const h = img.naturalHeight || size;
          const k = size / Math.max(w, h);
          canvas.width = Math.max(1, Math.round(w * k));
          canvas.height = Math.max(1, Math.round(h * k));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch (_) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = svgToDataUri(svg);
    } catch (_) { resolve(null); }
  });

  const create = (app) => {
    const factory = Vectura.RecentsStore;
    const store = factory && typeof factory.create === 'function'
      ? factory.create({ onWriteFailure: () => toast("This browser couldn't keep a saved copy of your work for Recents; it stays open in this tab.", 'warning') })
      : null;
    const listeners = new Set();
    let entries = [];
    let menuEls = null;
    let lastClear = null;
    let refreshing = null;
    let seq = 0;
    let refreshedSeq = -1;

    const limit = () => Vectura.START_PAGE?.LIMITS?.recentsShown || 8;
    const isMac = () => /mac|iphone|ipad|ipod/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase());

    const algorithmLabel = () => {
      const layers = (app.engine?.layers || []).filter((l) => l && !l.isGroup);
      const first = layers[0];
      if (!first) return 'Empty canvas';
      const label = Vectura.PresetNameHeuristics?.algoLabel;
      return (typeof label === 'function' ? label(first.type) : first.type) || 'Layer';
    };
    const paperLabel = () => {
      const S = Vectura.SETTINGS || {};
      const m = (Vectura.MACHINES || {})[S.paperSize];
      if (S.paperSize === 'custom' || !m) return `${Math.round(S.paperWidth || 0)}×${Math.round(S.paperHeight || 0)} mm`;
      return m.name;
    };
    const pensSummary = () => (Array.isArray(Vectura.SETTINGS?.pens) ? Vectura.SETTINGS.pens : []).slice(0, 4)
      .map((p) => ({ color: p.color, width: p.width }));

    const hexOf = (c) => (typeof c === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim().toLowerCase() : '');
    // The document's own paper and primary ink (first drawn layer's pen), kept on the entry so a PNG thumbnail
    // (which carries no readable ground) still shows in the file's colors.
    const ownColors = () => {
      const S = Vectura.SETTINGS || {};
      const pens = Array.isArray(S.pens) ? S.pens : [];
      const first = (app.engine?.layers || []).find((l) => l && !l.isGroup);
      const pen = (first && pens.find((p) => p && p.id === first.penId)) || pens[0] || null;
      return { paperColor: hexOf(S.paper?.color) || hexOf(S.bgColor), inkColor: hexOf(pen && pen.color) };
    };

    const buildThumb = async () => {
      try {
        const doc = app.ui?.buildSvgDocument?.();
        if (!doc || !doc.svg) return null;
        const paper = Vectura.SETTINGS?.paper?.color || Vectura.SETTINGS?.bgColor;
        const svg = thumbSvg(doc.svg, paper);
        if (svg.length <= SVG_LIMIT) return { kind: 'svg', data: svg };
        const png = await svgToPng(svg);
        return png ? { kind: 'png', data: png } : null;
      } catch (err) {
        return null;
      }
    };

    const emit = () => { listeners.forEach((fn) => { try { fn(entries); } catch (_) { /* noop */ } }); };

    const entryThumbSrc = (entry) => {
      const t = entry && entry.thumb;
      if (!t || !t.data) return null;
      if (t.kind === 'svg') return svgToDataUri(t.data);
      return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(t.data) ? t.data : null;
    };

    const ctl = {
      store,
      relativeTime,
      thumbSrc: entryThumbSrc,
      algorithmLabel,
      list: () => entries.slice(),
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      isMac,

      // Coalesced: the store's mutation hook and record()/clear() both ask for a refresh. A mutation bumps
      // `seq`; `refresh({ ifStale: true })` returns the cached list when a refresh already covered it, so each
      // mutation renders and notifies once.
      refresh({ ifStale = false } = {}) {
        if (refreshing) return refreshing;
        if (ifStale && refreshedSeq === seq) return Promise.resolve(entries);
        const mySeq = seq;
        refreshing = (async () => {
          if (!store) { entries = []; } else {
            try { entries = await store.list({ limit: limit() }); } catch (_) { entries = []; }
          }
          refreshing = null;
          refreshedSeq = mySeq;
          ctl.renderMenu();
          emit();
          return entries;
        })();
        return refreshing;
      },

      /** Record the document the editor holds right now. */
      async record({ source = 'open', name, handle = null, payload = null, id, forceNew = false, algorithm, paper, pens, thumb: thumbOverride, paperColor, inkColor } = {}) {
        if (!store) return null;
        try {
          const doc = payload || { type: 'vectura', version: app.ui?.getAppVersion?.() || '', state: app.captureState(), images: {} };
          if (doc.state) delete doc.state.layerLockedIds;
          const thumb = thumbOverride !== undefined ? thumbOverride : await buildThumb();
          const own = ownColors();
          const entry = await store.record({
            name: name || 'untitled.vectura', algorithm: algorithm || algorithmLabel(), paper: paper || paperLabel(), pens: pens || pensSummary(),
            paperColor: paperColor || own.paperColor, inkColor: inkColor || own.inkColor,
            thumb, payload: doc, handle: handle || undefined, source, id, forceNew,
          });
          if (entry && entry.id) app.currentRecentId = entry.id;
          await ctl.refresh({ ifStale: true });
          return entry;
        } catch (err) {
          console.warn('[Recents] record failed', err);
          return null;
        }
      },

      /** Reopen an entry: its file handle first, the stored copy otherwise. */
      async open(id) {
        if (!store) return false;
        const entry = await store.get(id);
        if (!entry) return false;
        // Reopening replaces the canvas: ask first when there is unsaved work.
        if (typeof app.confirmDiscardChanges === 'function'
          && !(await app.confirmDiscardChanges({ title: 'Open this file?', message: 'The current canvas has changes that are not saved to a file. Opening replaces it, and that cannot be undone.', confirmLabel: 'Open' }))) return false;
        const handle = await store.getHandle(id).catch(() => null);
        if (handle && typeof handle.getFile === 'function') {
          try {
            let perm = typeof handle.queryPermission === 'function' ? await handle.queryPermission({ mode: 'read' }) : 'granted';
            if (perm !== 'granted' && typeof handle.requestPermission === 'function') perm = await handle.requestPermission({ mode: 'read' });
            if (perm === 'granted') {
              const file = await handle.getFile();
              // Validated first: the page is hidden only once the file really opened (openVecturaFile hides it).
              const opened = await app.ui.openVecturaFile(file, { handle, fromRecent: true });
              if (opened !== false) return true;
            }
          } catch (_) { /* fall through to the stored copy */ }
        }
        const payload = await store.getDoc(id).catch(() => null);
        if (!payload) {
          toast(`Could not reopen ${entry.name}. Use Open file… to find it again.`, 'warning');
          return false;
        }
        app.startPage?.hide?.({ restoreFocus: false });
        const ok = app.ui.loadVecturaPayload(payload, { name: entry.name, quiet: true });
        if (ok) {
          toast(`Opened your saved copy from ${relativeTime(entry.lastOpened)}`, 'info');
          // id: update this recent in place (a name alone never identifies a work).
          await ctl.record({ source: 'open', name: entry.name, payload, id: entry.id });
        }
        return ok;
      },

      async openNth(n) {
        const e = entries[n];
        return e ? ctl.open(e.id) : false;
      },

      /** Hide every recent (kept in the works list) with an Undo toast. */
      async clear() {
        if (!store || !entries.length) return;
        lastClear = await store.clearRecent();
        await ctl.refresh({ ifStale: true });
        const token = lastClear;
        toast('Recent list cleared', 'info', {
          label: 'Undo',
          onAction: async () => { await store.undoClear(token); await ctl.refresh({ ifStale: true }); },
        });
      },

      /** Wire the File menu entries and keep the submenu in sync. */
      bindMenu() {
        const trigger = document.getElementById('btn-open-recent');
        const panel = document.getElementById('open-recent-panel');
        if (!trigger || !panel || trigger._vecturaWired) return;
        trigger._vecturaWired = true;
        menuEls = { trigger, panel, sub: trigger.closest('.top-menu-sub') };
        const open = (focusFirst) => {
          if (!menuEls.sub) return;
          menuEls.sub.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          panel.hidden = false;
          if (focusFirst) panel.querySelector('.top-menu-item:not([disabled])')?.focus();
        };
        const close = (refocus) => {
          if (!menuEls.sub) return;
          menuEls.sub.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
          panel.hidden = true;
          if (refocus) trigger.focus();
        };
        menuEls.close = close;
        menuEls.open = open;
        // Touch-safe: a tap (click) opens the submenu; mouseenter is only the hover shortcut.
        menuEls.sub.addEventListener('click', (e) => {
          if (!trigger.contains(e.target)) return;
          e.preventDefault(); e.stopPropagation(); open(false);
        });
        menuEls.sub.addEventListener('mouseenter', () => open(false));
        menuEls.sub.addEventListener('mouseleave', () => { if (!panel.contains(document.activeElement)) close(false); });
        trigger.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(true); }
        });
        panel.addEventListener('keydown', (e) => {
          const items = [...panel.querySelectorAll('.top-menu-item:not([disabled])')];
          const idx = items.indexOf(document.activeElement);
          if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); (items[(idx + 1) % items.length] || items[0])?.focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); (items[(idx - 1 + items.length) % items.length] || items[0])?.focus(); }
          else if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        });
        panel.addEventListener('click', (e) => e.stopPropagation());
        // closing the parent menu closes the submenu with it
        const parentPanel = trigger.closest('[data-top-menu-panel]');
        if (parentPanel && typeof MutationObserver === 'function') {
          new MutationObserver(() => { if (parentPanel.hidden) close(false); }).observe(parentPanel, { attributes: true, attributeFilter: ['hidden'] });
        }
        document.getElementById('btn-start-page')?.addEventListener('click', () => app.startPage?.show());
        document.getElementById('btn-new-canvas')?.addEventListener('click', () => app.newCanvas({ paper: app.getNewCanvasPaper?.() }));
        document.getElementById('btn-close-project')?.addEventListener('click', () => app.closeProject?.());
        ctl.renderMenu();
      },

      renderMenu() {
        // A refresh can resolve after the page is torn down (closed window, test teardown).
        if (typeof document === 'undefined' || !document) return;
        const panel = document.getElementById('open-recent-panel');
        if (!panel) return;
        const mac = isMac();
        panel.textContent = '';
        const title = document.createElement('div');
        title.className = 'top-menu-sub-title';
        title.textContent = 'Recent projects';
        panel.appendChild(title);
        if (!entries.length) {
          const none = document.createElement('button');
          none.type = 'button';
          none.className = 'top-menu-item';
          none.setAttribute('role', 'menuitem');
          none.disabled = true;
          none.innerHTML = '<span>No recent files</span>';
          panel.appendChild(none);
        } else {
          entries.slice(0, MENU_MAX_DIGITS).forEach((entry, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'top-menu-item top-menu-recent';
            b.setAttribute('role', 'menuitem');
            b.dataset.recentId = entry.id;
            const lead = document.createElement('span');
            lead.className = 'recent-lead';
            const th = document.createElement('span');
            th.className = 'sp-thumb';
            const src = entryThumbSrc(entry);
            if (src) {
              const img = document.createElement('img');
              img.alt = '';
              img.src = src;
              th.appendChild(img);
            }
            const tx = document.createElement('span');
            tx.className = 'recent-text';
            const nm = document.createElement('span');
            nm.className = 'recent-name';
            nm.textContent = entry.name;
            const mt = document.createElement('span');
            mt.className = 'recent-meta';
            mt.textContent = `${entry.algorithm} · ${relativeTime(entry.lastOpened)}`;
            tx.append(nm, mt);
            lead.append(th, tx);
            const sc = document.createElement('span');
            sc.className = 'top-menu-shortcut';
            sc.dataset.shortcutMac = `Alt+Cmd+${i + 1}`;
            sc.dataset.shortcutWin = `Alt+Ctrl+${i + 1}`;
            sc.textContent = mac ? `⌥⌘${i + 1}` : `Alt+Ctrl+${i + 1}`;
            b.append(lead, sc);
            b.addEventListener('click', () => {
              app.ui?.setTopMenuOpen?.(null, false);
              ctl.open(entry.id);
            });
            panel.appendChild(b);
          });
          const sep = document.createElement('hr');
          sep.className = 'top-menu-sep';
          sep.setAttribute('role', 'separator');
          panel.appendChild(sep);
          const clear = document.createElement('button');
          clear.type = 'button';
          clear.id = 'btn-clear-recent';
          clear.className = 'top-menu-item';
          clear.setAttribute('role', 'menuitem');
          clear.innerHTML = '<span>Clear Recent</span>';
          clear.addEventListener('click', () => { app.ui?.setTopMenuOpen?.(null, false); ctl.clear(); });
          panel.appendChild(clear);
        }
      },
    };

    if (store && typeof store.subscribe === 'function') store.subscribe(() => { seq += 1; ctl.refresh(); });
    return ctl;
  };

  UI.RecentsController = { create, relativeTime, thumbSvg, svgToPng };
})();
