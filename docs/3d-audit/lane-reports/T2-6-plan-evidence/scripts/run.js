const { makeRuntime, render, CELLS, md5 } = require('/private/tmp/claude-501/scratch-T26/_t26/lib.js');
const { allMetrics } = require('/private/tmp/claude-501/scratch-T26/_t26/metrics26.js');
const fs = require('fs');

(async () => {
  const trees = (process.env.TREES || 'v1.4.1,T2-3c,HEAD').split(',');
  const rigs = (process.env.RIGS || 'create,test').split(',');
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const d = Number(process.env.D || 50);
  const out = {};
  for (const t of trees) {
    const V = await makeRuntime(t, { instrument: true });
    out[t] = {};
    for (const rig of rigs) {
      for (const [primitive, mapper] of CELLS) {
        const key = `${primitive}/${mapper}`;
        if (only && !only.test(`${rig}|${key}`)) continue;
        const r = render(V, { primitive, mapper, rig, density: d });
        const m = allMetrics(r);
        m.md5 = md5(r.paths);
        out[t][`${rig}|${key}`] = m;
        const A = m.A || {};
        console.log(`${t} ${rig} ${key}  paths=${m.pathCount} ink=${m.inkMm} RP=${m.rowPitch} `
          + `A1=${A.A1_gradedGapShare!=null?A.A1_gradedGapShare.toFixed(4):'-'} `
          + `bareP95=${A.A1b_bareRunP95!=null?A.A1b_bareRunP95.toFixed(4):'-'} `
          + `A2n=${A.A2n_fragLt050RP} A2loc=${A.A2loc_fragLtHalfNbr} `
          + `A3=${A.A3_withinBandR2!=null?A.A3_withinBandR2.toFixed(4):'-'} `
          + `poolR2=${A.pooledLenToneR2n!=null?A.pooledLenToneR2n.toFixed(4):'-'} `
          + `ovMax=${A.ovMax!=null?A.ovMax.toFixed(4):'-'} over2=${A.over2RP} `
          + `w25=${m.wedge25!=null?m.wedge25.toFixed(5):'-'} hole=${m.holeMax!=null?m.holeMax.toFixed(3):'-'} `
          + `bandC=${m.bandC!=null?m.bandC.toFixed(4):'-'} O5=${m.O5!=null?m.O5.toFixed(4):'-'} cov=${m.siteCoverage!=null?m.siteCoverage.toFixed(4):'-'} pens=${m.pens}`);
      }
    }
  }
  fs.writeFileSync(process.env.OUT || '/private/tmp/claude-501/scratch-T26/_t26/out.json', JSON.stringify(out, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
