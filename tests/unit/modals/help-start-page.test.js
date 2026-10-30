/*
 * Pins the Start Page entries of the in-app help guide and shortcut list against
 * src/config/start-page.js (START_PAGE.SHORTCUTS) and the Start Page key handlers:
 * every shortcut and gesture is listed exactly once, with the right Mac and non-Mac keys,
 * and the guide uses US spelling.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('help guide: Start Page shortcuts and gestures', () => {
  let dom;
  let doc;

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    const ctx = dom.getInternalVMContext();
    for (const rel of ['src/ui/modals/help-shortcuts.js']) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
    }
    const H = dom.window.Vectura.UI.Modals.HelpShortcuts;
    H.bind({});
    const holder = dom.window.document.createElement('div');
    holder.innerHTML = H.buildHelpContent.call({});
    doc = holder;
  });
  afterAll(() => dom?.window?.close?.());

  const rows = () => [...doc.querySelectorAll('tr.help-row')].map((tr) => ({
    keys: [...tr.querySelectorAll('.help-row-keys kbd')].map((kbd) => `${kbd.dataset.mac || kbd.textContent}|${kbd.dataset.win || kbd.textContent}`).join(' '),
    desc: tr.querySelector('.help-row-desc')?.textContent.trim() || '',
  }));
  const withDesc = (re) => rows().filter((r) => re.test(r.desc));

  it('lists Start Page, New canvas and Open recent once each with Mac and non-Mac keys', () => {
    const sp = withDesc(/^Start Page$/);
    expect(sp).toHaveLength(1);
    expect(sp[0].keys).toBe('⌘|Ctrl ⇧|Shift H|H');
    const nc = withDesc(/^New canvas$/);
    expect(nc).toHaveLength(1);
    expect(nc[0].keys).toBe('⌘|Ctrl N|N');
    const rc = withDesc(/^Open a recent project$/);
    expect(rc).toHaveLength(1);
    expect(rc[0].keys).toBe('⌘|Ctrl ⌥|Alt 1–8|1–8');
  });

  it('lists Arrange move once, in its own Start Page section', () => {
    const mv = withDesc(/Move the focused plate/);
    expect(mv).toHaveLength(1);
    expect(mv[0].keys).toBe('⌥|Alt ↑ / ↓|↑ / ↓');
    const hdrs = [...doc.querySelectorAll('.help-section-hdr')].map((h) => h.textContent);
    expect(hdrs.filter((h) => /Arrange/.test(h))).toEqual(['Start Page · Arrange plates']);
  });

  it('lists the Esc and 3D-rotate gestures once each', () => {
    const esc = withDesc(/^Leave the Start Page$/);
    expect(esc).toHaveLength(1);
    expect(esc[0].keys).toBe('Esc|Esc');
    expect(withDesc(/^Rotate a 3D piece$/)).toHaveLength(1);
    expect(withDesc(/^Turn a focused 3D piece$/)).toHaveLength(1);
  });

  it('uses US spelling', () => {
    expect(doc.textContent).not.toMatch(/colour/i);
  });
});
