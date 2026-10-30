/**
 * Start Page color controls — window.Vectura.UI.StartPageColorControls. Sits directly under the cover.
 *   Curated · Mono · Basic · Wildcard (a radiogroup), Randomize (dice, seeded; shows the seed; "random" mode),
 *   a swatch strip of the colorways on the page (+N) and the ownership note.
 * Page mode = a seed (random) or else the saved colorMode. The caller owns state; this renders and reports.
 *   create({ host, mode(), seed(), previewSeed(), swatches(), onMode(m), onRandom() }) -> { sync, el }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const LABELS = { curated: 'Curated', mono: 'Mono', basic: 'Basic', wildcard: 'Wildcard', random: 'Random' };
  const NOTES = {
    curated: 'Your plate edits live in Curated.',
    mono: 'Mono: theme colors for every plate · your edits return in Curated.',
    basic: 'Basic: theme paper, ink-only color · your edits return in Curated.',
    wildcard: 'Wildcard: saturated stocks · your edits return in Curated.',
    random: 'Random: a new run from the seed · your edits return in Curated.',
  };
  const MAX_SWATCHES = 6;

  const create = ({ host, mode, seed, previewSeed, swatches, onMode, onRandom }) => {
    const { h } = Vectura.StartPageDom;
    const modes = ['curated', 'mono', 'basic', 'wildcard'];
    const root = h('div', { class: 'sp-ctl-row', id: 'sp-ctl', role: 'group', 'aria-label': 'Page colorway' });
    const seg = h('div', { class: 'sp-seg', role: 'radiogroup', 'aria-label': 'Colorway mode' },
      modes.map((m) => h('button', { type: 'button', role: 'radio', 'data-sp-mode': m, text: LABELS[m] })));
    const dice = h('button', { type: 'button', id: 'sp-dice', class: 'sp-dice', title: 'Randomize colorways' },
      h('span', { class: 'sp-dice-ico', html: Vectura.StartPageIcons.dice }), h('span', { class: 'sp-seed', 'aria-hidden': 'true' }), h('span', { class: 'sp-sr', 'data-live-dice': '' }));
    const sw = h('span', { class: 'sp-sw', 'aria-hidden': 'true' });
    const note = h('span', { class: 'sp-own-note' });
    const live = h('span', { class: 'sp-sr', 'aria-live': 'polite' });
    root.append(h('span', { class: 'sp-ctl-lbl', text: 'Colorway · whole page' }), seg, dice, sw, note, live);
    host.append(root);

    const btns = [...seg.querySelectorAll('[data-sp-mode]')];
    btns.forEach((b, i) => {
      b.addEventListener('click', () => onMode(b.dataset.spMode));
      b.addEventListener('keydown', (e) => {
        let j = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % btns.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + btns.length) % btns.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = btns.length - 1;
        if (j >= 0) { e.preventDefault(); btns[j].focus(); onMode(btns[j].dataset.spMode); }
      });
    });
    dice.addEventListener('click', () => {
      onRandom();
      const ico = dice.querySelector('.sp-dice-ico');
      ico.classList.remove('sp-roll'); void ico.offsetWidth; ico.classList.add('sp-roll');
    });

    const sync = () => {
      const m = mode();
      const sd = seed();
      const random = m === 'random';
      const any = btns.some((b) => b.dataset.spMode === m);
      btns.forEach((b, i) => {
        const on = b.dataset.spMode === m;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on || (!any && i === 0) ? 0 : -1;
      });
      dice.querySelector('.sp-seed').textContent = sd || previewSeed();
      dice.classList.toggle('is-random', random);
      dice.querySelector('[data-live-dice]').textContent = random ? `Randomize again, current seed ${String(sd).split('').join(' ')}` : 'Randomize colorways';
      note.textContent = NOTES[m] || NOTES.curated;
      live.textContent = random ? `Random colorways, seed ${sd}` : `${LABELS[m] || m} colorways`;
      const list = swatches() || [];
      sw.textContent = '';
      list.slice(0, MAX_SWATCHES).forEach((cw) => {
        const i = h('i', { title: `${cw.penName || 'Ink'} on ${cw.paperName || 'paper'}` });
        i.style.setProperty('--p', cw.paper); i.style.setProperty('--i', cw.ink); i.style.setProperty('--i2', cw.ink2 || cw.ink);
        sw.append(i);
      });
      if (list.length > MAX_SWATCHES) sw.append(h('b', { text: `+${list.length - MAX_SWATCHES}` }));
      sw.title = list.map((cw) => `${cw.penName || 'Ink'} on ${cw.paperName || 'paper'}`).join('\n');
    };
    sync();
    return { sync, el: root };
  };

  UI.StartPageColorControls = { create, LABELS, NOTES };
})();
