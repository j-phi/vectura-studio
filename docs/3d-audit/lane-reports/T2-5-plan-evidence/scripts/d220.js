const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const M = require('/private/tmp/claude-501/scratch-T25/_t25/metrics.js');
const P = require('/private/tmp/claude-501/scratch-T25/_t25/proto.js');
(async () => {
  const A = await L.makeRuntime('HEAD', { instrument:true });
  const B = await L.makeRuntime('HEAD', { instrument:true, extraOverrides: { 'src/core/scene3d/surface-fill.js': L.instrumentSurfaceFill(P.build({ anchor:'stagger', subdiv:true, L0:1.05 })) } });
  for (const d of (process.env.D||'220').split(',').map(Number))
  for (const rig of ['create','test']) for (const [p,mp] of L.CELLS) {
    const o={};
    for (const [nm,V] of [['HEAD',A],['RANK1',B]]) {
      const r = L.render(V, { primitive:p, mapper:mp, rig, density:d });
      const m = M.allMetrics(r); const RP=r.stat.tickField.rowPitch;
      const ts=r.stat.t25marks.map(t=>L.plen(t.pts));
      o[nm]={ ink:m.inkMm, cov:m.siteCoverage, wedge:m.wedge25, hole:m.holeMax, band:m.bandC, o5:m.O5ratio, pens:r.stat.pens, over2:ts.filter(v=>v>2*RP).length, marks:r.stat.marks, tooShort:r.stat.tooShort };
    }
    const f=(v,k)=>v[k]==null?'-':(typeof v[k]==='number'?v[k].toFixed(k==='ink'?1:4):v[k]);
    console.log(`d=${d}|${rig}|${p}/${mp}  HEAD ink=${f(o.HEAD,'ink')} cov=${f(o.HEAD,'cov')} wedge=${f(o.HEAD,'wedge')} hole=${f(o.HEAD,'hole')} band=${f(o.HEAD,'band')} O5=${f(o.HEAD,'o5')} pens=${o.HEAD.pens} over2=${o.HEAD.over2} tooShort=${o.HEAD.tooShort}  ||  RANK1 ink=${f(o.RANK1,'ink')} cov=${f(o.RANK1,'cov')} wedge=${f(o.RANK1,'wedge')} hole=${f(o.RANK1,'hole')} band=${f(o.RANK1,'band')} O5=${f(o.RANK1,'o5')} pens=${o.RANK1.pens} over2=${o.RANK1.over2} tooShort=${o.RANK1.tooShort}`);
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
