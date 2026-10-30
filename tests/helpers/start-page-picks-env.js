// jsdom harness for the Start Page lift card, Studio picks and Community modules: loads the real files from
// disk into a fresh window, fakes rAF with a manual clock, and stands in for StartPageInk (covered by its own tests).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const nextTick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const make = ({ reduced = false, io = false } = {}) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: false });
  const W = dom.window;
  const clock = { now: 0, queue: [], id: 0 };
  W.requestAnimationFrame = (cb) => { clock.queue.push([++clock.id, cb]); return clock.id; };
  W.cancelAnimationFrame = (id) => { clock.queue = clock.queue.filter(([i]) => i !== id); };
  W.performance = { now: () => clock.now };
  clock.run = (ms) => { // run frames at 60 Hz for ms of fake time
    const end = clock.now + ms;
    while (clock.now < end && clock.queue.length) {
      clock.now += 1000 / 60;
      const q = clock.queue; clock.queue = [];
      q.forEach(([, cb]) => cb(clock.now));
    }
    clock.now = Math.max(clock.now, end);
  };
  const mq = { matches: reduced, addEventListener() {}, removeEventListener() {} };
  W.matchMedia = () => mq;
  const ios = [];
  if (io) {
    W.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; this.els = new Set(); ios.push(this); }
      observe(el) { this.els.add(el); }
      unobserve(el) { this.els.delete(el); }
      disconnect() { this.els.clear(); }
    };
    ios.reveal = (el) => ios.forEach((o) => { if (o.els.has(el)) o.cb([{ target: el, isIntersecting: true }], o); });
  }
  const box = (w, h) => (el) => { el.getBoundingClientRect = () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0 }); return el; };
  const ctx = dom.getInternalVMContext();
  const load = (rel) => vm.runInContext(read(rel), ctx, { filename: rel });
  return { dom, W, D: W.document, clock, load, mq, ios, box };
};

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0L100 100" stroke="currentColor"/></svg>';

/** A stub of StartPageInk: records mounts, keeps setColorway on the element like the real handle. */
const stubInk = (W, state = {}) => {
  const calls = { mount: [], unmount: [], drawIn: [] };
  W.Vectura.StartPageInk = {
    isStill: () => !!state.still,
    mount: (el, art, o) => { calls.mount.push({ el, art, o }); el._spInk = { colorway: o.colorway, setColorway(cw) { this.colorway = cw; el.dataset.spKey = cw.key; calls.recolor = (calls.recolor || 0) + 1; } }; el.dataset.spKey = o.colorway.key; return Promise.resolve({}); },
    unmount: (el) => { calls.unmount.push(el); el._spInk = null; },
    drawIn: (el, o) => { calls.drawIn.push({ el, o }); return Promise.resolve({}); },
  };
  return calls;
};

module.exports = { make, SVG, stubInk, nextTick, read };
