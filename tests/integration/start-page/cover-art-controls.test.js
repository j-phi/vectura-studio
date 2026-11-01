/**
 * Start Page cover art controls (cover-art-controls.js): per-slot piece select + colorway swatches for every cover style,
 * the Reset button, keyboard, cheap idempotent sync, and the settings.js host + onSync wiring.
 */
const { make, nextTick } = require('../../helpers/start-page-picks-env');

const cwOf = (n, extra = {}) => ({ key: `cw${n}`, paper: `#fff${n}`, ink: `#00${n}`, ink2: null, penName: `Pen ${n}`, paperName: `Paper ${n}`, ...extra });
const ARTS = [
  { id: 'work:w1', kind: 'work', name: 'My Work.vectura', algorithm: 'Rings' },
  { id: 'pick:p1', kind: 'pick', name: 'Pick One', algorithm: 'Terrain' },
  { id: 'pick:p2', kind: 'pick', name: 'Pick Two', algorithm: 'Topo' },
];

const boot = () => {
  const env = make();
  env.load('src/ui/start-page/dom.js');
  env.load('src/ui/start-page/cover-art-controls.js');
  const V = env.W.Vectura;
  const host = env.D.getElementById('root');
  return { ...env, V, host };
};

const rig = (style, slots, o = {}) => {
  const b = boot();
  const state = { style, slots, arts: ARTS };
  const calls = { art: [], color: [], reset: [] };
  const opts = {
    page: cwOf(0),
    ...o,
  };
  const ctl = b.V.UI.StartPageCoverArtControls.create({
    host: b.host,
    style: () => state.style,
    slots: () => state.slots,
    arts: () => Promise.resolve(state.arts),
    colorOptions: () => [{ id: 'page', label: 'Page colorway', cw: opts.page }, { id: 'alt1', label: 'Alt one', cw: cwOf(1) }, { id: 'alt2', label: 'Alt two', cw: cwOf(2) }],
    onArt: (...a) => calls.art.push(a),
    onColor: (...a) => calls.color.push(a),
    onReset: (...a) => calls.reset.push(a),
  });
  return { ...b, ctl, state, calls };
};

const slot = (k, ch, extra = {}) => ({ k, ch, art: ARTS[1], cw: cwOf(0), chosenId: '', chosenCw: null, ...extra });
const flush = async (ctl) => { ctl.sync(); await nextTick(); ctl.sync(); };

