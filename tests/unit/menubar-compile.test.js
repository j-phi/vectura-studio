/*
 * Compile gate for src/ui/shell/menubar.js (Phase 2 step 3 second extraction).
 *
 * The legacy setTopMenuOpen/initTopMenuBar/triggerTopMenuAction bodies lived
 * inside the src/ui/ui.js IIFE and closure-captured the IIFE-local `getEl`
 * helper. After moving those bodies into menubar.js as
 * window.Vectura.UI.MenuBar.{setTopMenuOpen,initTopMenuBar,triggerTopMenuAction},
 * the legacy ui.js IIFE passes `getEl` in via MenuBar.bind(deps) during its
 * own initialization. If the wiring ever breaks — bind() not called, getEl
 * forgotten, or the new file's destructure drifts — initTopMenuBar() and
 * triggerTopMenuAction() throw on the very first call with a clear error.
 * (setTopMenuOpen does not depend on getEl, so it works without bind.)
 *
 * This compile gate proves:
 *
 * 1. The new file parses (Node enforces this; we additionally load it into
 *    JSDOM to confirm browser semantics are clean).
 * 2. The expected contract surface is exposed:
 *    - window.Vectura.UI.MenuBar.bind  (function)
 *    - window.Vectura.UI.MenuBar.setTopMenuOpen  (function)
 *    - window.Vectura.UI.MenuBar.initTopMenuBar  (function)
 *    - window.Vectura.UI.MenuBar.triggerTopMenuAction  (function)
 * 3. Calling initTopMenuBar / triggerTopMenuAction before bind() yields an
 *    explicit error from requireDeps() (clear failure mode, not silent
 *    ReferenceError).
 * 4. After bind(deps), initTopMenuBar runs without throwing when no
 *    `#top-menubar` element exists in the JSDOM document — early-skip path.
 * 5. Smoke test: against a constructed menubar fixture, the body wires triggers
 *    and setTopMenuOpen mutates aria-expanded/.open/panel.hidden exactly as the
 *    legacy body did (proves verbatim extraction preserves observable behavior).
 *
 * Mirrors tests/unit/theme-switcher-compile.test.js — same JSDOM harness,
 * same "clear failure mode before bind" guard pattern.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('menubar compile gate', () => {
  let dom;
  let MenuBar;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/menubar.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    MenuBar = w.Vectura.UI.MenuBar;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.MenuBar with bind + the three legacy methods', () => {
    expect(MenuBar).toBeTruthy();
    expect(typeof MenuBar.bind).toBe('function');
    expect(typeof MenuBar.setTopMenuOpen).toBe('function');
    expect(typeof MenuBar.initTopMenuBar).toBe('function');
    expect(typeof MenuBar.triggerTopMenuAction).toBe('function');
  });

  it('initTopMenuBar throws a clear error when bind() has not been called', () => {
    expect(() => MenuBar.initTopMenuBar.call({})).toThrow(/MenuBar\.initTopMenuBar invoked before MenuBar\.bind/);
  });

  it('triggerTopMenuAction throws a clear error when bind() has not been called', () => {
    expect(() => MenuBar.triggerTopMenuAction.call({}, 'btn-x')).toThrow(/MenuBar\.triggerTopMenuAction invoked before MenuBar\.bind/);
  });

  it('after bind(deps), initTopMenuBar runs without throwing when no #top-menubar element is present', () => {
    MenuBar.bind({ getEl: (id) => dom.window.document.getElementById(id) });
    // No #top-menubar in the JSDOM document → getEl returns null → early return.
    expect(() => MenuBar.initTopMenuBar.call({ topMenuTriggers: [], openTopMenuTrigger: null })).not.toThrow();
  });

  it('setTopMenuOpen mutates aria-expanded / .open class / panel.hidden on the supplied triggers', () => {
    // Build a minimal top-menubar fixture in JSDOM and call setTopMenuOpen
    // directly with `this` set to a UI-like instance. This is the smoke test
    // that proves the verbatim extraction preserves observable behavior.
    const doc = dom.window.document;

    // Clean any prior fixture.
    const prior = doc.getElementById('top-menubar');
    if (prior) prior.remove();

    const bar = doc.createElement('div');
    bar.id = 'top-menubar';
    bar.innerHTML = `
      <div>
        <button id="trig-a" data-top-menu-trigger>File</button>
        <div data-top-menu-panel><button class="top-menu-item" id="item-a1">New</button></div>
      </div>
      <div>
        <button id="trig-b" data-top-menu-trigger>Edit</button>
        <div data-top-menu-panel><button class="top-menu-item" id="item-b1">Undo</button></div>
      </div>
    `;
    doc.body.appendChild(bar);

    const trigA = doc.getElementById('trig-a');
    const trigB = doc.getElementById('trig-b');
    const panelA = trigA.parentElement.querySelector('[data-top-menu-panel]');
    const panelB = trigB.parentElement.querySelector('[data-top-menu-panel]');

    const ctx = { topMenuTriggers: [trigA, trigB], openTopMenuTrigger: null };

    // Open A.
    MenuBar.setTopMenuOpen.call(ctx, trigA, true);
    expect(trigA.getAttribute('aria-expanded')).toBe('true');
    expect(trigA.classList.contains('open')).toBe(true);
    expect(panelA.classList.contains('open')).toBe(true);
    expect(panelA.hidden).toBe(false);
    expect(trigB.getAttribute('aria-expanded')).toBe('false');
    expect(panelB.hidden).toBe(true);
    expect(ctx.openTopMenuTrigger).toBe(trigA);

    // Switch to B.
    MenuBar.setTopMenuOpen.call(ctx, trigB, true);
    expect(trigA.getAttribute('aria-expanded')).toBe('false');
    expect(panelA.hidden).toBe(true);
    expect(trigB.getAttribute('aria-expanded')).toBe('true');
    expect(panelB.hidden).toBe(false);
    expect(ctx.openTopMenuTrigger).toBe(trigB);

    // Close.
    MenuBar.setTopMenuOpen.call(ctx, null, false);
    expect(trigA.getAttribute('aria-expanded')).toBe('false');
    expect(trigB.getAttribute('aria-expanded')).toBe('false');
    expect(panelA.hidden).toBe(true);
    expect(panelB.hidden).toBe(true);
    expect(ctx.openTopMenuTrigger).toBeNull();
  });

  it('triggerTopMenuAction clicks the target button and closes the menu', () => {
    const doc = dom.window.document;
    let clicked = 0;
    const btn = doc.createElement('button');
    btn.id = 'btn-fake-action';
    btn.addEventListener('click', () => {
      clicked += 1;
    });
    doc.body.appendChild(btn);

    // Re-bind with the JSDOM getEl in case a prior test mutated DEPS.
    MenuBar.bind({ getEl: (id) => doc.getElementById(id) });

    const trig = doc.querySelector('#trig-a');
    // Mirror the legacy UI prototype: `this.setTopMenuOpen` routes back to the
    // module. In production this is the prototype delegator on the UI class;
    // here we wire it directly so triggerTopMenuAction's `this.setTopMenuOpen`
    // resolves the same way.
    const ctx = {
      topMenuTriggers: [trig],
      openTopMenuTrigger: trig,
      setTopMenuOpen(t, o) { MenuBar.setTopMenuOpen.call(this, t, o); },
    };
    // Open the menu first so we can verify it gets closed.
    MenuBar.setTopMenuOpen.call(ctx, trig, true);
    expect(ctx.openTopMenuTrigger).toBe(trig);

    const ok = MenuBar.triggerTopMenuAction.call(ctx, 'btn-fake-action');
    expect(ok).toBe(true);
    expect(clicked).toBe(1);
    expect(ctx.openTopMenuTrigger).toBeNull();

    // Missing button id returns false without throwing.
    const okMissing = MenuBar.triggerTopMenuAction.call(ctx, 'btn-does-not-exist');
    expect(okMissing).toBe(false);
  });
});
