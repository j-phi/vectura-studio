// Shared BC-E render driver for the split scene3d-mktick-spacing-tone BC-E audit files.
const fs = require('fs');
const path = require('path');
const { loadScene3dAuditRuntime } = require('./scene3d-audit-runtime');
const crypto = require('crypto');
const {
  contact, thirdsSplit, covByIBins, siteCoverage, pathLen, over2RP, subMinCount,
  buildBareRaster, bareArea, inkCoverage, chainMetrics, envelopeRanges, holeComponents,
} = require('./scene3d-mktick-spacing-tone');
const {
  REL_PATH, ROOT_DIR, BOUNDS, SUN, clone, CELLS, CRUMB_MARK_LAWS, B7_CELLS, buildSceneParams, loadHeadSource, patchOne, HOOK_NEEDLE, HOOK_REPL, buildHookedSource, renderCellHooked, buildBcSource, buildScene3dSource, SCENE3D_REL, md5, plain, pathsMd5, siteKey, WIN_L, WIN_R, STRIP_L, STRIP_R,
} = require('./scene3d-mktick-spacing-tone-shared');

const key = (d, rig, prim, mapper) => `${d}|${rig}|${prim}/${mapper}`;
// T2-8b-5b: the rim-strip mutants render only torus/hatch + cone/hatch (both rigs, d=50).
  const RIM_KINDS = ['noext', 'nohubstr', 'noboth', 'nostraight', 'nocoh', 'nocohstrip', 'noiso', 'nohook'];
  const RIM_CELLS = [['torus', 'hatch'], ['cone', 'hatch'], ['sphere', 'hatch'], ['sphere', 'contour'], ['torus', 'contour']];
  const FULL = ['ship', 'off', 'inline']; // kinds also rendered at d=220
  const ALL12 = [];
  ['test', 'create'].forEach((rig) => CELLS.forEach(([p, m]) => ALL12.push([rig, p, m])));
  const agg = (chains) => {
    const c = chains.filter((x) => x.hasBoundary);
    return {
      n: chains.length,
      maxS: c.length ? Math.max(...c.map((x) => (x.s == null ? 0 : x.s))) : 0,
      allJ1: chains.every((x) => x.j1 === 1),
      maxDir: c.length ? Math.max(...c.map((x) => (x.dirExcess == null ? -99 : x.dirExcess))) : -99,
      viol: chains.reduce((a, x) => a + x.violations, 0),
      orphans: chains.reduce((a, x) => a + x.orphans, 0),
      minEdge: chains.length ? Math.min(...chains.map((x) => x.minEdge)) : Infinity,
    };
  };

