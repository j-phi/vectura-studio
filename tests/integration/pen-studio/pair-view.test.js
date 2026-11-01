import { describe, it, expect, afterEach } from 'vitest';

const { loadUIComponent } = require('../../helpers/load-ui-component');
const stubs = require('../../helpers/pen-studio-lab-stubs');

let env; let calls; let raf; let ctx; let view;
const $ = (sel) => env.document.querySelector(sel);
const $$ = (sel) => Array.from(env.document.querySelectorAll(sel));
const click = (n) => n.dispatchEvent(new env.window.Event('click', { bubbles: true }));

const setup = (stateOver, opts = {}) => {
  env = loadUIComponent(['src/ui/pen-studio/pair-view']);
  calls = stubs.install(env.window);
  raf = stubs.installRaf(env.window);
  ctx = stubs.makeCtx(Object.assign({ state: stateOver }, opts));
  const host = env.document.createElement('div');
  env.document.body.appendChild(host);
  view = env.window.Vectura.UI.PenStudioPair.mount(host, ctx);
  ctx.mounted.push(view);
};
afterEach(() => { if (view) view.destroy(); if (env) env.cleanup(); view = null; });

describe('PenStudioPair', () => {
  it('lists chips and selects one; hue complement says "not a pen yet" and names the closest owned pen', () => {
    setup();
    const chips = $$('.pen-studio-chip');
    expect(chips.map((c) => c.dataset.key)).toEqual(expect.arrayContaining(['c180', 'c150', 'p:sp-b']));
    expect(chips[0].classList.contains('is-selected')).toBe(true);
    expect($('.pen-studio-pair-note').textContent).toContain('Not a pen yet');
    expect($('.pen-studio-pair-note').textContent).toContain('Micron Black');
    click(chips.find((c) => c.dataset.key === 'p:sp-b'));
    expect(ctx.state.comp).toEqual({ id: 'p:sp-b' });
    expect($('.pen-studio-pair-note').textContent).toContain('is a real pen');
  });

  it('filters chips on dark paper and names hidden real pens', () => {
    setup({ paperType: 'black-stock' });
    const keys = $$('.pen-studio-chip').map((c) => c.dataset.key);
    expect(keys).not.toContain('p:sp-b');
    expect($('.pen-studio-pair-note').textContent).toContain('Hidden on Black stock');
    expect($('.pen-studio-pair-note').textContent).toContain('Micron Burgundy');
  });

  it('Randomize changes the pick with a seeded rng', () => {
    setup({}, { rng: () => () => 0.99 });
    const before = ctx.state.comp;
    click($('.pen-studio-random'));
    expect(ctx.state.comp).not.toEqual(before);
    expect(ctx.state.comp.id).toBeTruthy();
  });

  it('Lines slider (3-7) and weave modes set the complement count in the canvas draw', () => {
    setup();
    raf.flush();
    const strokesOf = () => calls.draw[calls.draw.length - 1].opts.paths;
    const input = $('.pen-studio-lines-input');
    expect([input.min, input.max]).toEqual(['3', '7']);
    input.value = '7'; input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    raf.flush();
    expect(ctx.state.n).toBe(7);
    let paths = strokesOf();
    expect(paths.length).toBe(7);
    const compOf = () => paths.filter((p) => p.pen !== calls.draw[calls.draw.length - 1].pen).length;
    expect(compOf()).toBe(3); // alt: i%2==1 of 7
    click($$('.pen-studio-weave-btn').find((b) => b.dataset.key === 'mid'));
    raf.flush();
    paths = strokesOf();
    expect(compOf()).toBe(1);
    click($$('.pen-studio-weave-btn').find((b) => b.dataset.key === 'third'));
    raf.flush();
    paths = strokesOf();
    expect(compOf()).toBe(2);
    expect($$('.pen-studio-weave-btn').map((b) => b.textContent)).toEqual(['Alternate', 'Every 3rd', 'Center']);
  });
});
