import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = [
  'src/config/palettes.js', 'src/config/papers.js', 'src/config/pen-models.js', 'src/config/defaults.js',
  'src/core/pen-model.js', 'src/core/start-page/colorway.js',
];
const REQUIRED = [
  'id', 'label', 'short', 'brand', 'inkClass', 'tipShape', 'effect', 'confidence', 'sizes', 'defaultSize',
  'absorbentWidthGainMm', 'opacity', 'coverOnDark', 'blend', 'overlapDarkening', 'edge', 'bleed',
  'dryskipResponse', 'startBlob', 'endPool', 'cornerPool', 'starvation', 'skip', 'widthJitter', 'colours', 'sizesSource',
];
const NEW_IDS = [
  'staedtler-pigment-liner-308', 'uni-pin-fineliner', 'staedtler-triplus-334', 'pilot-g2', 'pentel-energel',
  'molotow-one4all-127hs', 'faber-castell-pitt-artist-pen', 'copic-multiliner', 'lamy-safari', 'muji-gel-ballpoint',
];
const CURATED = [
  'sakura-pigma-micron', 'stabilo-point-88', 'sakura-gelly-roll-classic', 'sakura-gelly-roll-metallic',
  'sakura-gelly-roll-moonlight', 'uniball-signo-broad-um153', 'uni-posca-pc1mr',
];

describe('pens20 catalogue ingest', () => {
  let dom; let V;
  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
    const ctx = dom.getInternalVMContext();
    FILES.forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
    V = dom.window.Vectura;
  });
  afterAll(() => dom?.window?.close());
  const P = () => V.PEN_MODELS;

  it('every model has all required fields and is listed in ORDER and CLASS_ORDER', () => {
    Object.values(P().MODELS).forEach((m) => {
      REQUIRED.forEach((k) => {
        if (k === 'sizesSource' && m.id === 'glow-phosphorescent-marker') return;
        expect(m[k], `${m.id}.${k}`).toBeDefined();
      });
      expect(P().MODELS[m.id]).toBe(m);
      expect(P().ORDER).toContain(m.id);
      expect(P().CLASS_ORDER).toContain(m.inkClass);
      expect(m.colours.length, `${m.id} colours`).toBeGreaterThan(0);
      m.colours.forEach((c) => expect(c.hex, `${m.id}/${c.name}`).toMatch(/^#[0-9a-f]{6}$/i));
    });
    expect(new Set(P().ORDER).size).toBe(P().ORDER.length);
  });
  it('sizes are sorted ascending by nominal, positive, unique, defaultSize resolves', () => {
    Object.values(P().MODELS).forEach((m) => {
      const nom = m.sizes.map((s) => s.nominalWidthMm);
      expect(nom, m.id).toEqual([...nom].sort((a, b) => a - b));
      m.sizes.forEach((s) => {
        expect(s.nominalWidthMm, `${m.id}/${s.label}`).toBeGreaterThan(0);
        expect(s.laidWidthMm, `${m.id}/${s.label}`).toBeGreaterThan(0);
      });
      expect(new Set(m.sizes.map((s) => s.label)).size, m.id).toBe(m.sizes.length);
      expect(V.PenModel.sizeOf(m, m.defaultSize), `${m.id} default`).toBeTruthy();
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    });
  });
  it('new models are present, low-confidence unless sourced', () => {
    NEW_IDS.forEach((id) => {
      const m = P().MODELS[id];
      expect(m, id).toBeTruthy();
      expect(m.confidence, id).toBeLessThanOrEqual(0.5);
      expect(typeof m.sizesSource).toBe('string');
    });
  });
  it('curated models carry a sizesSource', () => {
    CURATED.forEach((id) => expect(P().MODELS[id].sizesSource, id).toMatch(/\S{4,}/));
  });
  it('additions: Posca PC-5M, Sharpie Fine, Pilot V10, Isograph 0.3 and existing hexes untouched', () => {
    const has = (id, label) => P().MODELS[id].sizes.some((s) => s.label === label);
    expect(has('uni-posca-pc1mr', 'PC-5M (2.5)')).toBe(true);
    expect(has('sharpie-ultra-fine', 'Fine')).toBe(true);
    expect(has('pilot-precise-v5-v7', 'V10 (1.0)')).toBe(true);
    expect(has('rotring-isograph', '0.3')).toBe(true);
    expect(P().MODELS['sakura-pigma-micron'].colours.find((c) => c.name === 'Black').hex).toBe('#1b1b1d');
    expect(P().MODELS['sakura-gelly-roll-classic'].colours.find((c) => c.name === 'Black').hex).toBe('#16161a');
  });
  it('CATALOGUE_REV bumped and Start Page colorway validation still clean', () => {
    expect(P().CATALOGUE_REV).toBe('2026-11-pens20');
    expect(V.StartPageColorway.validateCatalogue()).toEqual([]);
  });
});
