/**
 * @vitest-environment jsdom
 *
 * Lift & tilt, Glare sweep and Re-plot: pointer behavior, settling and the Still contract.
 */
const { load, makeTile } = require('../helpers/start-page-hoverfx-env');

const flush = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); await vi.advanceTimersByTimeAsync(1); } };
const ptr = (el, type, x, y) => { const e = new Event(type); e.clientX = x; e.clientY = y; el.dispatchEvent(e); };

describe('simple hover effects', () => {
  let env;
  beforeEach(() => { vi.useFakeTimers(); env = load(); });
  afterEach(() => { vi.useRealTimers(); });

  describe('Lift & tilt', () => {
    test('tilts the art layer toward the pointer inside its frame, lifts the frame and adds a glare', async () => {
      const { el, box, handle } = makeTile(400, 300);
      const ctl = env.H.attach(el, 'lift', { handle }); await flush();
      ptr(el, 'pointermove', 380, 40);
      env.clock.run(500);
      expect(box.style.transform).toMatch(/perspective\(900px\) rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\) scale\(1\.0\d+\)/);
      const m = box.style.transform.match(/rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\)/);
      expect(+m[1]).toBeGreaterThan(3);   // pointer is near the top: top edge tilts away (positive rotateX here is -ny)
      expect(+m[2]).toBeGreaterThan(3);   // pointer is right of centre
      expect(el.classList.contains('sp-hfx-lift')).toBe(true);
      expect(el.style.overflow).toBe('hidden'); // the frame clips the tilted art: nothing spills over text
      const gl = el.querySelector('.sp-hfx-tilt-glare');
      expect(gl).toBeTruthy();
      expect(parseFloat(gl.style.getPropertyValue('--gx'))).toBeGreaterThan(80);
      ctl.destroy();
    });

    test('comes to rest: transform, lift class, glare and overflow are all cleared after leaving', async () => {
      const { el, box, handle } = makeTile();
      el.style.overflow = 'visible';
      env.H.attach(el, 'lift', { handle }); await flush();
      ptr(el, 'pointermove', 100, 100); env.clock.run(300);
      ptr(el, 'pointerleave', 0, 0); env.clock.run(3000);
      expect(env.clock.queue.length).toBe(0);
      expect(box.style.transform).toBe('');
      expect(el.classList.contains('sp-hfx-lift')).toBe(false);
      expect(el.querySelector('.sp-hfx-tilt-glare')).toBe(null);
      expect(el.style.overflow).toBe('visible');
    });

    test('Still turned on mid-hover snaps back to rest and ignores further moves', async () => {
      const { el, box, handle } = makeTile();
      env.H.attach(el, 'lift', { handle }); await flush();
      ptr(el, 'pointermove', 100, 100); env.clock.run(200);
      expect(box.style.transform).not.toBe('');
      window.dispatchEvent(new CustomEvent('vectura:start-page-motion', { detail: { still: true } }));
      expect(box.style.transform).toBe('');
      ptr(el, 'pointermove', 300, 200); env.clock.run(300);
      expect(box.style.transform).toBe('');
    });

    test('destroy leaves no inline style or element behind', async () => {
      const { el, box, handle } = makeTile();
      const ctl = env.H.attach(el, 'lift', { handle }); await flush();
      ptr(el, 'pointermove', 100, 100); env.clock.run(100);
      ctl.destroy();
      expect(box.style.transform).toBe(''); expect(el.querySelector('.sp-hfx-tilt-glare')).toBe(null); expect(el.classList.contains('sp-hfx-lift')).toBe(false);
      ptr(el, 'pointermove', 100, 100); env.clock.run(100);
      expect(box.style.transform).toBe('');
    });
  });

  describe('Glare sweep', () => {
    test('sweeps once per entry (with a cooldown) and is clipped to the art element', async () => {
      const { el, handle } = makeTile();
      env.H.attach(el, 'glare', { handle }); await flush();
      const g = el.querySelector('.sp-hfx-glare');
      expect(g).toBeTruthy(); expect(g.classList.contains('go')).toBe(true); // attach during a hover fires the first sweep
      g.classList.remove('go');
      ptr(el, 'pointerleave', 0, 0); ptr(el, 'pointerenter', 5, 5);
      expect(g.classList.contains('go')).toBe(false); // inside the cooldown
      vi.advanceTimersByTime(1000);
      ptr(el, 'pointerleave', 0, 0); ptr(el, 'pointerenter', 5, 5);
      expect(g.classList.contains('go')).toBe(true);
    });
    test('does nothing under Still', async () => {
      const { el, handle } = makeTile();
      env.H.attach(el, 'glare', { handle }); await flush();
      env.H.setMotion({ still: true });
      el.querySelector('.sp-hfx-glare').classList.remove('go');
      vi.advanceTimersByTime(2000);
      ptr(el, 'pointerleave', 0, 0); ptr(el, 'pointerenter', 5, 5);
      expect(el.querySelector('.sp-hfx-glare').classList.contains('go')).toBe(false);
    });
    test('destroy removes the glare element', async () => {
      const { el, handle } = makeTile();
      const ctl = env.H.attach(el, 'glare', { handle }); await flush();
      ctl.destroy();
      expect(el.querySelector('.sp-hfx-glare')).toBe(null);
    });
  });

  describe('Re-plot', () => {
    const withInk = () => {
      const calls = [];
      window.Vectura.StartPageInk = { drawIn: (h, o) => { calls.push(o); return Promise.resolve(h); }, finish: vi.fn() };
      return calls;
    };
    test('replays the plot-in once per entry, with a cooldown', async () => {
      const calls = withInk();
      const { el, handle } = makeTile();
      env.H.attach(el, 'replot', { handle }); await flush();
      expect(calls.length).toBe(1);
      expect(calls[0].style).toBe('plot');
      ptr(el, 'pointerleave', 0, 0); ptr(el, 'pointerenter', 5, 5);
      expect(calls.length).toBe(1);
      vi.advanceTimersByTime(1500);
      ptr(el, 'pointerleave', 0, 0); ptr(el, 'pointerenter', 5, 5);
      expect(calls.length).toBe(2);
    });
    test('does not re-plot while a draw-in is running or under Still', async () => {
      const calls = withInk();
      const { el, handle } = makeTile();
      handle.run = {};
      env.H.attach(el, 'replot', { handle }); await flush();
      expect(calls.length).toBe(0);
      handle.run = null; vi.advanceTimersByTime(2000);
      env.H.setMotion({ still: true });
      ptr(el, 'pointerleave', 0, 0); ptr(el, 'pointerenter', 5, 5);
      expect(calls.length).toBe(0);
    });
    test('destroy finishes a running draw-in', async () => {
      withInk();
      const { el, handle } = makeTile();
      const ctl = env.H.attach(el, 'replot', { handle }); await flush();
      handle.run = {};
      ctl.destroy();
      expect(window.Vectura.StartPageInk.finish).toHaveBeenCalledWith(handle);
    });
  });
});
