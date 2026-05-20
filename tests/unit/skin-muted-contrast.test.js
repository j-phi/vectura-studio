/*
 * CSS-9 (2026-05-20) — skin --ui-muted vs --ui-bg WCAG AA tripwire.
 *
 * Each skin in `src/ui/skin/` that defines both `--ui-muted` and `--ui-bg`
 * must keep the pair at >= 4.5:1 contrast (WCAG 2.x AA for normal text).
 *
 * The implementation uses the standard WCAG relative-luminance formula
 * inline so the test has no dependency on a third-party color library.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIN_DIR = path.join(ROOT, 'src/ui/skin');

// ---------- WCAG 2.x helpers ----------

function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) throw new Error(`bad hex: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance(rgb) {
  const a = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const L = Math.max(la, lb);
  const D = Math.min(la, lb);
  return (L + 0.05) / (D + 0.05);
}

// ---------- skin parsing ----------

const MUTED_RE = /--ui-muted:\s*(#[0-9a-fA-F]{3,6})\b/;
const BG_RE = /--ui-bg:\s*(#[0-9a-fA-F]{3,6})\b/;

// Skin palette files only — skip shared/structural sheets and the template.
function isSkinPalette(filename) {
  if (!filename.endsWith('.css')) return false;
  if (filename.startsWith('_')) return false; // _template.css
  const shared = new Set(['tokens.css', 'components.css', 'motion.css']);
  return !shared.has(filename);
}

function collectSkins() {
  return fs
    .readdirSync(SKIN_DIR)
    .filter(isSkinPalette)
    .map((file) => {
      const text = fs.readFileSync(path.join(SKIN_DIR, file), 'utf8');
      const muted = text.match(MUTED_RE)?.[1];
      const bg = text.match(BG_RE)?.[1];
      return { file, muted, bg };
    });
}

// ---------- self-check on the WCAG math ----------

describe('CSS-9 helpers: WCAG contrast math', () => {
  it('white on black is 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
  it('identical colors are 1:1', () => {
    expect(contrastRatio('#abcdef', '#abcdef')).toBeCloseTo(1, 5);
  });
  it('order does not matter', () => {
    expect(contrastRatio('#888888', '#efefef')).toBeCloseTo(
      contrastRatio('#efefef', '#888888'),
      5,
    );
  });
});

// ---------- the tripwire ----------

describe('CSS-9: skin --ui-muted on --ui-bg meets WCAG AA (>=4.5:1)', () => {
  const skins = collectSkins();

  it('at least one skin palette was discovered', () => {
    expect(skins.length).toBeGreaterThan(0);
  });

  for (const skin of skins) {
    const label = skin.file.replace('.css', '');

    if (!skin.muted || !skin.bg) {
      // Skin relies on inherited values; nothing to assert here.
      it.skip(`${label}: skipped (does not define both --ui-muted and --ui-bg)`, () => {});
      continue;
    }

    it(`${label}: contrast(${skin.muted}, ${skin.bg}) >= 4.5`, () => {
      const ratio = contrastRatio(skin.muted, skin.bg);
      expect(
        ratio,
        `${label}: --ui-muted ${skin.muted} on --ui-bg ${skin.bg} = ${ratio.toFixed(2)}:1 (need >=4.5)`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
