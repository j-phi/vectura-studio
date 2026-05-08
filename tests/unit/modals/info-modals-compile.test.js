/*
 * Compile gate for src/ui/modals/info-modals.js (Phase 3 step 3 — second modal).
 *
 * Verifies the info-modals module:
 *   - registers as window.Vectura.UI.Modals.InfoModals
 *   - exposes bind() + the five method exports (showInfo, showDuplicateNameError,
 *     showValueError, attachInfoButton, attachStaticInfoButtons, bindInfoButtons)
 *   - throws a clear error if any method runs before bind()
 *   - showDuplicateNameError + showValueError compose this.openModal() with the
 *     expected title strings (no preview pipeline involvement)
 *   - attachInfoButton appends a <button class="info-btn"> with the expected
 *     data-info attribute and idempotency guard
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

describe('info-modals compile gate', () => {
  let dom;
  let InfoModals;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/modals/info-modals.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    InfoModals = w.Vectura.UI.Modals.InfoModals;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.InfoModals with bind + all six method exports', () => {
    expect(InfoModals).toBeTruthy();
    expect(typeof InfoModals.bind).toBe('function');
    expect(typeof InfoModals.showInfo).toBe('function');
    expect(typeof InfoModals.showDuplicateNameError).toBe('function');
    expect(typeof InfoModals.showValueError).toBe('function');
    expect(typeof InfoModals.attachInfoButton).toBe('function');
    expect(typeof InfoModals.attachStaticInfoButtons).toBe('function');
    expect(typeof InfoModals.bindInfoButtons).toBe('function');
  });

  it('showInfo throws a clear error before bind()', () => {
    expect(() => InfoModals.showInfo.call({}, 'whatever'))
      .toThrow(/InfoModals\.showInfo invoked before InfoModals\.bind/);
  });

  it('showDuplicateNameError throws a clear error before bind()', () => {
    expect(() => InfoModals.showDuplicateNameError.call({}, 'foo'))
      .toThrow(/InfoModals\.showDuplicateNameError invoked before InfoModals\.bind/);
  });

  it('after bind(), showDuplicateNameError + showValueError compose openModal with the expected title', () => {
    // Use a sentinel-marker escapeHtml so we can prove the module routes the
    // arg through the injected escaper rather than embedding the raw string.
    const seen = [];
    InfoModals.bind({
      INFO: {},
      buildPreviewPair: () => '',
      escapeHtml: (s) => {
        seen.push(s);
        return `[E:${s}]`;
      },
      getEl: (id) => dom.window.document.getElementById(id),
      SETTINGS: {},
    });

    let lastCall = null;
    const stub = { openModal: (opts) => { lastCall = opts; } };

    InfoModals.showDuplicateNameError.call(stub, 'My Layer');
    expect(lastCall).toBeTruthy();
    expect(lastCall.title).toBe('Name Unavailable');
    expect(lastCall.body).toContain('[E:My Layer]');
    expect(lastCall.body).toContain('already in use');
    expect(seen).toContain('My Layer');

    lastCall = null;
    InfoModals.showValueError.call(stub, '<bad>');
    expect(lastCall.title).toBe('Invalid Value');
    expect(lastCall.body).toContain('[E:<bad>]');
    expect(lastCall.body).toContain('outside the allowed range');
  });

  it('attachInfoButton appends an .info-btn child with data-info; idempotent', () => {
    const doc = dom.window.document;
    const label = doc.createElement('label');
    label.textContent = 'My Field';
    InfoModals.attachInfoButton.call({}, label, 'global.foo');
    const btn = label.querySelector('.info-btn');
    expect(btn).toBeTruthy();
    expect(btn.dataset.info).toBe('global.foo');
    expect(btn.getAttribute('aria-label')).toContain('My Field');

    // Re-attach should not double the button.
    InfoModals.attachInfoButton.call({}, label, 'global.foo');
    expect(label.querySelectorAll('.info-btn').length).toBe(1);
  });
});
