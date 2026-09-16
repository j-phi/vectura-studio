import json, sys, math, os, random
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from band import *
SP = os.path.dirname(os.path.abspath(__file__))
A = json.load(open(f"{SP}/data/pre.json")); B = json.load(open(f"{SP}/data/post.json"))
KEY = sys.argv[1] if len(sys.argv)>1 else "create|sphere/contour"
a=A["cells"][KEY]; b=B["cells"][KEY]; rp=b["rowPitch"]
xs=[];ys=[]
for d in (a,b):
    for f in d["paths"]: xs+=f[0::2]; ys+=f[1::2]
x0,y0,x1,y1=min(xs)-2.5*rp,min(ys)-2.5*rp,max(xs)+2.5*rp,max(ys)+2.5*rp
W=int(math.ceil((x1-x0)*PPMM)); H=int(math.ceil((y1-y0)*PPMM))
M = object_mask(raster_ink(a["paths"],x0,y0,W,H),rp) & object_mask(raster_ink(b["paths"],x0,y0,W,H),rp)

def mid(f):
    return (sum(f[0::2])/max(1,len(f[0::2])), sum(f[1::2])/max(1,len(f[1::2])))

def synth_band(paths, period, angdeg, keepfloor=0.25):
    """Suppress ink in the dark phase of a diagonal sinusoid -> a REAL band pattern."""
    a_=math.radians(angdeg); nx,ny=math.cos(a_),math.sin(a_)
    out=[]
    rnd=random.Random(7)
    for f in paths:
        mx,my=mid(f)
        s=(mx*nx+my*ny)
        w=0.5*(1+math.cos(2*math.pi*s/period))   # 0..1
        p=keepfloor+(1-keepfloor)*w
        if rnd.random()<p: out.append(f)
    return out

def synth_random(paths, keep=0.62):
    rnd=random.Random(11)
    return [f for f in paths if rnd.random()<keep]

def jitter(paths, amp):
    rnd=random.Random(23); out=[]
    for f in paths:
        dx=rnd.uniform(-amp,amp); dy=rnd.uniform(-amp,amp)
        g=list(f)
        for i in range(0,len(g),2): g[i]+=dx; g[i+1]+=dy
        out.append(g)
    return out

def rep(name, paths):
    r=measure(paths,M,x0,y0,W,H,rp)
    print(f"{name:42s} bandC={r['bandC']:.4f}  period={str(r['periodMm'])[:6]:>7s}mm  theta={r['theta']:3.0f}  meanInk={r['meanInk']:.4f}")
    return r

print(f"cell={KEY} rowPitch={rp:.3f}")
rpre = rep("PRE (clean, 42acff7b)", a["paths"])
rpost= rep("POST (banded, 81925ee8)", b["paths"])
rep("SYNTH: pre + 15mm diagonal band (135deg)", synth_band(a["paths"], 15.0, 135))
rep("SYNTH: pre + 20mm diagonal band (45deg)", synth_band(a["paths"], 20.0, 45))
for k in (0.98,0.95,0.90,0.80):
    rep(f"CONTROL: pre, random drop keep={k:.2f}", synth_random(a["paths"], k))
rep("CONTROL: pre, isotropic jitter +-room/2 (no bands)", jitter(a["paths"], 1.1))
