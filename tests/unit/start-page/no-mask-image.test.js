/*
 * Owner rule: no CSS mask-image on Start Page art. The band's left fade is a real gradient overlay element.
 */
const fs = require('fs');
const path = require('path');

const SKIN = path.resolve(__dirname, '../../../src/ui/skin');
const css = (f) => fs.readFileSync(path.join(SKIN, f), 'utf8');

describe('Start Page art has no CSS mask', () => {
  test.each(['components.css', 'motion.css', 'tokens.css'])('%s: no mask / mask-image declaration inside an .sp- rule', (file) => {
    const text = css(file).replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text))) {
      if (/\.sp-|#start-page/.test(m[1]) && /(^|[;\s])(-webkit-)?mask(-image)?\s*:/.test(m[2])) offenders.push(m[1].trim());
    }
    expect(offenders).toEqual([]);
  });

  test('the band fades its art with a gradient overlay element', () => {
    const cover = fs.readFileSync(path.resolve(__dirname, '../../../src/ui/start-page/cover.js'), 'utf8');
    expect(cover).toMatch(/sp-pf-fade/);
    expect(css('components.css')).toMatch(/\.sp-pf-fade\s*\{[^}]*linear-gradient/);
  });
});
