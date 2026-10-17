const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const crypto = require('crypto');
const {
  contact, thirdsSplit, covByIBins, siteCoverage, pathLen, over2RP, subMinCount,
  buildBareRaster, bareArea, inkCoverage, chainMetrics, envelopeRanges, holeComponents,
} = require('../helpers/scene3d-mktick-spacing-tone');
const {
  REL_PATH, ROOT_DIR, BOUNDS, SUN, clone, CELLS, CRUMB_MARK_LAWS, B7_CELLS, buildSceneParams, loadHeadSource, patchOne, HOOK_NEEDLE, HOOK_REPL, buildHookedSource, renderCellHooked, buildBcSource, buildScene3dSource, SCENE3D_REL, md5, plain, pathsMd5, siteKey, WIN_L, WIN_R, STRIP_L, STRIP_R,
} = require('../helpers/scene3d-mktick-spacing-tone-shared');
const {
  key, RIM_KINDS, RIM_CELLS, FULL, ALL12, agg, renderBcKinds,
} = require('../helpers/scene3d-mktick-spacing-tone-bce-render');

// Rim-strip / rim-edge / no-hook BC-E bars (split from scene3d-mktick-spacing-tone-bce.test.js; see its header for the mutant table).

describe('Scene3D.SurfaceFill — T2-8b-3 BC-E endpoint-envelope band continuation (cone base wedges)', () => {
  const R = {};
  const KINDS = ['ship', ...RIM_KINDS];
  const cone = (kind, rig) => R[kind][key(50, rig, 'cone', 'hatch')];

  beforeAll(async () => {
    await renderBcKinds(R, KINDS);
  }, 1800000); // bounded runtime ownership; audit remains intentionally exhaustive

  describe('RIMSTRIP (BLOCKING, T2-8b-5b) — the rim-facing end of a regular tick is lengthened only STRAIGHT, by <= 0.6 of its own length, and never at both ends; test-rig W_L closed', () => {
    // Fixture: d=50, cam a, ground DISABLED, one SUN az135/el45, fillAngle 45; torus/hatch + cone/hatch, BOTH rigs (4 cells).
    // GATES (i) STRAIGHT: appended part within 0.15 mm (0.5 pen) of the straight continuation of the tick's own end;
    // (ii) GROW: total growth <= 0.62 x the tick's own length; (iii) BOTH: no tick gains >= 0.1 mm at both ends;
    // (iv) test-rig cone/hatch W_L (bare >= 0.5 mm) <= 1.90 mm^2. Does NOT gate the other 8 cells' extension, tone, or W_R.
    // Ticks are matched to the no-extension render (`noext`, == the pre-T2-8b-5 output) by shared vertices.
    const key2 = (q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
    const len2 = (p) => { let s = 0; for (let i = 1; i < p.length; i += 1) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; };
    const extStats = (kind, rig, prim) => {
      const a = R.noext[key(50, rig, prim, 'hatch')].pp;
      const b = R[kind][key(50, rig, prim, 'hatch')].pp;
      if (!a || !a.length || !b || !b.length) throw new Error(`rim extension comparison has empty geometry for ${kind}/${rig}/${prim}`);
      const own = new Map(); a.forEach((p, i) => p.forEach((q) => own.set(key2(q), i)));
      let dev = 0; let grow = 0; let both = 0; let changed = 0;
      b.forEach((pb) => {
        const ids = pb.map((q) => own.get(key2(q))).filter((v) => v !== undefined);
        if (!ids.length) return;
        const pa = a[ids[0]]; const n = pa.length; const m = pb.length;
        if (n < 2 || (n === m && Math.abs(len2(pa) - len2(pb)) < 1e-6)) return;
        const idx = new Map(pb.map((q, k) => [key2(q), k]));
        const f = idx.get(key2(pa[0])); const l = idx.get(key2(pa[n - 1]));
        if (f === undefined || l === undefined) return; // a chain tick that moved, not an extended tick
        changed += 1;
        const gUp = m - 1 - l > 0 ? len2(pb.slice(l)) : 0; const gDn = f > 0 ? len2(pb.slice(0, f + 1)) : 0;
        if (gUp >= 0.1 && gDn >= 0.1) both += 1;
        grow = Math.max(grow, (len2(pb) - len2(pa)) / len2(pa));
        const dir = (end, back) => { let acc = 0; let k = back; while (k !== end && acc < 0.4) { k += (end > back ? 1 : -1); acc = Math.hypot(pa[end].x - pa[k].x, pa[end].y - pa[k].y); } return pa[k]; };
        if (gUp > 0) {
          const e = pa[n - 1]; const bk = dir(0, n - 1); const ux = e.x - bk.x; const uy = e.y - bk.y; const ul = Math.hypot(ux, uy) || 1;
          for (let k = l + 1; k < m; k += 1) dev = Math.max(dev, Math.abs((pb[k].x - e.x) * uy - (pb[k].y - e.y) * ux) / ul);
        }
        if (gDn > 0) {
          const e = pa[0]; const bk = dir(n - 1, 0); const ux = e.x - bk.x; const uy = e.y - bk.y; const ul = Math.hypot(ux, uy) || 1;
          for (let k = 0; k < f; k += 1) dev = Math.max(dev, Math.abs((pb[k].x - e.x) * uy - (pb[k].y - e.y) * ux) / ul);
        }
      });
      return { dev, grow, both, changed };
    };
    const all4 = (kind) => ['test', 'create'].flatMap((rig) => ['torus', 'cone'].map((p) => extStats(kind, rig, p)));
    const maxOf = (kind, f) => Math.max(...all4(kind).map((s) => s[f]));
    test('the extension is non-vacuous: >= 20 ticks changed vs noext on the 4 cells', () => {
      const n = all4('ship').reduce((a, s) => a + s.changed, 0);
      // eslint-disable-next-line no-console
      console.log('RIMSTRIP changed ticks', n);
      expect(n).toBeGreaterThanOrEqual(20);
    });
    test('(i) STRAIGHT: max deviation of any appended point from the straight continuation <= 0.135 mm (T2-8b-5c: 0.15 -> 0.135, ship max 0.127, nostraight 0.145)', () => {
      // eslint-disable-next-line no-console
      console.log('RIMSTRIP max dev ship', maxOf('ship', 'dev'));
      expect(maxOf('ship', 'dev')).toBeLessThanOrEqual(0.135);
    });
    test('MUTATION nohubstr (T2-8b-5 prototype: nominal hub + no straightness cut) trips (i) on torus (0.43 vs 0.15)', () => {
      expect(extStats('nohubstr', 'create', 'torus').dev).toBeGreaterThan(0.135);
    });
    test('MUTATION nostraight (straightness cut alone removed, true hub kept) trips (i) on torus/test (0.26 vs 0.15)', () => {
      expect(extStats('nostraight', 'test', 'torus').dev).toBeGreaterThan(0.135);
    });
    test('(ii) GROW: no extended tick grows more than 0.62 of its own length', () => { expect(maxOf('ship', 'grow')).toBeLessThanOrEqual(0.62); });
    // MUTATION nogrow RETIRED (T2-8b-5c): the coherence rules (both-ends factor, isolation cap, strip hold) now keep growth <= 0.60 on their own, so removing the cap changes nothing (0.60 vs 0.60 on 12 cells): the mutant was VACUOUS. Bar (ii) stays as a backstop.
    // (iii) NEVER RIM TO RIM, now measured on the published candidate record `stat.rimExt`
    // ([li, a, rowIdx, gainUp, extUp, gainDn, extDn], -1 = no candidate): for a tick with a candidate at BOTH ends the
    // two extensions together may not exceed the larger gain (T2-8b-5c: a continuous factor 1 - min/max replaced 5b's hard skip).
    const bothSum = (kind) => {
      let worst = 0; let n = 0;
      ['test', 'create'].forEach((rig) => RIM_CELLS.forEach(([p, m]) => {
        R[kind][key(50, rig, p, m)].rimExt.forEach((x) => {
          if (x[3] >= 0 && x[5] >= 0) { n += 1; worst = Math.max(worst, x[4] + x[6] - Math.max(x[3], x[5])); }
        });
      }));
      return { worst, n };
    };
    test('(iii) BOTH: a tick that could reach both outlines is extended by no more than the larger single gain', () => {
      const b = bothSum('ship');
      // eslint-disable-next-line no-console
      console.log('RIMSTRIP both-candidate ticks', b.n, 'worst (extUp+extDn-maxGain)', b.worst);
      expect(b.n).toBeGreaterThanOrEqual(1);
      expect(b.worst).toBeLessThanOrEqual(0.02);
    });
    test('MUTATION noboth trips (iii)', () => { expect(bothSum('noboth').worst).toBeGreaterThan(0.02); });
    test('(iv) RIM-STRIP: test-rig cone/hatch W_L bare >= 0.5 mm <= 1.90 mm^2 (measured 1.89)', () => {
      const w = bareArea(cone('ship', 'test').raster, 0.5, WIN_L);
      // eslint-disable-next-line no-console
      console.log('RIMSTRIP test cone/hatch W_L bare>=0.5', w, 'noext', bareArea(cone('noext', 'test').raster, 0.5, WIN_L));
      expect(w).toBeLessThanOrEqual(1.90);
    });
    test('MUTATION noext (== e609338c output) fails (iv) (2.66 > 1.90)', () => {
      expect(bareArea(cone('noext', 'test').raster, 0.5, WIN_L)).toBeGreaterThan(1.90);
    });
  });

  describe('RIMEDGE (BLOCKING, T2-8b-5c) — the rim-side ends read as ONE edge: no step between neighbouring candidates, no lone tick sticking out', () => {
    // Fixture: d=50, cam a, ground DISABLED, one SUN az135/el45, fillAngle 45, 12 cells (6 cells x both rigs).
    // Source: `stat.rimExt` rows [li, a, rowIdx, gainUp, extUp, gainDn, extDn] (-1 = not a candidate at that end).
    // STEP = for two ticks at consecutive rowIdx, both candidates at one end: |(gain-ext) difference| - |gain difference|
    //        (the offset difference the extension ADDED to the rim edge). ISO = a run of n consecutive candidates extends <= 0.45 n mm.
    // GATES the extension's neighbour coherence ONLY. Does NOT gate tick length, tone, or the offsets that v1.4.5 already had.
    const ALL = [];
    ['test', 'create'].forEach((rig) => CELLS.forEach(([p, m]) => ALL.push([rig, p, m])));
    const cellRows = (kind, rig, p, m) => {
      const rows = R[kind][key(50, rig, p, m)];
      if (!rows || !rows.rimExt.length) throw new Error(`rimExt audit evidence is empty for ${kind}/${rig}/${p}/${m}`);
      return rows.rimExt;
    };
    const stepOf = (rimExt) => {
      const rows = new Map();
      rimExt.forEach((x) => { if (!rows.has(x[0])) rows.set(x[0], []); rows.get(x[0]).push(x); });
      let m = 0;
      rows.forEach((r) => {
        r.sort((x, y) => x[2] - y[2]);
        for (let i = 1; i < r.length; i += 1) {
          if (r[i][2] - r[i - 1][2] !== 1) continue;
          [[3, 4], [5, 6]].forEach(([g, e]) => {
            if (r[i][g] < 0 || r[i - 1][g] < 0) return;
            m = Math.max(m, Math.abs((r[i - 1][g] - r[i - 1][e]) - (r[i][g] - r[i][e])) - Math.abs(r[i - 1][g] - r[i][g]));
          });
        }
      });
      return m;
    };
    const isoExcess = (rimExt) => {
      const rows = new Map();
      rimExt.forEach((x) => { if (!rows.has(x[0])) rows.set(x[0], []); rows.get(x[0]).push(x); });
      let worst = 0;
      rows.forEach((r) => {
        r.sort((x, y) => x[2] - y[2]);
        [[3, 4], [5, 6]].forEach(([g, e]) => {
          let i = 0;
          while (i < r.length) {
            if (r[i][g] < 0) { i += 1; continue; }
            let j = i;
            while (j + 1 < r.length && r[j + 1][g] >= 0 && r[j + 1][2] - r[j][2] === 1) j += 1;
            for (let t = i; t <= j; t += 1) worst = Math.max(worst, r[t][e] - 0.45 * (j - i + 1));
            i = j + 1;
          }
        });
      });
      return worst;
    };
    const maxStep = (kind, cells) => Math.max(...cells.map(([rig, p, m]) => stepOf(cellRows(kind, rig, p, m))));
    test('STEP: max added step between neighbouring rim candidates <= 0.35 mm on all 12 cells', () => {
      const v = ALL.map(([rig, p, m]) => stepOf(cellRows('ship', rig, p, m)));
      // eslint-disable-next-line no-console
      console.log('RIMEDGE max step per cell', v.map((x) => x.toFixed(2)).join(','));
      expect(Math.max(...v)).toBeLessThanOrEqual(0.35);
    });
    test('MUTATION nocoh (neighbour coherence removed) trips STEP on test cone/hatch (1.14) and torus/hatch', () => {
      expect(maxStep('nocoh', [['test', 'cone', 'hatch']])).toBeGreaterThan(0.35);
    });
    test('MUTATION nocohstrip (coherence and strip rule removed) trips STEP on create torus/hatch (0.65)', () => {
      expect(maxStep('nocohstrip', [['create', 'torus', 'hatch']])).toBeGreaterThan(0.35);
    });
    test('ISO: a run of n consecutive candidates extends by <= 0.45 n mm on the 8 mutant-covered cells', () => {
      const cells = [];
      ['test', 'create'].forEach((rig) => RIM_CELLS.forEach(([p, m]) => cells.push([rig, p, m])));
      const w = Math.max(...cells.map(([rig, p, m]) => isoExcess(cellRows('ship', rig, p, m))));
      expect(w).toBeLessThanOrEqual(0.02);
    });
    test('MUTATION noiso trips ISO (a lone tick sticks out by > 0.45 mm)', () => {
      const cells = [];
      ['test', 'create'].forEach((rig) => RIM_CELLS.forEach(([p, m]) => cells.push([rig, p, m])));
      expect(Math.max(...cells.map(([rig, p, m]) => isoExcess(cellRows('noiso', rig, p, m))))).toBeGreaterThan(0.02);
    });
  });

  describe('NOHOOK (BLOCKING, T2-8b-5c; Jay: "the lines in the spheres must not have angles/hooks") — extension, continuation and apex ticks carry no bend > 8.5 deg', () => {
    // Fixture as RIMSTRIP, 4 cells x both rigs (torus/hatch, cone/hatch, sphere/hatch, sphere/contour). Ticks matched to `noext` by shared vertices.
    // GATES the bend at the JOIN and at every appended vertex of an extended tick (max over cells; 5b: 15.5 deg on sphere/contour),
    // and the bend inside continuation + apex runs. DOES NOT GATE REGULAR ticks: v1.4.5 already carries regular ticks with bends
    // up to 134 deg (create sphere/hatch, 39 ticks > 30 deg, at the sphere's top pole) -> reported in T2-8b-5c-impl.md, not fixed here.
    const ALL = [];
    ['test', 'create'].forEach((rig) => CELLS.forEach(([p, m]) => ALL.push([rig, p, m])));
    const key2 = (q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`;
    const bend = (a, b, c) => {
      const ax = b.x - a.x; const ay = b.y - a.y; const bx = c.x - b.x; const by = c.y - b.y;
      const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
      if (!(la > 1e-6 && lb > 1e-6)) return 0;
      return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
    };
    const extBend = (kind) => {
      let worst = 0;
      ['test', 'create'].forEach((rig) => RIM_CELLS.forEach(([p, m]) => {
        const a = R.noext[key(50, rig, p, m)].pp;
        const b = R[kind][key(50, rig, p, m)].pp;
        if (!a || !a.length || !b || !b.length) throw new Error(`rim bend comparison has empty geometry for ${kind}/${rig}/${p}/${m}`);
        const own = new Map(); a.forEach((pa, i) => pa.forEach((q) => own.set(key2(q), i)));
        b.forEach((pb) => {
          const ids = pb.map((q) => own.get(key2(q))).filter((v) => v !== undefined);
          if (!ids.length) return;
          const pa = a[ids[0]]; if (pa.length === pb.length) return;
          const idx = new Map(pb.map((q, k) => [key2(q), k]));
          const f = idx.get(key2(pa[0])); const l = idx.get(key2(pa[pa.length - 1]));
          if (f === undefined || l === undefined) return;
          for (let k = Math.max(1, l); k < pb.length - 1; k += 1) worst = Math.max(worst, bend(pb[k - 1], pb[k], pb[k + 1]));
          for (let k = Math.min(pb.length - 2, f); k >= 1; k -= 1) worst = Math.max(worst, bend(pb[k + 1], pb[k], pb[k - 1]));
        });
      }));
      return worst;
    };
    test('extended ticks: join and appended-vertex bend <= 8.5 deg', () => {
      const w = extBend('ship');
      // eslint-disable-next-line no-console
      console.log('NOHOOK extended-tick worst bend', w, 'nohook mutant', extBend('nohook'));
      expect(w).toBeLessThanOrEqual(8.5);
    });
    test('MUTATION nohook (join/segment bend check removed) trips it (15.5 deg on sphere/contour)', () => {
      expect(extBend('nohook')).toBeGreaterThan(8.5);
    });
    test('continuation + apex runs: no internal bend > 10 deg on 12 cells (measured 9.2)', () => {
      const w = Math.max(...ALL.map(([rig, p, m]) => R.ship[key(50, rig, p, m)].contBend));
      // eslint-disable-next-line no-console
      console.log('NOHOOK continuation/apex worst bend', w);
      expect(w).toBeLessThanOrEqual(10);
    });
  });

});
