/**
 * P3 integration: StartPageMotion (preference -> module glue), the one motion source of truth in StartPageInk
 * (isStill + the vectura:start-page-motion event), and the Settings popover's "Art animates in" / "Hover effect" sections.
 */
const { make, nextTick } = require('../../helpers/start-page-picks-env');

const boot = (opts = {}) => {
  const env = make(opts);
  env.load('src/ui/start-page/dom.js');
  env.load('src/core/start-page/art-geometry.js');
  env.load('src/ui/start-page/ink.js');
  env.load('src/ui/start-page/motion.js');
  return { ...env, V: env.W.Vectura };
};

describe('StartPageInk: one motion source of truth', () => {
  it('setMotion announces vectura:start-page-motion with the combined state, and sets the root attributes', () => {
    const { V, W, D } = boot();
    const seen = [];
    W.addEventListener('vectura:start-page-motion', (e) => seen.push(e.detail.still));
    expect(V.StartPageInk.isStill()).toBe(false);
    V.StartPageInk.setMotion({ still: true });
    expect(V.StartPageInk.isStill()).toBe(true);
    expect(seen).toEqual([true]);
    expect(D.documentElement.hasAttribute('data-start-page-still')).toBe(true);
    V.StartPageInk.setMotion({ still: false });
    expect(seen).toEqual([true, false]);
    expect(D.documentElement.hasAttribute('data-start-page-still')).toBe(false);
  });

  it('prefers-reduced-motion counts as Still without the toggle', () => {
    const { V } = boot({ reduced: true });
    expect(V.StartPageInk.isStill()).toBe(true);
    expect(V.StartPageMotion.isStill()).toBe(true);
  });
});

describe('StartPageMotion mapping', () => {
  it('accepts the preference enum and the ids the plate editor stores', () => {
    const { V } = boot();
    const M = V.StartPageMotion;
    expect(['plot', 'sweep', 'fade-up', 'ink-bleed', 'stroke-cascade', 'scan-lines', 'iris', 'none'].map((x) => M.styleId(x)))
      .toEqual(['plot', 'sweep', 'fade', 'bleed', 'cascade', 'scan', 'iris', 'none']);
    expect(M.styleId('fade')).toBe('fade');
    expect(M.styleId('nope')).toBe('plot');
    expect(M.hoverId('hologram')).toBe('holo');
    expect(M.hoverId('holo')).toBe('holo');
    expect(M.hoverId('default')).toBe(null);
  });

  it('default hover: plates re-trigger the animate-in, cards lift', () => {
    const { V } = boot();
    const M = V.StartPageMotion;
    expect(M.plan('default', 'plate')).toEqual({ type: 'retrigger' });
    expect(M.plan('default', 'card')).toEqual({ type: 'lift-card' });
    expect(M.plan('none', 'plate')).toEqual({ type: 'none' });
    expect(M.plan('retrigger', 'card')).toEqual({ type: 'retrigger' });
    expect(M.plan('lift', 'card')).toEqual({ type: 'lift-card' });
    expect(M.plan('lift', 'plate')).toEqual({ type: 'fx', id: 'lift' });
    expect(M.plan('ripple', 'plate')).toEqual({ type: 'fx', id: 'ripple' });
  });

  it('artType reads the algorithm label and maps 3D types to live models', () => {
    const { V } = boot();
    V.StartPageOrbit3D = { modelFor: (t, p) => ({ topoform: 'torus', spiralizer: 'coiled-sphere', terrain: /alpine/.test(p || '') ? 'terrain-alpine' : 'terrain' }[t] || null) };
    const M = V.StartPageMotion;
    expect(M.modelFor({ algorithm: 'Topoform' })).toBe('torus');
    expect(M.modelFor({ algorithm: 'Spiralizer' })).toBe('coiled-sphere');
    expect(M.modelFor({ algorithm: 'terrain', presetId: 'terrain-alpine' })).toBe('terrain-alpine');
    expect(M.modelFor({ algorithm: 'Rings' })).toBe(null);
    expect(M.modelFor(null)).toBe(null);
  });

  it('a 3D Scene piece asks for its scene by sceneId (a saved work) before presetId', () => {
    const { V } = boot();
    V.StartPageOrbit3D = { modelFor: (t, p) => (t === 'object3d' || t === 'scene3d') && p ? `scene:${p}` : null };
    const M = V.StartPageMotion;
    expect(M.modelFor({ algorithm: 'Object 3D', sceneId: 'work:9' })).toBe('scene:work:9');
    expect(M.modelFor({ algorithm: 'scene3d', presetId: 'scene3d-studio-shadows' })).toBe('scene:scene3d-studio-shadows');
  });
});

