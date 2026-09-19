import json, math, sys
from collections import defaultdict
S='/private/tmp/claude-501/scratch-T2-7-plan'
W=0.3
def ang(a,b): return math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))%180
def ad(a,b): d=abs(a-b)%180; return min(d,180-d)
def segdist(p,a,b):
    ax,ay=a; bx,by=b; px,py=p; dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
    t=0 if L<1e-12 else max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L))
    return math.hypot(px-ax-t*dx,py-ay-t*dy)
def run(tag,key,G=None):
    D=json.load(open(f'{S}/dump_{tag}.json'))[key]; rp=D['rp']
    F=[p['pts'] for p in D['paths'] if p['k']=='sceneFill' and len(p['pts'])>1]
    n=len(F); A=[ang(q[0],q[-1]) for q in F]
    Ls=[sum(math.dist(q[i],q[i-1]) for i in range(1,len(q))) for q in F]
    cell=2.0; grid=defaultdict(list)
    for i,q in enumerate(F):
        seen=set()
        for (x,y) in q:
            c=(int(x//cell),int(y//cell))
            if c not in seen: seen.add(c); grid[c].append(i)
    def near(i):
        s=set()
        for (x,y) in F[i]:
            cx,cy=int(x//cell),int(y//cell)
            for dx in (-1,0,1):
                for dy in (-1,0,1): s.update(grid.get((cx+dx,cy+dy),()))
        s.discard(i); return s
    contact=[False]*n; tipc=0; tips=0
    par=list(range(n))
    def f(i):
        while par[i]!=i: par[i]=par[par[i]]; i=par[i]
        return i
    for i in range(n):
        q=F[i]
        for tip in (q[0],q[-1]):
            tips+=1; hit=False
            for j in near(i):
                r=F[j]
                d=min(segdist(tip,r[k-1],r[k]) for k in range(1,len(r)))
                if d<W:
                    hit=True; contact[i]=True
                    # end-to-end collinear chain link
                    mi=((q[0][0]+q[-1][0])/2,(q[0][1]+q[-1][1])/2); mj=((r[0][0]+r[-1][0])/2,(r[0][1]+r[-1][1])/2)
                    if ad(A[i],A[j])<20 and math.dist(mi,mj)>1e-6 and ad(ang(mi,mj),A[i])<20:
                        par[f(i)]=f(j)
            if hit: tipc+=1
    groups=defaultdict(list)
    for i in range(n): groups[f(i)].append(i)
    chains=[g for g in groups.values() if len(g)>=3]
    clen=sorted((sum(Ls[i] for i in g)/rp for g in groups.values()),reverse=True)
    return dict(tag=tag,key=key,nFill=n,tipContactFrac=round(tipc/tips,3),markContactFrac=round(sum(contact)/n,3),
                chains3=len(chains),chainInk3=round(sum(Ls[i] for g in chains for i in g)/max(1e-9,sum(Ls)),3),
                maxChainRP=round(clen[0],2),p99ChainRP=round(clen[max(0,int(0.01*len(clen)))],2))
if __name__=='__main__':
    for tag in sys.argv[1:]:
        for key in ['cone|create','cone|test','sphere|create','sphere|test']:
            print(json.dumps(run(tag,key)))
