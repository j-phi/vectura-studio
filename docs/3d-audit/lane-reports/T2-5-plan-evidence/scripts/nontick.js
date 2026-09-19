const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const P = require('/private/tmp/claude-501/scratch-T25/_t25/proto.js');
(async () => {
  const laws = ['mkDashRamp','mkScribble','mkDotScreen','mkLozenge','mkChevron','mkComma','mkSFlick','mkCrossPlus','mkTriangle','mkDotLozenge','mkRadialFlick','whiteBand'];
  const A = await L.makeRuntime('HEAD', {});
  const B = await L.makeRuntime('HEAD', { extraOverrides: { 'src/core/scene3d/surface-fill.js': P.build({ anchor:'stagger', subdiv:true, L0:1.05 }) } });
  let bad = 0;
  for (const law of laws) for (const rig of ['create','test']) for (const [p,mp] of [['cone','hatch'],['sphere','contour']]) {
    const a = L.render(A, { primitive:p, mapper:mp, rig, toneLaw: law });
    const b = L.render(B, { primitive:p, mapper:mp, rig, toneLaw: law });
    const same = L.md5(a.paths) === L.md5(b.paths);
    if (!same) { bad += 1; console.log('DIFF', law, rig, p+'/'+mp, a.paths.length, b.paths.length); }
  }
  console.log(bad === 0 ? 'ALL 12 non-tick laws x 2 rigs x 2 cells BYTE-IDENTICAL (48 renders)' : `${bad} DIFFS`);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
