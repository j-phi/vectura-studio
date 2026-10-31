/**
 * Start Page plate color names: the paper and pen names a plate shows (header meta line + PAPER / PEN spec rows) describe the
 * colors actually shown. StartPagePlateColors.resolve(...).colorway carries paperName / penName that follow manual colors.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ctx = { Vectura: {}, console };
ctx.window = ctx; ctx.globalThis = ctx;
let C; let P;
beforeAll(() => {
  vm.createContext(ctx);
  for (const rel of ['src/config/start-page-plate-palette.js', 'src/core/start-page/plate-rhythm.js', 'src/core/start-page/plate-type.js', 'src/core/start-page/plate-fills.js', 'src/ui/start-page/plates/colors.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  }
  C = ctx.Vectura.StartPagePlateColors;
  P = ctx.Vectura.START_PAGE_PLATE_PALETTE.find((e) => e.id === 'black-silver');
});

const names = (colors) => { const cw = C.resolve(P, colors, { layout: 'knockout-title' }).colorway; return [cw.paperName, cw.penName]; };

describe('resolve: paper / pen names follow manual colors', () => {
  it('Auto keeps the palette names', () => {
    expect(names(null)).toEqual([P.paperName, P.penName]);
    expect(names({ title: '#ff0000', band: '#00ff00', text: '#ffffff' })).toEqual([P.paperName, P.penName]); // Title / Band / Text never rename
  });
  it('a manual art fill names the ink after the fill', () => {
    expect(names({ art: { fill: 'iridescent' } })).toEqual([P.paperName, 'Iridescent ink']);
    expect(names({ art: { fill: 'metallic-gold' } })[1]).toBe('Metallic gold ink');
  });
  it('a manual art hex uses the matching pen name, else a readable custom name', () => {
    const other = ctx.Vectura.START_PAGE_PLATE_PALETTE.find((e) => e.ink.toLowerCase() !== P.ink.toLowerCase());
    expect(names({ art: other.ink })[1]).toBe(other.penName);
    expect(names({ art: P.ink.toUpperCase() })[1]).toBe(P.penName);
    expect(names({ art: '#0f766f' })[1]).toBe('Custom ink #0f766f');
  });
  it('a manual background names the paper the same way', () => {
    const other = ctx.Vectura.START_PAGE_PLATE_PALETTE.find((e) => e.ground.toLowerCase() !== P.ground.toLowerCase());
    expect(names({ background: other.ground })[0]).toBe(other.paperName);
    expect(names({ background: '#123456' })[0]).toBe('Custom paper #123456');
    expect(names({ background: { fill: 'sunset' } })[0]).toBe('Sunset gradient paper');
    expect(names({ background: '#123456' })[1]).toBe(P.penName);
  });
});
