import sys
S='/private/tmp/claude-501/scratch-T2-7-plan'
src=open(f'{S}/main/src/core/scene3d/surface-fill.js').read()
GAP=float(sys.argv[1]); I0=float(sys.argv[2]); I1=float(sys.argv[3]); LF=float(sys.argv[4]); BEND=float(sys.argv[5]); out=sys.argv[6]  # I0=KAPPA I1=ALPHA
def rep(s,a,b,label):
    n=s.count(a); assert n==1,(label,n); return s.replace(a,b)
old_len = src[src.index("          const Lease = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;"):]
old_len = old_len[:old_len.index("        } else {")]
new_len = f"""          if (law.shape === 'tick') {{
            // T2-7 PROTO4 — TWO CHANNELS, contact-free. Shadow: full-length ticks
            // (seam gap = PMINT, never wider), spacing carries tone. Toward the light
            // (I > I0) LENGTH relaxes too, to LF of full by I1; spacing keeps opening.
            const PMINT = (1 + {GAP}) * w;
            const lamMax = clamp(1 - PMINT / R, 0.2, 0.95);
            const Lplot = 1.15 * MIN_MARK_MM;
            const cMax = Math.max(lamMax * R, Lplot) / R * w / PMINT;
            const c = Math.pow(mkAsk(I) / MK_DARK_AREA, {LF}) * cMax;   // LF reused as GAMMA (tone contrast)
            // LENGTH = a fixed share ALPHA of the tone's log-range; full length on the
            // shadow plateau c >= KAPPA*cMax (no across-row seam gap opens there).
            const f = Math.min(1, Math.pow(c / ({I0} * cMax), {I1}));
            L = lamMax * f * R;
            if (L < Lplot) L = Math.min(Lplot, 0.98 * R);
            P = L * w / Math.max(1e-9, c * R);
            if (P < PMINT) P = PMINT;
            if (P > MK_PMAX) {{ P = MK_PMAX; L = Math.min(L, c * R * P / w); }}
          }} else {{
{old_len}          }}
"""
src=rep(src,old_len,new_len,'len')
a=src.index("          if (law.shape === 'tick') {\n            const nominalRP = masterPitch / MK_ROW_COV;")
b=src.index("        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));")
src=src[:a]+"""          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            const nOver = clamp(Math.ceil(sv.L / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            if (nOver > 1) {
              const sub = sv.R / nOver; const each = sv.L / nOver; const tiled = [];
              for (let j = 0; j < nOver; j++) { const vc = (j - (nOver - 1) / 2) * sub; tiled.push([[0, vc - each / 2], [0, vc + each / 2]]); }
              polys = tiled;
            }
          }
        }
"""+src[b:]
src=rep(src,"                if (Math.acos(cosv) * (180 / Math.PI) > 10) sawDirBad = true;",
 "                if (Math.acos(cosv) * (180 / Math.PI) > 10) sawDirBad = true;\n                if (law.shape === 'tick' && Math.acos(cosv) * (180 / Math.PI) > 25) { mkStat.offSurface += 1; return false; }",'dir')
# H2 bend cap: tick-only walks (stepCapMM set) stop when a step turns > BEND deg from the arm's first step
src=rep(src,"          const pts = [];\n          let truncated = false;\n",
 "          const pts = [];\n          let truncated = false;\n          let d0x = null; let d0y = null;\n",'bend0')
src=rep(src,"            curPt = nextPt;\n            pts.push(curPt);\n",
 f"""            if (stepCapMM) {{
              const sx = nextPt.x - curPt.x; const sy = nextPt.y - curPt.y; const sl = Math.hypot(sx, sy);
              if (sl > 1e-9) {{
                if (d0x == null) {{ d0x = sx / sl; d0y = sy / sl; }}
                else if ((sx * d0x + sy * d0y) / sl < Math.cos({BEND} * Math.PI / 180)) {{ truncated = true; break; }}
              }}
            }}
            curPt = nextPt;
            pts.push(curPt);
""",'bend')
open(out,'w').write(src); print('wrote',out)
