/*
 * Metric + imperial length formatting shared by the Send to Plotter panel (fmtLen / fmtSize / fmtDist).
 * documentUnits 'imperial' leads with inches and shows mm in parentheses; anything else leads with mm.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('send-to-plotter length formatter', () => {
  let dom; let STP;
  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
    const context = dom.getInternalVMContext();
    for (const rel of ['src/config/plotters.js', 'src/core/plotter/plot-safety.js', 'src/ui/modals/send-to-plotter.js']) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context, { filename: rel });
    }
    STP = dom.window.Vectura.UI.Modals.SendToPlotter;
  });
  afterAll(() => dom?.window?.close?.());
  const units = (u) => { dom.window.Vectura.SETTINGS = { documentUnits: u }; };

  it('metric mode leads with mm and puts inches in parentheses', () => {
    units('metric');
    expect(STP.fmtLen(25.4)).toBe('25 mm (1.0 in)');
    expect(STP.fmtLen(1.5, { precision: 1 })).toBe('1.5 mm (0.06 in)');
    expect(STP.fmtSize(420, 297)).toBe('420 × 297 mm (16.5 × 11.7 in)');
  });

  it('imperial mode leads with inches and puts mm in parentheses', () => {
    units('imperial');
    expect(STP.fmtLen(25.4)).toBe('1.0 in (25 mm)');
    expect(STP.fmtSize(420, 297)).toBe('16.5 × 11.7 in (420 × 297 mm)');
  });

  it('long distances switch to m and ft in both modes', () => {
    units('metric');
    expect(STP.fmtDist(2500)).toBe('2.50 m (8.20 ft)');
    expect(STP.fmtDist(500)).toBe('500 mm (19.7 in)');
    units('imperial');
    expect(STP.fmtDist(2500)).toBe('8.20 ft (2.50 m)');
  });

  it('defaults to metric when no units setting exists', () => {
    dom.window.Vectura.SETTINGS = undefined;
    expect(STP.fmtLen(100)).toBe('100 mm (3.9 in)');
  });
});
