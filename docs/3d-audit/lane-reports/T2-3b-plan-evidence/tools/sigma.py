import json,sys,os,math
import numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from band import *
from sweep import geom, load
SP=os.path.dirname(os.path.abspath(__file__))
KEYS=["create|sphere/contour","test|sphere/contour"]
g=geom(KEYS)
tags=["pre","V3d_Lconst","V2_len_L102","V3_len_L116","V4_full","V3e_Pfixed"]
print(f"{'sigma_mm':>8s} "+" ".join(f"{t:>13s}" for t in tags))
for sig in (1.0,1.5,2.0,2.5,3.0,4.0):
    for k in KEYS:
        x0,y0,W,H,rp,M=g[k]
        row=f"{sig:8.1f} "
        for t in tags:
            d=load(t)
            r=measure(d["cells"][k]["paths"],M,x0,y0,W,H,rp,sigma_mm=sig)
            row+=f"{r['bandC']:13.4f} "
        print(row+f"  [{k}]")
