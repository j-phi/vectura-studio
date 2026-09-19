const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const M = require('/private/tmp/claude-501/scratch-T25/_t25/metrics.js');
const P = require('/private/tmp/claude-501/scratch-T25/_t25/proto.js');
const fs = require('fs');
const VARIANTS = {
  'P0-baselineHEAD': { anchor:'stagger' },
  'P1-fixed':        { anchor:'fixed' },
  'P2-fixed+KR1.0':  { anchor:'fixed', KR:1.0 },
  'P3-grad+KR1.0':   { anchor:'grad',  KR:1.0 },
  'P4-grad+KR1.0+L0_1.02': { anchor:'grad', KR:1.0, L0:1.02 },
  'P5-fixed+KR1.0+L0_1.02': { anchor:'fixed', KR:1.0, L0:1.02 },
  'P6-staggerOnly+KR1.0':   { anchor:'stagger', KR:1.0 },
  'P7-subdiv+stagger': { anchor:'stagger', subdiv:true },
  'P8-subdiv+fixed':   { anchor:'fixed', subdiv:true },
  'P9-subdiv+grad':    { anchor:'grad', subdiv:true },
  'P10-subdiv+grad+L0_1.02': { anchor:'grad', subdiv:true, L0:1.02 },
  'P11-subdiv+fixed+L0_1.02': { anchor:'fixed', subdiv:true, L0:1.02 },
  'P12-subdiv+stagger+L0_1.02': { anchor:'stagger', subdiv:true, L0:1.02 },
  'P13-subdiv+stagger+L0_1.06': { anchor:'stagger', subdiv:true, L0:1.06 },
  'P14-subdiv+stagger+L0_1.05': { anchor:'stagger', subdiv:true, L0:1.05 },
  'P15-subdiv+spill+stagger': { anchor:'stagger', subdiv:true, spill:true },
  'P16-subdiv+spill+fixed':   { anchor:'fixed', subdiv:true, spill:true },
  'P17-subdiv+spill+grad':    { anchor:'grad', subdiv:true, spill:true },
};
(async () => {
  const want = process.env.VARIANTS ? process.env.VARIANTS.split(',') : Object.keys(VARIANTS);
  const res = {};
  for (const name of want) {
    const src = P.build(VARIANTS[name]);
    const V = await L.makeRuntime('HEAD', { instrument: true, extraOverrides: { 'src/core/scene3d/surface-fill.js': require('/private/tmp/claude-501/scratch-T25/_t25/lib.js').instrumentSurfaceFill(src) } });
    for (const rig of ['create','test']) for (const [p,mp] of L.CELLS) {
      const r = L.render(V, { primitive:p, mapper:mp, rig });
      const m = M.allMetrics(r);
      const RP = r.stat.tickField.rowPitch;
      const ts = r.stat.t25marks.map(t=>L.plen(t.pts));
      m.over2RP = ts.filter(v=>v>2*RP).length; m.over2RPmm = Math.round(ts.filter(v=>v>2*RP).reduce((a,b)=>a+b,0)*10)/10;
      m.over15RP = ts.filter(v=>v>1.5*RP).length; m.maxLdRP = Math.max(...ts)/RP; m.pens = r.stat.pens;
      const key = `${name}|${rig}|${p}/${mp}`;
      res[key] = m;
      const t = m.tick;
      console.log(key, 'ink', m.inkMm, 'O5site', m.O5ratio&&m.O5ratio.toFixed(2), 'O5path', t.O5t25.toFixed(2), 'seamMax', t.seamOvMax.toFixed(4), 'seamP95', t.seamOvP95.toFixed(4),
        'over2RP', m.over2RP, 'maxLd/RP', m.maxLdRP.toFixed(2), 'wedge25', m.wedge25.toFixed(4), 'holeMax', m.holeMax.toFixed(3),
        'pens', m.pens, 'bandC', m.bandC.toFixed(4), 'R2n', t.lenToneR2n.toFixed(3), 'roughP95', t.roughP95.toFixed(3), 'frag', t.fragFrac035.toFixed(3));
    }
  }
  fs.writeFileSync('/private/tmp/claude-501/scratch-T25/_t25/proto.json', JSON.stringify(res, null, 1));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
