/* Pen Studio responsive rules live in the PEN STUDIO block of components.css. */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.resolve(__dirname, '../../../src/ui/skin/components.css'), 'utf8');
const block = css.slice(css.indexOf('PEN STUDIO (pen-studio-*)'), css.indexOf('/* END PEN STUDIO */'));

describe('Pen Studio responsive CSS', () => {
  test('boxes column has a min-width so names do not collapse to one letter', () => {
    expect(block).toMatch(/\.pen-studio-boxes \{[^}]*min-width: 200px/);
  });
  test('box and pen names clamp to two lines before ellipsis; count never wraps below', () => {
    expect(block).toMatch(/\.pen-studio-box-name \{[^}]*-webkit-line-clamp: 2/);
    expect(block).toMatch(/\.pen-studio-row-name \{[^}]*-webkit-line-clamp: 2/);
    expect(block).toMatch(/\.pen-studio-box-count \{[^}]*white-space: nowrap/);
    expect(block).toMatch(/\.pen-studio-box-toggle \{[^}]*min-width: 0/);
  });
  test('paper chips use an auto-fill grid', () => {
    expect(block).toMatch(/\.pen-studio-papers \{[^}]*repeat\(auto-fill, minmax\(96px, 1fr\)\)/);
  });
  test('pair column stacks under the lab via a container query, not a viewport query', () => {
    expect(block).toMatch(/@container pen-studio \(max-width: 1100px\)/);
    expect(block).not.toMatch(/@media[^{]*max-width/);
  });
  test('canvases fill their column', () => {
    expect(block).toMatch(/\.pen-studio-matrix-cell \{[^}]*width: 100%/);
  });
});
