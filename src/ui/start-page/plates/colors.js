/**
 * Start Page plate manual colors — window.Vectura.StartPagePlateColors.
 *
 * Turns a plate's placed colorway plus the user's manual colors into what a plate shows, and paints it onto a
 * rendered plate (StartPagePlateLayouts). Stored values: null (Auto) | '#hex' | { fill: <StartPagePlateFills id> }.
 *
 *   resolve(placed, colors, opts?) -> { colorway, art: { fill: spec|null }, text: { css|null }, ground: { css|null, hex },
 *                                       title: { kind, css, spec, rep }, band: { kind, css, rep, on },
 *                                       stops: { art, text, ground }, contrast: { text, art, warnings: [{ code, part, message }] } }
 *     placed  the rhythm / mode colorway ({ ground, ink, accent, class, ... }); colors { art, text, background, title, band }
 *     (Basic passes { art: basicColors.ink }). opts { still, layout }.
 *     title  the big display word (layouts with the 'title' role, StartPagePlateType.rolesFor); Auto = today's look
 *            (follows the art fill). band  the solid secondary ground of the band layouts; Auto = the pen ink.
 *            Both are Auto (kind null) when not chosen, and apply() ignores them on layouts that do not draw them.
 *   apply(plateEl, resolved)   recolors the plate in place (no re-plot): plate variables, art tiles + knockout word with the
 *                              art fill, text and background gradients (data-txfill / data-bgfill / data-artfill).
 *   contrast(a, b)
 * Gradients are checked stop by stop against the ground (a gradient ground is averaged). Warnings: text < 4.5:1, art < 3:1,
 * title < 3:1 (against the band when the word sits on it, else the ground; only when opts.layout draws a title).
 */
