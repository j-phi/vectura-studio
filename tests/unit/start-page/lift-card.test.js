/**
 * Start Page lift & tilt (src/ui/start-page/lift-card.js) — window.Vectura.StartPageLiftCard.
 * N3 behavior: pointer tilt + broad subtle glare + darker soft shadow; keyboard focus lifts without tilt;
 * Still / prefers-reduced-motion never tilt; detach() restores the element.
 */
const { make } = require('../../helpers/start-page-picks-env');

const setup = (opts = {}) => {
  const env = make(opts);
  env.load('src/ui/start-page/lift-card.js');
  const { D, W } = env;
  const card = env.box(300, 200)(D.createElement('button'));
  card.innerHTML = '<span class="art">ART</span>';
  D.getElementById('root').appendChild(card);
  return { ...env, card, L: W.Vectura.StartPageLiftCard };
};
const move = (W, el, type, x, y, extra = {}) => {
  const e = new W.MouseEvent(type, { clientX: x, clientY: y, bubbles: type !== 'pointerenter' && type !== 'pointerleave' });
  Object.assign(e, extra); el.dispatchEvent(e);
};
const inner = (card) => card.querySelector('.sp-lift-in');

describe('StartPageLiftCard', () => {
  it('attach wraps the content, adds a shadow and a glare layer, and never covers text', () => {
    const { L, card } = setup();
    L.attach(card);
    expect(card.classList.contains('sp-lift')).toBe(true);
    expect(inner(card).querySelector('.art').textContent).toBe('ART');
    expect(card.querySelector('.sp-lift-sh')).toBeTruthy();
    const gl = card.querySelector('.sp-lift-gl');
    expect(gl).toBeTruthy();
    expect(gl.getAttribute('aria-hidden')).toBe('true');
    expect(inner(card).contains(gl)).toBe(true); // the glare is clipped inside the art frame
  });

  it('tilts toward the pointer, lifts, and shows glare + shadow', () => {
    const { L, card, W, clock } = setup();
    L.attach(card);
    move(W, card, 'pointerenter', 290, 10);
    move(W, card, 'pointermove', 290, 10); // top-right corner
    clock.run(800);
    const t = inner(card).style.transform;
    expect(t).toMatch(/perspective/);
    const rx = parseFloat(/rotateX\((-?[\d.]+)deg\)/.exec(t)[1]);
    const ry = parseFloat(/rotateY\((-?[\d.]+)deg\)/.exec(t)[1]);
    expect(rx).toBeGreaterThan(5); // top edge tips toward the viewer
    expect(ry).toBeGreaterThan(5);
    expect(parseFloat(/scale\(([\d.]+)\)/.exec(t)[1])).toBeGreaterThan(1.04);
    expect(parseFloat(card.querySelector('.sp-lift-gl i').style.opacity)).toBeGreaterThan(0.5);
    expect(parseFloat(card.querySelector('.sp-lift-sh').style.opacity)).toBeGreaterThan(0.5);
    expect(card.dataset.spLift).toBe('hover');
  });

  it('settles back to rest on pointer leave', () => {
    const { L, card, W, clock } = setup();
    L.attach(card);
    move(W, card, 'pointerenter', 290, 10); clock.run(500);
    move(W, card, 'pointerleave', 400, 400); clock.run(2500);
    expect(inner(card).style.transform).toBe('');
    expect(card.querySelector('.sp-lift-sh').style.opacity).toBe('');
    expect(card.dataset.spLift).toBe('rest');
  });

  it('ignores touch pointers', () => {
    const { L, card, W, clock } = setup();
    L.attach(card);
    move(W, card, 'pointerenter', 290, 10, { pointerType: 'touch' }); clock.run(500);
    expect(inner(card).style.transform).toBe('');
  });

  it('keyboard focus gives the lifted state without tilt', () => {
    const { L, card, W, clock } = setup();
    L.attach(card);
    const realMatches = card.matches.bind(card);
    card.matches = (sel) => (sel === ':focus-visible' ? true : realMatches(sel)); // jsdom has no focus-visible heuristics
    card.dispatchEvent(new W.FocusEvent('focusin', { bubbles: true }));
    clock.run(800);
    const t = inner(card).style.transform;
    expect(parseFloat(/rotateX\((-?[\d.]+)deg\)/.exec(t)[1])).toBe(0);
    expect(parseFloat(/rotateY\((-?[\d.]+)deg\)/.exec(t)[1])).toBe(0);
    expect(parseFloat(/scale\(([\d.]+)\)/.exec(t)[1])).toBeGreaterThan(1.02);
    expect(card.dataset.spLift).toBe('focus');
    card.dispatchEvent(new W.FocusEvent('focusout', { bubbles: true }));
    clock.run(2500);
    expect(inner(card).style.transform).toBe('');
  });

  it('Still (option) never tilts, scales or glares', () => {
    let still = true;
    const { L, card, W, clock } = setup();
    L.attach(card, { still: () => still });
    move(W, card, 'pointerenter', 290, 10); move(W, card, 'pointermove', 290, 10); clock.run(800);
    expect(inner(card).style.transform).toBe('');
    expect(card.querySelector('.sp-lift-gl i').style.opacity).toBe('');
    card.dispatchEvent(new W.FocusEvent('focusin', { bubbles: true })); clock.run(800);
    expect(inner(card).style.transform).toBe('');
    still = false;
  });

  it('honors StartPageInk.isStill and the vectura:start-page-motion event mid-hover', () => {
    const { L, card, W, clock } = setup();
    let inkStill = false;
    W.Vectura.StartPageInk = { isStill: () => inkStill };
    L.attach(card);
    move(W, card, 'pointerenter', 290, 10); clock.run(500);
    expect(inner(card).style.transform).toMatch(/rotateX/);
    inkStill = true;
    W.dispatchEvent(new W.CustomEvent('vectura:start-page-motion', { detail: { still: true } }));
    clock.run(100);
    expect(inner(card).style.transform).toBe('');
    move(W, card, 'pointermove', 10, 190); clock.run(500);
    expect(inner(card).style.transform).toBe('');
  });

  it('prefers-reduced-motion behaves like Still', () => {
    const { L, card, W, clock } = setup({ reduced: true });
    L.attach(card);
    move(W, card, 'pointerenter', 290, 10); clock.run(800);
    expect(inner(card).style.transform).toBe('');
  });

  it('detach removes listeners and the layers it added, and is idempotent', () => {
    const { L, card, W, clock } = setup();
    const h = L.attach(card);
    move(W, card, 'pointerenter', 290, 10); clock.run(300);
    h.detach(); h.detach();
    expect(card.classList.contains('sp-lift')).toBe(false);
    expect(card.querySelector('.sp-lift-sh')).toBeNull();
    expect(card.querySelector('.sp-lift-gl')).toBeNull();
    expect(card.querySelector('.sp-lift-in')).toBeNull();
    expect(card.querySelector('.art').textContent).toBe('ART');
    move(W, card, 'pointerenter', 10, 10); clock.run(300);
    expect(card.querySelector('.art').parentElement).toBe(card);
    expect(L.attach(card)).not.toBe(h); // can attach again
  });

  it('attaching twice returns the same handle', () => {
    const { L, card } = setup();
    expect(L.attach(card)).toBe(L.attach(card));
  });
});
