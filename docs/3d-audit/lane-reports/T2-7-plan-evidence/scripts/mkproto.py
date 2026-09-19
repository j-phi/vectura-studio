import sys, re
S='/private/tmp/claude-501/scratch-T2-7-plan'
src=open(f'{S}/main/src/core/scene3d/surface-fill.js').read()
GAP=float(sys.argv[1]) if len(sys.argv)>1 else 0.6    # clear gap between ticks, pen widths
LMIN=float(sys.argv[2]) if len(sys.argv)>2 else 0.35  # lightest tick length / R
DIRCUT=float(sys.argv[3]) if len(sys.argv)>3 else 25  # deg: drop a tick whose walk turned
out=sys.argv[4] if len(sys.argv)>4 else f'{S}/proto/src/core/scene3d/surface-fill.js'
def rep(s,a,b,label):
    n=s.count(a)
    assert n==1,(label,n)
    return s.replace(a,b)
# 1) solve: tone = SPACING, contact-free tick
old_len = src[src.index("          const Lease = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;"):]
old_len = old_len[:old_len.index("        } else {")]
new_len = f"""          if (law.shape === 'tick') {{
            // T2-7 PROTO — tone = SPACING; ticks never touch.
            const PMINT = (1 + {GAP}) * w;                        // along-row: >= GAP pens clear
            const lamMax = clamp(1 - PMINT / R, 0.2, 0.95);       // across-row: seam gap >= PMINT
            const lam = lamMax * ({LMIN} + (1 - {LMIN}) * eased);
            L = lam * R;
            const Lplot = 1.15 * MIN_MARK_MM;                    // T2-4's PlotFloor, as the tick's minimum SIZE
            if (L < Lplot) L = Math.min(Lplot, 0.98 * R);        // at max density the seam gap yields first
            const cMax = Math.max(lamMax * R, L) / R * w / PMINT;                      // densest contact-free coverage
            const c = (mkAsk(I) / MK_DARK_AREA) * cMax;           // tone range mapped onto it
            P = L * w / Math.max(1e-9, c * R);
            if (P < PMINT) P = PMINT;
            if (P > MK_PMAX) {{ P = MK_PMAX; L = Math.min(L, c * R * P / w); }}
          }} else {{
{old_len}          }}
"""
src=rep(src,old_len,new_len,'len')
# 2) placement: centred tick, no stagger, no comb; T2-5's clause-(c) split kept (uniform, centred)
a=src.index("          if (law.shape === 'tick') {\n            const nominalRP = masterPitch / MK_ROW_COV;")
b=src.index("        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));")
blk=src[a:b]
# keep the closing brace of the else { polys = mkShape...  block: blk ends with '          }\n        }\n'
assert blk.rstrip().endswith('}\n        }') or blk.rstrip().endswith('}'), blk[-200:]
newblk = """          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            const nOver = clamp(Math.ceil(sv.L / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            if (nOver > 1) {
              const sub = sv.R / nOver; const each = sv.L / nOver; const tiled = [];
              for (let j = 0; j < nOver; j++) { const vc = (j - (nOver - 1) / 2) * sub; tiled.push([[0, vc - each / 2], [0, vc + each / 2]]); }
              polys = tiled;
            }
          }
        }
"""
src=src[:a]+newblk+src[b:]
# 3) drop a tick whose walked chord turned away from its asked direction (limb rogues)
src=rep(src,"                if (Math.acos(cosv) * (180 / Math.PI) > 10) sawDirBad = true;",
 f"                if (Math.acos(cosv) * (180 / Math.PI) > 10) sawDirBad = true;\n                if (law.shape === 'tick' && Math.acos(cosv) * (180 / Math.PI) > {DIRCUT}) {{ mkStat.offSurface += 1; return false; }}",'dir')
open(out,'w').write(src); print('wrote',out)
