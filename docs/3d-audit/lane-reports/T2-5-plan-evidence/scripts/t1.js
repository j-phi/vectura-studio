const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
(async () => {
  for (const tag of ['v1.4.1','T2-3','HEAD']) {
    const Vp = await L.makeRuntime(tag, { instrument: false });
    const a = L.render(Vp, { primitive:'cone', mapper:'hatch', rig:'create' });
    const Vi = await L.makeRuntime(tag, { instrument: true });
    const b = L.render(Vi, { primitive:'cone', mapper:'hatch', rig:'create' });
    console.log(tag, 'plain', a.paths.length, L.md5(a.paths).slice(0,10), '| instr', b.paths.length, L.md5(b.paths).slice(0,10), 'IDENTICAL=', L.md5(a.paths)===L.md5(b.paths));
    console.log('   marks', b.stat.t25marks.length, 'runs', b.runs.length);
    const srcs = {}; b.runs.forEach(r=>{srcs[r.src]=(srcs[r.src]||0)+1;});
    console.log('   pushRun srcs', srcs);
    const em = {}; b.paths.forEach(p=>{const k=(p.meta&&p.meta.kind)+'|'+(p.meta&&p.meta.t25emit); em[k]=(em[k]||0)+1;});
    console.log('   emit sites', em);
  }
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1);});
