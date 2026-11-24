/**
 * Opening several .vectura files at once: picker multi-select, drag & drop routing, and the ordered,
 * record-awaiting batch (openVecturaFiles) through the real ui-file-io mixin.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (scripts) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  scripts.forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return dom;
};
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('open several .vectura files', () => {
  let dom; let win; let ui; let log; let toasts;
  beforeEach(() => {
    dom = load(['src/core/utils.js', 'src/core/image-codec.js', 'src/ui/ui-file-io.js']);
    win = dom.window;
    toasts = [];
    win.Vectura.UI = win.Vectura.UI || {};
    win.Vectura.UI.overlays = { Toast: { show: (o) => toasts.push(o) } };
    log = [];
    ui = Object.assign({}, win.Vectura._UIFileIOMixin || {});
    ui.app = { confirmDiscardChanges: vi.fn(async () => true), recents: { record: vi.fn() } };
    ui.openModal = vi.fn();
  });
  afterEach(() => win.close());

  it('exposes the mixin methods', () => {
    expect(typeof ui.openVecturaFiles).toBe('function');
  });

  it('the picker asks for multiple files (FSA and input fallback)', async () => {
    ui.openVecturaFile = vi.fn(); ui.openVecturaFiles = vi.fn();
    const picker = vi.fn(() => Promise.resolve([]));
    win.showOpenFilePicker = picker;
    ui.pickVecturaFile();
    expect(picker.mock.calls[0][0].multiple).toBe(true);
    delete win.showOpenFilePicker;
    win.Vectura.FilePicker = { pickFile: vi.fn(({ input }) => input) };
    ui.pickVecturaFile({ forceInput: true });
    expect(win.document.getElementById('sp-transient-open').multiple).toBe(true);
  });

  it('FSA picking 3 files opens them as one batch with their handles', async () => {
    const files = ['a', 'b', 'c'].map((n) => ({ name: `${n}.vectura` }));
    const handles = files.map((f) => ({ getFile: async () => f }));
    win.showOpenFilePicker = vi.fn(() => Promise.resolve(handles));
    ui.openVecturaFile = vi.fn(); ui.openVecturaFiles = vi.fn();
    ui.pickVecturaFile();
    await tick();
    expect(ui.openVecturaFiles).toHaveBeenCalledWith(files, { handles });
    expect(ui.openVecturaFile).not.toHaveBeenCalled();
  });

  it('a single picked file keeps the single-file path', async () => {
    const f = { name: 'a.vectura' }; const h = { getFile: async () => f };
    win.showOpenFilePicker = vi.fn(() => Promise.resolve([h]));
    ui.openVecturaFile = vi.fn(); ui.openVecturaFiles = vi.fn();
    ui.pickVecturaFile();
    await tick();
    expect(ui.openVecturaFile).toHaveBeenCalledWith(f, { handle: h });
    expect(ui.openVecturaFiles).not.toHaveBeenCalled();
  });

  it('batch: confirms once, opens in order, awaits each record before the next load, summarizes', async () => {
    const files = ['a', 'b', 'c'].map((n) => ({ name: `${n}.vectura` }));
    const gates = [deferred(), deferred(), deferred()];
    ui.openVecturaFile = vi.fn(async (file, opts) => {
      log.push(`load:${file.name}`);
      expect(opts).toMatchObject({ awaitRecord: true, silentInvalid: true });
      await gates[files.indexOf(file)].promise; // stands in for the awaited recents record
      log.push(`recorded:${file.name}`);
      return true;
    });
    const p = ui.openVecturaFiles(files, { handles: [{ h: 1 }, { h: 2 }, { h: 3 }] });
    await tick();
    expect(log).toEqual(['load:a.vectura']);
    gates[0].resolve(); await tick();
    expect(log).toEqual(['load:a.vectura', 'recorded:a.vectura', 'load:b.vectura']);
    gates[1].resolve(); await tick(); gates[2].resolve();
    const res = await p;
    expect(res).toEqual({ opened: 3, failed: [] });
    expect(ui.app.confirmDiscardChanges).toHaveBeenCalledTimes(1);
    expect(ui.openVecturaFile.mock.calls[1][1].handle).toEqual({ h: 2 });
    expect(toasts.at(-1).message).toMatch(/Opened 3 projects/);
  });

  it('batch: an invalid file is skipped and summarized once; declining the discard opens nothing', async () => {
    const files = [{ name: 'a.vectura' }, { name: 'bad.vectura' }, { name: 'c.vectura' }];
    ui.openVecturaFile = vi.fn(async (f) => f.name !== 'bad.vectura');
    const res = await ui.openVecturaFiles(files);
    expect(res).toEqual({ opened: 2, failed: ['bad.vectura'] });
    expect(toasts.filter((t) => /could not be read/.test(t.message))).toHaveLength(1);
    expect(toasts.at(-1).message).toBe('Opened 2 of 3 projects; 1 could not be read (bad.vectura)');
    expect(ui.openModal).not.toHaveBeenCalled();
    ui.openVecturaFile.mockClear();
    ui.app.confirmDiscardChanges = vi.fn(async () => false);
    expect((await ui.openVecturaFiles(files)).cancelled).toBe(true);
    expect(ui.openVecturaFile).not.toHaveBeenCalled();
  });

  it('_readVecturaFile waits for the recents record only when awaitRecord is set', async () => {
    const gate = deferred();
    ui.app.recents.record = vi.fn(() => gate.promise);
    ui.loadVecturaPayload = vi.fn(() => true);
    const file = new win.Blob([JSON.stringify({ state: { engine: {}, settings: {} } })]);
    file.name = 'x.vectura';
    let plainDone = false; let awaitedDone = false;
    ui._readVecturaFile(file, {}).then(() => { plainDone = true; });
    ui._readVecturaFile(file, { awaitRecord: true }).then(() => { awaitedDone = true; });
    await new Promise((r) => setTimeout(r, 50));
    expect(plainDone).toBe(true);
    expect(awaitedDone).toBe(false);
    gate.resolve(); await tick();
    expect(awaitedDone).toBe(true);
  });
});
