const fs=require('fs'); const path=require('path');
const args={}; for(let i=2;i<process.argv.length;i+=1){const a=process.argv[i]; if(a.startsWith('--'))args[a.slice(2)]=process.argv[++i];}
const ROOT=path.resolve(args.root);
const {loadVecturaRuntime}=require(path.join(ROOT,'tests/helpers/load-vectura-runtime.js'));
const {measureWedge, siteCoverage, lengthCarriesTone}=require(path.join(ROOT,'tests/helpers/scene3d-mktick-wedge.js'));
const REL='src/core/scene3d/surface-fill.js';
const BOUNDS={width:1200,height:1000,m:20,dW:1160,dH:960,penWidth:0.3};
const SUN={id:'sun',type:'directional',azimuth:135,elevation:45,intensity:1,castShadows:false};
const clone=(v)=>JSON.parse(JSON.stringify(v));
const CELLS=[['sphere','hatch'],['sphere','contour'],['torus','hatch'],['torus','contour'],['cone','hatch'],['cone','contour']];
(async()=>{
  const opts={rootDir:ROOT}; if(args.src) opts.scriptOverrides={[REL]:fs.readFileSync(path.resolve(args.src),'utf8')};
  const rt=await loadVecturaRuntime(opts); const V=rt.window.Vectura;
  const out={};
  for(const rig of ['test','create']){ out[rig]={};
    for(const [primitive,mapper] of CELLS){
      const defaults=V.ALGO_DEFAULTS.scene3d, Params=V.Scene3D.Params, p=clone(defaults);
      const bag=rig==='create'?{...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive]||{}),...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive]||{})}:clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive]||{});
      p.objects=[{id:'obj',name:'Obj',primitive,params:bag,transform:{x:0,y:0,z:0,yaw:0,pitch:0,roll:0,scale:1},visibility:'solid'}];
      p.ground={enabled:false}; p.backdrop={enabled:false}; p.camera=clone(Params.DEFAULT_CAMERA);
      p.tone={...clone(defaults).tone,enabled:true}; p.lights=[SUN];
      p.styleTable={scene:{penId:null,mapper,params:{fillAngle:45,fillDensity:50,toneLaw:'mkTick'}},byObject:{},byFace:{}};
      const paths=V.AlgorithmRegistry.scene3d.generate(p,null,null,BOUNDS);
      const st=V.Scene3D.SurfaceFill.lastMarkStats;
      const w=measureWedge({tickField:st.tickField, paths, penWidth:BOUNDS.penWidth});
      const o5=lengthCarriesTone(st.lenByThird, st.cntByThird);
      out[rig][`${primitive}/${mapper}`]={wedge25:w.wedge25, holeMax:w.holeMax, siteCov:siteCoverage(st.tickSites), o5:o5.ratio, mono:o5.monotone, tooShort:st.tooShort, marks:st.marks};
    }}
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(out,null,1));
  for(const rig of ['test','create']){ const v=CELLS.map(([p,m])=>out[rig][`${p}/${m}`].wedge25); const mean=v.reduce((a,b)=>a+b,0)/v.length;
    console.log(`${rig}: meanWedge25=${mean.toFixed(5)}  cells=` + CELLS.map(([p,m])=>`${p}/${m} w=${out[rig][`${p}/${m}`].wedge25.toFixed(4)} hole=${out[rig][`${p}/${m}`].holeMax.toFixed(3)} O5=${out[rig][`${p}/${m}`].o5===null?'null':out[rig][`${p}/${m}`].o5.toFixed(3)}${out[rig][`${p}/${m}`].mono?'':'!NONMONO'} cov=${out[rig][`${p}/${m}`].siteCov.toFixed(3)}`).join(' | '));
  }
  await rt.cleanup(); process.exit(0);
})();
