/**
 * Start Page plate color roles (src/core/start-page/plate-type.js COLOR_ROLES + src/ui/start-page/plates/colors.js):
 * which layouts render a Title (display word) and a Band (secondary ground), and what resolve() does with them.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ctx = { Vectura: {}, console };
ctx.window = ctx; ctx.globalThis = ctx;
let T; let C;
beforeAll(() => {
  vm.createContext(ctx);
  for (const rel of ['src/core/start-page/plate-rhythm.js', 'src/core/start-page/plate-type.js', 'src/core/start-page/plate-fills.js', 'src/ui/start-page/plates/colors.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  }
  T = ctx.Vectura.StartPagePlateType;
  C = ctx.Vectura.StartPagePlateColors;
});

const BASE = { ground: '#101418', ink: '#7fe0c0', accent: '#d08040', class: 'dark', textInk: '#e8e8e8' };

describe('color roles by layout', () => {
  it('Title is offered where a display word is drawn, Band where a solid secondary ground is', () => {
    const table = Object.fromEntries(T.LAYOUTS.map((l) => [l.id, T.rolesFor(l.id)]));
    expect(table).toEqual({
      'vertical-word': ['title'], 'spec-sheet': ['title'], 'text-wrap': [], waterfall: ['title'], knockout: ['band'],
      'full-sheet': ['title'], 'full-bleed-band': ['title', 'band'], diptych: ['title'], 'specimen-frame': [],
      'big-numeral': ['title'], 'words-both-sides': ['title'], 'plot-stages': [], 'knockout-title': ['title', 'band'],
      'detail-full': [], 'four-crops': [], 'pull-quote': [],
    });
  });
  it('an unknown layout has no roles', () => { expect(T.rolesFor('nope')).toEqual([]); });
});

describe('resolve: Title and Band', () => {
  it('Auto (null or missing) is exactly the old output', () => {
    const old = C.resolve(BASE, { art: { fill: 'iridescent' }, text: null, background: null });
    const auto = C.resolve(BASE, { art: { fill: 'iridescent' }, text: null, background: null, title: null, band: null }, { layout: 'full-bleed-band' });
    expect(JSON.stringify(auto.colorway)).toBe(JSON.stringify(old.colorway));
    expect(auto.art).toEqual(old.art);
    expect(auto.ground).toEqual(old.ground);
    expect(auto.title.kind).toBeNull();
    expect(auto.band.kind).toBeNull();
    expect(auto.contrast.warnings).toEqual(old.contrast.warnings);
  });
  it('a hex Title and Band resolve independently of the art fill', () => {
    const r = C.resolve(BASE, { art: { fill: 'iridescent' }, title: '#ff3366', band: '#224466' }, { layout: 'full-bleed-band' });
    expect(r.title).toMatchObject({ kind: 'solid', css: '#ff3366' });
    expect(r.band).toMatchObject({ kind: 'solid', css: '#224466' });
    expect(r.band.on).toMatch(/^#[0-9a-f]{6}$/);
    expect(T.contrast(r.band.on, '#224466')).toBeGreaterThanOrEqual(4.5);
    expect(r.art.kind).toBe('iridescent');
  });
  it('a special fill on Title gives a gradient spec; on Band a CSS background', () => {
    const r = C.resolve(BASE, { title: { fill: 'sunset' }, band: { fill: 'metallic-gold' } }, { layout: 'full-bleed-band' });
    expect(r.title.kind).toBe('sunset');
    expect(r.title.spec.stops.length).toBeGreaterThan(1);
    expect(r.band.kind).toBe('metallic-gold');
    expect(r.band.css).toMatch(/linear-gradient/);
  });
  it('warns when the Title is below 3:1 against the band it sits on, and against the ground elsewhere', () => {
    const onBand = C.resolve(BASE, { title: '#224466', band: '#224466' }, { layout: 'full-bleed-band' });
    expect(onBand.contrast.warnings.map((w) => w.code)).toContain('title-contrast');
    const onGround = C.resolve(BASE, { title: '#101418' }, { layout: 'diptych' });
    expect(onGround.contrast.warnings.map((w) => w.code)).toContain('title-contrast');
    const fine = C.resolve(BASE, { title: '#ffffff' }, { layout: 'diptych' });
    expect(fine.contrast.warnings.map((w) => w.code)).not.toContain('title-contrast');
  });
  it('a Band that swallows the paper-colored Auto title is flagged too', () => {
    const r = C.resolve(BASE, { band: '#101418' }, { layout: 'knockout-title' });
    expect(r.contrast.warnings.map((w) => w.code)).toContain('title-contrast');
  });
  it('roles the layout does not use raise no warnings', () => {
    const r = C.resolve(BASE, { title: '#101418', band: '#101418' }, { layout: 'text-wrap' });
    expect(r.contrast.warnings.map((w) => w.code)).not.toContain('title-contrast');
  });
});
