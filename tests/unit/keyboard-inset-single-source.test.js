/*
 * TUX-032: window.visualViewport is read in exactly one module (src/ui/keyboard-inset.js).
 * Every other sheet, popover and field reads --kb-inset or KeyboardInset.inset.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const OWNER = path.join(SRC, 'ui', 'keyboard-inset.js');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return walk(full);
  return e.isFile() && e.name.endsWith('.js') ? [full] : [];
});

describe('visualViewport has a single reader', () => {
  test('only src/ui/keyboard-inset.js mentions visualViewport', () => {
    const offenders = walk(SRC)
      .filter((f) => f !== OWNER)
      .filter((f) => /visualViewport/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
  test('the owner module exists and registers Vectura.KeyboardInset', () => {
    expect(fs.readFileSync(OWNER, 'utf8')).toMatch(/Vectura\.KeyboardInset\s*=/);
  });
});