// Mutant variants are deliberately loaded, rendered, summarized, and torn
// down one at a time. The test tables retain only the geometry evidence
// their assertions need; no live Window/App/runtime survives into the next variant.
const renderBcKinds = async (R, KINDS, { full = FULL, roster = ['off', 'ship', 'noflag'] } = {}) => {
    for (const kind of KINDS) {
      const runtime = await loadScene3dAuditRuntime({ scriptOverrides: kind === 'noflag'
        ? { [REL_PATH]: buildBcSource(null), [SCENE3D_REL]: buildScene3dSource(kind) }
        : { [REL_PATH]: buildBcSource(kind === 'ship' ? null : kind) } });
      R[kind] = {};
      const render = (d, rig, primitive, mapper) => {
        const recs = [];
        runtime.window.__T28B_REC__ = (rec) => recs.push(rec);
        const r = renderCellHooked(runtime, { primitive, mapper, rig, fillDensity: d });
        delete runtime.window.__T28B_REC__;
        // Copy the final traced geometry, then release the live runtime at the
        // end of this mutant's cell set before the next one is constructed.
        recs.forEach((x) => { x.pts = x.pts.map((q) => ({ x: q.x, y: q.y })); });
        const pp = plain(r.paths);
        const fills = pp.filter((path) => path.meta && path.meta.kind === 'sceneFill');
        const edges = pp.filter((path) => path.meta && path.meta.kind === 'sceneEdge');
        const c = contact(fills, BOUNDS.penWidth);
        const apexSet = new Set(recs.filter((x) => x.apex).map((x) => `${x.pts[0].x.toFixed(4)},${x.pts[0].y.toFixed(4)}`));
        const chains = chainMetrics(recs, edges);
        const bareRaster = d === 50 ? buildBareRaster(pp) : null;
        const fill = bareRaster ? holeComponents(bareRaster, recs, { T: 0.5, hiI: 2 / 3, w: BOUNDS.penWidth }) : null;
        const keepRaster = d === 50 && ['ship', 'off', 'dense', 'noext', 'cfat', 'noapex'].includes(kind) && primitive === 'cone' && mapper === 'hatch';
        const raster = keepRaster ? bareRaster : null;
        R[kind][key(d, rig, primitive, mapper)] = {
          sites: siteKey(r), tip: c.tipContact, mark: c.markContact,
          o2: r.rowPitch != null ? over2RP(fills, r.rowPitch).count : 0,
          sub: subMinCount(fills.filter((f) => !apexSet.has(`${f[0].x.toFixed(4)},${f[0].y.toFixed(4)}`)), BOUNDS.penWidth),
          subRaw: subMinCount(fills, BOUNDS.penWidth),
          crumbs: fills.filter((f) => !apexSet.has(`${f[0].x.toFixed(4)},${f[0].y.toFixed(4)}`) && pathLen(f) < 2 * BOUNDS.penWidth - 1e-9).length,
          contBend: recs.filter((x) => x.apex || (x.tag && x.tag.startsWith('cont|'))).reduce((mx, x) => {
            let w = mx;
            for (let k = 1; k < x.pts.length - 1; k += 1) {
              const a0 = x.pts[k - 1]; const b0 = x.pts[k]; const c0 = x.pts[k + 1];
              const ax = b0.x - a0.x; const ay = b0.y - a0.y; const bx = c0.x - b0.x; const by = c0.y - b0.y;
              const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
              if (la > 1e-6 && lb > 1e-6) w = Math.max(w, (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI);
            }
            return w;
          }, 0),
          rimExt: r.stat && r.stat.rimExt ? r.stat.rimExt.map((x) => x.slice()) : [],
          nFills: fills.length, bins: covByIBins(r.sites, BOUNDS.penWidth), md5: pathsMd5(r.paths),
          pp: (kind === 'ship' || RIM_KINDS.includes(kind)) ? fills.map((path) => Object.assign(path.map((point) => ({ x: point.x, y: point.y })), { meta: { kind: 'sceneFill' } })) : null,
          apexLens: recs.filter((x) => x.apex).map((x) => pathLen(x.pts)),
          chains, raster, fill,
        };
      };
      try {
        const exactMutationCells = {
          dense: [['create', 'cone', 'hatch']], gap: [['create', 'cone', 'hatch']],
          cfat: [['create', 'cone', 'hatch']], rulingref: [['create', 'cone', 'hatch']],
          noapex: [['create', 'cone', 'hatch']],
          apexnorule: [['create', 'torus', 'hatch'], ['test', 'torus', 'hatch']],
          nohubstr: [['create', 'torus', 'hatch']], nostraight: [['test', 'torus', 'hatch']],
          nocoh: [['test', 'cone', 'hatch']], nocohstrip: [['create', 'torus', 'hatch']],
        };
        const variantCells = exactMutationCells[kind]
          || (RIM_KINDS.includes(kind)
            ? ['test', 'create'].flatMap((rig) => RIM_CELLS.map(([primitive, mapper]) => [rig, primitive, mapper]))
            : ['test', 'create'].flatMap((rig) => CELLS.map(([primitive, mapper]) => [rig, primitive, mapper])));
        variantCells.forEach(([rig, primitive, mapper]) => render(50, rig, primitive, mapper));
        ['test', 'create'].forEach((rig) => {
          if (full.includes(kind)) B7_CELLS.forEach(([primitive, mapper]) => render(220, rig, primitive, mapper));
        });
        if (roster.includes(kind)) {
          const V = runtime.window.Vectura;
          const laws = V.SCENE3D_TONE_LAWS.PRODUCTION;
          const nonMk = laws.filter((law) => !/^mk/.test(law)).slice(0, 6);
          let crumbs = 0;
          V.Scene3D.Params.MAPPERS.forEach((mapper) => CRUMB_MARK_LAWS.concat(nonMk).forEach((law) => {
            const params = buildSceneParams(V.Scene3D.Params, V.ALGO_DEFAULTS.scene3d, { mapper, fillDensity: 50, primitive: 'cone', rig: 'create', law });
            const paths = V.AlgorithmRegistry.scene3d.generate(params, null, null, BOUNDS);
            crumbs += paths.filter((path) => path.meta && path.meta.kind === 'sceneFill' && pathLen(path) < 2 * BOUNDS.penWidth - 1e-9).length;
          }));
          R[kind].crumbsRoster = crumbs;
        }
      } finally {
        await runtime.cleanup();
      }
    }
};

module.exports = {
  key, RIM_KINDS, RIM_CELLS, FULL, ALL12, agg, renderBcKinds,
};
