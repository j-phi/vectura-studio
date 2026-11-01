import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const { loadUIComponent } = require('../../helpers/load-ui-component');
const stubs = require('../../helpers/pen-studio-lab-stubs');

let env; let calls; let raf; let ctx; let view;
const $ = (sel, root) => (root || env.document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || env.document).querySelectorAll(sel));
const click = (n) => n.dispatchEvent(new env.window.Event('click', { bubbles: true }));

const setup = (stateOver, docOver) => {
  env = loadUIComponent(['src/ui/pen-studio/lab-view']);
  calls = stubs.install(env.window);
  raf = stubs.installRaf(env.window);
  ctx = stubs.makeCtx({ state: stateOver, doc: docOver });
  const host = env.document.createElement('div');
  env.document.body.appendChild(host);
  view = env.window.Vectura.UI.PenStudioLab.mount(host, ctx);
  ctx.mounted.push(view);
  return host;
};

beforeEach(() => { env = null; });
afterEach(() => { if (view) view.destroy(); if (env) env.cleanup(); view = null; });

describe('PenStudioLab sizes', () => {
  it('toggles owned sizes, never empties, and the testing outline follows', () => {
    setup();
    const btn = (l) => $$('.pen-studio-size').find((b) => b.dataset.key === l);
    expect(btn('05').classList.contains('is-testing')).toBe(true);
    click(btn('08'));
    expect(ctx.doc.boxes[0].items[0].sizes).toEqual(['05', '08']);
    expect(btn('08').classList.contains('is-testing')).toBe(true);
    click(btn('05'));
    expect(ctx.doc.boxes[0].items[0].sizes).toEqual(['08']);
    expect(btn('08').classList.contains('is-testing')).toBe(true);
    const before = ctx.docs.length;
    click(btn('08')); // last owned size: refused
    expect(ctx.docs.length).toBe(before);
    expect(ctx.doc.boxes[0].items[0].sizes).toEqual(['08']);
  });
});

describe('PenStudioLab papers and views', () => {
  it('paper click updates the strips through ctx.set only', () => {
    setup();
    raf.flush();
    expect($$('.pen-studio-strip').length).toBe(6);
    calls.testSpec.length = 0;
    click($$('.pen-studio-paper').find((b) => b.dataset.key === 'kraft'));
    expect(ctx.sets[ctx.sets.length - 1]).toEqual({ paperType: 'kraft' });
    expect(calls.testSpec.every((c) => c.paperType === 'kraft')).toBe(true);
    expect(env.window.SETTINGS).toBeUndefined();
  });

  it('marks faint papers for a black pen on black stock', () => {
    setup();
    const black = $$('.pen-studio-paper').find((b) => b.dataset.key === 'black-stock');
    expect(black.textContent).toContain('faint');
  });

  it('all-papers matrix has 10 rows x 4 cells; row click selects paper and returns to one view', () => {
    setup({ view: 'all' });
    const rows = $$('.pen-studio-matrix-row');
    expect(rows.length).toBe(10);
    rows.forEach((r) => expect($$('canvas', r).length).toBe(4));
    expect($('.pen-studio-matrix').hidden).toBe(false);
    click(rows[5]);
    expect(ctx.state.paperType).toBe('kraft');
    expect(ctx.state.view).toBe('one');
    expect($('.pen-studio-strips').hidden).toBe(false);
  });
});

describe('PenStudioLab sliders and actions', () => {
  const slider = (k) => $(`.pen-studio-slider[data-key="${k}"] input`);
  const input = (k, v) => { const s = slider(k); s.value = String(v); s.dispatchEvent(new env.window.Event('input', { bubbles: true })); };
  const save = () => $('.pen-studio-btn.is-save');

  it('renders six sliders colored by state; draft -> unsaved, Save disabled when clean', () => {
    setup();
    expect($$('.pen-studio-slider').length).toBe(6);
    expect(save().disabled).toBe(true);
    input('wetness', 0.8);
    expect(ctx.state.drafts['sp-a'].ink.wetness).toBe(0.8);
    expect($('.pen-studio-slider[data-key="wetness"] .pen-studio-slider-value').dataset.state).toBe('draft');
    expect($('.pen-studio-slider[data-key="skips"] .pen-studio-slider-value').dataset.state).toBe('default');
    expect(save().disabled).toBe(false);
    expect($('.pen-studio-note').textContent).toBe('Unsaved changes');
  });

  it('Save commits and clears the draft; Discard drops it; Reset to model fills defaults', () => {
    setup();
    input('wetness', 0.8);
    click(save());
    expect(ctx.doc.pens[0].ink.wetness).toBe(0.8);
    expect(ctx.state.drafts['sp-a']).toBeUndefined();
    expect(ctx.state.note.tone).toBe('ok');
    input('skips', 0.1);
    click($('.pen-studio-btn.is-discard'));
    expect(ctx.state.drafts['sp-a']).toBeUndefined();
    click($('.pen-studio-btn.is-reset'));
    expect(ctx.state.drafts['sp-a'].ink.skips).toBe(0);
  });

  it('Save as new and Export open overlays via ctx.set', () => {
    setup();
    click($('.pen-studio-btn.is-save-new'));
    expect(ctx.sets[ctx.sets.length - 1].overlay).toEqual({ kind: 'saveNew' });
    click($('.pen-studio-btn.is-export'));
    expect(ctx.state.overlay.kind).toBe('export');
  });

  it('shows an evidence tooltip on each slider', () => {
    setup();
    expect($('.pen-studio-slider[data-key="starvation"]').title).toContain('Posca');
  });
});

describe('PenStudioLab render queue', () => {
  it('drops stale generations and draws each strip once per settled state', () => {
    setup();
    calls.draw.length = 0;
    const s = $('.pen-studio-slider[data-key="wetness"] input');
    ['0.5', '0.6', '0.7'].forEach((v) => { s.value = v; s.dispatchEvent(new env.window.Event('input', { bubbles: true })); });
    expect(view._queue.pending()).toBe(6);
    raf.flush();
    expect(calls.draw.length).toBe(6);
    expect(calls.draw[0].opts.paths.length).toBeGreaterThan(0);
    expect(calls.draw[0].opts.paperFill).toBe(true);
  });

  it('unchanged update() does not redraw', () => {
    setup();
    raf.flush();
    calls.draw.length = 0;
    view.update();
    raf.flush();
    expect(calls.draw.length).toBe(0);
  });

  it('destroy cancels pending work', () => {
    setup();
    view.destroy();
    calls.draw.length = 0;
    raf.flush();
    expect(calls.draw.length).toBe(0);
    view = null;
  });
});