describe('StartPageMotion.bindArt', () => {
  const rig = (hover, o = {}) => {
    const env = boot(o);
    const { V, W, D } = env;
    const calls = { attach: [], retrigger: [], destroyed: 0 };
    V.StartPageHoverFx = { attach: (el, id, opts) => { calls.attach.push({ el, id, opts }); return {}; }, detach() {} };
    V.StartPageDrawStyles = { retrigger: (h, style) => { calls.retrigger.push({ h, style }); return { destroy() { calls.destroyed += 1; } }; } };
    const el = D.createElement('div'); el.id = 'art'; D.getElementById('root').appendChild(el);
    const handle = { el, id: 1 };
    el._spInk = handle;
    const state = { hover, anim: 'ink-bleed' };
    const b = V.StartPageMotion.bindArt(el, { handle: () => handle, animateIn: () => state.anim, hover: () => state.hover, kind: 'plate' });
    const enter = () => el.dispatchEvent(new W.MouseEvent('pointerenter'));
    return { ...env, calls, el, handle, state, b, enter };
  };

  it('an effect id lazy-attaches on pointer entry, on that element only, with its handle', () => {
    const r = rig('ripple');
    expect(r.calls.attach).toHaveLength(0); // nothing before the pointer arrives
    r.enter();
    expect(r.calls.attach).toHaveLength(1);
    expect(r.calls.attach[0].id).toBe('ripple');
    expect(r.calls.attach[0].el).toBe(r.el);
    expect(r.calls.attach[0].opts.handle).toBe(r.handle);
    expect(r.calls.retrigger).toHaveLength(0);
  });

  it('a pointer that arrives before the art is parsed still gets the effect: on the ready signal or the next move', async () => {
    const r = rig('ripple');
    let ready; r.handle.parsed = null; r.handle.ready = new Promise((res) => { ready = res; });
    r.enter();
    expect(r.calls.attach).toHaveLength(0); // no strokes yet: nothing to attach to
    r.el.dispatchEvent(new r.W.MouseEvent('pointermove'));
    expect(r.calls.attach).toHaveLength(0); // still parsing
    r.handle.parsed = { polys: [] };
    r.el.dispatchEvent(new r.W.MouseEvent('pointermove')); // next move attaches
    expect(r.calls.attach).toHaveLength(1);
    r.el.dispatchEvent(new r.W.MouseEvent('pointermove'));
    expect(r.calls.attach).toHaveLength(1); // once

    const r2 = rig('ripple'); // the ready signal alone (a still pointer) also attaches
    let ready2; r2.handle.parsed = null; r2.handle.ready = new Promise((res) => { ready2 = res; });
    r2.enter();
    r2.handle.parsed = { polys: [] }; ready2(r2.handle); await nextTick();
    expect(r2.calls.attach).toHaveLength(1);
    void ready;

    const r3 = rig('ripple'); // a pointer that left does not attach late
    r3.handle.parsed = null; r3.enter();
    r3.el.dispatchEvent(new r3.W.MouseEvent('pointerleave'));
    r3.handle.parsed = { polys: [] };
    r3.el.dispatchEvent(new r3.W.MouseEvent('pointermove'));
    expect(r3.calls.attach).toHaveLength(0);
  });

  it('Still (toggle or reduced motion) attaches no hover effect', () => {
    const r = rig('ripple');
    r.V.StartPageInk.setMotion({ still: true });
    r.enter();
    expect(r.calls.attach).toHaveLength(0);
    const r2 = rig('ripple', { reduced: true });
    r2.enter();
    expect(r2.calls.attach).toHaveLength(0);
  });

  it('None attaches nothing; default installs the re-trigger with the mapped animate-in style', () => {
    const none = rig('none');
    none.enter();
    expect(none.calls.attach).toHaveLength(0);
    expect(none.calls.retrigger).toHaveLength(0);
    const def = rig('default');
    expect(def.calls.retrigger).toHaveLength(1);
    expect(def.calls.retrigger[0].style).toBe('bleed');
    def.enter();
    expect(def.calls.attach).toHaveLength(0);
  });

  it('changing the page preference re-evaluates every bound element', () => {
    const r = rig('default');
    expect(r.calls.retrigger).toHaveLength(1);
    r.state.hover = 'none';
    r.V.StartPageMotion.changed();
    expect(r.calls.destroyed).toBe(1);
    r.state.hover = 'default'; r.state.anim = 'iris';
    r.V.StartPageMotion.changed();
    expect(r.calls.retrigger.map((c) => c.style)).toEqual(['bleed', 'iris']);
    r.b.destroy();
    expect(r.calls.destroyed).toBe(2);
  });
});