(() => {
  const W = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = W.Vectura = W.Vectura || {};
  const TEXT_MIN = 4.5;
  const ART_MIN = 3;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const T = () => Vectura.StartPagePlateType;
  const F = () => Vectura.StartPagePlateFills;
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  const lum = (h) => { const t = T(); return t.contrast(h, '#000000') * 0.05 - 0.05; };
  const contrast = (a, b) => T().contrast(a, b);
  const minContrast = (a, b) => { let m = Infinity; a.forEach((x) => b.forEach((y) => { m = Math.min(m, contrast(x, y)); })); return m; };
  const r1 = (v) => Math.round(v * 10) / 10;
  const isHex = (v) => typeof v === 'string' && HEX.test(v);

  // Manual Artwork / Background names: the palette's own pen / paper when the hex matches one, else a readable custom name,
  // or the special fill's name. Auto (and Title / Band / Text) keep the palette entry's names.
  const fillName = (id) => { const k = (F().KINDS || []).find((x) => x.id === id); return k ? k.name : id; };
  const palette = () => (Array.isArray(Vectura.START_PAGE_PLATE_PALETTE) ? Vectura.START_PAGE_PLATE_PALETTE : []);
  const manualPenName = (v, base) => {
    if (F().isFill(v)) { const n = fillName(v.fill); return /\bink$/i.test(n) ? n : `${n} ink`; }
    if (!isHex(v)) return null;
    const k = v.toLowerCase();
    if (base.ink && String(base.ink).toLowerCase() === k && base.penName) return base.penName;
    const hit = palette().find((e) => e.ink && String(e.ink).toLowerCase() === k && e.penName);
    return hit ? hit.penName : `Custom ink ${k}`;
  };
  const manualPaperName = (v, base) => {
    if (F().isFill(v)) return `${fillName(v.fill)} paper`;
    if (!isHex(v)) return null;
    const k = v.toLowerCase();
    const g = base.ground || base.paper;
    if (g && String(g).toLowerCase() === k && base.paperName) return base.paperName;
    const hit = palette().find((e) => e.ground && String(e.ground).toLowerCase() === k && e.paperName);
    return hit ? hit.paperName : `Custom paper ${k}`;
  };

  const resolve = (placed, colors, opts) => {
    const Fl = F(); const Ty = T();
    const base = placed || {};
    const c = colors || {};
    const still = !!(opts && opts.still);
    const baseGround = base.ground || base.paper || '#ffffff';
    const autoVars = Ty.plateVars(base);
    // ground first: text and art fills pick light or dark stops by it
    let ground = baseGround; let groundCss = null; let groundKind = null;
    if (Fl.isFill(c.background)) {
      groundKind = c.background.fill;
      const st = Fl.stops(groundKind, { ink: base.ink, accent: base.accent, onDark: lum(baseGround) < 0.2 });
      ground = Fl.average(st); groundCss = Fl.css(groundKind, { ink: base.ink, accent: base.accent, onDark: lum(baseGround) < 0.2 }, { still });
    } else if (isHex(c.background)) ground = c.background;
    const onDark = lum(ground) < 0.2;
    const ctx = { ink: base.ink, accent: base.accent, onDark };
    let ink = base.ink; let artSpec = null; let artStops = [autoVars['--spl-art']];
    if (Fl.isFill(c.art)) {
      artSpec = Fl.spec(c.art.fill, ctx); ink = Fl.representative(c.art.fill, ctx); artStops = Fl.stops(c.art.fill, ctx);
    } else if (isHex(c.art)) { ink = c.art; artStops = [c.art]; }
    let textInk = base.textInk; let textCss = null; let textStops = [autoVars['--spl-text']]; let textKind = null;
    if (Fl.isFill(c.text)) {
      textKind = c.text.fill; textInk = Fl.representative(textKind, ctx); textStops = Fl.stops(textKind, ctx); textCss = Fl.css(textKind, ctx, { still });
    } else if (isHex(c.text)) { textInk = c.text; textStops = [c.text]; }
    // Title (display word) and Band (secondary ground): independent of the art fill; Auto keeps today's derived look.
    const layout = opts && opts.layout;
    const known = !!layout && Ty.LAYOUTS.some((l) => l.id === layout);
    const roles = known ? Ty.rolesFor(layout) : [];
    const wordOnBand = known && Ty.WORD_ON_BAND.indexOf(layout) >= 0;
    const band = { kind: null, css: null, rep: null, on: null };
    let bandStops = null;
    if (Fl.isFill(c.band)) {
      const bctx = { ink: base.ink, accent: base.accent, onDark: lum(ground) < 0.2 };
      bandStops = Fl.stops(c.band.fill, bctx);
      Object.assign(band, { kind: c.band.fill, css: Fl.css(c.band.fill, bctx, { still }), rep: Fl.average(bandStops) });
    } else if (isHex(c.band)) { bandStops = [c.band]; Object.assign(band, { kind: 'solid', css: c.band, rep: c.band }); }
    if (band.kind) band.on = Ty.ensure(ground, band.rep, 4.6);
    const backdrop = wordOnBand ? (band.rep || ink) : ground;
    const title = { kind: null, css: null, spec: null, rep: null };
    let titleStops = null;
    if (Fl.isFill(c.title) || isHex(c.title)) {
      if (Fl.isFill(c.title)) {
        const tctx = { ink: base.ink, accent: base.accent, onDark: lum(backdrop) < 0.2 };
        titleStops = Fl.stops(c.title.fill, tctx);
        Object.assign(title, { kind: c.title.fill, spec: Fl.spec(c.title.fill, tctx), rep: Fl.representative(c.title.fill, tctx) });
      } else { titleStops = [c.title]; Object.assign(title, { kind: 'solid', css: c.title, rep: c.title }); }
    }
    const cls = ground === baseGround ? base.class : (lum(ground) < 0.18 ? 'dark' : (base.class === 'dark' ? 'light' : base.class));
    const colorway = Object.assign({}, base, { ground, ink, accent: base.accent, class: cls });
    if (textInk) colorway.textInk = textInk;
    // the names the plate prints (header meta line, PAPER / PEN rows) describe the colors shown, not the palette entry they replace
    const penName = manualPenName(c.art, base); if (penName) colorway.penName = penName;
    const paperName = manualPaperName(c.background, base); if (paperName) colorway.paperName = paperName;
    // manual picks are honored exactly: the plate shows them as chosen and the warning below says what is wrong with them
    if (Fl.isFill(c.art) || isHex(c.art)) colorway.exactInk = true; else delete colorway.exactInk;
    if (Fl.isFill(c.text) || isHex(c.text)) colorway.exactText = true; else delete colorway.exactText;
    // when the user chose no ink of their own the art stays at the plate's own ink
    const textC = minContrast(textStops, [ground]);
    const artC = minContrast(artStops, [ground]);
    const warnings = [];
    if (textC < TEXT_MIN) warnings.push({ code: 'text-contrast', part: 'text', message: `Text contrast ${r1(textC).toFixed(1)}:1 is below 4.5:1, so captions may be hard to read.` });
    if (artC < ART_MIN) warnings.push({ code: 'art-contrast', part: 'art', message: `Art contrast ${r1(artC).toFixed(1)}:1 is below 3:1, so the lines may fade into the ground.` });
    // the word is the Title when chosen; with a manual Band the Auto word is the paper color knocked out of that band
    const titleCheck = roles.indexOf('title') >= 0 ? (titleStops || (wordOnBand && bandStops ? [ground] : null)) : null;
    if (titleCheck) {
      const titleC = minContrast(titleCheck, wordOnBand ? (bandStops || [ink]) : [ground]);
      if (titleC < ART_MIN) warnings.push({ code: 'title-contrast', part: 'title', message: `Title contrast ${r1(titleC).toFixed(1)}:1 is below 3:1, so the big word may fade into ${wordOnBand && bandStops ? 'the band' : 'the ground'}.` });
    }
    return {
      title, band, colorway, art: { fill: artSpec, kind: artSpec ? artSpec.kind : null },
      text: { css: textCss, kind: textKind }, ground: { css: groundCss, hex: ground, kind: groundKind },
      stops: { art: artStops, text: textStops, ground: [ground] },
      contrast: { text: textC, art: artC, warnings },
    };
  };

  /* display words (SVG text) follow the art fill through a gradient in one shared defs block */
  const wordFill = (plateEl, spec, role) => {
    const prop = role === 'title' ? '--spl-title' : '--spl-word-fill';
    const key = role === 'title' ? '_speUidT' : '_speUid';
    const D = plateEl.ownerDocument;
    let defs = D.getElementById('spe-defs');
    if (!defs && spec) {
      const svg = D.createElementNS(SVGNS, 'svg');
      svg.setAttribute('id', 'spe-defs'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.style.position = 'absolute';
      svg.appendChild(D.createElementNS(SVGNS, 'defs'));
      D.body.appendChild(svg); defs = svg;
    }
    if (!plateEl[key]) plateEl[key] = `spe-w${Math.random().toString(36).slice(2, 8)}`;
    const id = plateEl[key];
    if (defs) { const old = defs.querySelector(`#${id}`); if (old) old.remove(); }
    if (!spec) { plateEl.style.removeProperty(prop); return; }
    const g = D.createElementNS(SVGNS, 'linearGradient');
    g.setAttribute('id', id); g.setAttribute('x1', '0'); g.setAttribute('y1', '0'); g.setAttribute('x2', '1'); g.setAttribute('y2', '1');
    spec.stops.forEach((s) => { const st = D.createElementNS(SVGNS, 'stop'); st.setAttribute('offset', String(s[0])); st.setAttribute('stop-color', s[1]); g.appendChild(st); });
    defs.firstElementChild.appendChild(g);
    plateEl.style.setProperty(prop, `url(#${id})`);
  };

  const apply = (plateEl, res) => {
    if (!plateEl || !res) return;
    const L = Vectura.StartPagePlateLayouts;
    const c = plateEl._spl;
    if (L && c && !c.dead) L.recolor(plateEl, res.colorway);
    else { const v = T().plateVars(res.colorway); Object.keys(v).forEach((k) => plateEl.style.setProperty(k, v[k])); plateEl.dataset.cls = res.colorway.class || ''; }
    const set = (attr, prop, kind, css) => {
      if (kind && css) { plateEl.dataset[attr] = kind; plateEl.style.setProperty(prop, css); } else { delete plateEl.dataset[attr]; plateEl.style.removeProperty(prop); }
    };
    set('bgfill', '--spl-bg-fill', res.ground.kind, res.ground.css);
    set('txfill', '--spl-tx-fill', res.text.kind, res.text.css);
    if (res.art.fill) plateEl.dataset.artfill = res.art.kind; else delete plateEl.dataset.artfill;
    wordFill(plateEl, res.art.fill);
    // Title and Band only where the plate's layout draws them (a stored value for another layout stays stored, unused)
    const lay = plateEl.dataset.layout;
    const roles = lay && T().LAYOUTS.some((l) => l.id === lay) ? T().rolesFor(lay) : ['title', 'band'];
    const band = roles.indexOf('band') >= 0 && res.band && res.band.kind ? res.band : null;
    const title = roles.indexOf('title') >= 0 && res.title && res.title.kind ? res.title : null;
    if (band) {
      plateEl.dataset.band = band.kind; plateEl.style.setProperty('--spl-band', band.css);
      plateEl.style.setProperty('--spl-band-on', band.on); plateEl.style.setProperty('--spl-band-rep', band.rep);
    } else { delete plateEl.dataset.band; ['--spl-band', '--spl-band-on', '--spl-band-rep'].forEach((k) => plateEl.style.removeProperty(k)); }
    if (title) {
      plateEl.dataset.title = title.kind;
      if (title.spec) wordFill(plateEl, title.spec, 'title'); else { wordFill(plateEl, null, 'title'); plateEl.style.setProperty('--spl-title', title.css); }
    } else { delete plateEl.dataset.title; wordFill(plateEl, null, 'title'); }
    if (c && !c.dead) {
      const withFill = (h) => {
        if (!h || !h.setColorway) return;
        const cur = h.colorway || {};
        const next = Object.assign({}, cur, { fill: res.art.fill || null });
        delete next.key;
        h.setColorway(next);
      };
      c.prints.forEach((p) => withFill(p.el._spInk));
      c.crops.forEach((k) => withFill(k.el._spInk));
      if (c.ko && c.ko._spWord) withFill(c.ko._spWord);
    }
  };

  Vectura.StartPagePlateColors = { resolve, apply, contrast, TEXT_MIN, ART_MIN };
})();
