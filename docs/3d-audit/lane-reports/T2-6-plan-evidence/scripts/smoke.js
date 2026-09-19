const t0=Date.now(); const T=(m)=>console.log(m, ((Date.now()-t0)/1000).toFixed(1)+'s');
const { makeRuntime, render } = require('/private/tmp/claude-501/scratch-T26/_t26/lib.js');
(async () => {
  const V = await makeRuntime('HEAD', { instrument: true }); T('runtime');
  const r = render(V, { primitive:'cone', mapper:'hatch', rig:'create', density:50 }); T('render paths='+r.paths.length);
  const stat = r.stat; console.log('t26marks', (stat.t26marks||[]).length, 'tickField', !!(stat.tickField&&stat.tickField.rowPitch));
  const wedgeH = require('/private/tmp/claude-501/scratch-T26/tests/helpers/scene3d-mktick-wedge.js');
  const w = wedgeH.measureWedge({ tickField: stat.tickField, paths: r.paths, penWidth: 0.3 }); T('wedge '+w.wedge25);
  const { oraclesA } = require('/private/tmp/claude-501/scratch-T26/_t26/metrics26.js');
  const A = oraclesA(stat.t26marks, stat.tickField.rowPitch, 0.3); T('oraclesA'); console.log(A);
  const bandH = require('/private/tmp/claude-501/scratch-T26/tests/helpers/scene3d-mktick-band.js');
  const b = bandH.measure(r.paths, { rowPitch: stat.tickField.rowPitch, penMm: 0.3 }); T('bandC '+(b&&b.bandC));
})().catch((e)=>{console.error(e);process.exit(1);});