describe('Settings popover: Art animates in + Hover effect', () => {
  const settings = (prefs = {}) => {
    const env = boot();
    env.load('src/ui/start-page/icons.js');
    env.load('src/core/start-page/cover-words.js');
    env.load('src/ui/start-page/settings.js');
    const { V, D } = env;
    V.StartPageDrawStyles = { LABELS: {} };
    const root = D.getElementById('root');
    const button = D.createElement('button'); root.appendChild(button);
    const calls = { pref: [], preview: 0, toggle: [] };
    const ctl = V.UI.StartPageSettings.create({
      root, button, prefs: () => ({ coverStyle: 'mosaic', animateIn: 'plot', hover: 'default', ...prefs }),
      onStyle() {}, onToggle: (k, on) => calls.toggle.push([k, on]),
      onPref: (k, v) => calls.pref.push([k, v]), onPreview: () => { calls.preview += 1; },
    });
    return { ...env, ctl, calls, pop: root.querySelector('#sp-settings') };
  };

  it('lists the animate-in styles and hover effects with the owner labels', () => {
    const { pop } = settings();
    const anim = pop.querySelector('select[data-pref="animateIn"]');
    const hover = pop.querySelector('select[data-pref="hover"]');
    expect([...anim.options].map((o) => o.textContent)).toEqual(['Plot', 'Sweep', 'Fade up', 'Ink bleed', 'Stroke cascade', 'Scan lines', 'Iris', 'None']);
    expect([...anim.options].map((o) => o.value)).toEqual(['plot', 'sweep', 'fade-up', 'ink-bleed', 'stroke-cascade', 'scan-lines', 'iris', 'none']);
    expect([...hover.options].map((o) => o.textContent)).toEqual(['Default', 'None', 'Re-trigger animation', 'Lift & tilt', 'Glare sweep', 'Re-plot', 'Hologram Foil', 'Pressure Ripple', 'Stipple Weather', 'Paper Breeze', 'Gravity Well', 'Light Current']);
    expect([...hover.options].map((o) => o.value)).toEqual(['default', 'none', 'retrigger', 'lift', 'glare', 'replot', 'holo', 'ripple', 'stipple', 'breeze', 'gravity', 'current']);
    expect(pop.querySelector('[data-slot="animate-in"]').hidden).toBe(false);
    expect(pop.querySelector('[data-slot="hover"]').hidden).toBe(false);
  });

  it('reflects the saved values, reports changes, and Preview replays the cover', () => {
    const { pop, calls, W } = settings({ animateIn: 'iris', hover: 'ripple' });
    const anim = pop.querySelector('select[data-pref="animateIn"]');
    const hover = pop.querySelector('select[data-pref="hover"]');
    expect(anim.value).toBe('iris');
    expect(hover.value).toBe('ripple');
    anim.value = 'ink-bleed'; anim.dispatchEvent(new W.Event('change', { bubbles: true }));
    hover.value = 'none'; hover.dispatchEvent(new W.Event('change', { bubbles: true }));
    expect(calls.pref).toEqual([['animateIn', 'ink-bleed'], ['hover', 'none']]);
    pop.querySelector('[data-act="preview-animate"]').click();
    expect(calls.preview).toBe(1);
  });
});
