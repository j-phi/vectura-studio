// TUX-037 ratchet: every destructive delete entry point goes through
// `ui.notifyUndoable(label, token)` so it shows the Undo toast.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []);
});

describe('TUX-037 delete -> Undo toast ratchet', () => {
  test.each([
    'src/ui/panels/layers-panel.js',
    'src/ui/menus/layer-context-menu.js',
    'src/ui/shell/canvas-context-menu.js',
    'src/ui/shortcuts.js',
    'src/ui/panels/pens-panel.js',
  ])('%s calls notifyUndoable(', (rel) => {
    expect(read(rel)).toMatch(/notifyUndoable(\?\.)?\(/);
  });

  // Pinned count of `removeLayer(` text occurrences under src/ui (code + comments).
  // Today: shortcuts (1), canvas-context-menu (1), layers-panel _lvlDelSel (1),
  // layer-context-menu shared _deleteLayerWithUndo (1) + Ungroup (1) + header comment (1).
  // A new direct call site fails here until it is reviewed: it must show the Undo toast
  // (or, like Ungroup, remove no content), then bump this number.
  test('removeLayer( call sites under src/ui are pinned', () => {
    let count = 0;
    walk(path.join(ROOT, 'src/ui')).forEach((f) => {
      count += (fs.readFileSync(f, 'utf8').match(/removeLayer\(/g) || []).length;
    });
    expect(count).toBe(6);
  });
});
