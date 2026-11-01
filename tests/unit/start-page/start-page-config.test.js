/*
 * Unit tests for src/config/start-page.js — window.Vectura.START_PAGE
 * (defaults, enums, limits, shortcuts, sanitize).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const load = () => {
  const ctx = vm.createContext({ window: {} });
  ctx.window.window = ctx.window;
  const code = fs.readFileSync(path.join(ROOT, 'src/config/start-page.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'src/config/start-page.js' });
  return ctx.window.Vectura.START_PAGE;
};

describe('START_PAGE config', () => {
  let SP;
  beforeAll(() => { SP = load(); });

  it('registers on window.Vectura and is frozen', () => {
    expect(SP).toBeTruthy();
    expect(Object.isFrozen(SP)).toBe(true);
    expect(Object.isFrozen(SP.DEFAULTS)).toBe(true);
    expect(Object.isFrozen(SP.ENUMS)).toBe(true);
    expect(Object.isFrozen(SP.LIMITS)).toBe(true);
  });

  it('exposes the contract defaults', () => {
    expect(SP.DEFAULTS).toEqual({
      showOnLaunch: true, coverStyle: 'mosaic', showName: false, showLine: false,
      motionStill: false, railCollapsed: false, visiblePlates: 5, showExamples: true, animateIn: 'plot', hover: 'default',
      colorMode: 'curated', seed: null, coverWord: 'vectura', customWord: '',
      name: '', practiceLine: '', newPaper: 'A3', coverArtId: '', coverFrame: null, coverFill: '', coverFont: 'grotesk', coverScale: 100, communityNotify: false,
      coverArt: { mosaic: [], word: '', band: '' }, coverColors: { mosaic: [], word: null, band: null },
    });
  });

  it('exposes enums, limits and shortcuts', () => {
    expect(SP.ENUMS.coverStyle).toEqual(['mosaic', 'word', 'band']);
    expect(SP.ENUMS.colorMode).toEqual(['curated', 'mono', 'basic', 'wildcard']);
    expect(SP.ENUMS.animateIn).toEqual(['plot', 'sweep', 'fade-up', 'ink-bleed', 'stroke-cascade', 'scan-lines', 'iris', 'none']);
    expect(SP.ENUMS.visiblePlates).toEqual([0, 1, 3, 5, 10, 15, 20, 'all']);
    expect(SP.ENUMS.newPaper).toEqual(['A4', 'A3', 'Letter', '9x12']);
    expect(SP.ENUMS.coverWord).toContain('custom');
    expect(SP.ENUMS.hover).toEqual(expect.arrayContaining(['default', 'none', 'retrigger', 'lift', 'glare', 'replot', 'holo', 'ripple']));
    expect(SP.LIMITS).toEqual({
      recentsShown: 8, entriesMax: 48, docsMaxBytes: 40 * 1024 * 1024,
      textMax: { name: 60, practiceLine: 120, customWord: 24 },
    });
    expect(SP.SHORTCUTS).toEqual({ startPage: 'Shift+Cmd+H', newCanvas: 'Cmd+N', openRecent: 'Alt+Cmd+1..8' });
  });

  describe('sanitize', () => {
    it('communityNotify is a boolean preference, default false', () => {
      expect(SP.sanitize({}).communityNotify).toBe(false);
      expect(SP.sanitize({ communityNotify: true }).communityNotify).toBe(true);
      expect(SP.sanitize({ communityNotify: 1 }).communityNotify).toBe(true);
      expect(SP.sanitize({ communityNotify: 0 }).communityNotify).toBe(false);
    });

    it('returns a complete default object for junk input', () => {
      [undefined, null, 5, 'x', [], {}].forEach((v) => expect(SP.sanitize(v)).toEqual(SP.DEFAULTS));
    });

    it('returns a fresh, unfrozen object each call', () => {
      const a = SP.sanitize({});
      a.name = 'changed';
      expect(SP.sanitize({}).name).toBe('');
      expect(Object.isFrozen(a)).toBe(false);
    });

    it('drops unknown keys', () => {
      const out = SP.sanitize({ bogus: 1, name: 'Ann', __proto__: { evil: 1 } });
      expect(Object.keys(out).sort()).toEqual(Object.keys(SP.DEFAULTS).sort());
      expect(out.name).toBe('Ann');
    });

    it('falls back to the default for bad enum values and keeps valid ones', () => {
      const out = SP.sanitize({ coverStyle: 'word', colorMode: 'nope', animateIn: 'iris', hover: 'x', newPaper: 'A5', coverWord: 'custom' });
      expect(out.coverStyle).toBe('word');
      expect(out.colorMode).toBe('curated');
      expect(out.animateIn).toBe('iris');
      expect(out.hover).toBe('default');
      expect(out.newPaper).toBe('A3');
      expect(out.coverWord).toBe('custom');
    });

    it('the Use-as-cover preferences are an id, a clamped frame and a fill kind', () => {
      const ok = SP.sanitize({ coverArtId: 'work:abc-123', coverFrame: { fit: 'cover', z: 9, cx: 0.4, cy: 2 }, coverFill: 'iridescent' });
      expect(ok.coverArtId).toBe('work:abc-123');
      expect(ok.coverFrame).toEqual({ fit: 'cover', z: 4, cx: 0.4, cy: 1 });
      expect(ok.coverFill).toBe('iridescent');
      const bad = SP.sanitize({ coverArtId: '<img src=x>', coverFrame: 'nope', coverFill: 'Bad Fill!' });
      expect(bad.coverArtId).toBe('');
      expect(bad.coverFrame).toBeNull();
      expect(bad.coverFill).toBe('');
    });

    it('handles visiblePlates numbers, numeric strings and all', () => {
      expect(SP.sanitize({ visiblePlates: 10 }).visiblePlates).toBe(10);
      expect(SP.sanitize({ visiblePlates: '15' }).visiblePlates).toBe(15);
      expect(SP.sanitize({ visiblePlates: 'all' }).visiblePlates).toBe('all');
      expect(SP.sanitize({ visiblePlates: 0 }).visiblePlates).toBe(0);
      expect(SP.sanitize({ visiblePlates: 7 }).visiblePlates).toBe(5);
    });

    it('coerces booleans', () => {
      const out = SP.sanitize({ showOnLaunch: 0, showName: 1, showLine: 'yes', motionStill: true, railCollapsed: '' });
      expect(out.showOnLaunch).toBe(false);
      expect(out.showName).toBe(true);
      expect(out.showLine).toBe(true);
      expect(out.motionStill).toBe(true);
      expect(out.railCollapsed).toBe(false);
    });

    it('trims, restricts characters and limits text length', () => {
      const out = SP.sanitize({
        name: '  Ann <b>O\'Neil</b> & Co.  ',
        practiceLine: 'x'.repeat(500),
        customWord: 'ab\u0000c$%^',
      });
      expect(out.name).toBe('Ann bO\'Neil/b & Co.');
      expect(out.practiceLine).toHaveLength(120);
      expect(out.customWord).toBe('abc$%^');
      expect(SP.sanitize({ name: 'y'.repeat(100) }).name).toHaveLength(60);
      expect(SP.sanitize({ customWord: 'z'.repeat(100) }).customWord).toHaveLength(24);
    });

    it('allows the contract punctuation set and unicode letters', () => {
      const s = "Zoë Núñez, (b. 1990) - a/b · it’s & ok.";
      expect(SP.sanitize({ name: s.slice(0, 60) }).name).toBe(s);
    });

    it('keeps symbols such as + in identity text (regression: "Line + Design" lost its +)', () => {
      expect(SP.sanitize({ practiceLine: 'Line + Design' }).practiceLine).toBe('Line + Design');
      expect(SP.sanitize({ name: 'A+B @ Studio #1 *' }).name).toBe('A+B @ Studio #1 *');
    });

    it('rejects non-strings for text fields', () => {
      expect(SP.sanitize({ name: { a: 1 } }).name).toBe('');
      expect(SP.sanitize({ practiceLine: 12 }).practiceLine).toBe('');
    });

    it('seed is null or 5-char [A-Z0-9]', () => {
      expect(SP.sanitize({ seed: 'ab3k9' }).seed).toBe('AB3K9');
      expect(SP.sanitize({ seed: 'AB3K9' }).seed).toBe('AB3K9');
      expect(SP.sanitize({ seed: 'toolong1' }).seed).toBeNull();
      expect(SP.sanitize({ seed: 'AB-39' }).seed).toBeNull();
      expect(SP.sanitize({ seed: 12345 }).seed).toBeNull();
      expect(SP.sanitize({ seed: null }).seed).toBeNull();
    });

    it('is idempotent', () => {
      const once = SP.sanitize({ name: 'A <> B', coverStyle: 'band', visiblePlates: '3', seed: 'zz9z9' });
      expect(SP.sanitize(once)).toEqual(once);
    });
  });
  describe('coverArt / coverColors', () => {
    const cw = { key: 'a:b', paper: '#FFFFFF', ink: '#112233', ink2: '#445566', paperName: 'Paper', penName: 'Ink' };
    it('defaults are fresh objects', () => {
      const a = SP.sanitize({}); const b = SP.sanitize({});
      expect(a.coverArt).toEqual({ mosaic: [], word: '', band: '' });
      expect(a.coverColors).toEqual({ mosaic: [], word: null, band: null });
      expect(a.coverArt).not.toBe(SP.DEFAULTS.coverArt);
      expect(a.coverArt.mosaic).not.toBe(b.coverArt.mosaic);
    });
    it('garbage falls back to defaults', () => {
      [5, 'x', [], null].forEach((v) => {
        const o = SP.sanitize({ coverArt: v, coverColors: v });
        expect(o.coverArt).toEqual({ mosaic: [], word: '', band: '' });
        expect(o.coverColors).toEqual({ mosaic: [], word: null, band: null });
      });
    });
    it('keeps valid ids, blanks invalid ones, trims trailing blanks and caps length', () => {
      const o = SP.sanitize({ coverArt: { mosaic: ['', 'work-1', 'bad id!', '', ''], word: 'pick:abc', band: '<x>' } });
      expect(o.coverArt).toEqual({ mosaic: ['', 'work-1'], word: 'pick:abc', band: '' });
      expect(SP.sanitize({ coverArt: { mosaic: Array(60).fill('w') } }).coverArt.mosaic).toHaveLength(40);
    });
    it('sanitizes colorways', () => {
      const o = SP.sanitize({ coverColors: { word: cw, band: { ...cw, paper: 'red' }, mosaic: [null, cw, { ...cw, key: '!!', ink2: 'zz', textInk: '#000000', penName: 'P<>en' }, null] } });
      expect(o.coverColors.word).toEqual({ key: 'a:b', paper: '#ffffff', ink: '#112233', ink2: '#445566', textInk: '#112233', paperName: 'Paper', penName: 'Ink' });
      expect(o.coverColors.band).toBeNull();
      expect(o.coverColors.mosaic).toHaveLength(3);
      expect(o.coverColors.mosaic[0]).toBeNull();
      expect(o.coverColors.mosaic[2]).toMatchObject({ key: 'custom', ink2: null, textInk: '#000000', penName: 'Pen' });
    });
    it('is idempotent', () => {
      const once = SP.sanitize({ coverArt: { mosaic: ['', 'w1'], word: 'p', band: '' }, coverColors: { word: cw, mosaic: [null, cw] } });
      expect(SP.sanitize(once)).toEqual(once);
    });
  });
});
