const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const M = require('/private/tmp/claude-501/scratch-T25/_t25/metrics.js');
const fs = require('fs');
const TAGS = process.env.TAGS ? process.env.TAGS.split(',') : ['v1.4.1','T2-3','HEAD'];
const RIGS = ['create','test'];
(async () => {
  const res = {};
  for (const tag of TAGS) {
    const V = await L.makeRuntime(tag, { instrument: true });
    for (const rig of RIGS) {
      for (const [prim, map] of L.CELLS) {
        const r = L.render(V, { primitive: prim, mapper: map, rig });
        const key = `${tag}|${rig}|${prim}/${map}`;
        try { res[key] = M.allMetrics(r); } catch (e) { res[key] = { error: String(e).slice(0,300), stack: (e.stack||'').slice(0,600) }; console.log('ERR', key, e.stack.split('\n').slice(0,4).join(' | ')); continue; }
        const m = res[key];
        console.log(key, 'paths', m.pathCount, 'wedge25', m.wedge25 && m.wedge25.toFixed(4), 'holeMax', m.holeMax && m.holeMax.toFixed(3),
          'O5', m.O5ratio && m.O5ratio.toFixed(3), 'bandC', m.bandC && m.bandC.toFixed(4),
          'nonBand', m.purity.nonBandCount, 'ticks', m.tick && m.tick.nTicks);
      }
    }
  }
  fs.writeFileSync('/private/tmp/claude-501/scratch-T25/_t25/sweep.json', JSON.stringify(res, null, 1));
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1);});
