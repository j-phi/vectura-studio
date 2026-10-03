// Shared setup for the TUX-032 specs: a factory-default Text layer (fitToFrame:true, so the
// Size scrub starts hidden), the left pane open, and a fake visualViewport keyboard.
const { PROJECTS } = require('../touch/viewports');

// On-screen keyboard heights (CSS px) per device, §1.2 of docs/touch-ux-requirements.md.
const KEYBOARD = { iPadL: 400, iPadP: 310, iPhP: 340, iPhL: 210 };
const keyboardFor = (testInfo) => {
  const p = PROJECTS[testInfo.project.name];
  return p ? KEYBOARD[p.device] : 300;
};

// Replaces window.visualViewport with an EventTarget the test drives. Real iOS keeps the layout
// viewport fixed and shrinks the visual viewport, which is what this models.
//   __kb(K, {offsetTop})   keyboard of K px (height = innerHeight - K - offsetTop)
//   __kbRaw({height, offsetTop, scale})   exact values
const installKeyboardStub = () => {
  const fake = new EventTarget();
  Object.assign(fake, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: fake });
  window.__kbFake = fake;
  window.__kbRaw = (v) => { Object.assign(fake, v); fake.dispatchEvent(new Event('resize')); };
  window.__kb = (K, { offsetTop = 0 } = {}) => window.__kbRaw({ height: innerHeight - K - offsetTop, offsetTop, scale: 1 });
};

const waitApp = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.app && window.app.ui && window.app.engine && window.app.textEdit));
};

const paneIsOpen = (page) => page.evaluate(() => {
  const p = document.getElementById('left-pane') || document.querySelector('.pane-left');
  if (!p) return false;
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p);
  return r.width > 100 && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none';
});

// Opens the pane the way a finger would when a button is reachable; otherwise through the
// pane DOM state. (iPhone panes are not finger-openable before TUX-010: not journey proof.)
const openLeftPane = async (page, touch) => {
  if (await paneIsOpen(page)) return;
  for (const id of ['btn-pane-toggle-left', 'btn-mobile-pane-left']) {
    const btn = page.locator(`#${id}`);
    if (await btn.isVisible().catch(() => false)) {
      await touch.tap(page, btn);
      await page.waitForTimeout(350);
      if (await paneIsOpen(page)) return;
    }
  }
  await page.evaluate(() => {
    const pane = document.getElementById('left-pane') || document.querySelector('.pane-left');
    if (document.body.classList.contains('auto-collapsed')) pane.classList.add('pane-force-open');
    else pane.classList.remove('pane-collapsed');
  });
  await page.waitForTimeout(350);
};

// Default text layer through the real engine path (NOT the Type tool, which forces fitToFrame:false).
const addDefaultTextLayer = async (page, touch) => {
  await page.evaluate(() => {
    const id = window.app.engine.addLayer('text');
    window.app.engine.activeLayerId = id;
    window.app.regen();
    window.app.ui.renderLayers && window.app.ui.renderLayers();
    window.app.ui.buildControls();
  });
  await openLeftPane(page, touch);
  await page.waitForSelector('.vtp-fontpick-trigger', { state: 'attached' });
};

// Scrolls the nearest scrollable ancestor so `selector`'s bottom sits `gap` px above the
// viewport bottom if the content allows it (the worst case for a keyboard). The floor is the scroller's own bottom when that is above innerHeight.
const scrollToLow = (page, selector, gap = 16) => page.evaluate(({ selector, gap }) => {
  const el = document.querySelector(selector);
  el.scrollIntoView({ block: 'center' });
  let n = el.parentElement;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) break;
    n = n.parentElement;
  }
  if (n && n !== document.body) { const floor = Math.min(innerHeight, n.getBoundingClientRect().bottom); n.scrollTop += el.getBoundingClientRect().bottom - (floor - gap); }
  window.scrollTo(0, 0);
}, { selector, gap });

// Scroll the target into view first (a finger can only tap what is on screen), then tap.
const tapIn = async (page, touch, locator) => {
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await touch.tap(page, locator);
};

module.exports = { tapIn, KEYBOARD, keyboardFor, installKeyboardStub, waitApp, openLeftPane, addDefaultTextLayer, scrollToLow };
