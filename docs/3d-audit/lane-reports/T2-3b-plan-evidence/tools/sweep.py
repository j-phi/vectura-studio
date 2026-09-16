import json, sys, math, os, pickle
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from band import *
SP=os.path.dirname(os.path.abspath(__file__))
CACHE=f"{SP}/data/_geom.pkl"

def load(tag): return json.load(open(f"{SP}/data/{tag}.json"))

def geom(keys):
    if os.path.exists(CACHE):
        g=pickle.load(open(CACHE,'rb'))
    else: g={}
    A=load("pre"); B=load("post")
    changed=False
    for k in keys:
        if k in g: continue
        a=A["cells"][k]; b=B["cells"][k]; rp=b["rowPitch"]
        xs=[];ys=[]
        for d in (a,b):
            for f in d["paths"]: xs+=f[0::2]; ys+=f[1::2]
        x0,y0=min(xs)-2.5*rp,min(ys)-2.5*rp; x1,y1=max(xs)+2.5*rp,max(ys)+2.5*rp
        W=int(math.ceil((x1-x0)*PPMM)); H=int(math.ceil((y1-y0)*PPMM))
        M=object_mask(raster_ink(a["paths"],x0,y0,W,H),rp) & object_mask(raster_ink(b["paths"],x0,y0,W,H),rp)
        g[k]=(x0,y0,W,H,rp,M); changed=True
    if changed: pickle.dump(g, open(CACHE,'wb'))
    return g

if __name__=="__main__":
    tags=sys.argv[1].split(",")
    keys=sys.argv[2].split(",") if len(sys.argv)>2 else None
    A=load("pre")
    if not keys: keys=list(A["cells"].keys())
    g=geom(keys)
    res={}
    for t in tags:
        d=load(t); res[t]={}
        for k in keys:
            x0,y0,W,H,rp,M=g[k]
            r=measure(d["cells"][k]["paths"],M,x0,y0,W,H,rp)
            res[t][k]=r
        print(f"-- {t} done", file=sys.stderr)
    json.dump(res, open(f"{SP}/data/sweep.json","w"))
    hdr=f"{'variant':16s}"+"".join(f"{k.replace('|','/'):>26s}" for k in keys)
    print(hdr)
    for t in tags:
        line=f"{t:16s}"
        for k in keys:
            r=res[t][k]
            line+=f"{r['bandC']:10.4f}/{str(r['periodMm'])[:5]:>5s}/{r['theta']:3.0f} "
        print(line)
