const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

/**
 * Phase 5 — SDK smoke tests for `scripts/skin-new.js` and `src/ui/skin/_template.css`.
 *
 * These tests verify:
 *   1. The template file exists and contains `__SKIN_ID__` placeholder.
 *   2. `scripts/skin-new.js` substitutes the placeholder, refuses overwrite without --force,
 *      validates id format, and prints the manifest snippet.
 *   3. The template covers every required token group consumed by the skin manager,
 *      renderer, and components.css.
 */
describe('Skin SDK', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const templatePath = path.join(repoRoot, 'src', 'ui', 'skin', '_template.css');
  const scriptPath = path.join(repoRoot, 'scripts', 'skin-new.js');
  const skinDir = path.join(repoRoot, 'src', 'ui', 'skin');

  // Use a unique id so we don't collide with fixtures or real skins.
  const tempIds = [];
  const cleanupTempSkin = (id) => {
    const file = path.join(skinDir, `${id}.css`);
    try { fs.unlinkSync(file); } catch (e) { /* ignore */ }
  };

  afterAll(() => {
    tempIds.forEach(cleanupTempSkin);
  });

  describe('_template.css', () => {
    test('exists and contains the __SKIN_ID__ placeholder', () => {
      expect(fs.existsSync(templatePath)).toBe(true);
      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('__SKIN_ID__');
      expect(content).toMatch(/\[data-ui-skin="__SKIN_ID__"\]/);
    });

    test('declares every required --ui-* token group', () => {
      const content = fs.readFileSync(templatePath, 'utf8');
      const required = [
        '--ui-bg', '--ui-panel', '--ui-panel-alt', '--ui-border', '--ui-border-hi',
        '--ui-text', '--ui-text-2', '--ui-muted', '--ui-formula',
        '--ui-accent', '--ui-accent-2', '--ui-danger',
        '--ui-ctrl', '--ui-ctrl-hov', '--ui-workspace', '--slider-start',
      ];
      required.forEach((token) => {
        expect(content).toContain(`${token}:`);
      });
    });

    test('declares the Tailwind --vectura-*-rgb decomposition', () => {
      const content = fs.readFileSync(templatePath, 'utf8');
      const rgbTokens = [
        '--vectura-bg-rgb', '--vectura-panel-rgb', '--vectura-border-rgb',
        '--vectura-text-rgb', '--vectura-muted-rgb', '--vectura-accent-rgb',
        '--vectura-danger-rgb',
      ];
      rgbTokens.forEach((token) => {
        expect(content).toContain(`${token}:`);
      });
    });

    test('declares legacy --color-* aliases mapping to --ui-* tokens', () => {
      const content = fs.readFileSync(templatePath, 'utf8');
      // Sample a few — the full list is documented in skin-authoring.md.
      expect(content).toMatch(/--color-bg:\s*var\(--ui-bg\)/);
      expect(content).toMatch(/--color-text:\s*var\(--ui-text\)/);
      expect(content).toMatch(/--color-accent:\s*var\(--ui-accent\)/);
    });

    test('declares renderer + designer + plotter token groups', () => {
      const content = fs.readFileSync(templatePath, 'utf8');
      expect(content).toContain('--render-canvas:');
      expect(content).toContain('--render-selection-handle-fill:');
      expect(content).toContain('--designer-grid-bg:');
      expect(content).toContain('--plotter-bg:');
    });
  });

  describe('scripts/skin-new.js', () => {
    test('rejects invalid skin ids', () => {
      let threw = false;
      try {
        execFileSync('node', [scriptPath, 'NotKebab'], { stdio: 'pipe' });
      } catch (err) {
        threw = true;
        expect(err.status).not.toBe(0);
        const stderr = String(err.stderr || '');
        expect(stderr).toMatch(/invalid skin id/i);
      }
      expect(threw).toBe(true);
    });

    test('rejects missing skin id', () => {
      let threw = false;
      try {
        execFileSync('node', [scriptPath], { stdio: 'pipe' });
      } catch (err) {
        threw = true;
        expect(err.status).not.toBe(0);
        const stderr = String(err.stderr || '');
        expect(stderr).toMatch(/missing/i);
      }
      expect(threw).toBe(true);
    });

    test('generates a valid skin file from the template', () => {
      const id = `test-sdk-${Date.now()}`;
      tempIds.push(id);
      const out = execFileSync('node', [scriptPath, id], { encoding: 'utf8' });
      expect(out).toContain(`Created src/ui/skin/${id}.css`);

      const generated = fs.readFileSync(path.join(skinDir, `${id}.css`), 'utf8');
      expect(generated).not.toContain('__SKIN_ID__');
      expect(generated).toContain(`[data-ui-skin="${id}"]`);
      expect(generated).toContain('--ui-bg:');
    });

    test('refuses to overwrite without --force', () => {
      const id = `test-sdk-overwrite-${Date.now()}`;
      tempIds.push(id);
      execFileSync('node', [scriptPath, id], { stdio: 'pipe' });

      let threw = false;
      try {
        execFileSync('node', [scriptPath, id], { stdio: 'pipe' });
      } catch (err) {
        threw = true;
        expect(err.status).not.toBe(0);
        expect(String(err.stderr || '')).toMatch(/already exists.*--force/i);
      }
      expect(threw).toBe(true);

      // With --force, succeeds.
      const out = execFileSync('node', [scriptPath, id, '--force'], { encoding: 'utf8' });
      expect(out).toContain(`Created src/ui/skin/${id}.css`);
    });

    test('prints the manifest snippet to stdout', () => {
      const id = `test-sdk-snippet-${Date.now()}`;
      tempIds.push(id);
      const out = execFileSync('node', [scriptPath, id, '--label', 'My Skin'], { encoding: 'utf8' });
      expect(out).toContain(`'${id}':`);
      expect(out).toContain(`id: '${id}'`);
      expect(out).toContain(`label: 'My Skin'`);
      expect(out).toContain(`stylesheet: './src/ui/skin/${id}.css'`);
      expect(out).toContain('cssVars:');
    });
  });

});
