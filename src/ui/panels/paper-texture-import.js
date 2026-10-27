/**
 * Image-paper import dialog + online texture search sheet —
 * window.Vectura.UI.PaperTextureImport.
 *
 *   openImportDialog(ui, { blob, heightBlob?, name?, source?, tileMm?, onCreate })
 *     Name, physical size (scan dpi, default PAPERS.IMAGE.defaultDpi, or image
 *     width in mm — prefilled from provider metadata), optional height map,
 *     attribution; "Create paper" runs Vectura.PaperImage.processImport (time-
 *     sliced, progress shown) and hands { image, meanColor, name, source } to
 *     onCreate (which saves + applies the paper; returns a Promise<bool>).
 *
 *   openSearchSheet(ui, { onPicked, onUpload })
 *     Search box (default PAPER_TEXTURE_SOURCES.DEFAULT_QUERY), collection
 *     chips, a thumbnail grid with licence badges; "Use" downloads the full
 *     image (Vectura.PaperTextureSearch.download) and calls onPicked({ blob,
 *     heightBlob, name, source, tileMm }); when the site blocks the download
 *     (CORS) the card offers "Open source page" + "Upload the file"
 *     (onUpload(source) — the upload keeps the attribution).
 *
 * Untrusted strings (titles, authors, URLs from providers) are only ever set
 * through textContent / validated https hrefs. Both use the app modal
 * (ui.openModal / ui.closeModal): focus trap, Esc, touch sheet.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const strings = () => (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PAPER_PANEL) || {};
  const fmt = (t, vars) => String(t || '').replace(/\{(\w+)\}/g, (_m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  const imgCfg = () => (Vectura.PAPERS && Vectura.PAPERS.IMAGE) || { defaultDpi: 300, dpiMin: 25, dpiMax: 4800, tileMmMin: 5, tileMmMax: 2000, ACCEPT: 'image/png,image/jpeg,image/webp' };
  const HTTPS_RE = /^https:\/\/[^\s"'<>`\\]{1,1000}$/;
  const HTTP_RE = /^https?:\/\/[^\s"'<>`\\]{1,1000}$/;

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'className') n.className = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    });
    kids.forEach((c) => { if (c) n.appendChild(c); });
    return n;
  };

  const sourceLine = (source) => {
    if (!source) return null;
    const S = strings();
    const parts = [source.title, source.author, source.provider].filter((v, i, a) => v && a.indexOf(v) === i);
    const line = el('p', { className: 'paper-attribution' }, [el('span', { text: `${S.ATTRIBUTION_PREFIX || 'Texture:'} ${parts.join(' · ')}` })]);
    if (source.licence) {
      line.appendChild(document.createTextNode(' · '));
      // CC BY and friends require the licence to be linked.
      line.appendChild(source.licenceUrl && HTTP_RE.test(source.licenceUrl)
        ? el('a', { href: source.licenceUrl, target: '_blank', rel: 'noopener noreferrer', className: 'paper-licence-link', text: source.licence })
        : document.createTextNode(source.licence));
    }
    if (source.url && HTTP_RE.test(source.url)) {
      line.appendChild(document.createTextNode(' · '));
      line.appendChild(el('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', text: S.SEARCH_SOURCE || 'Source page' }));
    }
    return line;
  };

  function openImportDialog(ui, opts = {}) {
    const S = strings();
    const C = imgCfg();
    const E = S.IMAGE_ERRORS || {};
    const PI = Vectura.PaperImage;
    let heightBlob = opts.heightBlob || null;
    const baseName = (opts.name || (opts.blob && opts.blob.name ? String(opts.blob.name).replace(/\.[a-z0-9]+$/i, '') : '') || S.IMPORT_DEFAULT_NAME || 'Paper photo').slice(0, 48);

    // Preview from a data URL of the (already type-checked) image; large
    // files skip the preview.
    const preview = el('div', { className: 'paper-import-preview', 'aria-hidden': 'true' });
    if (opts.blob && PI && PI.blobToDataUrl && Number(opts.blob.size) <= 12 * 1024 * 1024) {
      PI.blobToDataUrl(opts.blob).then((url) => {
        if (url && /^data:image\/(png|jpeg|webp);base64,/.test(url)) preview.style.backgroundImage = `url("${url}")`;
      });
    }

    const nameInput = el('input', { type: 'text', id: 'paper-import-name', className: 'paper-import-input', maxlength: '48', 'aria-label': S.IMPORT_NAME || 'Name' });
    nameInput.value = baseName;
    const mode = el('select', { id: 'paper-import-scale-mode', className: 'ctrl-sel paper-import-input', 'aria-label': S.IMPORT_SCALE || 'Physical size' }, [
      el('option', { value: 'dpi', text: S.IMPORT_SCALE_DPI || 'Scan resolution (dpi)' }),
      el('option', { value: 'mm', text: S.IMPORT_SCALE_MM || 'Image width (mm)' }),
    ]);
    const scale = el('input', { type: 'number', id: 'paper-import-scale', className: 'paper-import-input paper-import-scale', min: String(C.dpiMin || 25), max: String(C.dpiMax || 4800), step: '1', inputmode: 'decimal', 'aria-label': S.IMPORT_SCALE || 'Physical size' });
    if (opts.tileMm > 0) {
      mode.value = 'mm';
      scale.value = String(opts.tileMm);
    } else {
      mode.value = 'dpi';
      scale.value = String(C.defaultDpi || 300);
    }
    mode.addEventListener('change', () => {
      if (mode.value === 'mm') { scale.min = String(C.tileMmMin); scale.max = String(C.tileMmMax); scale.value = String(opts.tileMm || 200); } else { scale.min = String(C.dpiMin || 25); scale.max = String(C.dpiMax || 4800); scale.value = String(C.defaultDpi || 300); }
    });
    const heightLabel = el('span', { className: 'paper-import-height-name', text: heightBlob ? (heightBlob.name || 'height map') : (S.IMPORT_HEIGHT_NONE || 'None') });
    const heightInput = el('input', { type: 'file', className: 'hidden', accept: C.ACCEPT, id: 'paper-import-height-file', tabindex: '-1', 'aria-label': S.IMPORT_HEIGHT || 'Height map' });
    const heightBtn = el('button', { type: 'button', className: 'paper-action-btn', id: 'paper-import-height-btn', text: S.IMPORT_HEIGHT_CHOOSE || 'Choose file…' });
    heightBtn.addEventListener('click', () => heightInput.click());
    heightInput.addEventListener('change', () => {
      const f = heightInput.files && heightInput.files[0];
      if (f) { heightBlob = f; heightLabel.textContent = f.name || 'height map'; }
    });
    const status = el('p', { className: 'paper-import-status', role: 'status', 'aria-live': 'polite' });
    const cancel = el('button', { type: 'button', className: 'hdr-btn', id: 'paper-import-cancel', text: S.IMPORT_CANCEL || 'Cancel' });
    const create = el('button', { type: 'button', className: 'add-btn', id: 'paper-import-create', text: S.IMPORT_CREATE || 'Create paper' });

    const body = el('div', { className: 'paper-import-dialog' }, [
      preview,
      el('label', { className: 'paper-import-label', for: 'paper-import-name', text: S.IMPORT_NAME || 'Name' }),
      nameInput,
      el('label', { className: 'paper-import-label', for: 'paper-import-scale', text: S.IMPORT_SCALE || 'Physical size' }),
      el('div', { className: 'paper-import-row' }, [mode, scale]),
      el('p', { className: 'paper-note', text: S.IMPORT_SCALE_HINT || '' }),
      el('span', { className: 'paper-import-label', text: S.IMPORT_HEIGHT || 'Height map (optional)' }),
      el('div', { className: 'paper-import-row' }, [heightLabel, heightBtn, heightInput]),
      sourceLine(opts.source),
      opts.scaleGuessed ? el('p', { className: 'paper-note', text: S.IMPORT_SCALE_GUESSED || '' }) : null,
      opts.source && /\bsa\b|sharealike/i.test(String(opts.source.licence || '')) ? el('p', { className: 'paper-note paper-import-sa', text: S.IMPORT_SHARE_ALIKE || '' }) : null,
      status,
      el('footer', { className: 'vectura-dialog-footer paper-import-footer' }, [cancel, create]),
    ]);

    let busy = false;
    let closed = false;
    const ctl = typeof G.AbortController === 'function' ? new G.AbortController() : null;
    const done = { promise: null };
    // Close only THIS dialog (another modal may be open by the time an async
    // step finishes).
    const close = () => {
      if (closed) return;
      const bodyEl = ui && ui.modal && ui.modal.bodyEl;
      if (bodyEl && !bodyEl.contains(body)) return;
      if (ui && typeof ui.closeModal === 'function') ui.closeModal();
    };
    // Esc / ✕ / Cancel while processing: abort, and never apply the paper later.
    const onClosed = () => {
      closed = true;
      if (ctl) ctl.abort();
    };
    cancel.addEventListener('click', () => close());
    create.addEventListener('click', () => {
      if (busy || !PI) return;
      const v = Number(scale.value);
      const scaleOpts = mode.value === 'mm' ? { tileMm: v } : { dpi: v };
      busy = true;
      create.disabled = true;
      status.textContent = fmt(S.IMPORT_WORKING, { pct: 0 });
      done.promise = PI.processImport(opts.blob, {
        ...scaleOpts,
        heightBlob,
        signal: ctl ? ctl.signal : undefined,
        onProgress: (p) => { status.textContent = fmt(S.IMPORT_WORKING, { pct: Math.round(p * 100) }); },
      }).then((res) => {
        if (closed) return false;
        return Promise.resolve(typeof opts.onCreate === 'function'
          ? opts.onCreate({ ...res, name: nameInput.value, source: opts.source || null })
          : true);
      }).then((ok) => {
        busy = false;
        if (ok !== false) close();
        else { create.disabled = false; status.textContent = ''; }
        return ok;
      }, (err) => {
        busy = false;
        create.disabled = false;
        if (closed || (err && err.reason === 'aborted')) return false;
        status.textContent = E[(err && err.reason) || 'decode'] || E.decode || 'That image could not be read.';
        status.classList.add('is-error');
        return false;
      });
    });

    ui.openModal({
      title: S.IMPORT_TITLE || 'New paper from an image',
      body,
      cardClass: 'paper-import-card',
      onClose: onClosed,
    });
    return done;
  }

  function openSearchSheet(ui, opts = {}) {
    const S = strings();
    const PTS = Vectura.PaperTextureSearch;
    const conf = Vectura.PAPER_TEXTURE_SOURCES || {};
    const providers = PTS ? PTS.providers() : [];
    const active = new Set(providers.filter((p) => PTS.isUsable(p)).map((p) => p.id));

    const input = el('input', { type: 'search', id: 'paper-search-query', className: 'paper-import-input paper-search-input', placeholder: S.SEARCH_PLACEHOLDER || 'Search', 'aria-label': S.SEARCH_TITLE || 'Search paper textures', maxlength: '80' });
    input.value = conf.DEFAULT_QUERY || 'paper';
    const go = el('button', { type: 'button', className: 'add-btn', id: 'paper-search-go', text: S.SEARCH_BTN || 'Search' });
    const chips = el('div', { className: 'paper-search-chips', role: 'group', 'aria-label': S.SEARCH_PROVIDERS || 'Collections' });
    const renderChips = () => {
      chips.textContent = '';
      providers.forEach((p) => {
        const usable = PTS.isUsable(p);
        const badge = p.needsKey && !usable ? (S.SEARCH_NEEDS_KEY || 'needs a key') : (p.licence || (p.licenceAllow ? 'CC0 · CC BY' : ''));
        const chip = el('button', {
          type: 'button', className: 'paper-search-chip', 'aria-pressed': active.has(p.id) ? 'true' : 'false', 'data-provider': p.id,
          title: p.verified || p.name, disabled: usable ? null : true,
        }, [el('span', { text: p.name }), badge ? el('span', { className: 'paper-licence-badge', text: badge }) : null]);
        chip.addEventListener('click', () => {
          if (active.has(p.id) && active.size > 1) active.delete(p.id); else active.add(p.id);
          chip.setAttribute('aria-pressed', active.has(p.id) ? 'true' : 'false');
          sheet.pending = run();
        });
        chips.appendChild(chip);
      });
    };
    renderChips();
    // Optional user keys (Pexels, Unsplash): stored in this browser only.
    const keyed = providers.filter((p) => p.needsKey);
    const keys = keyed.length ? el('details', { className: 'paper-search-keys' }, [
      el('summary', { className: 'paper-advanced-summary', text: S.SEARCH_KEYS || 'API keys (optional)' }),
      el('p', { className: 'paper-note', text: S.SEARCH_KEYS_HELP || '' }),
      ...keyed.map((p) => {
        const inp = el('input', { type: 'password', className: 'paper-import-input', autocomplete: 'off', 'aria-label': p.needsKey.label || p.name, placeholder: p.needsKey.label || p.name, 'data-key-provider': p.id });
        inp.value = PTS.getKey(p.id) || '';
        const msg = el('span', { className: 'paper-search-note', role: 'status' });
        const save = el('button', { type: 'button', className: 'paper-action-btn', text: S.SEARCH_KEY_SAVE || 'Save' });
        save.addEventListener('click', () => {
          const ok = PTS.setKey(p.id, inp.value);
          msg.textContent = ok ? (S.SEARCH_KEY_SAVED || 'Saved') : (S.SEARCH_KEY_BAD || 'Invalid key');
          if (ok) { if (inp.value.trim()) active.add(p.id); else active.delete(p.id); renderChips(); }
        });
        const link = p.needsKey.url && HTTPS_RE.test(p.needsKey.url)
          ? el('a', { href: p.needsKey.url, target: '_blank', rel: 'noopener noreferrer', text: p.name }) : null;
        return el('div', { className: 'paper-import-row' }, [inp, save, link, msg]);
      }),
    ]) : null;
    // Drop zone / file chooser: the manual path for any image (and the CORS fallback).
    const drop = el('button', { type: 'button', className: 'paper-search-drop', id: 'paper-search-drop', text: S.SEARCH_DROP || 'Drop an image here' });
    drop.addEventListener('click', () => { if (typeof opts.onUpload === 'function') opts.onUpload(null); });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && typeof opts.onFile === 'function') opts.onFile(f, null);
    });
    const credits = el('p', { className: 'paper-note paper-search-credits' });
    const status = el('p', { className: 'paper-search-status', role: 'status', 'aria-live': 'polite' });
    const grid = el('div', { className: 'paper-search-grid', role: 'list' });
    const body = el('div', { className: 'paper-search-sheet' }, [
      el('div', { className: 'paper-import-row' }, [input, go]),
      chips,
      keys,
      status,
      grid,
      drop,
      credits,
      el('p', { className: 'paper-note', text: S.SEARCH_LICENCE_NOTE || '' }),
    ]);
    const renderCredits = (ids) => {
      credits.textContent = '';
      providers.filter((p) => ids.has(p.id) && p.credit && HTTPS_RE.test(p.credit.url || '')).forEach((p, i) => {
        if (i) credits.appendChild(document.createTextNode(' · '));
        credits.appendChild(el('a', { href: p.credit.url, target: '_blank', rel: 'noopener noreferrer', text: p.credit.text }));
      });
    };

    let seq = 0;
    let ctl = null;
    const sourceOf = (r) => ({
      provider: r.providerName, providerId: r.provider, assetId: r.id, title: r.title, author: r.author,
      licence: r.licence, licenceUrl: r.licenceUrl, url: r.sourceUrl || undefined, attribution: r.attribution,
    });

    const card = (r) => {
      const thumb = el('img', { className: 'paper-search-thumb', src: r.thumbUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      const use = el('button', { type: 'button', className: 'paper-action-btn paper-search-use', text: S.SEARCH_USE || 'Use', 'aria-label': `${S.SEARCH_USE || 'Use'} ${r.title}` });
      const note = el('p', { className: 'paper-search-note', role: 'status' });
      const actions = el('div', { className: 'paper-search-actions' }, [use]);
      const hires = r.hires && PTS.canUnzip && PTS.canUnzip()
        ? el('button', { type: 'button', className: 'paper-action-btn paper-search-hires', text: S.SEARCH_HIRES || 'High-res (ZIP)', 'aria-label': `${S.SEARCH_HIRES || 'High-res (ZIP)'} ${r.title}` })
        : null;
      if (hires) actions.appendChild(hires);
      const item = el('div', { className: 'paper-search-card', role: 'listitem', 'data-result': `${r.provider}:${r.id}` }, [
        thumb,
        el('span', { className: 'paper-search-title', text: r.title }),
        el('span', { className: 'paper-search-meta' }, [
          r.licenceUrl && HTTP_RE.test(r.licenceUrl)
            ? el('a', { className: 'paper-licence-badge', href: r.licenceUrl, target: '_blank', rel: 'noopener noreferrer', text: r.licence })
            : el('span', { className: 'paper-licence-badge', text: r.licence }),
          r.direct ? el('span', { className: 'paper-direct-badge', title: S.SEARCH_DIRECT_TITLE || '', text: ` ${S.SEARCH_DIRECT || 'Direct'}` }) : null,
          el('span', { text: ` ${r.providerName}` }),
          r.scaleGuessed ? null : el('span', { text: ` · ${Math.round(r.physicalMm)} mm` }),
        ]),
        actions,
        note,
      ]);
      const fetchAndUse = async (dlOpts) => {
        use.disabled = true;
        if (hires) hires.disabled = true;
        note.textContent = S.SEARCH_DOWNLOADING || 'Downloading…';
        const res = await PTS.download(r, dlOpts);
        if (res.ok) {
          note.textContent = res.via === 'proxy' ? (S.SEARCH_PROXY_NOTE || '') : '';
          if (typeof opts.onPicked === 'function') {
            opts.onPicked({ blob: res.albedo, heightBlob: res.height || null, name: r.title, source: sourceOf(r), tileMm: r.physicalMm || 0, scaleGuessed: Boolean(r.scaleGuessed) });
          }
          return res;
        }
        use.disabled = false;
        if (hires) hires.disabled = false;
        note.textContent = res.reason === 'cors' ? (S.SEARCH_BLOCKED || '') : fmt(S.SEARCH_FAILED, { reason: res.reason });
        if (!actions.querySelector('.paper-search-fallback')) {
          if (r.sourceUrl && HTTPS_RE.test(r.sourceUrl)) {
            actions.appendChild(el('a', { className: 'paper-action-btn paper-search-fallback', href: r.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: S.SEARCH_OPEN_SOURCE || 'Open source page' }));
          }
          const up = el('button', { type: 'button', className: 'paper-action-btn paper-search-fallback paper-search-upload', text: S.SEARCH_UPLOAD || 'Upload the file' });
          up.addEventListener('click', () => { if (typeof opts.onUpload === 'function') opts.onUpload(sourceOf(r), r); });
          actions.appendChild(up);
        }
        return res;
      };
      use.addEventListener('click', () => { item.pending = fetchAndUse({}); });
      if (hires) hires.addEventListener('click', () => { item.pending = fetchAndUse({ hires: true }); });
      return item;
    };

    const run = async () => {
      if (!PTS) return null;
      seq += 1;
      const mine = seq;
      if (ctl && ctl.abort) ctl.abort();
      ctl = typeof G.AbortController === 'function' ? new G.AbortController() : null;
      status.textContent = S.SEARCH_LOADING || 'Searching…';
      grid.textContent = '';
      let out = await PTS.search(input.value, { providers: Array.from(active), signal: ctl ? ctl.signal : undefined });
      if (mine !== seq) return out;
      grid.textContent = '';
      out.results.forEach((r) => grid.appendChild(card(r)));
      renderCredits(new Set(out.results.map((r) => r.provider)));
      const parts = [];
      parts.push(out.results.length ? fmt(S.SEARCH_COUNT, { count: out.results.length }) : fmt(S.SEARCH_EMPTY, { query: out.query }));
      // The curated bundle is simply absent unless a maintainer fetched it.
      if (out.absent && out.absent.length) {
        out.absent.forEach((id) => {
          const chip = chips.querySelector(`[data-provider="${id}"]`);
          if (chip) chip.hidden = true;
        });
      }
      const limited = out.errors.filter((e) => e.reason === 'rate-limited');
      if (limited.length) {
        const names = limited.map((e) => (providers.find((p) => p.id === e.provider) || {}).name || e.provider);
        parts.push(fmt(S.SEARCH_RATE_LIMITED, { providers: names.join(', ') }));
        out = { ...out, errors: out.errors.filter((e) => e.reason !== 'rate-limited') };
      }
      if (out.errors.length) {
        const names = out.errors.map((e) => (providers.find((p) => p.id === e.provider) || {}).name || e.provider);
        parts.push(fmt(S.SEARCH_ERRORS, { providers: names.join(', ') }));
      }
      status.textContent = parts.join(' · ');
      return out;
    };
    go.addEventListener('click', () => { sheet.pending = run(); });
    // (sheet is assigned below, before any event can fire)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sheet.pending = run(); } });

    const sheet = { pending: null, run: () => (sheet.pending = run()) };
    ui.openModal({ title: S.SEARCH_TITLE || 'Search paper textures', body, cardClass: 'paper-search-card-modal' });
    sheet.pending = run();
    return sheet;
  }

  UI.PaperTextureImport = { openImportDialog, openSearchSheet };
})();
