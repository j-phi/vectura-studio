/* ROUND 9 — what zone does the RENDERER actually give each facet?
 * facets.js reconstructs the dihedral gate; this intercepts Regions.formZone on
 * the live call path instead, so there is nothing to reconstruct. */
const path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const {loadVecturaRuntime}=require(path.join(ROOT,'tests/helpers/load-vectura-runtime'));
const R7=require('./render.js');
(async()=>{
 const rt=await loadVecturaRuntime(); const V=rt.window.Vectura;
 const Rg=V.Scene3D.Regions; const orig=Rg.formZone; const origInk=Rg.formInk;
 for(const id of process.argv.slice(2)){
  const calls=[]; const inks=[];
  Rg.formZone=function(n,w,ctx){const z=orig.apply(this,arguments);
    calls.push({n:{x:+n.x.toFixed(3),y:+n.y.toFixed(3),z:+n.z.toFixed(3)},term:ctx&&('terminator' in ctx)?ctx.terminator:'(absent)',z0:z});return z;};
  Rg.formInk=function(z){inks.push(z);return origInk.apply(this,arguments);};
  R7.buildPaths(V,id);
  Rg.formZone=orig; Rg.formInk=origInk;
  const seen=new Map();
  calls.forEach(c=>{const k=JSON.stringify(c.n);if(!seen.has(k))seen.set(k,{...c,count:0});seen.get(k).count++;});
  console.log(`\n== ${id}  (${calls.length} formZone calls, ${seen.size} distinct normals)`);
  [...seen.values()].forEach(c=>console.log(`   n=(${c.n.x},${c.n.y},${c.n.z})  terminator:${c.term}  ZONE ${c.z0}   x${c.count}`));
  const tally={};inks.forEach(z=>{tally[z]=(tally[z]||0)+1;});
  console.log('   formInk calls by zone:',JSON.stringify(tally));
 }
 rt.cleanup();process.exit(0);
})();
