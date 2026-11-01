/**
 * Start Page "open in exactly the colors shown" — window.Vectura.StartPageOpenArt.
 *
 * Any piece opened from the Start Page (a saved work or a studio pick) lands in the editor in EXACTLY the
 * colorway it was showing: paper and pens, including page modes, manual overrides and special fills. The
 * resolved colorway is FROZEN into the document; nothing is re-derived afterwards.
 *
 *   freezeColorway(payload, colorway) -> new payload        pure
 *     colorway = { paper, ink, ink2?, paperType?, fill? }   (penId etc. are ignored)
 *   open(art, colorway, { asTemplate, app }) -> Promise<boolean>
 *     art = { kind: 'work', recentId|workId, name } | { kind: 'pick', presetId, name }
 *   FILL_INKS                                               representative solid ink per special fill
 *
 * Special fills (iridescent, duotone, metallic, sunset) cannot be a plotter pen, so they freeze as the nearest
 * representative SOLID ink: the caller's own displayed ink when it supplies a hex, otherwise FILL_INKS[fill].
 * The plate draws every pen in the one ink, so every used pen (and layer) takes the ink; a duotone steps the used
 * pens evenly from ink to ink2. The fill itself is stashed in `state.settings.startPageFill = { kind, ink, ink2|null }`
 * so a renderer can honor it. applyState restores the stash onto SETTINGS.startPageFill and captureState writes it
 * back, so it travels with the opened document (and a later Save) until New Canvas clears it.
 *
 * The opened document is a recolored COPY: dirty (unsaved), named "<name> (colorway)" or, as a template,
 * "<name> copy" (app.documentName), and detached from the recent it came from (app.currentRecentId = null), so
 * Save writes a new recent instead of overwriting the original.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const FILL_INKS = Object.freeze({
    iridescent: '#8a7fd8',
    'iridescent-animated': '#8a7fd8',
    duotone: '#2b3a8f',
    'metallic-gold': '#c9a24a',
    'metallic-silver': '#b8bcc4',
    sunset: '#e8603c',
  });

  const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  const hex6 = (value) => {
    if (typeof value !== 'string' || !HEX_RE.test(value.trim())) return null;
    let h = value.trim().slice(1).toLowerCase();
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    return `#${h}`;
  };
  const clone = (v) => Vectura.Utils.clone(v);

  const paperFor = (current, colorway) => {
    const Paper = Vectura.Paper;
    const types = (Vectura.PAPERS && Vectura.PAPERS.TYPES) || {};
    const type = typeof colorway.paperType === 'string' && types[colorway.paperType] ? colorway.paperType : 'none';
    const color = hex6(colorway.paper) || hex6(current && current.color) || '#ffffff';
    const same = current && current.type === type;
    const info = types[type] || {};
    // Same stock as the document: keep its own texture / bleed / scale / seed. A different stock starts from that
    // stock's catalogue defaults.
    const cfg = same
      ? { ...current, type, color }
      : { type, color, texture: info.defaultTexture, bleed: info.defaultBleed };
    if (Paper && typeof Paper.normalize === 'function') return Paper.normalize(cfg, { fallbackColor: color });
    return { type, color, texture: Number(cfg.texture) || 0, bleed: Number(cfg.bleed) || 0, scale: Number(cfg.scale) || 1, seed: Number(cfg.seed) || 1 };
  };

  // Two colorways are "the same" when paper and ink agree within a tiny tolerance (sum of channel differences) and
  // neither carries a special fill or a second ink.
  const rgbOf = (v) => { const h = hex6(v); return h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null; };
  const sameAsOwn = (cw, own, tol = 6) => {
    if (!cw || !own || cw.fill || hex6(cw.ink2)) return false;
    const a = [rgbOf(cw.paper), rgbOf(cw.ink)]; const b = [rgbOf(own.paper), rgbOf(own.ink)];
    if (a.some((x) => !x) || b.some((x) => !x)) return false;
    return a.every((c, i) => c.reduce((n, v, k) => n + Math.abs(v - b[i][k]), 0) <= tol);
  };
  // "<name>.vectura (colorway)" copies of copies never stack suffixes.
  const baseName = (name) => {
    let n = String(name || 'Untitled').replace(/\.vectura$/i, '').trim();
    for (let i = 0; i < 6; i += 1) { const m = n.replace(/\s+\((?:colorway)\)$/i, '').replace(/\s+copy$/i, '').trim(); if (m === n) break; n = m; }
    return n || 'Untitled';
  };

  const freezeColorway = (payload, colorway) => {
    if (!payload || typeof payload !== 'object') throw new Error('Not a Vectura document');
    const doc = clone(payload);
    const state = doc.state && typeof doc.state === 'object' ? doc.state : doc;
    if (!state.engine || typeof state.engine !== 'object') throw new Error('Not a Vectura document');
    const cw = colorway && typeof colorway === 'object' ? colorway : {};
    const settings = state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};

    // ---- paper
    settings.paper = paperFor(settings.paper, cw);
    settings.bgColor = settings.paper.color;

    // ---- inks (a special fill freezes as its representative solid ink)
    const fill = typeof cw.fill === 'string' && FILL_INKS[cw.fill] ? cw.fill : null;
    const ink = hex6(cw.ink) || (fill ? FILL_INKS[fill] : null);
    const ink2 = hex6(cw.ink2);

    // ---- pens used by the document's layers, in first-use order
    if (!Array.isArray(settings.pens) || !settings.pens.length) {
      settings.pens = [{ id: 'pen-1', name: 'Pen 1', color: '#000000', width: Number(settings.strokeWidth) || 0.3 }];
    }
    const pens = settings.pens;
    const layers = Array.isArray(state.engine.layers) ? state.engine.layers : [];
    const real = layers.filter((l) => l && !l.isGroup);
    const used = [];
    real.forEach((l) => {
      const pen = pens.find((p) => p && p.id === l.penId) || pens[0];
      if (pen && !used.includes(pen)) used.push(pen);
    });
    if (!used.length) used.push(pens[0]);
    const paint = (pen, color) => {
      if (!pen || !color) return;
      pen.color = color;
      // The theme must not recolor a pen the colorway chose.
      if (pen.id === 'pen-1' || typeof pen.themeManaged === 'boolean') pen.themeManaged = false;
    };
    // The plate draws EVERY pen in the one colorway ink (a duotone: a gradient from ink to ink2), so a solid-pen
    // document gets the same: without ink2 every used pen is the ink; with ink2 the used pens step evenly from ink
    // to ink2 (two pens: exactly ink and ink2).
    const mix = (a, b, t) => {
      const x = rgbOf(a); const y = rgbOf(b);
      if (!x || !y) return a;
      return `#${x.map((c, k) => Math.round(c + (y[k] - c) * t).toString(16).padStart(2, '0')).join('')}`;
    };
    const target = (i) => {
      if (!ink2 || used.length < 2 || !ink) return ink;
      return mix(ink, ink2, i / (used.length - 1));
    };
    used.forEach((pen, i) => paint(pen, target(i)));
    real.forEach((l) => {
      const pen = pens.find((p) => p && p.id === l.penId);
      if (pen && used.includes(pen) && hex6(pen.color)) l.color = pen.color;
      else if (!pen && used[0] && ink) { l.penId = used[0].id; l.color = used[0].color; }
    });

    // ---- the special fill, for a renderer that can honor it
    if (fill) settings.startPageFill = { kind: fill, ink, ink2: ink2 || null };
    else delete settings.startPageFill;
    return doc;
  };

  // ------------------------------------------------------------------ opening
  const toast = (message, variant = 'info') => {
    const T = Vectura.UI && Vectura.UI.overlays && Vectura.UI.overlays.Toast;
    if (!T || typeof T.show !== 'function') return null;
    try { return T.show({ message, variant, duration: 3500 }); } catch (_) { return null; }
  };

  const open = async (art, colorway, { asTemplate = false, app: appOpt = null } = {}) => {
    const app = appOpt || G.app || Vectura.app;
    if (!art || !app || !app.ui || typeof app.ui.loadVecturaPayload !== 'function') return false;
    const name = `${art.name || 'Untitled'}`;

    // Opening replaces the canvas: ask first when there is unsaved work.
    if (typeof app.confirmDiscardChanges === 'function'
      && !(await app.confirmDiscardChanges({
        title: 'Open this piece?',
        message: 'The current canvas has changes that are not saved to a file. Opening replaces it, and that cannot be undone.',
        confirmLabel: 'Open',
      }))) return false;

    let payload = null;
    try {
      if (art.kind === 'pick') {
        const preset = (Vectura.PRESETS || []).find((p) => p && p.id === art.presetId);
        const R = Vectura.StartPageArtRenderer;
        if (preset && R && typeof R.presetPayload === 'function') payload = R.presetPayload(preset);
      } else {
        const id = art.recentId || art.workId;
        const store = (app.recents && app.recents.store)
          || (Vectura.RecentsStore && Vectura.RecentsStore.shared && Vectura.RecentsStore.shared());
        payload = store && id ? await store.getDoc(id) : null;
      }
    } catch (err) {
      console.warn('[OpenArt] could not build the document', err);
      payload = null;
    }
    if (!payload) {
      toast(`Could not open ${name}.`, 'warning');
      return false;
    }

    let frozen;
    try { frozen = freezeColorway(payload, colorway); } catch (err) {
      console.warn('[OpenArt] freeze failed', err);
      toast(`Could not open ${name}.`, 'warning');
      return false;
    }

    app.startPage?.hide?.({ restoreFocus: false });
    const ok = app.ui.loadVecturaPayload(frozen, { quiet: true });
    if (!ok) return false;

    // A recolored copy: unsaved, named, and detached from any recent so Save never overwrites the original.
    const docName = asTemplate ? `${baseName(name)} copy` : `${baseName(name)} (colorway)`;
    app.documentName = docName;
    app.currentRecentId = null;
    app._cleanFingerprint = '\u0000unsaved';
    const S = Vectura.SETTINGS;
    if (frozen.state.settings.startPageFill) S.startPageFill = clone(frozen.state.settings.startPageFill);
    else delete S.startPageFill;
    try { app.renderer?.center?.(); } catch (_) { /* view only */ }
    toast(`Opened ${docName} as a new, unsaved document`, 'info');
    return true;
  };

  Vectura.StartPageOpenArt = { freezeColorway, open, sameAsOwn, baseName, FILL_INKS };
})();
