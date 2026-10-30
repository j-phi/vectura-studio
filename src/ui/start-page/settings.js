/**
 * Start Page settings popover — window.Vectura.UI.StartPageSettings (gear in the header).
 * Sections (P1): Cover style · Under the cover (Show name, Show practice line) · Launch (Show Start Page on launch).
 * P3 sections: "Art animates in" (startPage.animateIn, with a Preview that replays the cover) and "Hover effect" (startPage.hover).
 * Keyboard: the gear toggles it (aria-expanded), the style rows are a radiogroup (arrows), Esc closes and focus
 * returns to the gear, a click outside or focus leaving closes it.
 *   create({ root, button, prefs(), onStyle(k), onToggle(key, on), onPref(key, value), onPreview() }) -> { open, close, toggle, sync, isOpen, el }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const STYLES = [
    { id: 'mosaic', name: 'Name in Ink', note: 'Default', desc: 'Each letter carries a different piece. Hover a letter for its label.',
      svg: '<svg viewBox="0 0 62 40" aria-hidden="true"><rect x="5" y="9" width="11" height="22" rx="1" fill="#d2a77c"/><rect x="18" y="15" width="11" height="16" rx="1" fill="#97aefc"/><rect x="31" y="15" width="11" height="16" rx="1" fill="#ff8f6e"/><rect x="44" y="9" width="7" height="22" rx="1" fill="#9fcf8f"/><path d="M5 35h47" stroke="currentColor" opacity=".4"/></svg>' },
    { id: 'word', name: 'Cover Specimen', desc: 'One piece fills the whole word. Plates can hand it a new piece.',
      svg: '<svg viewBox="0 0 62 40" aria-hidden="true"><text x="4" y="29" font-size="24" font-weight="700" font-family="Space Grotesk, sans-serif" letter-spacing="-1.5" fill="#e9dcc0">Word</text><path d="M4 18c10-6 20 6 30 0s16-4 24 2M4 24c12-5 22 5 32 0s14-3 22 1" stroke="#b5532d" fill="none" stroke-width=".8"/></svg>' },
    { id: 'band', name: 'Portfolio band', desc: 'A wide band of one piece. 3D pieces turn when you drag them.',
      svg: '<svg viewBox="0 0 62 40" aria-hidden="true"><rect x="0" y="6" width="62" height="28" fill="#121214"/><path d="M26 28l6-7 4 3 6-9 5 6 4-3 7 10" stroke="#e6f1ff" fill="none" stroke-width=".9"/><path d="M26 31l7-5 5 2 6-5 6 4 8-2" stroke="#e6f1ff" fill="none" stroke-width=".6" opacity=".6"/><path d="M5 26h14" stroke="#e6f1ff" stroke-width="2"/><path d="M5 30h9" stroke="#e6f1ff" opacity=".5"/></svg>' },
  ];

  // Page defaults for the art motion. Values are the startPage enum ids; labels are the owner's US wording.
  const ANIMATE_IN = [['plot', 'Plot'], ['sweep', 'Sweep'], ['fade-up', 'Fade up'], ['ink-bleed', 'Ink bleed'], ['stroke-cascade', 'Stroke cascade'],
    ['scan-lines', 'Scan lines'], ['iris', 'Iris'], ['none', 'None']];
  const HOVER = [['default', 'Default'], ['none', 'None'], ['retrigger', 'Re-trigger animation'], ['lift', 'Lift & tilt'], ['glare', 'Glare sweep'],
    ['replot', 'Re-plot'], ['holo', 'Hologram Foil'], ['ripple', 'Pressure Ripple'], ['stipple', 'Stipple Weather'], ['breeze', 'Paper Breeze'],
    ['gravity', 'Gravity Well'], ['current', 'Light Current']];

  const create = ({ root, button, prefs, onStyle, onToggle, onPref, onPreview }) => {
    const { h } = Vectura.StartPageDom;
    const isMac = () => /mac|iphone|ipad|ipod/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase());
    const mod = () => (isMac() ? '⌘' : 'Ctrl+');
    let isOpen = false;

    const sw = (key, label) => h('div', { class: 'sp-set-row' },
      h('span', { class: 'sp-set-label', id: `sp-set-${key}-l`, text: label }),
      h('button', { type: 'button', role: 'switch', class: 'sp-switch', 'data-set': key, 'aria-labelledby': `sp-set-${key}-l`, 'aria-checked': 'false' }, h('span', { class: 'sp-switch-knob' })));

    const pop = h('div', { id: 'sp-settings', class: 'sp-settings', role: 'dialog', 'aria-labelledby': 'sp-settings-h', hidden: true },
      h('h2', { id: 'sp-settings-h', text: 'Start Page settings' }),
      h('div', { class: 'sp-set-sub', text: 'Saved on this device' }),
      h('section', { class: 'sp-set-sec' },
        h('span', { class: 'sp-micro', id: 'sp-set-cover-l', text: 'Cover style' }),
        h('div', { class: 'sp-styles', role: 'radiogroup', 'aria-labelledby': 'sp-set-cover-l' },
          STYLES.map((s) => h('button', { type: 'button', role: 'radio', class: 'sp-style', 'data-style': s.id, 'aria-checked': 'false', tabindex: '-1' },
            h('span', { class: 'sp-style-art', html: s.svg }),
            h('span', { class: 'sp-style-tx' }, h('b', {}, s.name, s.note ? h('em', { text: s.note }) : null), h('span', { text: s.desc })))))),
      h('section', { class: 'sp-set-sec' },
        h('span', { class: 'sp-micro', text: 'Under the cover' }),
        sw('showName', 'Show name'), sw('showLine', 'Show practice line'),
        h('p', { class: 'sp-set-help', text: 'Your studio name and a line about your practice, saved on this device. Click either on the cover to edit it.' })),
      h('section', { class: 'sp-set-sec sp-slot', 'data-slot': 'animate-in' },
        h('span', { class: 'sp-micro', id: 'sp-set-anim-l', text: 'Art animates in' }),
        h('div', { class: 'sp-set-pick' },
          h('select', { class: 'sp-set-select', 'data-pref': 'animateIn', 'aria-labelledby': 'sp-set-anim-l' },
            ANIMATE_IN.map(([v, n]) => h('option', { value: v, text: n }))),
          h('button', { type: 'button', class: 'sp-set-btn', 'data-act': 'preview-animate', text: 'Preview', title: 'Replay the cover with this style' })),
        h('p', { class: 'sp-set-help', text: 'The page default. A plate can set its own in its editor.' })),
      h('section', { class: 'sp-set-sec sp-slot', 'data-slot': 'hover' },
        h('span', { class: 'sp-micro', id: 'sp-set-hover-l', text: 'Hover effect' }),
        h('div', { class: 'sp-set-pick' },
          h('select', { class: 'sp-set-select', 'data-pref': 'hover', 'aria-labelledby': 'sp-set-hover-l' },
            HOVER.map(([v, n]) => h('option', { value: v, text: n })))),
        h('p', { class: 'sp-set-help', text: 'Default: plates draw themselves in again, cards lift and tilt. Effects only touch the art, never the text. Off while animations are paused.' })),
      h('section', { class: 'sp-set-sec' },
        h('span', { class: 'sp-micro', text: 'Launch' }),
        sw('showOnLaunch', 'Show Start Page on launch'),
        h('p', { class: 'sp-set-help', text: `Also in File → Document Setup (${mod()}K) → History & Preferences.` })));
    root.append(pop);

    const radios = () => [...pop.querySelectorAll('.sp-style')];
    const sync = () => {
      const p = prefs();
      radios().forEach((r) => { const on = r.dataset.style === p.coverStyle; r.setAttribute('aria-checked', String(on)); r.tabIndex = on ? 0 : -1; });
      pop.querySelectorAll('select[data-pref]').forEach((sel) => {
        const want = p[sel.dataset.pref];
        if (want != null && [...sel.options].some((o) => o.value === want)) sel.value = want;
      });
      pop.querySelectorAll('[data-set]').forEach((b) => {
        const k = b.dataset.set;
        const on = k === 'showOnLaunch' ? p.showOnLaunch !== false : p[k] === true;
        b.setAttribute('aria-checked', String(on));
      });
    };

    const close = (refocus = true) => {
      if (!isOpen) return;
      isOpen = false;
      pop.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (refocus) button.focus();
    };
    const open = () => {
      sync();
      isOpen = true;
      pop.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      (pop.querySelector('.sp-style[aria-checked="true"]') || pop.querySelector('.sp-style'))?.focus();
    };

    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'sp-settings');
    button.addEventListener('click', () => (isOpen ? close(true) : open()));

    pop.addEventListener('click', (e) => {
      const st = e.target.closest && e.target.closest('.sp-style');
      if (st) { onStyle(st.dataset.style); sync(); return; }
      const tg = e.target.closest && e.target.closest('[data-set]');
      if (tg) { onToggle(tg.dataset.set, tg.getAttribute('aria-checked') !== 'true'); sync(); }
    });
    pop.addEventListener('change', (e) => {
      const sel = e.target && e.target.closest && e.target.closest('select[data-pref]');
      if (sel && typeof onPref === 'function') onPref(sel.dataset.pref, sel.value);
    });
    pop.addEventListener('click', (e) => {
      const pv = e.target.closest && e.target.closest('[data-act="preview-animate"]');
      if (pv && typeof onPreview === 'function') onPreview();
    });
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (e.target && e.target.closest && e.target.closest('select')) return; // the selects own their arrow keys
      const r = radios();
      const i = r.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % r.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + r.length) % r.length;
      if (j >= 0) { e.preventDefault(); r[j].focus(); onStyle(r[j].dataset.style); sync(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (isOpen && !pop.contains(e.target) && !button.contains(e.target)) close(false);
    }, true);
    pop.addEventListener('focusout', (e) => {
      if (isOpen && e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== button) close(false);
    });

    sync();
    return { open, close, toggle: () => (isOpen ? close(true) : open()), sync, isOpen: () => isOpen, el: pop };
  };

  UI.StartPageSettings = { create, STYLES, ANIMATE_IN, HOVER };
})();