describe('StartPageCoverArtControls', () => {
  it('mosaic: one row per letter, a piece select with Automatic + grouped options, and a colorway radiogroup', async () => {
    const { ctl, host } = rig('mosaic', [slot(0, 'V'), slot(1, 'E')]);
    await flush(ctl);
    expect(host.querySelector('.sp-cvart-help').textContent).toBe('Pick a piece and a colorway for each letter.');
    const rows = host.querySelectorAll('.sp-cvart-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.sp-cvart-label').textContent).toBe('Letter 1 · V');
    const sel = rows[0].querySelector('select[data-cover-art-k="0"]');
    expect(sel.getAttribute('aria-label')).toBe('Piece for letter 1, V');
    expect(sel.options[0].value).toBe('');
    expect(sel.options[0].textContent).toBe('Automatic');
    const groups = [...sel.querySelectorAll('optgroup')];
    expect(groups.map((g) => g.label)).toEqual(['Your pieces', 'Templates']);
    expect([...groups[0].children].map((o) => o.textContent)).toEqual(['My Work']);
    expect([...groups[1].children].map((o) => o.value)).toEqual(['pick:p1', 'pick:p2']);
    const rg = rows[0].querySelector('[role="radiogroup"]');
    expect(rg.getAttribute('aria-label')).toBe('Colorway for letter 1, V');
    const sws = rg.querySelectorAll('[role="radio"]');
    expect([...sws].map((s) => s.dataset.cwId)).toEqual(['page', 'alt1', 'alt2']);
    expect(sws[0].getAttribute('aria-checked')).toBe('true');
    expect(sws[0].tabIndex).toBe(0);
    expect(sws[1].tabIndex).toBe(-1);
    expect(sws[1].title).toBe('Alt one');
  });

  it('word and band: a single "Piece" row with their own help line and names', async () => {
    for (const [style, help] of [['word', 'The piece that fills the cover word, and its colorway.'], ['band', 'The piece in the band, and its colorway.']]) {
      const { ctl, host } = rig(style, [slot(0, '')]);
      await flush(ctl);
      expect(host.querySelector('.sp-cvart-help').textContent).toBe(help);
      expect(host.querySelectorAll('.sp-cvart-row')).toHaveLength(1);
      expect(host.querySelector('.sp-cvart-label').textContent).toBe('Piece');
      expect(host.querySelector('select').getAttribute('aria-label')).toBe('Cover piece');
      expect(host.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('Cover colorway');
    }
  });

  it('changing the select reports onArt(style, k, id); Automatic reports an empty id', async () => {
    const { ctl, host, calls, W } = rig('mosaic', [slot(0, 'V'), slot(1, 'E', { chosenId: 'pick:p2' })]);
    await flush(ctl);
    const sels = host.querySelectorAll('select');
    expect(sels[1].value).toBe('pick:p2');
    sels[0].value = 'work:w1'; sels[0].dispatchEvent(new W.Event('change', { bubbles: true }));
    sels[1].value = ''; sels[1].dispatchEvent(new W.Event('change', { bubbles: true }));
    expect(calls.art).toEqual([['mosaic', 0, 'work:w1'], ['mosaic', 1, '']]);
  });

  it('clicking a swatch reports onColor with its cw, and null for the page option', async () => {
    const { ctl, host, calls, state } = rig('word', [slot(0, '')]);
    await flush(ctl);
    const sws = () => host.querySelectorAll('[role="radio"]');
    sws()[2].click();
    expect(calls.color).toEqual([['word', 0, cwOf(2)]]);
    state.slots = [slot(0, '', { chosenCw: cwOf(2) })];
    ctl.sync();
    expect([...sws()].map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(sws()[2].tabIndex).toBe(0);
    sws()[0].click();
    expect(calls.color[1]).toEqual(['word', 0, null]);
  });

  it('arrow keys move focus and select, wrap around, and do not reach the popover handler', async () => {
    const { ctl, host, calls, W, D } = rig('band', [slot(0, '')]);
    await flush(ctl);
    let leaked = 0;
    host.addEventListener('keydown', () => { leaked += 1; });
    const sws = host.querySelectorAll('[role="radio"]');
    sws[0].focus();
    sws[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(D.activeElement).toBe(sws[1]);
    expect(calls.color.at(-1)).toEqual(['band', 0, cwOf(1)]);
    sws[1].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(D.activeElement).toBe(sws[0]);
    expect(calls.color.at(-1)).toEqual(['band', 0, null]);
    sws[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(D.activeElement).toBe(sws[2]);
    expect(leaked).toBe(0);
  });

  it('Reset is disabled with no choices, enabled with one, and reports onReset(style)', async () => {
    const { ctl, host, calls, state } = rig('mosaic', [slot(0, 'V')]);
    await flush(ctl);
    const btn = () => host.querySelector('[data-act="reset-cover-art"]');
    expect(btn().textContent).toBe('Reset cover art');
    expect(btn().disabled).toBe(true);
    state.slots = [slot(0, 'V', { chosenId: 'pick:p1' })];
    ctl.sync();
    expect(btn().disabled).toBe(false);
    btn().click();
    expect(calls.reset).toEqual([['mosaic']]);
    state.slots = [slot(0, 'V', { chosenCw: cwOf(1) })];
    ctl.sync();
    expect(btn().disabled).toBe(false);
  });

  it('shows the empty message and no rows when there are no slots', async () => {
    const { ctl, host } = rig('mosaic', []);
    await flush(ctl);
    expect(host.querySelector('.sp-cvart-empty').textContent).toBe('Save or open a piece and it can go on the cover.');
    expect(host.querySelectorAll('.sp-cvart-row')).toHaveLength(0);
  });

  it('sync is idempotent: rows are kept when nothing structural changes, and only values update', async () => {
    const { ctl, host, state } = rig('mosaic', [slot(0, 'V'), slot(1, 'E')]);
    await flush(ctl);
    const row = host.querySelector('.sp-cvart-row');
    const sel = row.querySelector('select');
    ctl.sync(); ctl.sync();
    expect(host.querySelector('.sp-cvart-row')).toBe(row);
    state.slots = [slot(0, 'V', { chosenId: 'pick:p2' }), slot(1, 'E')];
    ctl.sync();
    expect(host.querySelector('.sp-cvart-row select')).toBe(sel);
    expect(sel.value).toBe('pick:p2');
    state.slots = [slot(0, 'V'), slot(1, 'E'), slot(2, 'R')];
    ctl.sync();
    expect(host.querySelectorAll('.sp-cvart-row')).toHaveLength(3);
  });

  it('keeps focus on the swatch in use when the rows rebuild', async () => {
    const { ctl, host, state, D } = rig('mosaic', [slot(0, 'V'), slot(1, 'E')]);
    await flush(ctl);
    host.querySelectorAll('[role="radio"]')[1].focus();
    state.slots = [slot(0, 'V'), slot(1, 'E'), slot(2, 'R')];
    ctl.sync();
    expect(D.activeElement.dataset.cwId).toBe('alt1');
    expect(D.activeElement.closest('.sp-cvart-row').querySelector('select').dataset.coverArtK).toBe('0');
  });

  it('falls back to matching paper+ink when the chosen colorway key is not offered', async () => {
    const { ctl, host } = rig('word', [slot(0, '', { chosenCw: { key: 'other', paper: '#fff1', ink: '#001', ink2: null } })]);
    await flush(ctl);
    expect(host.querySelector('[role="radio"][aria-checked="true"]').dataset.cwId).toBe('alt1');
  });
});

describe('Settings popover: Cover art host', () => {
  it('exposes coverArtHost inside the Cover section and calls onSync at the end of sync()', () => {
    const env = make();
    env.load('src/ui/start-page/dom.js');
    env.load('src/ui/start-page/icons.js');
    env.load('src/core/start-page/cover-words.js');
    env.load('src/ui/start-page/settings.js');
    const { W, D } = env;
    W.Vectura.StartPageDrawStyles = { LABELS: {} };
    const root = D.getElementById('root');
    const button = D.createElement('button'); root.appendChild(button);
    let synced = 0;
    const ctl = W.Vectura.UI.StartPageSettings.create({
      root, button, prefs: () => ({ coverStyle: 'mosaic' }), onStyle() {}, onToggle() {}, onSync: () => { synced += 1; },
    });
    expect(ctl.coverArtHost).toBeTruthy();
    expect(ctl.coverArtHost.classList.contains('sp-set-coverart')).toBe(true);
    expect(ctl.coverArtHost.dataset.slot).toBe('cover-art');
    expect(ctl.coverArtHost.closest('[data-slot="cover"]')).toBeTruthy();
    expect(D.getElementById('sp-set-art-l').textContent).toBe('Cover art');
    const before = synced;
    ctl.sync();
    expect(synced).toBe(before + 1);
  });
});
