const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const P = require('/private/tmp/claude-501/scratch-T25/_t25/proto.js');
(async () => {
  const A = await L.makeRuntime('HEAD', {});
  const laws = A.SCENE3D_TONE_LAWS.PRODUCTION;
  const mappers = A.Scene3D.Params.MAPPERS || ['none','hatch','wireframe','crosshatch','contour','spiral','stipple','contourSlice'];
  console.log('PRODUCTION laws', laws.length, JSON.stringify(laws));
  console.log('MAPPERS', JSON.stringify(mappers));
  const B = await L.makeRuntime('HEAD', { extraOverrides: { 'src/core/scene3d/surface-fill.js': P.build({ anchor:'stagger', subdiv:true, L0:1.05 }) } });
  let n=0, diff=0; const diffs=[];
  for (const law of laws) for (const mp of mappers) {
    const a = L.render(A, { primitive:process.env.PRIM||'cone', mapper:mp, rig:process.env.RIG||'create', toneLaw: law });
    const b = L.render(B, { primitive:process.env.PRIM||'cone', mapper:mp, rig:process.env.RIG||'create', toneLaw: law });
    n+=1; if (L.md5(a.paths)!==L.md5(b.paths)) { diff+=1; diffs.push(law+'/'+mp); }
  }
  console.log(`roster sweep ${process.env.PRIM||'cone'}/${process.env.RIG||'create'}: ${n} (law x mapper) cells; ${diff} changed`);
  console.log('changed:', JSON.stringify(diffs));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
