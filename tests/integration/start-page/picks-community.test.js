/**
 * Start Page Studio picks (picks-section.js) and Community (community.js): rendering, lazy mount, Open /
 * Open as template in exactly the colors shown, recolor, notify persistence, keyboard access.
 */
const { make, SVG, stubInk, nextTick } = require('../../helpers/start-page-picks-env');

const arts = (n = 3) => Array.from({ length: n }, (_, i) => ({
  id: `pick:p${i}`, kind: 'pick', name: `Pick ${i + 1}`, algorithm: ['rings', 'terrain', 'topo'][i % 3], collection: ['Botanicals', 'Studies', 'Studies'][i % 3],
  presetId: `p${i}`, getSvg: async () => SVG,
}));
const work = { id: 'work:w1', kind: 'work', name: 'My Work', algorithm: 'Rings', collection: 'Studies', recentId: 'w1', getSvg: async () => SVG };

const boot = (o = {}) => {
  const env = make(o);
  env.load('src/ui/start-page/dom.js');
  env.load('src/ui/start-page/lift-card.js');
  env.load('src/ui/start-page/picks-section.js');
  env.load('src/ui/start-page/community.js');
  const ink = stubInk(env.W, o);
  return { ...env, ink, V: env.W.Vectura, root: env.D.getElementById('root') };
};
const cw = (n) => ({ key: `cw${n}`, paper: '#fff', ink: `#00${n}`, ink2: null });
const click = (W, el) => el.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true }));

