const fs = require('fs');
const path = require('path');

/**
 * Phase 5 — keyboard a11y audit (manual + scripted).
 *
 * Per plan §"Phase 5" (line 722): "Keyboard a11y audit (Tab order, focus rings,
 * Esc paths)." Manual audit results live in `docs/a11y-audit-phase5.md`.
 *
 * This file scripts the easy half: scan source files to confirm every shipped
 * overlay primitive and every keyboard-capturing component has an Esc handler,
 * and confirm the modal primitive implements a focus-trap. If a future overlay
 * is added without these wires, this test fails — forcing the author to update
 * the audit doc and the wires together.
 */
describe('Keyboard a11y audit', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const read = (...rel) => fs.readFileSync(path.join(repoRoot, ...rel), 'utf8');

  test('focus-trapping overlay primitives handle Escape', () => {
    // The two focus-trapping primitives must handle Escape directly; everything
    // else either delegates to one of these (dialog → modal) or is a passive
    // surface (toast, drag-drop, progress-bar, empty-state, tooltip).
    ['modal.js', 'menu.js'].forEach((file) => {
      const src = read('src', 'ui', 'overlays', file);
      expect(src, `${file} must handle Escape directly`).toMatch(/key\s*===\s*['"]Escape['"]/);
    });
  });

  test('dialog primitive delegates to modal (inherits Escape)', () => {
    const dialog = read('src', 'ui', 'overlays', 'dialog.js');
    // Dialog wraps Modal — confirm the delegation pattern is intact.
    expect(dialog).toMatch(/UI\.overlays\.Modal|overlays\.Modal/);
  });

  test('keyboard-capturing components cancel via Escape', () => {
    const components = ['slider.js', 'number-input.js', 'angle-dial.js'];
    components.forEach((file) => {
      const src = read('src', 'ui', 'components', file);
      expect(src, `${file} must handle Escape (cancel edit)`).toMatch(/key\s*===\s*['"]Escape['"]/);
    });
  });

  test('modal primitive implements focus-trap (delegates to UI.focus.trap)', () => {
    const modal = read('src', 'ui', 'overlays', 'modal.js');
    expect(modal).toMatch(/Escape/);
    expect(modal).toMatch(/focus|Focus/);
    // Modal delegates Tab boundary detection to UI.focus.trap.
    expect(modal).toMatch(/focus\.trap|focus\.getFocusable/);

    // The trap implementation lives in src/ui/focus.js — confirm it actually
    // listens for the Tab key and cycles focus.
    const focusJs = read('src', 'ui', 'focus.js');
    expect(focusJs).toMatch(/key\s*!==?\s*['"]Tab['"]|key\s*===\s*['"]Tab['"]/);
    expect(focusJs).toMatch(/getFocusable|focusables?/);
  });

  test('shortcuts.js handles Escape for at least the documented surfaces', () => {
    const shortcuts = read('src', 'ui', 'shortcuts.js');
    const escMatches = shortcuts.match(/key\s*===\s*['"]Escape['"]/g) || [];
    // Plan: tool cancel (algo-draw, scissor, pen-draw), palette dismiss, modal esc — at least 4.
    expect(escMatches.length).toBeGreaterThanOrEqual(4);
  });

  test('skin CSS does not nuke focus-visible rings on focusable controls', () => {
    // The skin CSS uses `outline: none` on a few controls, but the legacy
    // styles.css `:focus-visible` rules paint a ring via outline + accent.
    // Confirm styles.css still ships at least one such rule sourced from --color-accent.
    const styles = read('styles.css');
    // At least 5 :focus-visible rules per the manual audit.
    const matches = styles.match(/:focus-visible/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
    // At least one outline rule references the accent token.
    expect(styles).toMatch(/outline:\s*2px\s+solid\s+var\(--color-accent\)/);
  });

  test('a11y audit doc exists and lists every audited surface', () => {
    const auditPath = path.join(repoRoot, 'docs', 'a11y-audit-phase5.md');
    expect(fs.existsSync(auditPath)).toBe(true);
    const audit = fs.readFileSync(auditPath, 'utf8');
    // Spot-check the surfaces table is present.
    expect(audit).toMatch(/Document Setup modal/);
    expect(audit).toMatch(/Petal Designer/);
    expect(audit).toMatch(/Pattern Designer/);
    expect(audit).toMatch(/Pen palette dropdown/);
    expect(audit).toMatch(/Methodology/);
  });
});
