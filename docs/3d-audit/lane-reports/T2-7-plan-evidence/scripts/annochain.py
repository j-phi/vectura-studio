import json, math, sys
sys.path.insert(0,'.')
from PIL import Image, ImageDraw
import contact as C
from collections import defaultdict
S=C.S
def draw(tag,key,out):
    D=json.load(open(f'{S}/dump_{tag}.json'))[key]; rp=D['rp']
    F=[p['pts'] for p in D['paths'] if p['k']=='sceneFill' and len(p['pts'])>1]
    E=[p['pts'] for p in D['paths'] if p['k']!='sceneFill']
    n=len(F); A=[C.ang(q[0],q[-1]) for q in F]; W=C.W
    par=list(range(n))
    def f(i):
        while par[i]!=i: par[i]=par[par[i]]; i=par[i]
        return i
    ends=defaultdict(list)
    for i,q in enumerate(F):
        for t in (q[0],q[-1]): ends[(int(t[0]//1),int(t[1]//1))].append((i,t))
    for i,q in enumerate(F):
        for t in (q[0],q[-1]):
            cx,cy=int(t[0]//1),int(t[1]//1)
            for dx in (-1,0,1):
                for dy in (-1,0,1):
                    for j,u in ends.get((cx+dx,cy+dy),()):
                        if j!=i and math.dist(t,u)<W and C.ad(A[i],A[j])<20: par[f(i)]=f(j)
    g=defaultdict(list)
    for i in range(n): g[f(i)].append(i)
    inchain=set(i for v in g.values() if len(v)>=3 for i in v)
    xs=[x for q in F+E for x,_ in q]; ys=[y for q in F+E for _,y in q]
    x0,y0=min(xs),min(ys); sc=700/max(max(xs)-x0,max(ys)-y0); pad=20
    im=Image.new('RGB',(int((max(xs)-x0)*sc)+40,int((max(ys)-y0)*sc)+40),(18,19,22)); d=ImageDraw.Draw(im)
    tf=lambda q:((q[0]-x0)*sc+pad,(q[1]-y0)*sc+pad); lw=max(1,int(round(0.3*sc)))
    for q in E: d.line([tf(p) for p in q],fill=(60,200,60),width=lw)
    for i,q in enumerate(F): d.line([tf(p) for p in q],fill=(255,50,50) if i in inchain else (225,238,255),width=lw)
    im.save(out); print(out,len(inchain))
for tag in sys.argv[1:]:
    for key in ['cone|create','sphere|create']:
        draw(tag,key,f'{S}/img/chain_{tag}_{key.replace("|","_")}.png')