describe('StartPagePicksSection', () => {
  it('renders the heading, anchor id, and one liftable card per pick with name, algorithm, collection and two actions', async () => {
    const { V, root, W } = boot();
    const calls = [];
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => [work, ...arts(3)] }, colorwayFor: (a, i) => cw(i), openArt: (...a) => calls.push(a) });
    await ctl.render();
    expect(root.id).toBe('sp-picks');
    expect(root.querySelector('h2').textContent).toBe('Studio picks');
    const cards = root.querySelectorAll('.sp-pick');
    expect(cards).toHaveLength(3); // works are not picks
    expect(cards[0].querySelector('h3').textContent).toBe('Pick 1');
    expect(cards[0].querySelector('.sp-pick-meta').textContent).toMatch(/rings/i);
    expect(cards[0].querySelector('.sp-pick-meta').textContent).toContain('Botanicals');
    expect(cards[0].querySelector('.sp-lift-in')).toBeTruthy(); // liftable
    const labels = [...cards[0].querySelectorAll('.sp-pick-acts button')].map((b) => b.textContent.trim());
    expect(labels).toEqual(['Open', 'Open as template']);
    expect(W).toBeTruthy();
  });

  it('mounts each pick through StartPageInk in its resolved colorway', async () => {
    const { V, root, ink } = boot();
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(3) }, colorwayFor: (a, i) => cw(i), openArt() {} });
    await ctl.render(); await nextTick(10);
    expect(ink.mount.map((m) => m.o.colorway.key)).toEqual(['cw0', 'cw1', 'cw2']);
    expect(ink.mount[0].art.svg).toContain('<svg');
  });

  it('lazy-mounts: nothing mounts until a card nears the viewport', async () => {
    const { V, root, ink, ios } = boot({ io: true });
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(3) }, colorwayFor: (a, i) => cw(i), openArt() {} });
    await ctl.render(); await nextTick(10);
    expect(ink.mount).toHaveLength(0);
    ios.reveal(root.querySelectorAll('.sp-pick-art')[1]); await nextTick(10);
    expect(ink.mount).toHaveLength(1);
    expect(ink.mount[0].art.id).toBe('pick:p1');
  });

  it('Open and Open as template call openArt with the card colorway; the card itself opens too', async () => {
    const { V, root, W } = boot();
    const calls = [];
    const list = arts(2);
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => list }, colorwayFor: (a, i) => cw(i + 5), openArt: (...a) => calls.push(a) });
    await ctl.render(); await nextTick(10);
    const card = root.querySelectorAll('.sp-pick')[1];
    const [open, tpl] = card.querySelectorAll('.sp-pick-acts button');
    click(W, open);
    click(W, tpl);
    click(W, card.querySelector('button.sp-lift'));
    expect(calls).toHaveLength(3);
    calls.forEach(([art, colorway]) => { expect(art.id).toBe('pick:p1'); expect(colorway.key).toBe('cw6'); });
    expect(calls[0][2].asTemplate).toBe(false);
    expect(calls[1][2].asTemplate).toBe(true);
    expect(calls[2][2].asTemplate).toBe(false);
  });

  it('recolor() re-resolves every colorway, repaints mounted tiles, and Open uses the new colors', async () => {
    const { V, root, W, ink } = boot();
    let gen = 0; const calls = [];
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(2) }, colorwayFor: (a, i) => cw(gen * 10 + i), openArt: (...a) => calls.push(a) });
    await ctl.render(); await nextTick(10);
    gen = 1; ctl.recolor();
    expect(ink.recolor).toBe(2);
    expect(root.querySelectorAll('.sp-pick-art')[0].dataset.spKey).toBe('cw10');
    click(W, root.querySelector('.sp-pick-acts button'));
    expect(calls[0][1].key).toBe('cw10');
  });

  it('is keyboard reachable: card and actions are real buttons, in order, with labels', async () => {
    const { V, root } = boot();
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(1) }, colorwayFor: () => cw(0), openArt() {} });
    await ctl.render();
    const btns = [...root.querySelectorAll('.sp-pick button')];
    expect(btns.map((b) => b.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    btns.forEach((b) => { expect(b.tabIndex).toBeGreaterThanOrEqual(0); expect(b.type).toBe('button'); });
    expect(btns[0].getAttribute('aria-label')).toMatch(/Open Pick 1/);
  });

  it('shows an honest empty line when there are no picks', async () => {
    const { V, root } = boot();
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => [work] }, colorwayFor: () => cw(0), openArt() {} });
    await ctl.render();
    expect(root.querySelectorAll('.sp-pick')).toHaveLength(0);
    expect(root.querySelector('.sp-picks-empty').textContent).toMatch(/No studio picks/);
  });

  it('render() is repeatable and destroy() tears everything down', async () => {
    const { V, root, ink } = boot();
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(2) }, colorwayFor: (a, i) => cw(i), openArt() {} });
    await ctl.render(); await ctl.render(); await nextTick(10);
    expect(root.querySelectorAll('.sp-pick')).toHaveLength(2);
    ctl.destroy();
    expect(root.querySelectorAll('.sp-pick')).toHaveLength(0);
    expect(ink.unmount.length).toBeGreaterThan(0);
  });

  it('a re-render of the same picks keeps the cards and their mounted art (never leaves a shown pick unmounted)', async () => {
    const { V, root, ink, ios } = boot({ io: true });
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(3) }, colorwayFor: (a, i) => cw(i), openArt() {} });
    await ctl.render(); await nextTick(10);
    const before = [...root.querySelectorAll('.sp-pick')];
    ios.reveal(before[0].querySelector('.sp-pick-art')); await nextTick(10);
    expect(ink.mount).toHaveLength(1);
    await ctl.render(); await nextTick(10);
    expect([...root.querySelectorAll('.sp-pick')]).toEqual(before); // same elements, not rebuilt
    expect(ink.unmount).toHaveLength(0);
    expect(ink.mount).toHaveLength(1);
    expect(root.style.minHeight).toBe('');
  });

  it('a re-render with a different set rebuilds the cards and releases the held height', async () => {
    const { V, root, ink } = boot();
    let n = 2;
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(n) }, colorwayFor: (a, i) => cw(i), openArt() {} });
    await ctl.render(); await nextTick(10);
    n = 3;
    await ctl.render(); await nextTick(10);
    expect(root.querySelectorAll('.sp-pick')).toHaveLength(3);
    expect(ink.unmount.length).toBeGreaterThan(0);
    expect(root.style.minHeight).toBe('');
  });

  it('a re-render recolors the kept cards to the colorways resolved now', async () => {
    const { V, root, ink } = boot();
    let shift = 0;
    const ctl = V.StartPagePicksSection.create(root, { artSource: { list: async () => arts(2) }, colorwayFor: (a, i) => cw(i + shift), openArt() {} });
    await ctl.render(); await nextTick(10);
    shift = 4;
    await ctl.render(); await nextTick(10);
    expect(ink.mount).toHaveLength(2);
    expect(root.querySelectorAll('.sp-pick-art')[0].dataset.spKey).toBe('cw4');
  });
});

