/** Pen Studio draft — dirty tracking, key states, commit. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = [
  'src/config/pen-models.js', 'src/config/pen-studio.js', 'src/config/ui-constants.js',
  'src/core/pen-validate.js', 'src/core/pen-model.js', 'src/core/pen-studio/store.js', 'src/core/pen-studio/draft.js',
];
const load = () => {
  const store = new Map();
  const win = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, crypto: globalThis.crypto, console };
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  FILES.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return win.Vectura;
};

let V; let S; let D; let doc; let penId; let pen;
beforeEach(() => {
  V = load(); S = V.PenStudioStore; D = V.PenStudioDraft;
  const made = S.createBox(S.emptyDoc());
  const added = S.addPen(made.doc, made.boxId, { name: 'Gel', color: '#f8f8f4', model: 'sakura-gelly-roll-classic' });
  doc = added.doc; penId = added.penId; pen = S.penById(doc, penId);
});

describe('values and key states', () => {
  it('reads draft, then saved, then the model default', () => {
    const model = V.PEN_MODELS.MODELS['sakura-gelly-roll-classic'];
    expect(D.valueOf(pen, D.newDraft(), 'wetness')).toBe(model.bleed.wetness);
    const saved = S.penById(S.updatePen(doc, penId, { ink: { wetness: 0.8 } }), penId);
    expect(D.valueOf(saved, D.newDraft(), 'wetness')).toBe(0.8);
    expect(D.valueOf(saved, D.set(D.newDraft(), 'wetness', 0.2), 'wetness')).toBe(0.2);
  });

  it('keyState is draft / saved / default', () => {
    const saved = S.penById(S.updatePen(doc, penId, { ink: { wetness: 0.8 } }), penId);
    expect(D.keyState(saved, D.newDraft(), 'wetness')).toBe('saved');
    expect(D.keyState(saved, D.newDraft(), 'jitter')).toBe('default');
    expect(D.keyState(saved, D.set(D.newDraft(), 'wetness', 0.3), 'wetness')).toBe('draft');
    expect(D.keyState(saved, D.set(D.newDraft(), 'wetness', 0.8), 'wetness')).toBe('saved');
    expect(D.keyState(pen, D.set(D.newDraft(), 'jitter', 0.2), 'jitter')).toBe('draft');
  });

  it('set clamps, ignores junk and does not mutate', () => {
    const d0 = D.newDraft();
    const d1 = D.set(d0, 'skips', 5);
    expect(d1.ink.skips).toBe(0.25);
    expect(d0.ink).toEqual({});
    expect(D.set(d1, 'skips', NaN).ink.skips).toBe(0.25);
    expect(D.set(d0, 'starvation', 7).ink.starvation).toBe(0.9);
  });
});

describe('dirty and commit', () => {
  it('is not dirty until something differs from the saved pen', () => {
    expect(D.isDirty(pen, D.newDraft())).toBe(false);
    expect(D.isDirty(pen, null)).toBe(false);
    const def = D.valueOf(pen, D.newDraft(), 'wetness');
    expect(D.isDirty(pen, D.set(D.newDraft(), 'wetness', def))).toBe(false);
    expect(D.isDirty(pen, D.set(D.newDraft(), 'wetness', def + 0.2))).toBe(true);
    expect(D.isDirty(pen, { ink: {}, name: 'Gel' })).toBe(false);
    expect(D.isDirty(pen, { ink: {}, name: 'Gel 2' })).toBe(true);
    expect(D.isDirty(pen, { ink: {}, name: '   ' })).toBe(false);
    expect(D.isDirty(pen, { ink: {}, desc: 'a note' })).toBe(true);
  });

  it('commit strips default-valued keys and falls back on an empty name', () => {
    const def = D.valueOf(pen, D.newDraft(), 'wetness');
    let draft = D.set(D.set(D.newDraft(), 'wetness', def), 'skips', 0.12);
    draft = Object.assign({}, draft, { name: '   ', desc: ' Sticky  ' });
    const out = S.penById(D.commit(doc, penId, draft), penId);
    expect(out.ink).toEqual({ skips: 0.12 });
    expect(out.name).toBe('Gel');
    expect(out.desc).toBe('Sticky');
    expect(D.commit(doc, 'nope', draft)).toBe(doc);
  });

  it('effectiveInk overlays the draft on saved ink', () => {
    const saved = S.penById(S.updatePen(doc, penId, { ink: { skips: 0.1, blobs: 2 } }), penId);
    expect(D.effectiveInk(saved, D.set(D.newDraft(), 'skips', 0.2))).toEqual({ skips: 0.2, blobs: 2 });
  });

  it('resetToModel returns every slider to the default and commits to an empty ink', () => {
    const withInk = S.updatePen(doc, penId, { ink: { skips: 0.1, blobs: 2 } });
    const saved = S.penById(withInk, penId);
    const reset = D.resetToModel(saved);
    expect(Object.keys(reset.ink).sort()).toEqual(V.PEN_STUDIO.SLIDERS.map((s) => s.key).sort());
    expect(D.isDirty(saved, reset)).toBe(true);
    expect(S.penById(D.commit(withInk, penId, reset), penId).ink).toEqual({});
    expect(D.isDirty(pen, D.resetToModel(pen))).toBe(false);
  });

  it('defaultSaveNewName uses the changed name or "<name> (custom)"', () => {
    expect(D.defaultSaveNewName(pen, D.newDraft())).toBe('Gel (custom)');
    expect(D.defaultSaveNewName(pen, { ink: {}, name: 'Gel' })).toBe('Gel (custom)');
    expect(D.defaultSaveNewName(pen, { ink: {}, name: ' Frosty ' })).toBe('Frosty');
    const long = S.penById(S.updatePen(doc, penId, { name: 'x'.repeat(48) }), penId);
    expect(D.defaultSaveNewName(long, D.newDraft())).toHaveLength(48);
  });
});
