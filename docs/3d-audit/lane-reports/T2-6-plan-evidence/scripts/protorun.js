const { makeRuntime, render, CELLS, md5 } = require('/private/tmp/claude-501/scratch-T26/_t26/lib.js');
const { allMetrics } = require('/private/tmp/claude-501/scratch-T26/_t26/metrics26.js');
const { build } = require('/private/tmp/claude-501/scratch-T26/_t26/proto26.js');
const fs = require('fs');

const VARIANTS = {
  HEAD:      null,
  F1: { rho:0.62, subMax:3, anchor:0, splitMinR:0.40, env:0.85, bandOnly:1, single:'stagger' },
  F2: { rho:0.62, subMax:3, anchor:0, splitMinR:0.35, env:0.80, bandOnly:1, single:'stagger' },
  F3: { rho:0.62, subMax:2, anchor:0, splitMinR:0.40, env:0.85, bandOnly:1, single:'stagger' },
  E62:    { rho:0.62, subMax:4, anchor:0, splitMinR:0.30, single:'stagger', bandOnly:1 },
  E62d:   { rho:0.62, subMax:4, anchor:0, splitMinR:0.30, single:'stagger', bandOnly:1, dropSub:true },
  E62e85: { rho:0.62, subMax:4, anchor:0, splitMinR:0.30, single:'stagger', bandOnly:1, env:0.85 },
  E75:    { rho:0.75, subMax:4, anchor:0, splitMinR:0.30, single:'stagger', bandOnly:1 },
  E62n3:  { rho:0.62, subMax:3, anchor:0, splitMinR:0.30, single:'stagger', bandOnly:1 },
  D62:   { rho:0.62, subMax:4, anchor:0, splitMinR:0.30, splitMaxR:0.98, single:'stagger', dropSub:true },
  D62_70:{ rho:0.62, subMax:4, anchor:0, splitMinR:0.30, splitMaxR:0.70, single:'stagger', dropSub:true },
  D75:   { rho:0.75, subMax:4, anchor:0, splitMinR:0.30, splitMaxR:0.98, single:'stagger', dropSub:true },
  D62n3: { rho:0.62, subMax:3, anchor:0, splitMinR:0.30, splitMaxR:0.98, single:'stagger', dropSub:true },
  M62_70: { rho:0.62, subMax:4, anchor:0, splitMinR:0.30, splitMaxR:0.70, single:'stagger' },
  M62_80: { rho:0.62, subMax:4, anchor:0, splitMinR:0.30, splitMaxR:0.80, single:'stagger' },
  M75_70: { rho:0.75, subMax:4, anchor:0, splitMinR:0.30, splitMaxR:0.70, single:'stagger' },
  M62_60: { rho:0.62, subMax:4, anchor:0, splitMinR:0.25, splitMaxR:0.60, single:'stagger' },
  M75_80: { rho:0.75, subMax:4, anchor:0, splitMinR:0.30, splitMaxR:0.80, single:'stagger' },
  C50:  { rho: 0.50, subMax: 4, anchor: 0, splitMinR: 0.30, single: 'stagger' },
  C62:  { rho: 0.62, subMax: 4, anchor: 0, splitMinR: 0.30, single: 'stagger' },
  C75:  { rho: 0.75, subMax: 4, anchor: 0, splitMinR: 0.30, single: 'stagger' },
  C62n6:{ rho: 0.62, subMax: 6, anchor: 0, splitMinR: 0.30, single: 'stagger' },
  C62n3:{ rho: 0.62, subMax: 3, anchor: 0, splitMinR: 0.30, single: 'stagger' },
  C62a1:{ rho: 0.62, subMax: 4, anchor: 1, splitMinR: 0.30, single: 'stagger' },
  C62g: { rho: 0.62, subMax: 4, anchor: 0, splitMinR: 0.30, single: 'grad' },
  C62lo:{ rho: 0.62, subMax: 4, anchor: 0, splitMinR: 0.15, single: 'stagger' },
  C62hi:{ rho: 0.62, subMax: 4, anchor: 0, splitMinR: 0.45, single: 'stagger' },
  C62L: { rho: 0.62, subMax: 4, anchor: 0, splitMinR: 0.30, single: 'stagger', L0: 1.05 },
};

(async () => {
  const names = (process.env.VARS || 'HEAD,PA').split(',');
  const rigs = (process.env.RIGS || 'create,test').split(',');
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const d = Number(process.env.D || 50);
  const out = {};
  for (const name of names) {
    const v = VARIANTS[name];
    const ov = v ? { 'src/core/scene3d/surface-fill.js': build(v) } : null;
    const V = await makeRuntime('HEAD', { instrument: true, extraOverrides: ov });
    out[name] = {};
    for (const rig of rigs) {
      for (const [primitive, mapper] of CELLS) {
        const key = `${primitive}/${mapper}`;
        if (only && !only.test(`${rig}|${key}`)) continue;
        const r = render(V, { primitive, mapper, rig, density: d });
        const m = allMetrics(r); m.md5 = md5(r.paths);
        out[name][`${rig}|${key}`] = m;
        const A = m.A || {};
        console.log(`d${d} ${name} ${rig} ${key}  paths=${m.pathCount} ink=${m.inkMm} pens=${m.pens} `
          + `A1=${A.A1_gradedGapShare!=null?A.A1_gradedGapShare.toFixed(4):'-'}/${A.A1dir_gradedGapShare!=null?A.A1dir_gradedGapShare.toFixed(4):'-'} `
          + `bareP95=${A.A1b_bareRunP95!=null?A.A1b_bareRunP95.toFixed(4):'-'} bareMax=${A.A1b_bareRunMax!=null?A.A1b_bareRunMax.toFixed(3):'-'} `
          + `A2n=${A.A2n_fragLt050RP}(${A.A2n_frac!=null?A.A2n_frac.toFixed(3):'-'}) A2loc=${A.A2loc_fragLtHalfNbr} `
          + `A3=${A.A3_withinBandR2!=null?A.A3_withinBandR2.toFixed(4):'-'} poolR2=${A.pooledLenToneR2n!=null?A.pooledLenToneR2n.toFixed(4):'-'} `
          + `ovMax=${A.ovMax!=null?A.ovMax.toFixed(4):'-'} over2=${A.over2RP} `
          + `w25=${m.wedge25!=null?m.wedge25.toFixed(5):'-'} hole=${m.holeMax!=null?m.holeMax.toFixed(3):'-'} bandC=${m.bandC!=null?m.bandC.toFixed(4):'-'} `
          + `O5=${m.O5!=null?m.O5.toFixed(4):'-'}${m.O5monotone?'':'*NONMONO'} cov=${m.siteCoverage!=null?m.siteCoverage.toFixed(4):'-'} tooShort=${m.tooShort} subs/site=${A.subsPerSite!=null?A.subsPerSite.toFixed(2):'-'}`);
      }
    }
  }
  fs.writeFileSync(process.env.OUT || '/private/tmp/claude-501/scratch-T26/_t26/proto.json', JSON.stringify(out, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
