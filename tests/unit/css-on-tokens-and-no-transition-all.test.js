const fs = require('fs');
const path = require('path');

/**
 * CSS-5 + CSS-7-partial regression tests.
 *
 * CSS-5: Introduce semantic foreground-on-accent tokens so hardcoded `#fff`
 * literals stop drifting away from per-skin contrast requirements. Tokens
 * --ui-on-accent, --ui-on-danger, --ui-on-warning must exist in tokens.css
 * with hex values.
 *
 * CSS-7-partial: `transition: all` is a perf footgun (animates every
 * computed property, including box-shadow/transform during paint). All
 * occurrences inside `src/ui/skin/` must be replaced with explicit
 * property lists.
 */
describe('CSS-5/7p — on-tokens + no transition:all', () => {
  const skinDir = path.resolve(__dirname, '..', '..', 'src', 'ui', 'skin');
  const tokensCss = fs.readFileSync(path.join(skinDir, 'tokens.css'), 'utf8');

  test('tokens.css declares --ui-on-accent with a hex value', () => {
    expect(tokensCss).toMatch(/--ui-on-accent:\s*#[0-9a-fA-F]{3,8}\s*;/);
  });

  test('tokens.css declares --ui-on-danger with a hex value', () => {
    expect(tokensCss).toMatch(/--ui-on-danger:\s*#[0-9a-fA-F]{3,8}\s*;/);
  });

  test('tokens.css declares --ui-on-warning with a hex value', () => {
    expect(tokensCss).toMatch(/--ui-on-warning:\s*#[0-9a-fA-F]{3,8}\s*;/);
  });

  test('no "transition: all" declarations remain in src/ui/skin/', () => {
    const offenders = [];
    const files = fs.readdirSync(skinDir).filter((f) => f.endsWith('.css'));
    for (const file of files) {
      const text = fs.readFileSync(path.join(skinDir, file), 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, idx) => {
        if (/transition:\s*all\b/.test(line)) {
          offenders.push(`${file}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