describe('StartPageCommunity', () => {
  const mk = (o = {}) => {
    const env = boot(o);
    let value = !!o.notified; const sets = [];
    const notify = { get: () => value, set: (v) => { value = v; sets.push(v); } };
    return { ...env, notify, sets, make: (extra = {}) => env.V.StartPageCommunity.create(env.root, { leadArt: arts(1)[0], colorway: cw(1), notify, openArt: undefined, ...extra }) };
  };

  it('renders heading, one honest line, a switch, the lead card and three empty slots (no fake feed)', async () => {
    const { make, root } = mk();
    const c = make(); await c.render(); await nextTick(10);
    expect(root.querySelector('h2').textContent).toContain('Community');
    const lines = root.querySelectorAll('.sp-cm-line');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toMatch(/coming later/i);
    expect(root.querySelector('[role=switch]')).toBeTruthy();
    expect(root.querySelectorAll('.sp-cm-lead')).toHaveLength(1);
    expect(root.querySelectorAll('.sp-cm-empty')).toHaveLength(3);
    expect(root.querySelector('img, [class*=avatar]')).toBeNull();
  });

  it('without a lead art shows four empty slots', async () => {
    const { make, root } = mk();
    const c = make({ leadArt: null }); await c.render();
    expect(root.querySelectorAll('.sp-cm-lead')).toHaveLength(0);
    expect(root.querySelectorAll('.sp-cm-empty')).toHaveLength(4);
  });

  it('mounts the lead art in the given colorway', async () => {
    const { make, ink } = mk();
    const c = make(); await c.render(); await nextTick(10);
    expect(ink.mount).toHaveLength(1);
    expect(ink.mount[0].o.colorway.key).toBe('cw1');
  });

  it('the Notify switch reflects and persists through the passed accessor', async () => {
    const { make, root, W, sets, notify } = mk();
    const c = make(); await c.render();
    const sw = root.querySelector('[role=switch]');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.tagName).toBe('BUTTON');
    click(W, sw);
    expect(sets).toEqual([true]);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(root.querySelector('[aria-live]').textContent).not.toBe('');
    c.destroy();
    const c2 = make(); await c2.render();
    expect(root.querySelector('[role=switch]').getAttribute('aria-checked')).toBe('true');
    click(W, root.querySelector('[role=switch]'));
    expect(sets).toEqual([true, false]);
    expect(notify.get()).toBe(false);
  });

  it('opens the lead piece through openArt with the shown colorway when provided', async () => {
    const { make, root, W } = mk();
    const calls = [];
    const c = make({ openArt: (...a) => calls.push(a) }); await c.render();
    click(W, root.querySelector('.sp-cm-lead button.sp-lift'));
    expect(calls).toHaveLength(1);
    expect(calls[0][1].key).toBe('cw1');
  });

  it('recolor(colorway) repaints the lead tile; destroy() clears', async () => {
    const { make, root, ink } = mk();
    const c = make(); await c.render(); await nextTick(10);
    c.recolor(cw(7));
    expect(root.querySelector('.sp-cm-lead .sp-ink-host, .sp-cm-lead [data-sp-key]').dataset.spKey).toBe('cw7');
    c.destroy();
    expect(root.children).toHaveLength(0);
    expect(ink.unmount.length).toBeGreaterThan(0);
  });
});
