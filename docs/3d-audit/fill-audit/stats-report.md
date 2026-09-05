# Scene3D fill-style audit — stats report

Generated 2026-09-05T01:43:29.802Z from 7440 shots / 1214 rows (424 unreachable pairs). Script: scripts/audit/scene3d-audit-stats.js

## (a) Density response

Ink ratio = inkMm[max]/inkMm[low]. Flat: 0.83 < ratio < 1.2 on a mapper that owns the density slider (mapper 'none' excluded). Non-monotone: ink or path count drops >2% from low→med or med→max. Angle-unstable: |ink(a)-ink(b)|/mean > 0.45 at one density.

### Density-INERT rows (ink and path count byte-identical across low/med/max) — 874 rows

| primitive|mapper | styles | which |
| --- | --- | --- |
| box|wireframe | 1 | ladder |
| box|contourSlice | 1 | ladder |
| plane|hatch | 1 | ladder |
| plane|wireframe | 1 | ladder |
| plane|crosshatch | 1 | ladder |
| plane|contour | 1 | ladder |
| plane|spiral | 1 | ladder |
| plane|stipple | 1 | ladder |
| plane|contourSlice | 1 | ladder |
| sphere|wireframe | 49 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, ladder, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| sphere|contourSlice | 49 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, ladder, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| ellipsoid|wireframe | 1 | ladder |
| ellipsoid|contourSlice | 1 | ladder |
| cylinder|wireframe | 1 | ladder |
| cylinder|contourSlice | 1 | ladder |
| cone|wireframe | 49 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, ladder, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| cone|contourSlice | 49 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, ladder, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| torus|wireframe | 49 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, ladder, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| torus|contourSlice | 49 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, ladder, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| torusKnot|wireframe | 1 | ladder |
| torusKnot|contourSlice | 1 | ladder |
| capsule|wireframe | 1 | ladder |
| capsule|contourSlice | 1 | ladder |
| superellipsoid|wireframe | 1 | ladder |
| superellipsoid|contourSlice | 1 | ladder |
| pyramid|wireframe | 1 | ladder |
| pyramid|contourSlice | 1 | ladder |
| solid|wireframe | 1 | ladder |
| solid|contourSlice | 1 | ladder |
| sphere|hatch | 12 | contFieldFore, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| sphere|crosshatch | 12 | contFieldFore, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| sphere|contour | 12 | contFieldFore, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| torus|hatch | 14 | contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| torus|crosshatch | 14 | contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| torus|contour | 14 | contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| box|hatch | 9 | defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| box|crosshatch | 9 | defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| cone|hatch | 14 | contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| cone|crosshatch | 14 | contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |
| cone|contour | 14 | contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, defectSplit, dutyConst, endShorten, etfKang, mazeFill, mezzoRegion, originSpiral, turingStripe, voronoiWeb |

### Weak density response (0.83 < ratio < 1.2 but not inert) — 391 rows

| primitive | mapper | style | angle | ink low/med/max | paths low/med/max | ratio |
| --- | --- | --- | --- | --- | --- | --- |
| sphere | hatch | nibAngle | a | 2906.6 / 2906.6 / 3270.8 | 138 / 138 / 162 | 1.13 |
| sphere | hatch | nibAngle | b | 3221.9 / 3221.9 / 3844.2 | 171 / 171 / 207 | 1.19 |
| sphere | hatch | bundleCount | a | 2493.5 / 2493.5 / 2571.3 | 144 / 144 / 146 | 1.03 |
| sphere | hatch | bundleCount | b | 2756.4 / 2756.4 / 2672.4 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | bundleSubNib | a | 3980.2 / 3980.2 / 4217.2 | 192 / 192 / 200 | 1.06 |
| sphere | hatch | bundleSubNib | b | 4444.5 / 4444.5 / 4333.8 | 215 / 215 / 220 | 0.98 |
| sphere | hatch | bundleEased | a | 2339.9 / 2339.9 / 2417.8 | 137 / 137 / 138 | 1.03 |
| sphere | hatch | bundleEased | b | 2760.3 / 2760.3 / 2675.6 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | bundleDither | a | 2483.3 / 2483.3 / 2568.8 | 146 / 146 / 145 | 1.03 |
| sphere | hatch | bundleDither | b | 2754.4 / 2754.4 / 2678.1 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | bundleLozenge | a | 2272.3 / 2272.3 / 2377.8 | 142 / 142 / 143 | 1.05 |
| sphere | hatch | bundleLozenge | b | 2467.9 / 2467.9 / 2405.4 | 155 / 155 / 152 | 0.97 |
| sphere | hatch | bundleHandoff | a | 2264.9 / 2264.9 / 2361.1 | 134 / 134 / 138 | 1.04 |
| sphere | hatch | bundleHandoff | b | 2756.4 / 2756.4 / 2672.4 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | contFieldSigmoid | a | 1777.8 / 1777.8 / 1901.2 | 120 / 120 / 127 | 1.07 |
| sphere | hatch | contFieldSigmoid | b | 2372.7 / 2372.7 / 2409.7 | 144 / 144 / 146 | 1.02 |
| sphere | hatch | contFieldFore | a | 2061.5 / 2061.5 / 2080.7 | 133 / 133 / 134 | 1.01 |
| sphere | hatch | contFieldSurface | a | 2490.5 / 2490.5 / 2486.7 | 155 / 155 / 155 | 1 |
| sphere | hatch | contFieldQuant | a | 2031 / 2031 / 2103.6 | 128 / 128 / 133 | 1.04 |
| sphere | hatch | contFieldQuant | b | 2369.3 / 2369.3 / 2409.4 | 144 / 144 / 146 | 1.02 |
| sphere | hatch | penCross | b | 831.8 / 831.8 / 962.3 | 94 / 94 / 98 | 1.16 |
| sphere | hatch | mkScribble | a | 3002.6 / 3002.6 / 3039.2 | 83 / 83 / 125 | 1.01 |
| sphere | hatch | mkScribble | b | 3397.7 / 3397.7 / 3456 | 78 / 78 / 100 | 1.02 |
| sphere | hatch | mkTick | a | 3131.3 / 3131.3 / 3043.7 | 666 / 666 / 2076 | 0.97 |
| sphere | hatch | mkTick | b | 3424.5 / 3424.5 / 3303.8 | 683 / 683 / 2185 | 0.96 |
| sphere | hatch | mkDashRamp | a | 2699.9 / 2699.9 / 2995.2 | 498 / 498 / 1861 | 1.11 |
| sphere | hatch | mkDashRamp | b | 3309.8 / 3309.8 / 3308.2 | 564 / 564 / 1999 | 1 |
| sphere | hatch | mkDotScreen | a | 2872.2 / 2872.2 / 2972.8 | 140 / 140 / 785 | 1.04 |
| sphere | hatch | mkDotScreen | b | 3650.9 / 3650.9 / 3395 | 129 / 129 / 783 | 0.93 |
| sphere | hatch | ampSpacing | a | 4644.3 / 4644.3 / 4644.9 | 250 / 250 / 182 | 1 |
| sphere | hatch | weaveDepth | a | 4230.2 / 4230.2 / 4586.5 | 176 / 176 / 193 | 1.08 |
| sphere | hatch | interlockWeave | a | 4546.8 / 4546.8 / 4651.2 | 156 / 156 / 176 | 1.02 |
| sphere | hatch | interlockWeave | b | 5201.5 / 5201.5 / 5363.6 | 167 / 167 / 184 | 1.03 |
| sphere | hatch | trochoidLoop | a | 5270.6 / 5270.6 / 4887.1 | 366 / 366 / 544 | 0.93 |
| sphere | hatch | trochoidLoop | b | 6353.8 / 6353.8 / 6408.5 | 441 / 441 / 759 | 1.01 |
| sphere | hatch | amplitudeOnly | a | 1748.2 / 1748.2 / 2003.5 | 138 / 138 / 144 | 1.15 |
| sphere | hatch | amplitudeOnly | b | 2075.8 / 2075.8 / 2270.4 | 152 / 152 / 146 | 1.09 |
| sphere | hatch | onePenDown | a | 4329 / 4329 / 4487.9 | 99 / 99 / 130 | 1.04 |
| sphere | hatch | onePenDown | b | 5564.3 / 5564.3 / 6585.9 | 102 / 102 / 165 | 1.18 |
| sphere | crosshatch | nibAngle | a | 5924.6 / 5924.6 / 7067.6 | 246 / 246 / 297 | 1.19 |
| sphere | crosshatch | bundleCount | a | 4844.5 / 4844.5 / 5064.6 | 236 / 236 / 244 | 1.05 |
| sphere | crosshatch | bundleCount | b | 5365 / 5365 / 5218.1 | 250 / 250 / 250 | 0.97 |
| sphere | crosshatch | bundleSubNib | a | 7852.2 / 7852.2 / 8365.5 | 348 / 348 / 364 | 1.07 |
| sphere | crosshatch | bundleSubNib | b | 8714 / 8714 / 8522.1 | 365 / 365 / 368 | 0.98 |
| sphere | crosshatch | bundleEased | a | 4543.7 / 4543.7 / 4753.7 | 227 / 227 / 234 | 1.05 |
| sphere | crosshatch | bundleEased | b | 5368.8 / 5368.8 / 5222.6 | 250 / 250 / 249 | 0.97 |
| sphere | crosshatch | bundleDither | a | 4826 / 4826 / 5060.4 | 240 / 240 / 245 | 1.05 |
| sphere | crosshatch | bundleDither | b | 5359.7 / 5359.7 / 5232.9 | 250 / 250 / 251 | 0.98 |
| sphere | crosshatch | bundleLozenge | a | 4437.1 / 4437.1 / 4674.6 | 226 / 226 / 233 | 1.05 |
| sphere | crosshatch | bundleLozenge | b | 4794.7 / 4794.7 / 4670.3 | 243 / 243 / 236 | 0.97 |
| sphere | crosshatch | bundleHandoff | a | 4404.5 / 4404.5 / 4642.5 | 223 / 223 / 232 | 1.05 |
| sphere | crosshatch | bundleHandoff | b | 5365 / 5365 / 5218.1 | 250 / 250 / 250 | 0.97 |
| sphere | crosshatch | contFieldSigmoid | a | 3318.5 / 3318.5 / 3466 | 171 / 171 / 180 | 1.04 |
| sphere | crosshatch | contFieldSigmoid | b | 4615.6 / 4615.6 / 4690.1 | 221 / 221 / 225 | 1.02 |
| sphere | crosshatch | contFieldFore | a | 4068.3 / 4068.3 / 4087.6 | 202 / 202 / 203 | 1 |
| sphere | crosshatch | contFieldSurface | a | 4828.5 / 4828.5 / 4824.7 | 242 / 242 / 242 | 1 |
| sphere | crosshatch | contFieldQuant | a | 3965.6 / 3965.6 / 4067.1 | 190 / 190 / 197 | 1.03 |
| sphere | crosshatch | contFieldQuant | b | 4611 / 4611 / 4689.9 | 221 / 221 / 225 | 1.02 |
| sphere | crosshatch | mkScribble | a | 6080.1 / 6080.1 / 5801.1 | 106 / 106 / 188 | 0.95 |
| sphere | crosshatch | mkScribble | b | 6650 / 6650 / 6870.9 | 88 / 88 / 135 | 1.03 |
| sphere | crosshatch | mkTick | a | 6051.9 / 6051.9 / 5637 | 1221 / 1221 / 3923 | 0.93 |
| sphere | crosshatch | mkTick | b | 6881.7 / 6881.7 / 6723.4 | 1314 / 1314 / 4401 | 0.98 |
| sphere | crosshatch | mkDashRamp | a | 5667.5 / 5667.5 / 5658.6 | 983 / 983 / 3591 | 1 |
| sphere | crosshatch | mkDashRamp | b | 6233.7 / 6233.7 / 6672.8 | 1004 / 1004 / 3975 | 1.07 |
| sphere | crosshatch | mkDotScreen | a | 5954.2 / 5954.2 / 5688.7 | 213 / 213 / 1507 | 0.96 |
| sphere | crosshatch | mkDotScreen | b | 6586.2 / 6586.2 / 6766.8 | 185 / 185 / 1503 | 1.03 |
| sphere | crosshatch | ampSpacing | a | 8495.6 / 8495.6 / 7856 | 403 / 403 / 326 | 0.92 |
| sphere | crosshatch | weaveDepth | a | 7907.7 / 7907.7 / 7687.6 | 295 / 295 / 321 | 0.97 |
| sphere | crosshatch | weaveDepth | b | 9328.2 / 9328.2 / 7904.4 | 284 / 284 / 204 | 0.85 |
| sphere | crosshatch | interlockWeave | a | 9113.2 / 9113.2 / 9390.9 | 232 / 232 / 299 | 1.03 |
| sphere | crosshatch | interlockWeave | b | 10258.3 / 10258.3 / 10517.9 | 257 / 257 / 291 | 1.03 |
| sphere | crosshatch | trochoidLoop | a | 10537.7 / 10537.7 / 9849.9 | 630 / 630 / 973 | 0.93 |
| sphere | crosshatch | trochoidLoop | b | 12558.4 / 12558.4 / 12683.1 | 816 / 816 / 1454 | 1.01 |
| sphere | crosshatch | amplitudeOnly | a | 3384.5 / 3384.5 / 3889.7 | 199 / 199 / 220 | 1.15 |
| sphere | crosshatch | amplitudeOnly | b | 3980 / 3980 / 4407.3 | 242 / 242 / 232 | 1.11 |
| sphere | crosshatch | onePenDown | a | 8892.6 / 8892.6 / 8865.2 | 135 / 135 / 189 | 1 |
| sphere | crosshatch | onePenDown | b | 10593 / 10593 / 12258.7 | 144 / 144 / 261 | 1.16 |
| sphere | contour | nibAngle | a | 3552.6 / 3591.6 / 3924.8 | 176 / 180 / 222 | 1.1 |
| sphere | contour | nibAngle | b | 4214.9 / 4214.9 / 5026.5 | 147 / 147 / 181 | 1.19 |
| sphere | contour | taperedEnds | a | 3339.3 / 3358.6 / 3821.5 | 172 / 181 / 204 | 1.14 |
| sphere | contour | taperedEnds | b | 4056.8 / 4056.8 / 4716.7 | 157 / 157 / 188 | 1.16 |
| sphere | contour | isophoteWidth | a | 3299.6 / 3180.7 / 3924.4 | 162 / 166 / 200 | 1.19 |
| sphere | contour | whiteBand | a | 3613.9 / 3586.6 / 3893.9 | 168 / 173 / 203 | 1.08 |
| sphere | contour | bundleCount | a | 2704.4 / 2727.1 / 2838.4 | 193 / 199 / 203 | 1.05 |
| sphere | contour | bundleCount | b | 3004.6 / 3004.6 / 3185.2 | 173 / 173 / 180 | 1.06 |
| sphere | contour | bundleSubNib | a | 4429.1 / 4522.1 / 5049.2 | 289 / 298 / 318 | 1.14 |
| sphere | contour | bundleSubNib | b | 4939 / 4939 / 5262.4 | 239 / 239 / 250 | 1.07 |
| sphere | contour | bundleEased | a | 2521.8 / 2541.4 / 2653.4 | 176 / 177 / 182 | 1.05 |
| sphere | contour | bundleEased | b | 3005.1 / 3005.1 / 3193.4 | 173 / 173 / 181 | 1.06 |
| sphere | contour | bundleDither | a | 2702.8 / 2720.5 / 2840.5 | 194 / 199 / 202 | 1.05 |
| sphere | contour | bundleDither | b | 2998.6 / 2998.6 / 3186 | 175 / 175 / 183 | 1.06 |
| sphere | contour | bundleLozenge | a | 2442.5 / 2479.2 / 2574.5 | 170 / 173 / 177 | 1.05 |
| sphere | contour | bundleLozenge | b | 2671 / 2671 / 2859.4 | 159 / 159 / 166 | 1.07 |
| sphere | contour | bundleHandoff | a | 2462.1 / 2476.9 / 2596.1 | 165 / 169 / 175 | 1.05 |
| sphere | contour | bundleHandoff | b | 3004.6 / 3004.6 / 3185.2 | 173 / 173 / 180 | 1.06 |
| sphere | contour | contFieldSigmoid | a | 1460.1 / 1462.5 / 1579.1 | 103 / 103 / 108 | 1.08 |
| sphere | contour | contFieldSigmoid | b | 2124.6 / 2124.6 / 2136 | 127 / 127 / 128 | 1.01 |
| sphere | contour | contFieldTouch | a | 3655.6 / 3657.5 / 3884.2 | 163 / 163 / 172 | 1.06 |
| sphere | contour | contFieldFore | a | 1941.7 / 1936.4 / 1942.7 | 120 / 119 / 120 | 1 |
| sphere | contour | contFieldSurface | a | 2291.5 / 2290.4 / 2293.8 | 134 / 134 / 134 | 1 |
| sphere | contour | contFieldQuant | a | 1733.6 / 1737.1 / 1848.6 | 111 / 111 / 116 | 1.07 |
| sphere | contour | contFieldQuant | b | 2137.7 / 2137.7 / 2142.3 | 128 / 128 / 129 | 1 |
| sphere | contour | penCross | a | 958.9 / 964.4 / 1076.5 | 92 / 92 / 95 | 1.12 |
| sphere | contour | penCross | b | 1040.1 / 1040.1 / 1208.1 | 115 / 115 / 126 | 1.16 |
| sphere | contour | mkScribble | a | 2851.1 / 2885.7 / 3004.7 | 82 / 89 / 152 | 1.05 |
| sphere | contour | mkScribble | b | 3407.3 / 3407.3 / 3589.9 | 77 / 77 / 105 | 1.05 |
| sphere | contour | mkTick | a | 2924.4 / 2948.6 / 2912.2 | 653 / 678 / 2348 | 1 |
| sphere | contour | mkTick | b | 3458.2 / 3458.2 / 3547.9 | 753 / 753 / 2831 | 1.03 |
| sphere | contour | mkDashRamp | a | 2821.6 / 2786.1 / 2900.8 | 543 / 552 / 2144 | 1.03 |
| sphere | contour | mkDashRamp | b | 3184.3 / 3184.3 / 3514.9 | 574 / 574 / 2494 | 1.1 |
| sphere | contour | mkDotScreen | a | 2980.9 / 2945.4 / 2958.3 | 132 / 134 / 1015 | 0.99 |
| sphere | contour | mkDotScreen | b | 3339.4 / 3339.4 / 3611.3 | 126 / 126 / 1092 | 1.08 |
| sphere | contour | ampSpacing | a | 4669.4 / 4869.3 / 4902.1 | 334 / 363 / 257 | 1.05 |
| sphere | contour | ampSpacing | b | 5524.9 / 5524.9 / 5663 | 273 / 273 / 159 | 1.02 |
| sphere | contour | weaveDepth | a | 4423.4 / 4483.7 / 4783.8 | 237 / 233 / 301 | 1.08 |
| sphere | contour | weaveDepth | b | 5334.2 / 5334.2 / 5412.2 | 205 / 205 / 155 | 1.01 |
| sphere | contour | interlockWeave | a | 4431.9 / 4419.9 / 4755.1 | 165 / 173 / 248 | 1.07 |
| sphere | contour | interlockWeave | b | 5657 / 5657 / 5357.2 | 157 / 157 / 185 | 0.95 |
| sphere | contour | amplitudeOnly | a | 1764.7 / 1796.2 / 2073.3 | 162 / 164 / 178 | 1.17 |
| sphere | contour | amplitudeOnly | b | 2054.4 / 2054.4 / 2323.6 | 163 / 163 / 182 | 1.13 |
| sphere | contour | onePenDown | a | 4594.9 / 4537.6 / 4573 | 102 / 106 / 135 | 1 |
| sphere | contour | onePenDown | b | 5518.6 / 5518.6 / 6130.3 | 109 / 109 / 223 | 1.11 |
| sphere | spiral | weightModulated | b | 902.7 / 902.7 / 760 | 95 / 95 / 90 | 0.84 |
| sphere | spiral | weightSmoothstep | b | 902.7 / 902.7 / 760 | 95 / 95 / 90 | 0.84 |
| sphere | spiral | fineLadder | a | 1583.5 / 1583.5 / 1672.9 | 118 / 118 / 128 | 1.06 |
| sphere | spiral | fineLadder | b | 1670.4 / 1670.4 / 1811 | 117 / 117 / 126 | 1.08 |
| sphere | spiral | phaseFineLadder | a | 1641.3 / 1641.3 / 1601.5 | 121 / 121 / 125 | 0.98 |
| sphere | spiral | phaseFineLadder | b | 1673.6 / 1673.6 / 1772.4 | 118 / 118 / 124 | 1.06 |
| sphere | spiral | perceptualRamp | a | 1640.3 / 1640.3 / 1599.9 | 121 / 121 / 126 | 0.98 |
| sphere | spiral | perceptualRamp | b | 1675.6 / 1675.6 / 1772.4 | 118 / 118 / 124 | 1.06 |
| sphere | spiral | lozengeStipple | a | 1640.3 / 1640.3 / 1599.9 | 121 / 121 / 126 | 0.98 |
| sphere | spiral | lozengeStipple | b | 1675.6 / 1675.6 / 1772.4 | 118 / 118 / 124 | 1.06 |
| sphere | spiral | deepFillTSP | a | 1127.6 / 1127.6 / 1107.6 | 111 / 111 / 115 | 0.98 |
| sphere | spiral | deepFillTSP | b | 986.5 / 986.5 / 1040 | 99 / 99 / 100 | 1.05 |
| sphere | spiral | weaveDepth | a | 2126.8 / 2126.8 / 2487.8 | 126 / 126 / 151 | 1.17 |
| torus | hatch | nibAngle | a | 2850.7 / 2850.7 / 3133.7 | 149 / 149 / 181 | 1.1 |
| torus | hatch | nibAngle | b | 3421.9 / 3421.9 / 3783.2 | 135 / 135 / 158 | 1.11 |
| torus | hatch | taperedEnds | a | 2862.5 / 2862.5 / 3355.9 | 153 / 153 / 190 | 1.17 |
| torus | hatch | taperedEnds | b | 3402.3 / 3402.3 / 3859.5 | 136 / 136 / 158 | 1.13 |
| torus | hatch | isophoteWidth | b | 3359.5 / 3359.5 / 3935.2 | 134 / 134 / 157 | 1.17 |
| torus | hatch | whiteBand | a | 2919.7 / 2919.7 / 3435.8 | 153 / 153 / 189 | 1.18 |
| torus | hatch | whiteBand | b | 3411.4 / 3411.4 / 4074.7 | 139 / 139 / 159 | 1.19 |
| torus | hatch | bundleCount | a | 2461.4 / 2461.4 / 2721.6 | 157 / 157 / 172 | 1.11 |
| torus | hatch | bundleCount | b | 2496.1 / 2496.1 / 2631.9 | 158 / 158 / 168 | 1.05 |
| torus | hatch | bundleSubNib | a | 4030.9 / 4030.9 / 4503.7 | 224 / 224 / 252 | 1.12 |
| torus | hatch | bundleSubNib | b | 4040 / 4040 / 4288.3 | 222 / 222 / 236 | 1.06 |
| torus | hatch | bundleEased | a | 2156.5 / 2156.5 / 2431.8 | 147 / 147 / 162 | 1.13 |
| torus | hatch | bundleEased | b | 2496.6 / 2496.6 / 2632.8 | 158 / 158 / 168 | 1.05 |
| torus | hatch | bundleDither | a | 2468.3 / 2468.3 / 2728.2 | 157 / 157 / 173 | 1.11 |
| torus | hatch | bundleDither | b | 2500.1 / 2500.1 / 2633.1 | 159 / 159 / 168 | 1.05 |
| torus | hatch | bundleLozenge | a | 2193.3 / 2193.3 / 2448.3 | 142 / 142 / 155 | 1.12 |
| torus | hatch | bundleLozenge | b | 2165.9 / 2165.9 / 2277.1 | 145 / 145 / 150 | 1.05 |
| torus | hatch | bundleHandoff | a | 2082.9 / 2082.9 / 2345.9 | 145 / 145 / 158 | 1.13 |
| torus | hatch | bundleHandoff | b | 2496.1 / 2496.1 / 2631.9 | 158 / 158 / 168 | 1.05 |
| torus | hatch | contFieldSigmoid | a | 1459 / 1459 / 1540.4 | 88 / 88 / 92 | 1.06 |
| torus | hatch | contFieldFore | a | 1808.6 / 1808.6 / 1847.8 | 99 / 99 / 101 | 1.02 |
| torus | hatch | contFieldQuant | a | 1792.2 / 1792.2 / 1819.4 | 98 / 98 / 100 | 1.02 |
| torus | hatch | penReserve | b | 1124.5 / 1124.5 / 1313.9 | 143 / 143 / 174 | 1.17 |
| torus | hatch | mkScribble | a | 2519.8 / 2519.8 / 2586.5 | 96 / 96 / 205 | 1.03 |
| torus | hatch | mkTick | b | 2925 / 2925 / 2830.5 | 695 / 695 / 2268 | 0.97 |
| torus | hatch | mkDashRamp | a | 2758.1 / 2758.1 / 2486 | 524 / 524 / 1771 | 0.9 |
| torus | hatch | mkDashRamp | b | 2514.2 / 2514.2 / 2788.1 | 454 / 454 / 2004 | 1.11 |
| torus | hatch | mkDotScreen | a | 2894.2 / 2894.2 / 2546.2 | 137 / 137 / 923 | 0.88 |
| torus | hatch | mkDotScreen | b | 2527.1 / 2527.1 / 2875.8 | 132 / 132 / 975 | 1.14 |
| torus | hatch | ampSpacing | a | 3925.9 / 3925.9 / 4267.6 | 339 / 339 / 218 | 1.09 |
| torus | hatch | ampSpacing | b | 4029.2 / 4029.2 / 4476.7 | 321 / 321 / 137 | 1.11 |
| torus | hatch | weaveDepth | a | 3917.8 / 3917.8 / 4172.7 | 227 / 227 / 224 | 1.07 |
| torus | hatch | weaveDepth | b | 4116.1 / 4116.1 / 4323.5 | 179 / 179 / 133 | 1.05 |
| torus | hatch | interlockWeave | a | 3956.2 / 3956.2 / 4181.8 | 198 / 198 / 192 | 1.06 |
| torus | hatch | interlockWeave | b | 4330.4 / 4330.4 / 4373.8 | 280 / 280 / 181 | 1.01 |
| torus | hatch | trochoidLoop | a | 4422.7 / 4422.7 / 4000.8 | 333 / 333 / 606 | 0.9 |
| torus | hatch | amplitudeOnly | b | 1629.3 / 1629.3 / 1904.7 | 180 / 180 / 191 | 1.17 |
| torus | hatch | onePenDown | a | 4136.2 / 4136.2 / 4033.1 | 106 / 106 / 124 | 0.98 |
| torus | hatch | onePenDown | b | 4319.5 / 4319.5 / 4397.6 | 129 / 129 / 132 | 1.02 |
| torus | crosshatch | nibAngle | a | 5630 / 5630 / 6481.7 | 241 / 241 / 305 | 1.15 |
| torus | crosshatch | nibAngle | b | 6760.6 / 6760.6 / 7802 | 204 / 204 / 275 | 1.15 |
| torus | crosshatch | taperedEnds | a | 5511.9 / 5511.9 / 6454.6 | 244 / 244 / 308 | 1.17 |
| torus | crosshatch | taperedEnds | b | 6634.7 / 6634.7 / 7251.3 | 205 / 205 / 269 | 1.09 |
| torus | crosshatch | whiteBand | a | 5652.8 / 5652.8 / 6692.6 | 238 / 238 / 313 | 1.18 |
| torus | crosshatch | bundleCount | a | 4785 / 4785 / 5290.9 | 259 / 259 / 282 | 1.11 |
| torus | crosshatch | bundleCount | b | 4790.1 / 4790.1 / 5075.8 | 258 / 258 / 280 | 1.06 |
| torus | crosshatch | bundleSubNib | a | 7927.2 / 7927.2 / 8888.9 | 398 / 398 / 443 | 1.12 |
| torus | crosshatch | bundleSubNib | b | 7868.8 / 7868.8 / 8387.2 | 385 / 385 / 421 | 1.07 |
| torus | crosshatch | bundleEased | a | 4188.8 / 4188.8 / 4709.7 | 237 / 237 / 260 | 1.12 |
| torus | crosshatch | bundleEased | b | 4791.4 / 4791.4 / 5077.5 | 258 / 258 / 280 | 1.06 |
| torus | crosshatch | bundleDither | a | 4784.7 / 4784.7 / 5296.8 | 260 / 260 / 283 | 1.11 |
| torus | crosshatch | bundleDither | b | 4791.4 / 4791.4 / 5076.9 | 259 / 259 / 281 | 1.06 |
| torus | crosshatch | bundleLozenge | a | 4232 / 4232 / 4719.4 | 233 / 233 / 255 | 1.12 |
| torus | crosshatch | bundleLozenge | b | 4127.4 / 4127.4 / 4355.6 | 227 / 227 / 241 | 1.06 |
| torus | crosshatch | bundleHandoff | a | 4019.8 / 4019.8 / 4548.1 | 230 / 230 / 250 | 1.13 |
| torus | crosshatch | bundleHandoff | b | 4790.1 / 4790.1 / 5075.8 | 258 / 258 / 280 | 1.06 |
| torus | crosshatch | contFieldSigmoid | a | 2600.7 / 2600.7 / 2770.7 | 111 / 111 / 120 | 1.07 |
| torus | crosshatch | contFieldFore | a | 3399.6 / 3399.6 / 3390.4 | 133 / 133 / 135 | 1 |
| torus | crosshatch | contFieldSurface | a | 4065.7 / 4065.7 / 4056.4 | 151 / 151 / 151 | 1 |
| torus | crosshatch | contFieldQuant | a | 3358.2 / 3358.2 / 3433.3 | 133 / 133 / 135 | 1.02 |
| torus | crosshatch | mkScribble | a | 4882.3 / 4882.3 / 5050.9 | 134 / 134 / 315 | 1.03 |
| torus | crosshatch | mkTick | b | 5542.7 / 5542.7 / 5459.5 | 1289 / 1289 / 4458 | 0.98 |
| torus | crosshatch | mkDashRamp | a | 5137.9 / 5137.9 / 4922.5 | 950 / 950 / 3528 | 0.96 |
| torus | crosshatch | mkDashRamp | b | 4904.1 / 4904.1 / 5373.6 | 880 / 880 / 3927 | 1.1 |
| torus | crosshatch | mkDotScreen | a | 5478.2 / 5478.2 / 5022.6 | 219 / 219 / 1766 | 0.92 |
| torus | crosshatch | mkDotScreen | b | 4860.9 / 4860.9 / 5564 | 200 / 200 / 1885 | 1.14 |
| torus | crosshatch | ampSpacing | a | 7768.5 / 7768.5 / 8509 | 634 / 634 / 372 | 1.1 |
| torus | crosshatch | ampSpacing | b | 8335.9 / 8335.9 / 9170.5 | 602 / 602 / 244 | 1.1 |
| torus | crosshatch | weaveDepth | a | 7792.8 / 7792.8 / 8243.3 | 419 / 419 / 395 | 1.06 |
| torus | crosshatch | weaveDepth | b | 8356 / 8356 / 8789.6 | 307 / 307 / 234 | 1.05 |
| torus | crosshatch | interlockWeave | a | 7705.4 / 7705.4 / 7972.3 | 339 / 339 / 327 | 1.03 |
| torus | crosshatch | interlockWeave | b | 8378.3 / 8378.3 / 8596.3 | 482 / 482 / 317 | 1.03 |
| torus | crosshatch | trochoidLoop | a | 8710.8 / 8710.8 / 7825.8 | 588 / 588 / 1129 | 0.9 |
| torus | crosshatch | amplitudeOnly | b | 3065.4 / 3065.4 / 3634.5 | 308 / 308 / 338 | 1.19 |
| torus | crosshatch | onePenDown | a | 8123.3 / 8123.3 / 8150.4 | 163 / 163 / 174 | 1 |
| torus | crosshatch | onePenDown | b | 8347.5 / 8347.5 / 8975.3 | 192 / 192 / 209 | 1.08 |
| torus | contour | nibAngle | a | 2512.5 / 2512.5 / 2981.5 | 243 / 243 / 305 | 1.19 |
| torus | contour | taperedEnds | a | 2353.2 / 2353.2 / 2676.8 | 250 / 250 / 294 | 1.14 |
| torus | contour | taperedEnds | b | 2542 / 2542 / 2897.9 | 204 / 204 / 255 | 1.14 |
| torus | contour | whiteBand | a | 2514.9 / 2514.9 / 3015.4 | 234 / 234 / 292 | 1.2 |
| torus | contour | whiteBand | b | 2747.7 / 2747.7 / 3289.3 | 188 / 188 / 262 | 1.2 |
| torus | contour | bundleCount | a | 2259.9 / 2259.9 / 2335.7 | 302 / 302 / 317 | 1.03 |
| torus | contour | bundleCount | b | 2160.9 / 2160.9 / 2239.7 | 295 / 295 / 300 | 1.04 |
| torus | contour | bundleSubNib | a | 3638.5 / 3638.5 / 3760.4 | 470 / 470 / 490 | 1.03 |
| torus | contour | bundleSubNib | b | 3468.5 / 3468.5 / 3608.9 | 457 / 457 / 465 | 1.04 |
| torus | contour | bundleEased | a | 1973.4 / 1973.4 / 2058.4 | 298 / 298 / 313 | 1.04 |
| torus | contour | bundleEased | b | 2159.9 / 2159.9 / 2238.7 | 295 / 295 / 300 | 1.04 |
| torus | contour | bundleDither | a | 2256.5 / 2256.5 / 2326 | 304 / 304 / 317 | 1.03 |
| torus | contour | bundleDither | b | 2159.5 / 2159.5 / 2237 | 295 / 295 / 300 | 1.04 |
| torus | contour | bundleLozenge | a | 1712.2 / 1712.2 / 1794.7 | 272 / 272 / 284 | 1.05 |
| torus | contour | bundleLozenge | b | 1525.9 / 1525.9 / 1594.5 | 271 / 271 / 281 | 1.04 |
| torus | contour | bundleHandoff | a | 1807.4 / 1807.4 / 1907.3 | 295 / 295 / 308 | 1.06 |
| torus | contour | bundleHandoff | b | 2160.9 / 2160.9 / 2239.7 | 295 / 295 / 300 | 1.04 |
| torus | contour | contFieldSigmoid | a | 1307.6 / 1307.6 / 1363.5 | 143 / 143 / 147 | 1.04 |
| torus | contour | contFieldQuant | a | 1683.8 / 1683.8 / 1681.9 | 170 / 170 / 170 | 1 |
| torus | contour | penReserve | a | 1284.3 / 1284.3 / 1507.8 | 283 / 283 / 440 | 1.17 |
| torus | contour | penCross | a | 970.3 / 970.3 / 1161.6 | 133 / 133 / 151 | 1.2 |
| torus | contour | mkScribble | a | 2195.5 / 2195.5 / 2622 | 97 / 97 / 233 | 1.19 |
| torus | contour | mkDotScreen | a | 2753.7 / 2753.7 / 2695.8 | 110 / 110 / 705 | 0.98 |
| torus | contour | ampSpacing | a | 4129.5 / 4129.5 / 4387.5 | 378 / 378 / 566 | 1.06 |
| torus | contour | ampSpacing | b | 4217.7 / 4217.7 / 4671.5 | 412 / 412 / 548 | 1.11 |
| torus | contour | weaveDepth | a | 3940.6 / 3940.6 / 4416.6 | 364 / 364 / 585 | 1.12 |
| torus | contour | weaveDepth | b | 4235.7 / 4235.7 / 4742.3 | 348 / 348 / 532 | 1.12 |
| torus | contour | interlockWeave | a | 3697.3 / 3697.3 / 4117 | 226 / 226 / 345 | 1.11 |
| torus | contour | interlockWeave | b | 4384.8 / 4384.8 / 4227.2 | 238 / 238 / 310 | 0.96 |
| torus | contour | trochoidLoop | a | 4596.3 / 4596.3 / 4315.8 | 319 / 319 / 548 | 0.94 |
| torus | contour | amplitudeOnly | a | 1950.4 / 1950.4 / 2192.1 | 240 / 240 / 285 | 1.12 |
| torus | contour | amplitudeOnly | b | 2236 / 2236 / 2448.5 | 274 / 274 / 297 | 1.1 |
| torus | contour | onePenDown | a | 3731.2 / 3731.2 / 4057 | 131 / 131 / 160 | 1.09 |
| torus | contour | onePenDown | b | 4365.2 / 4365.2 / 4278.3 | 124 / 124 / 169 | 0.98 |
| torus | spiral | weightModulated | a | 524.5 / 524.5 / 508.4 | 100 / 100 / 97 | 0.97 |
| torus | spiral | weightModulated | b | 470.6 / 470.6 / 461 | 93 / 93 / 81 | 0.98 |
| torus | spiral | weightSmoothstep | a | 524.5 / 524.5 / 508.4 | 100 / 100 / 97 | 0.97 |
| torus | spiral | weightSmoothstep | b | 470.6 / 470.6 / 461 | 93 / 93 / 81 | 0.98 |
| torus | spiral | fineLadder | b | 781.3 / 781.3 / 928.9 | 114 / 114 / 125 | 1.19 |
| torus | spiral | phaseFineLadder | a | 749 / 749 / 851.2 | 113 / 113 / 129 | 1.14 |
| torus | spiral | phaseFineLadder | b | 783.2 / 783.2 / 893.3 | 113 / 113 / 136 | 1.14 |
| torus | spiral | perceptualRamp | a | 749 / 749 / 851.2 | 113 / 113 / 129 | 1.14 |
| torus | spiral | perceptualRamp | b | 783.2 / 783.2 / 893.3 | 113 / 113 / 136 | 1.14 |
| torus | spiral | lozengeStipple | a | 749 / 749 / 851.2 | 113 / 113 / 129 | 1.14 |
| torus | spiral | lozengeStipple | b | 783.2 / 783.2 / 893.3 | 113 / 113 / 136 | 1.14 |
| torus | spiral | deepFillTSP | a | 616.6 / 616.6 / 693.5 | 104 / 104 / 115 | 1.12 |
| torus | spiral | deepFillTSP | b | 504.8 / 504.8 / 574.3 | 90 / 90 / 107 | 1.14 |
| torus | spiral | interlockWeave | a | 552.1 / 552.1 / 508.4 | 101 / 101 / 97 | 0.92 |
| torus | spiral | interlockWeave | b | 489.1 / 489.1 / 461 | 97 / 97 / 81 | 0.94 |
| torus | spiral | trochoidLoop | a | 552.1 / 552.1 / 508.4 | 101 / 101 / 97 | 0.92 |
| torus | spiral | trochoidLoop | b | 489.1 / 489.1 / 461 | 97 / 97 / 81 | 0.94 |
| torus | spiral | onePenDown | a | 552.1 / 552.1 / 508.4 | 101 / 101 / 97 | 0.92 |
| torus | spiral | onePenDown | b | 489.1 / 489.1 / 461 | 97 / 97 / 81 | 0.94 |
| cone | hatch | nibAngle | a | 1959.4 / 2011.7 / 2183.5 | 134 / 140 / 161 | 1.11 |
| cone | hatch | nibAngle | b | 2284.6 / 2284.6 / 2514.4 | 151 / 151 / 196 | 1.1 |
| cone | hatch | taperedEnds | a | 2157.7 / 2196.5 / 2535.3 | 146 / 147 / 167 | 1.18 |
| cone | hatch | taperedEnds | b | 2303.3 / 2303.3 / 2649.2 | 158 / 158 / 189 | 1.15 |
| cone | hatch | isophoteWidth | b | 2356.7 / 2356.7 / 2706.8 | 158 / 158 / 187 | 1.15 |
| cone | hatch | bundleCount | a | 1717 / 1829.1 / 1937.9 | 138 / 147 / 155 | 1.13 |
| cone | hatch | bundleCount | b | 1917.8 / 1917.8 / 2102.1 | 169 / 169 / 179 | 1.1 |
| cone | hatch | bundleSubNib | a | 2746.1 / 2929.4 / 3122.6 | 181 / 191 / 206 | 1.14 |
| cone | hatch | bundleSubNib | b | 3051.2 / 3051.2 / 3373.9 | 219 / 219 / 234 | 1.11 |
| cone | hatch | bundleEased | a | 1596.7 / 1705.9 / 1803.1 | 138 / 147 / 153 | 1.13 |
| cone | hatch | bundleEased | b | 1919.8 / 1919.8 / 2102.7 | 169 / 169 / 179 | 1.1 |
| cone | hatch | bundleDither | a | 1718.4 / 1823.8 / 1938.7 | 138 / 146 / 155 | 1.13 |
| cone | hatch | bundleDither | b | 1923.9 / 1923.9 / 2104.6 | 170 / 170 / 179 | 1.09 |
| cone | hatch | bundleLozenge | a | 1515.1 / 1580.7 / 1676 | 136 / 144 / 151 | 1.11 |
| cone | hatch | bundleLozenge | b | 1621.7 / 1621.7 / 1760.9 | 160 / 160 / 162 | 1.09 |
| cone | hatch | bundleHandoff | a | 1531.3 / 1651.1 / 1748.5 | 138 / 147 / 155 | 1.14 |
| cone | hatch | bundleHandoff | b | 1917.8 / 1917.8 / 2102.1 | 169 / 169 / 179 | 1.1 |
| cone | hatch | contFieldSigmoid | a | 1238.5 / 1239 / 1330.2 | 116 / 116 / 121 | 1.07 |
| cone | hatch | contFieldTouch | a | 3248.9 / 3248.9 / 3247.3 | 184 / 184 / 184 | 1 |
| cone | hatch | contFieldFore | a | 1546.3 / 1546.3 / 1564.8 | 128 / 128 / 129 | 1.01 |
| cone | hatch | contFieldSurface | a | 1708.6 / 1708.6 / 1727.8 | 137 / 137 / 139 | 1.01 |
| cone | hatch | contFieldQuant | a | 1528.9 / 1528.9 / 1567.2 | 125 / 125 / 127 | 1.03 |
| cone | hatch | mkTick | a | 2135.7 / 2094.8 / 2132.3 | 428 / 433 / 1393 | 1 |
| cone | hatch | ampSpacing | a | 3550.4 / 3637.8 / 3533.3 | 218 / 217 / 180 | 1 |
| cone | hatch | weaveDepth | a | 3523.4 / 3407.8 / 3541.6 | 177 / 185 / 216 | 1.01 |
| cone | hatch | interlockWeave | a | 3369 / 3265.8 / 3461.6 | 147 / 146 / 172 | 1.03 |
| cone | hatch | interlockWeave | b | 4349.8 / 4349.8 / 3838.2 | 218 / 218 / 239 | 0.88 |
| cone | hatch | trochoidLoop | a | 3782.2 / 3641.7 / 3748.9 | 256 / 256 / 401 | 0.99 |
| cone | hatch | amplitudeOnly | a | 1651.6 / 1574.3 / 1768.2 | 135 / 130 / 148 | 1.07 |
| cone | hatch | amplitudeOnly | b | 2393 / 2393 / 2503 | 285 / 285 / 289 | 1.05 |
| cone | hatch | onePenDown | a | 3281.9 / 3206.4 / 3468.6 | 94 / 95 / 152 | 1.06 |
| cone | hatch | onePenDown | b | 4381.1 / 4381.1 / 3837.4 | 120 / 120 / 136 | 0.88 |
| cone | crosshatch | nibAngle | a | 3981.9 / 4027.9 / 4714.1 | 209 / 216 / 252 | 1.18 |
| cone | crosshatch | nibAngle | b | 4460.8 / 4460.8 / 5245.8 | 216 / 216 / 284 | 1.18 |
| cone | crosshatch | taperedEnds | a | 4167.2 / 4207.7 / 4899.8 | 218 / 222 / 261 | 1.18 |
| cone | crosshatch | taperedEnds | b | 4436 / 4436 / 5105.5 | 225 / 225 / 291 | 1.15 |
| cone | crosshatch | isophoteWidth | b | 4497.9 / 4497.9 / 5192.9 | 229 / 229 / 285 | 1.15 |
| cone | crosshatch | whiteBand | b | 4571.6 / 4571.6 / 5443.1 | 221 / 221 / 280 | 1.19 |
| cone | crosshatch | bundleCount | a | 3244.8 / 3495.7 / 3738 | 204 / 218 / 236 | 1.15 |
| cone | crosshatch | bundleCount | b | 3694.7 / 3694.7 / 4084.6 | 258 / 258 / 281 | 1.11 |
| cone | crosshatch | bundleSubNib | a | 5275.1 / 5699.2 / 6107.8 | 290 / 310 / 337 | 1.16 |
| cone | crosshatch | bundleSubNib | b | 6010.5 / 6010.5 / 6675.7 | 365 / 365 / 400 | 1.11 |
| cone | crosshatch | bundleEased | a | 3019.9 / 3265.2 / 3487 | 203 / 216 / 232 | 1.15 |
| cone | crosshatch | bundleEased | b | 3696.9 / 3696.9 / 4085.5 | 258 / 258 / 281 | 1.11 |
| cone | crosshatch | bundleDither | a | 3244.8 / 3489.3 / 3742.5 | 204 / 218 / 236 | 1.15 |
| cone | crosshatch | bundleDither | b | 3697.4 / 3697.4 / 4088 | 259 / 259 / 281 | 1.11 |
| cone | crosshatch | bundleLozenge | a | 2884.1 / 3075.8 / 3287.5 | 200 / 213 / 230 | 1.14 |
| cone | crosshatch | bundleLozenge | b | 3078.4 / 3078.4 / 3387.9 | 239 / 239 / 246 | 1.1 |
| cone | crosshatch | bundleHandoff | a | 2885.9 / 3149.4 / 3376.3 | 200 / 215 / 232 | 1.17 |
| cone | crosshatch | bundleHandoff | b | 3694.7 / 3694.7 / 4084.6 | 258 / 258 / 281 | 1.11 |
| cone | crosshatch | contFieldSigmoid | a | 2381.5 / 2381.9 / 2514.8 | 152 / 152 / 160 | 1.06 |
| cone | crosshatch | contFieldTouch | a | 6365.5 / 6365.5 / 6363.9 | 290 / 290 / 290 | 1 |
| cone | crosshatch | contFieldFore | a | 2983.4 / 2983.4 / 3000.7 | 177 / 177 / 178 | 1.01 |
| cone | crosshatch | contFieldSurface | a | 3263.6 / 3263.6 / 3282.8 | 193 / 193 / 195 | 1.01 |
| cone | crosshatch | contFieldQuant | a | 2926.3 / 2926.3 / 2985.6 | 172 / 172 / 175 | 1.02 |
| cone | crosshatch | mkTick | a | 3976.6 / 3887.2 / 4048.3 | 742 / 746 / 2638 | 1.02 |
| cone | crosshatch | mkDashRamp | a | 3477.2 / 3265.7 / 4037.3 | 554 / 558 / 2437 | 1.16 |
| cone | crosshatch | mkDotScreen | a | 3401.4 / 3403.4 / 4036.4 | 146 / 157 / 994 | 1.19 |
| cone | crosshatch | ampSpacing | a | 6593.1 / 6817.1 / 6579.1 | 352 / 365 / 340 | 1 |
| cone | crosshatch | weaveDepth | a | 6453.3 / 6490.7 / 6509.1 | 283 / 296 / 353 | 1.01 |
| cone | crosshatch | interlockWeave | a | 6785.7 / 6506.7 / 6736.1 | 226 / 216 / 264 | 0.99 |
| cone | crosshatch | interlockWeave | b | 8778.3 / 8778.3 / 7541.6 | 363 / 363 / 394 | 0.86 |
| cone | crosshatch | trochoidLoop | a | 7725.2 / 7477.3 / 7320 | 429 / 429 / 687 | 0.95 |
| cone | crosshatch | amplitudeOnly | a | 3071 / 2993.7 / 3358.6 | 208 / 199 / 230 | 1.09 |
| cone | crosshatch | amplitudeOnly | b | 4429.4 / 4429.4 / 4759.4 | 457 / 457 / 491 | 1.07 |
| cone | crosshatch | onePenDown | a | 6599.2 / 6479.3 / 7700.8 | 127 / 114 / 213 | 1.17 |
| cone | crosshatch | onePenDown | b | 8672.4 / 8672.4 / 7581.3 | 172 / 172 / 223 | 0.87 |
| cone | contour | nibAngle | a | 2816 / 2816 / 3344.4 | 154 / 154 / 213 | 1.19 |
| cone | contour | taperedEnds | a | 2583.4 / 2583.4 / 2625.6 | 176 / 176 / 223 | 1.02 |
| cone | contour | taperedEnds | b | 2960.9 / 3014.6 / 3458.2 | 165 / 163 / 236 | 1.17 |
| cone | contour | isophoteWidth | b | 3311 / 3540.2 / 3726.1 | 146 / 146 / 212 | 1.13 |
| cone | contour | whiteBand | a | 2689.8 / 2689.8 / 3000 | 188 / 188 / 199 | 1.12 |
| cone | contour | whiteBand | b | 3515.8 / 3707.8 / 3820 | 126 / 126 / 186 | 1.09 |
| cone | contour | bundleCount | a | 2215 / 2215 / 2404.4 | 224 / 224 / 237 | 1.09 |
| cone | contour | bundleCount | b | 2283.5 / 2308 / 2404.2 | 215 / 219 / 222 | 1.05 |
| cone | contour | bundleSubNib | a | 3649.7 / 3649.7 / 4026.9 | 332 / 332 / 356 | 1.1 |
| cone | contour | bundleSubNib | b | 3760.8 / 3764.2 / 3967.3 | 299 / 309 / 313 | 1.05 |
| cone | contour | bundleEased | a | 2063.9 / 2063.9 / 2259.7 | 199 / 199 / 213 | 1.09 |
| cone | contour | bundleEased | b | 2285 / 2308.1 / 2404.4 | 215 / 219 / 222 | 1.05 |
| cone | contour | bundleDither | a | 2211 / 2211 / 2374.6 | 224 / 224 / 242 | 1.07 |
| cone | contour | bundleDither | b | 2294.2 / 2307.9 / 2403.6 | 215 / 220 / 222 | 1.05 |
| cone | contour | bundleLozenge | a | 1917 / 1917 / 2107.6 | 198 / 198 / 212 | 1.1 |
| cone | contour | bundleLozenge | b | 1877.9 / 1889.5 / 1988 | 179 / 181 / 189 | 1.06 |
| cone | contour | bundleHandoff | a | 2044.7 / 2044.7 / 2227.3 | 192 / 192 / 206 | 1.09 |
| cone | contour | bundleHandoff | b | 2283.5 / 2308 / 2404.2 | 215 / 219 / 222 | 1.05 |
| cone | contour | contFieldSigmoid | a | 1127.5 / 1127.5 / 1139.7 | 120 / 120 / 120 | 1.01 |
| cone | contour | contFieldTouch | a | 2889.2 / 2889.2 / 2924.3 | 203 / 203 / 204 | 1.01 |
| cone | contour | contFieldFore | a | 1332.7 / 1332.7 / 1348.6 | 129 / 129 / 130 | 1.01 |
| cone | contour | contFieldSurface | a | 1341.2 / 1341.2 / 1356.1 | 130 / 130 / 130 | 1.01 |
| cone | contour | contFieldQuant | a | 1379.2 / 1379.2 / 1395.8 | 131 / 131 / 132 | 1.01 |
| cone | contour | penCross | a | 794.1 / 794.1 / 831.2 | 106 / 106 / 107 | 1.05 |
| cone | contour | penCross | b | 905.2 / 923 / 1060.4 | 130 / 132 / 142 | 1.17 |
| cone | contour | mkScribble | b | 2321.9 / 2297.6 / 2627.7 | 87 / 88 / 119 | 1.13 |
| cone | contour | mkTick | a | 2055.5 / 2055.5 / 2233.7 | 492 / 492 / 2027 | 1.09 |
| cone | contour | mkTick | b | 2505.7 / 2484.8 / 2316 | 671 / 676 / 1798 | 0.92 |
| cone | contour | mkDashRamp | a | 2058.8 / 2058.8 / 2242.4 | 445 / 445 / 1836 | 1.09 |
| cone | contour | mkDotScreen | a | 2155.5 / 2155.5 / 2246.7 | 123 / 123 / 896 | 1.04 |
| cone | contour | mkDotScreen | b | 2402.9 / 2383.3 / 2509.7 | 132 / 133 / 910 | 1.04 |
| cone | contour | ampSpacing | a | 3602.7 / 3602.7 / 3673.4 | 283 / 283 / 228 | 1.02 |
| cone | contour | ampSpacing | b | 4296.4 / 4381 / 4390.8 | 296 / 328 / 191 | 1.02 |
| cone | contour | weaveDepth | a | 3543.8 / 3543.8 / 3530.8 | 264 / 264 / 332 | 1 |
| cone | contour | weaveDepth | b | 4141.7 / 3907.5 / 4253.6 | 247 / 232 / 187 | 1.03 |
| cone | contour | interlockWeave | a | 3243.8 / 3243.8 / 3255.2 | 163 / 163 / 228 | 1 |
| cone | contour | interlockWeave | b | 4191.6 / 4192.9 / 4006.2 | 158 / 157 / 205 | 0.96 |
| cone | contour | trochoidLoop | a | 3677.2 / 3677.2 / 3347.1 | 295 / 295 / 436 | 0.91 |
| cone | contour | amplitudeOnly | a | 1416.8 / 1416.8 / 1672.7 | 145 / 145 / 170 | 1.18 |
| cone | contour | amplitudeOnly | b | 1604.6 / 1605.1 / 1800.7 | 176 / 176 / 171 | 1.12 |
| cone | contour | onePenDown | a | 3060.8 / 3060.8 / 3267.1 | 98 / 98 / 161 | 1.07 |
| cone | contour | onePenDown | b | 4431.2 / 4256.2 / 4337.8 | 184 / 185 / 283 | 0.98 |
| cone | spiral | nibAngle | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | taperedEnds | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | weightModulated | a | 532.3 / 531.3 / 474.5 | 97 / 98 / 103 | 0.89 |
| cone | spiral | isophoteWidth | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | whiteBand | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | weightSmoothstep | a | 532.3 / 531.3 / 474.5 | 97 / 98 / 103 | 0.89 |
| cone | spiral | phaseFineLadder | a | 808.3 / 855.5 / 925.2 | 110 / 112 / 123 | 1.14 |
| cone | spiral | perceptualRamp | a | 807.8 / 854.6 / 925.2 | 111 / 112 / 123 | 1.15 |
| cone | spiral | lozengeStipple | a | 807.8 / 854.6 / 925.2 | 111 / 112 / 123 | 1.15 |
| cone | spiral | deepFillTSP | a | 566.3 / 622.4 / 661.7 | 110 / 104 / 111 | 1.17 |
| cone | spiral | penFacing | a | 1005.3 / 1038.5 / 903.4 | 117 / 119 / 116 | 0.9 |
| cone | spiral | penFacing | b | 1266.8 / 1266.8 / 1255.2 | 113 / 113 / 128 | 0.99 |
| cone | spiral | interlockWeave | a | 564.2 / 563.2 / 474.5 | 96 / 98 / 103 | 0.84 |
| cone | spiral | interlockWeave | b | 656.9 / 656.9 / 734.9 | 100 / 100 / 104 | 1.12 |
| cone | spiral | trochoidLoop | a | 564.2 / 563.2 / 474.5 | 96 / 98 / 103 | 0.84 |
| cone | spiral | trochoidLoop | b | 656.9 / 656.9 / 734.9 | 100 / 100 / 104 | 1.12 |
| cone | spiral | onePenDown | a | 564.2 / 563.2 / 474.5 | 96 / 98 / 103 | 0.84 |
| cone | spiral | onePenDown | b | 656.9 / 656.9 / 734.9 | 100 / 100 / 104 | 1.12 |

### Non-monotone density response (192 rows)

| primitive | mapper | style | angle | ink low/med/max | paths low/med/max | ratio |
| --- | --- | --- | --- | --- | --- | --- |
| sphere | hatch | bundleCount | b | 2756.4 / 2756.4 / 2672.4 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | bundleSubNib | b | 4444.5 / 4444.5 / 4333.8 | 215 / 215 / 220 | 0.98 |
| sphere | hatch | bundleEased | b | 2760.3 / 2760.3 / 2675.6 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | bundleDither | b | 2754.4 / 2754.4 / 2678.1 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | bundleLozenge | b | 2467.9 / 2467.9 / 2405.4 | 155 / 155 / 152 | 0.97 |
| sphere | hatch | bundleHandoff | b | 2756.4 / 2756.4 / 2672.4 | 158 / 158 / 159 | 0.97 |
| sphere | hatch | mkTick | a | 3131.3 / 3131.3 / 3043.7 | 666 / 666 / 2076 | 0.97 |
| sphere | hatch | mkTick | b | 3424.5 / 3424.5 / 3303.8 | 683 / 683 / 2185 | 0.96 |
| sphere | hatch | mkDotScreen | b | 3650.9 / 3650.9 / 3395 | 129 / 129 / 783 | 0.93 |
| sphere | hatch | ampSpacing | a | 4644.3 / 4644.3 / 4644.9 | 250 / 250 / 182 | 1 |
| sphere | hatch | ampSpacing | b | 4697.2 / 4697.2 / 3387.2 | 224 / 224 / 122 | 0.72 |
| sphere | hatch | weaveDepth | b | 4571.9 / 4571.9 / 3250.2 | 174 / 174 / 119 | 0.71 |
| sphere | hatch | trochoidLoop | a | 5270.6 / 5270.6 / 4887.1 | 366 / 366 / 544 | 0.93 |
| sphere | hatch | amplitudeOnly | b | 2075.8 / 2075.8 / 2270.4 | 152 / 152 / 146 | 1.09 |
| sphere | crosshatch | bundleCount | b | 5365 / 5365 / 5218.1 | 250 / 250 / 250 | 0.97 |
| sphere | crosshatch | bundleSubNib | b | 8714 / 8714 / 8522.1 | 365 / 365 / 368 | 0.98 |
| sphere | crosshatch | bundleEased | b | 5368.8 / 5368.8 / 5222.6 | 250 / 250 / 249 | 0.97 |
| sphere | crosshatch | bundleDither | b | 5359.7 / 5359.7 / 5232.9 | 250 / 250 / 251 | 0.98 |
| sphere | crosshatch | bundleLozenge | b | 4794.7 / 4794.7 / 4670.3 | 243 / 243 / 236 | 0.97 |
| sphere | crosshatch | bundleHandoff | b | 5365 / 5365 / 5218.1 | 250 / 250 / 250 | 0.97 |
| sphere | crosshatch | mkScribble | a | 6080.1 / 6080.1 / 5801.1 | 106 / 106 / 188 | 0.95 |
| sphere | crosshatch | mkTick | a | 6051.9 / 6051.9 / 5637 | 1221 / 1221 / 3923 | 0.93 |
| sphere | crosshatch | mkTick | b | 6881.7 / 6881.7 / 6723.4 | 1314 / 1314 / 4401 | 0.98 |
| sphere | crosshatch | mkDotScreen | a | 5954.2 / 5954.2 / 5688.7 | 213 / 213 / 1507 | 0.96 |
| sphere | crosshatch | ampSpacing | a | 8495.6 / 8495.6 / 7856 | 403 / 403 / 326 | 0.92 |
| sphere | crosshatch | ampSpacing | b | 9713.3 / 9713.3 / 8092.6 | 393 / 393 / 208 | 0.83 |
| sphere | crosshatch | weaveDepth | a | 7907.7 / 7907.7 / 7687.6 | 295 / 295 / 321 | 0.97 |
| sphere | crosshatch | weaveDepth | b | 9328.2 / 9328.2 / 7904.4 | 284 / 284 / 204 | 0.85 |
| sphere | crosshatch | trochoidLoop | a | 10537.7 / 10537.7 / 9849.9 | 630 / 630 / 973 | 0.93 |
| sphere | crosshatch | amplitudeOnly | b | 3980 / 3980 / 4407.3 | 242 / 242 / 232 | 1.11 |
| sphere | contour | isophoteWidth | a | 3299.6 / 3180.7 / 3924.4 | 162 / 166 / 200 | 1.19 |
| sphere | contour | penInterleave | a | 843.2 / 854.9 / 1153.4 | 137 / 128 / 190 | 1.37 |
| sphere | contour | penFacing | a | 810.5 / 829.3 / 1551.3 | 169 / 159 / 259 | 1.91 |
| sphere | contour | ampSpacing | a | 4669.4 / 4869.3 / 4902.1 | 334 / 363 / 257 | 1.05 |
| sphere | contour | ampSpacing | b | 5524.9 / 5524.9 / 5663 | 273 / 273 / 159 | 1.02 |
| sphere | contour | weaveDepth | b | 5334.2 / 5334.2 / 5412.2 | 205 / 205 / 155 | 1.01 |
| sphere | contour | interlockWeave | b | 5657 / 5657 / 5357.2 | 157 / 157 / 185 | 0.95 |
| sphere | contour | trochoidLoop | a | 5284.3 / 5194.3 / 4398.5 | 415 / 401 / 459 | 0.83 |
| sphere | contour | trochoidLoop | b | 6839.8 / 6839.8 / 5025.6 | 507 / 507 / 510 | 0.73 |
| sphere | spiral | nibAngle | a | 1405.7 / 1405.7 / 764.3 | 109 / 109 / 101 | 0.54 |
| sphere | spiral | nibAngle | b | 1305.1 / 1305.1 / 760 | 109 / 109 / 90 | 0.58 |
| sphere | spiral | taperedEnds | a | 1405.7 / 1405.7 / 764.3 | 109 / 109 / 101 | 0.54 |
| sphere | spiral | taperedEnds | b | 1305.1 / 1305.1 / 760 | 109 / 109 / 90 | 0.58 |
| sphere | spiral | weightModulated | a | 938.1 / 938.1 / 764.3 | 111 / 111 / 101 | 0.81 |
| sphere | spiral | weightModulated | b | 902.7 / 902.7 / 760 | 95 / 95 / 90 | 0.84 |
| sphere | spiral | isophoteWidth | a | 1405.7 / 1405.7 / 764.3 | 109 / 109 / 101 | 0.54 |
| sphere | spiral | isophoteWidth | b | 1305.1 / 1305.1 / 760 | 109 / 109 / 90 | 0.58 |
| sphere | spiral | whiteBand | a | 1405.7 / 1405.7 / 764.3 | 109 / 109 / 101 | 0.54 |
| sphere | spiral | whiteBand | b | 1305.1 / 1305.1 / 760 | 109 / 109 / 90 | 0.58 |
| sphere | spiral | weightSmoothstep | a | 938.1 / 938.1 / 764.3 | 111 / 111 / 101 | 0.81 |
| sphere | spiral | weightSmoothstep | b | 902.7 / 902.7 / 760 | 95 / 95 / 90 | 0.84 |
| sphere | spiral | phaseFineLadder | a | 1641.3 / 1641.3 / 1601.5 | 121 / 121 / 125 | 0.98 |
| sphere | spiral | perceptualRamp | a | 1640.3 / 1640.3 / 1599.9 | 121 / 121 / 126 | 0.98 |
| sphere | spiral | lozengeStipple | a | 1640.3 / 1640.3 / 1599.9 | 121 / 121 / 126 | 0.98 |
| sphere | spiral | penInterleave | a | 2133.9 / 2133.9 / 1092.2 | 126 / 126 / 109 | 0.51 |
| sphere | spiral | penInterleave | b | 1981 / 1981 / 1093 | 127 / 127 / 101 | 0.55 |
| sphere | spiral | penStipple | a | 2154 / 2154 / 1171.2 | 126 / 126 / 120 | 0.54 |
| sphere | spiral | penStipple | b | 1981 / 1981 / 1111.1 | 127 / 127 / 102 | 0.56 |
| sphere | spiral | penReserve | a | 2133.9 / 2133.9 / 1137.2 | 126 / 126 / 117 | 0.53 |
| sphere | spiral | penReserve | b | 1981 / 1981 / 1111.1 | 127 / 127 / 102 | 0.56 |
| sphere | spiral | penCross | a | 1933.8 / 1933.8 / 837.8 | 126 / 126 / 97 | 0.43 |
| sphere | spiral | penCross | b | 1981 / 1981 / 925.9 | 127 / 127 / 95 | 0.47 |
| sphere | spiral | penPitchMatch | a | 2133.9 / 2133.9 / 1241.2 | 126 / 126 / 116 | 0.58 |
| sphere | spiral | penPitchMatch | b | 1981 / 1981 / 1176.1 | 127 / 127 / 105 | 0.59 |
| sphere | spiral | penFacing | a | 2046.9 / 2046.9 / 1438.6 | 127 / 127 / 113 | 0.7 |
| sphere | spiral | penFacing | b | 1981 / 1981 / 1478.3 | 127 / 127 / 111 | 0.75 |
| sphere | spiral | interlockWeave | a | 1028.7 / 1028.7 / 764.3 | 100 / 100 / 101 | 0.74 |
| sphere | spiral | interlockWeave | b | 955.5 / 955.5 / 760 | 97 / 97 / 90 | 0.8 |
| sphere | spiral | trochoidLoop | a | 1028.7 / 1028.7 / 764.3 | 100 / 100 / 101 | 0.74 |
| sphere | spiral | trochoidLoop | b | 955.5 / 955.5 / 760 | 97 / 97 / 90 | 0.8 |
| sphere | spiral | amplitudeOnly | a | 1838.4 / 1838.4 / 971.5 | 124 / 124 / 99 | 0.53 |
| sphere | spiral | amplitudeOnly | b | 1699.3 / 1699.3 / 949 | 119 / 119 / 96 | 0.56 |
| sphere | spiral | onePenDown | a | 1028.7 / 1028.7 / 764.3 | 100 / 100 / 101 | 0.74 |
| sphere | spiral | onePenDown | b | 955.5 / 955.5 / 760 | 97 / 97 / 90 | 0.8 |
| torus | hatch | mkTick | a | 3054.1 / 3054.1 / 2502.3 | 707 / 707 / 1938 | 0.82 |
| torus | hatch | mkTick | b | 2925 / 2925 / 2830.5 | 695 / 695 / 2268 | 0.97 |
| torus | hatch | mkDashRamp | a | 2758.1 / 2758.1 / 2486 | 524 / 524 / 1771 | 0.9 |
| torus | hatch | mkDotScreen | a | 2894.2 / 2894.2 / 2546.2 | 137 / 137 / 923 | 0.88 |
| torus | hatch | ampSpacing | a | 3925.9 / 3925.9 / 4267.6 | 339 / 339 / 218 | 1.09 |
| torus | hatch | ampSpacing | b | 4029.2 / 4029.2 / 4476.7 | 321 / 321 / 137 | 1.11 |
| torus | hatch | weaveDepth | b | 4116.1 / 4116.1 / 4323.5 | 179 / 179 / 133 | 1.05 |
| torus | hatch | interlockWeave | a | 3956.2 / 3956.2 / 4181.8 | 198 / 198 / 192 | 1.06 |
| torus | hatch | interlockWeave | b | 4330.4 / 4330.4 / 4373.8 | 280 / 280 / 181 | 1.01 |
| torus | hatch | trochoidLoop | a | 4422.7 / 4422.7 / 4000.8 | 333 / 333 / 606 | 0.9 |
| torus | hatch | trochoidLoop | b | 5364.5 / 5364.5 / 4002.9 | 539 / 539 / 755 | 0.75 |
| torus | hatch | onePenDown | a | 4136.2 / 4136.2 / 4033.1 | 106 / 106 / 124 | 0.98 |
| torus | crosshatch | mkTick | a | 6011.8 / 6011.8 / 4996.1 | 1363 / 1363 / 3915 | 0.83 |
| torus | crosshatch | mkDashRamp | a | 5137.9 / 5137.9 / 4922.5 | 950 / 950 / 3528 | 0.96 |
| torus | crosshatch | mkDotScreen | a | 5478.2 / 5478.2 / 5022.6 | 219 / 219 / 1766 | 0.92 |
| torus | crosshatch | ampSpacing | a | 7768.5 / 7768.5 / 8509 | 634 / 634 / 372 | 1.1 |
| torus | crosshatch | ampSpacing | b | 8335.9 / 8335.9 / 9170.5 | 602 / 602 / 244 | 1.1 |
| torus | crosshatch | weaveDepth | a | 7792.8 / 7792.8 / 8243.3 | 419 / 419 / 395 | 1.06 |
| torus | crosshatch | weaveDepth | b | 8356 / 8356 / 8789.6 | 307 / 307 / 234 | 1.05 |
| torus | crosshatch | interlockWeave | a | 7705.4 / 7705.4 / 7972.3 | 339 / 339 / 327 | 1.03 |
| torus | crosshatch | interlockWeave | b | 8378.3 / 8378.3 / 8596.3 | 482 / 482 / 317 | 1.03 |
| torus | crosshatch | trochoidLoop | a | 8710.8 / 8710.8 / 7825.8 | 588 / 588 / 1129 | 0.9 |
| torus | crosshatch | trochoidLoop | b | 10282.4 / 10282.4 / 7734 | 949 / 949 / 1490 | 0.75 |
| torus | contour | mkDotScreen | a | 2753.7 / 2753.7 / 2695.8 | 110 / 110 / 705 | 0.98 |
| torus | contour | interlockWeave | b | 4384.8 / 4384.8 / 4227.2 | 238 / 238 / 310 | 0.96 |
| torus | contour | trochoidLoop | a | 4596.3 / 4596.3 / 4315.8 | 319 / 319 / 548 | 0.94 |
| torus | contour | trochoidLoop | b | 6491.8 / 6491.8 / 4801.1 | 488 / 488 / 588 | 0.74 |
| torus | spiral | nibAngle | a | 699.8 / 699.8 / 508.4 | 110 / 110 / 97 | 0.73 |
| torus | spiral | nibAngle | b | 637.1 / 637.1 / 461 | 98 / 98 / 81 | 0.72 |
| torus | spiral | taperedEnds | a | 699.8 / 699.8 / 508.4 | 110 / 110 / 97 | 0.73 |
| torus | spiral | taperedEnds | b | 637.1 / 637.1 / 461 | 98 / 98 / 81 | 0.72 |
| torus | spiral | weightModulated | a | 524.5 / 524.5 / 508.4 | 100 / 100 / 97 | 0.97 |
| torus | spiral | weightModulated | b | 470.6 / 470.6 / 461 | 93 / 93 / 81 | 0.98 |
| torus | spiral | isophoteWidth | a | 699.8 / 699.8 / 508.4 | 110 / 110 / 97 | 0.73 |
| torus | spiral | isophoteWidth | b | 637.1 / 637.1 / 461 | 98 / 98 / 81 | 0.72 |
| torus | spiral | whiteBand | a | 699.8 / 699.8 / 508.4 | 110 / 110 / 97 | 0.73 |
| torus | spiral | whiteBand | b | 637.1 / 637.1 / 461 | 98 / 98 / 81 | 0.72 |
| torus | spiral | weightSmoothstep | a | 524.5 / 524.5 / 508.4 | 100 / 100 / 97 | 0.97 |
| torus | spiral | weightSmoothstep | b | 470.6 / 470.6 / 461 | 93 / 93 / 81 | 0.98 |
| torus | spiral | penInterleave | a | 1000.2 / 1000.2 / 666.5 | 123 / 123 / 115 | 0.67 |
| torus | spiral | penInterleave | b | 912.6 / 912.6 / 577.1 | 119 / 119 / 110 | 0.63 |
| torus | spiral | penStipple | a | 1010.8 / 1010.8 / 730.9 | 124 / 124 / 110 | 0.72 |
| torus | spiral | penStipple | b | 912.6 / 912.6 / 592.7 | 119 / 119 / 112 | 0.65 |
| torus | spiral | penReserve | a | 1000.2 / 1000.2 / 697 | 123 / 123 / 114 | 0.7 |
| torus | spiral | penReserve | b | 912.6 / 912.6 / 592.7 | 119 / 119 / 112 | 0.65 |
| torus | spiral | penCross | a | 847.7 / 847.7 / 507.2 | 117 / 117 / 99 | 0.6 |
| torus | spiral | penCross | b | 912.6 / 912.6 / 513.4 | 119 / 119 / 101 | 0.56 |
| torus | spiral | penPitchMatch | a | 1000.2 / 1000.2 / 747.8 | 123 / 123 / 115 | 0.75 |
| torus | spiral | penPitchMatch | b | 912.6 / 912.6 / 642.7 | 119 / 119 / 112 | 0.7 |
| torus | spiral | penFacing | a | 919.7 / 919.7 / 751 | 120 / 120 / 116 | 0.82 |
| torus | spiral | penFacing | b | 912.6 / 912.6 / 732.3 | 119 / 119 / 114 | 0.8 |
| torus | spiral | interlockWeave | a | 552.1 / 552.1 / 508.4 | 101 / 101 / 97 | 0.92 |
| torus | spiral | interlockWeave | b | 489.1 / 489.1 / 461 | 97 / 97 / 81 | 0.94 |
| torus | spiral | trochoidLoop | a | 552.1 / 552.1 / 508.4 | 101 / 101 / 97 | 0.92 |
| torus | spiral | trochoidLoop | b | 489.1 / 489.1 / 461 | 97 / 97 / 81 | 0.94 |
| torus | spiral | amplitudeOnly | a | 884.7 / 884.7 / 602.6 | 119 / 119 / 108 | 0.68 |
| torus | spiral | amplitudeOnly | b | 797.5 / 797.5 / 547.9 | 115 / 115 / 96 | 0.69 |
| torus | spiral | onePenDown | a | 552.1 / 552.1 / 508.4 | 101 / 101 / 97 | 0.92 |
| torus | spiral | onePenDown | b | 489.1 / 489.1 / 461 | 97 / 97 / 81 | 0.94 |
| cone | hatch | whiteBand | a | 2031.6 / 2215.5 / 2569.9 | 144 / 141 / 168 | 1.26 |
| cone | hatch | ampSpacing | a | 3550.4 / 3637.8 / 3533.3 | 218 / 217 / 180 | 1 |
| cone | hatch | ampSpacing | b | 3754.6 / 3754.6 / 4724.6 | 308 / 308 / 295 | 1.26 |
| cone | hatch | weaveDepth | a | 3523.4 / 3407.8 / 3541.6 | 177 / 185 / 216 | 1.01 |
| cone | hatch | interlockWeave | a | 3369 / 3265.8 / 3461.6 | 147 / 146 / 172 | 1.03 |
| cone | hatch | interlockWeave | b | 4349.8 / 4349.8 / 3838.2 | 218 / 218 / 239 | 0.88 |
| cone | hatch | trochoidLoop | a | 3782.2 / 3641.7 / 3748.9 | 256 / 256 / 401 | 0.99 |
| cone | hatch | trochoidLoop | b | 6149.9 / 6149.9 / 4442.3 | 400 / 400 / 586 | 0.72 |
| cone | hatch | amplitudeOnly | a | 1651.6 / 1574.3 / 1768.2 | 135 / 130 / 148 | 1.07 |
| cone | hatch | onePenDown | a | 3281.9 / 3206.4 / 3468.6 | 94 / 95 / 152 | 1.06 |
| cone | hatch | onePenDown | b | 4381.1 / 4381.1 / 3837.4 | 120 / 120 / 136 | 0.88 |
| cone | crosshatch | mkTick | a | 3976.6 / 3887.2 / 4048.3 | 742 / 746 / 2638 | 1.02 |
| cone | crosshatch | mkDashRamp | a | 3477.2 / 3265.7 / 4037.3 | 554 / 558 / 2437 | 1.16 |
| cone | crosshatch | ampSpacing | a | 6593.1 / 6817.1 / 6579.1 | 352 / 365 / 340 | 1 |
| cone | crosshatch | ampSpacing | b | 7295.8 / 7295.8 / 9005.7 | 538 / 538 / 468 | 1.23 |
| cone | crosshatch | interlockWeave | a | 6785.7 / 6506.7 / 6736.1 | 226 / 216 / 264 | 0.99 |
| cone | crosshatch | interlockWeave | b | 8778.3 / 8778.3 / 7541.6 | 363 / 363 / 394 | 0.86 |
| cone | crosshatch | trochoidLoop | a | 7725.2 / 7477.3 / 7320 | 429 / 429 / 687 | 0.95 |
| cone | crosshatch | trochoidLoop | b | 12264.3 / 12264.3 / 8814.1 | 739 / 739 / 1095 | 0.72 |
| cone | crosshatch | amplitudeOnly | a | 3071 / 2993.7 / 3358.6 | 208 / 199 / 230 | 1.09 |
| cone | crosshatch | onePenDown | a | 6599.2 / 6479.3 / 7700.8 | 127 / 114 / 213 | 1.17 |
| cone | crosshatch | onePenDown | b | 8672.4 / 8672.4 / 7581.3 | 172 / 172 / 223 | 0.87 |
| cone | contour | phaseFineLadder | b | 649.8 / 625.7 / 1392.2 | 100 / 101 / 133 | 2.14 |
| cone | contour | mkTick | b | 2505.7 / 2484.8 / 2316 | 671 / 676 / 1798 | 0.92 |
| cone | contour | ampSpacing | a | 3602.7 / 3602.7 / 3673.4 | 283 / 283 / 228 | 1.02 |
| cone | contour | ampSpacing | b | 4296.4 / 4381 / 4390.8 | 296 / 328 / 191 | 1.02 |
| cone | contour | weaveDepth | b | 4141.7 / 3907.5 / 4253.6 | 247 / 232 / 187 | 1.03 |
| cone | contour | interlockWeave | b | 4191.6 / 4192.9 / 4006.2 | 158 / 157 / 205 | 0.96 |
| cone | contour | trochoidLoop | a | 3677.2 / 3677.2 / 3347.1 | 295 / 295 / 436 | 0.91 |
| cone | contour | trochoidLoop | b | 5388 / 5170.6 / 4083.5 | 515 / 522 / 581 | 0.76 |
| cone | contour | amplitudeOnly | b | 1604.6 / 1605.1 / 1800.7 | 176 / 176 / 171 | 1.12 |
| cone | contour | onePenDown | b | 4431.2 / 4256.2 / 4337.8 | 184 / 185 / 283 | 0.98 |
| cone | spiral | nibAngle | a | 700.7 / 705.9 / 474.5 | 110 / 110 / 103 | 0.68 |
| cone | spiral | nibAngle | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | taperedEnds | a | 700.7 / 705.9 / 474.5 | 110 / 110 / 103 | 0.68 |
| cone | spiral | taperedEnds | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | weightModulated | a | 532.3 / 531.3 / 474.5 | 97 / 98 / 103 | 0.89 |
| cone | spiral | isophoteWidth | a | 700.7 / 705.9 / 474.5 | 110 / 110 / 103 | 0.68 |
| cone | spiral | isophoteWidth | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | whiteBand | a | 700.7 / 705.9 / 474.5 | 110 / 110 / 103 | 0.68 |
| cone | spiral | whiteBand | b | 839.7 / 839.7 / 734.9 | 106 / 106 / 104 | 0.88 |
| cone | spiral | weightSmoothstep | a | 532.3 / 531.3 / 474.5 | 97 / 98 / 103 | 0.89 |
| cone | spiral | deepFillTSP | a | 566.3 / 622.4 / 661.7 | 110 / 104 / 111 | 1.17 |
| cone | spiral | penInterleave | a | 1053.3 / 1094.6 / 661.7 | 117 / 119 / 112 | 0.63 |
| cone | spiral | penInterleave | b | 1266.8 / 1266.8 / 1014.6 | 113 / 113 / 115 | 0.8 |
| cone | spiral | penStipple | a | 1053.3 / 1094.6 / 688.5 | 117 / 119 / 118 | 0.65 |
| cone | spiral | penStipple | b | 1266.8 / 1266.8 / 1048.1 | 113 / 113 / 116 | 0.83 |
| cone | spiral | penReserve | a | 1053.3 / 1094.6 / 680 | 117 / 119 / 115 | 0.65 |
| cone | spiral | penReserve | b | 1266.8 / 1266.8 / 1048.1 | 113 / 113 / 116 | 0.83 |
| cone | spiral | penCross | a | 948.1 / 984 / 516.4 | 116 / 117 / 96 | 0.54 |
| cone | spiral | penCross | b | 1266.8 / 1266.8 / 884.2 | 113 / 113 / 109 | 0.7 |
| cone | spiral | penPitchMatch | a | 1053.3 / 1094.6 / 711.6 | 117 / 119 / 122 | 0.68 |
| cone | spiral | penPitchMatch | b | 1266.8 / 1266.8 / 1048.1 | 113 / 113 / 116 | 0.83 |
| cone | spiral | penFacing | a | 1005.3 / 1038.5 / 903.4 | 117 / 119 / 116 | 0.9 |
| cone | spiral | interlockWeave | a | 564.2 / 563.2 / 474.5 | 96 / 98 / 103 | 0.84 |
| cone | spiral | trochoidLoop | a | 564.2 / 563.2 / 474.5 | 96 / 98 / 103 | 0.84 |
| cone | spiral | amplitudeOnly | a | 902 / 937 / 578.6 | 115 / 117 / 112 | 0.64 |
| cone | spiral | amplitudeOnly | b | 1095.3 / 1095.3 / 894.8 | 110 / 110 / 110 | 0.82 |
| cone | spiral | onePenDown | a | 564.2 / 563.2 / 474.5 | 96 / 98 / 103 | 0.84 |

### Angle-unstable ink (80 rows)

| primitive | mapper | style | density | ink a | ink b | divergence |
| --- | --- | --- | --- | --- | --- | --- |
| plane | hatch | ladder | low | 633.5 | 349.6 | 0.58 |
| plane | hatch | ladder | med | 763.1 | 349.6 | 0.74 |
| plane | hatch | ladder | max | 11227.5 | 349.6 | 1.88 |
| plane | crosshatch | ladder | low | 861.5 | 349.6 | 0.85 |
| plane | crosshatch | ladder | med | 1186.5 | 349.6 | 1.09 |
| plane | crosshatch | ladder | max | 17270.2 | 349.6 | 1.92 |
| plane | contour | ladder | low | 1295.8 | 349.6 | 1.15 |
| plane | contour | ladder | med | 1932.3 | 349.6 | 1.39 |
| plane | contour | ladder | max | 21607.1 | 349.6 | 1.94 |
| plane | spiral | ladder | low | 1094.4 | 349.6 | 1.03 |
| plane | spiral | ladder | med | 1774.4 | 349.6 | 1.34 |
| plane | spiral | ladder | max | 20805.4 | 349.6 | 1.93 |
| plane | stipple | ladder | low | 1142.8 | 349.6 | 1.06 |
| plane | stipple | ladder | med | 1873.1 | 349.6 | 1.37 |
| plane | stipple | ladder | max | 18855.7 | 349.6 | 1.93 |
| plane | contourSlice | ladder | low | 3105.5 | 349.6 | 1.6 |
| plane | contourSlice | ladder | med | 3105.5 | 349.6 | 1.6 |
| plane | contourSlice | ladder | max | 3105.5 | 349.6 | 1.6 |
| cone | spiral | ladder | max | 1337.3 | 2586.6 | 0.64 |
| pyramid | spiral | ladder | max | 1835.5 | 2975.2 | 0.47 |
| sphere | crosshatch | weightModulated | low | 1898.4 | 3092.1 | 0.48 |
| sphere | crosshatch | weightModulated | med | 1898.4 | 3092.1 | 0.48 |
| sphere | contour | weightModulated | low | 1057.1 | 1810.4 | 0.53 |
| cone | hatch | contFieldSigmoid | low | 1238.5 | 2038.7 | 0.49 |
| cone | hatch | contFieldSigmoid | med | 1239 | 2038.7 | 0.49 |
| cone | hatch | contFieldSurface | low | 1708.6 | 2937.9 | 0.53 |
| cone | hatch | contFieldSurface | med | 1708.6 | 2937.9 | 0.53 |
| cone | hatch | contFieldSurface | max | 1727.8 | 2937.9 | 0.52 |
| cone | hatch | trochoidLoop | low | 3782.2 | 6149.9 | 0.48 |
| cone | hatch | trochoidLoop | med | 3641.7 | 6149.9 | 0.51 |
| cone | hatch | defectSplit | low | 2111 | 4596.9 | 0.74 |
| cone | hatch | defectSplit | med | 2111 | 4596.9 | 0.74 |
| cone | hatch | defectSplit | max | 2111 | 4596.9 | 0.74 |
| cone | hatch | originSpiral | low | 2847.9 | 5698.9 | 0.67 |
| cone | hatch | originSpiral | med | 2847.9 | 5698.9 | 0.67 |
| cone | hatch | originSpiral | max | 2847.9 | 5698.9 | 0.67 |
| cone | crosshatch | contFieldSigmoid | low | 2381.5 | 3839 | 0.47 |
| cone | crosshatch | contFieldSigmoid | med | 2381.9 | 3839 | 0.47 |
| cone | crosshatch | contFieldSurface | low | 3263.6 | 5648.7 | 0.54 |
| cone | crosshatch | contFieldSurface | med | 3263.6 | 5648.7 | 0.54 |
| cone | crosshatch | contFieldSurface | max | 3282.8 | 5648.7 | 0.53 |
| cone | crosshatch | trochoidLoop | low | 7725.2 | 12264.3 | 0.45 |
| cone | crosshatch | trochoidLoop | med | 7477.3 | 12264.3 | 0.48 |
| cone | crosshatch | defectSplit | low | 4091.9 | 9024.5 | 0.75 |
| cone | crosshatch | defectSplit | med | 4091.9 | 9024.5 | 0.75 |
| cone | crosshatch | defectSplit | max | 4091.9 | 9024.5 | 0.75 |
| cone | crosshatch | originSpiral | low | 5565.7 | 11228.5 | 0.67 |
| cone | crosshatch | originSpiral | med | 5565.7 | 11228.5 | 0.67 |
| cone | crosshatch | originSpiral | max | 5565.7 | 11228.5 | 0.67 |
| cone | contour | none | med | 459.4 | 748.5 | 0.48 |
| cone | contour | none | max | 710.3 | 1169.1 | 0.49 |
| cone | contour | contFieldSurface | low | 1341.2 | 2499.5 | 0.6 |
| cone | contour | contFieldSurface | med | 1341.2 | 2499.5 | 0.6 |
| cone | contour | contFieldSurface | max | 1356.1 | 2499.5 | 0.59 |
| cone | contour | defectSplit | low | 2111 | 4596.9 | 0.74 |
| cone | contour | defectSplit | med | 2111 | 4596.9 | 0.74 |
| cone | contour | defectSplit | max | 2111 | 4596.9 | 0.74 |
| cone | contour | originSpiral | low | 2847.9 | 5698.9 | 0.67 |
| cone | contour | originSpiral | med | 2847.9 | 5698.9 | 0.67 |
| cone | contour | originSpiral | max | 2847.9 | 5698.9 | 0.67 |
| cone | spiral | fineLadder | max | 958.6 | 1648.6 | 0.53 |
| cone | spiral | phaseFineLadder | max | 925.2 | 1643.6 | 0.56 |
| cone | spiral | perceptualRamp | max | 925.2 | 1643.2 | 0.56 |
| cone | spiral | lozengeStipple | max | 925.2 | 1643.2 | 0.56 |
| cone | spiral | bundleCount | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | bundleSubNib | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | bundleEased | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | bundleDither | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | bundleLozenge | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | bundleHandoff | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | contFieldSigmoid | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | contFieldTouch | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | contFieldFore | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | contFieldSurface | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | contFieldQuant | max | 1900.7 | 3016.3 | 0.45 |
| cone | spiral | penCross | max | 516.4 | 884.2 | 0.53 |
| cone | spiral | ampSpacing | max | 1408.1 | 2581.6 | 0.59 |
| cone | spiral | weaveDepth | max | 1395.7 | 2428.1 | 0.54 |
| cone | stipple | none | med | 1474.1 | 2399.5 | 0.48 |
| cone | stipple | none | max | 4246.1 | 6922.9 | 0.48 |

### Zero ink / zero paths (0 rows)

| primitive | mapper | style | angle | ink low/med/max | paths low/med/max | ratio |
| --- | --- | --- | --- | --- | --- | --- |


### bareCentrelinesOnly (432 shots)

| primitive|mapper | styles | count |
| --- | --- | --- |
| sphere|spiral | ampSpacing, amplitudeOnly, interlockWeave, isophoteWidth, nibAngle, onePenDown, taperedEnds, trochoidLoop, weaveDepth, weightModulated, weightSmoothstep, whiteBand | 12 |
| sphere|stipple | ampSpacing, amplitudeOnly, interlockWeave, isophoteWidth, nibAngle, onePenDown, taperedEnds, trochoidLoop, weaveDepth, weightModulated, weightSmoothstep, whiteBand | 12 |
| torus|spiral | ampSpacing, amplitudeOnly, interlockWeave, isophoteWidth, nibAngle, onePenDown, taperedEnds, trochoidLoop, weaveDepth, weightModulated, weightSmoothstep, whiteBand | 12 |
| torus|stipple | ampSpacing, amplitudeOnly, interlockWeave, isophoteWidth, nibAngle, onePenDown, taperedEnds, trochoidLoop, weaveDepth, weightModulated, weightSmoothstep, whiteBand | 12 |
| cone|spiral | ampSpacing, amplitudeOnly, interlockWeave, isophoteWidth, nibAngle, onePenDown, taperedEnds, trochoidLoop, weaveDepth, weightModulated, weightSmoothstep, whiteBand | 12 |
| cone|stipple | ampSpacing, amplitudeOnly, interlockWeave, isophoteWidth, nibAngle, onePenDown, taperedEnds, trochoidLoop, weaveDepth, weightModulated, weightSmoothstep, whiteBand | 12 |

### Per-mapper density span (angle a, Tier B + A)

| tier|mapper | rows | median ink ratio | median path ratio | median ink @max | median paths @max | median genMs @max | worst genMs @max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A|none | 12 | 1.00 | 1.00 | 160 | 63 | 2 | 10 |
| A|hatch | 12 | 3.71 | 1.84 | 2977 | 165 | 8 | 24 |
| A|wireframe | 12 | 1.00 | 1.00 | 2278 | 772 | 7 | 26 |
| A|crosshatch | 12 | 3.84 | 2.20 | 4887 | 249 | 16 | 37 |
| A|contour | 12 | 3.71 | 1.96 | 2626 | 143 | 11 | 76 |
| A|spiral | 12 | 1.67 | 1.30 | 2402 | 150 | 7 | 19 |
| A|stipple | 12 | 17.07 | 16.23 | 21836 | 8264 | 57 | 308 |
| A|contourSlice | 12 | 1.00 | 1.00 | 1360 | 91 | 5 | 15 |
| B|none | 144 | 1.00 | 1.00 | 130 | 68 | 2 | 4 |
| B|hatch | 154 | 1.07 | 1.12 | 2308 | 172 | 34 | 2532 |
| B|wireframe | 144 | 1.00 | 1.00 | 2278 | 778 | 7 | 9 |
| B|crosshatch | 154 | 1.07 | 1.15 | 4548 | 283 | 62 | 5315 |
| B|contour | 144 | 1.08 | 1.19 | 2227 | 212 | 38 | 5087 |
| B|spiral | 117 | 1.15 | 1.12 | 925 | 122 | 7 | 32 |
| B|stipple | 117 | 10.85 | 9.85 | 14740 | 3599 | 49 | 533 |
| B|contourSlice | 144 | 1.00 | 1.00 | 1123 | 95 | 5 | 8 |

## (b) Perceptual fingerprints

dHash 16x16 on the decoded WebP (Chromium), Hamming threshold 60/256, 8x8 block-mean tolerance 5/255. A pair is a cluster link only when it also matches on med/b AND max/a (or the files are byte-identical).

### Max-density saturation (ink coverage of the frame > 0.62 at max/a) — 89 rows

| primitive | mapper | style | inkFrac@max |
| --- | --- | --- | --- |
| box | contour | ladder | 0.6588 |
| box | spiral | ladder | 0.6522 |
| plane | crosshatch | ladder | 0.6275 |
| plane | contour | ladder | 0.7548 |
| plane | spiral | ladder | 0.7298 |
| plane | stipple | ladder | 0.6392 |
| sphere | stipple | ladder | 0.7263 |
| ellipsoid | stipple | ladder | 0.7271 |
| cylinder | stipple | ladder | 0.88 |
| torus | stipple | ladder | 0.6976 |
| capsule | stipple | ladder | 0.7981 |
| sphere | crosshatch | bundleSubNib | 0.6266 |
| sphere | crosshatch | contFieldTouch | 0.717 |
| sphere | crosshatch | mkDashRamp | 0.6456 |
| sphere | crosshatch | mkDotScreen | 0.6286 |
| sphere | crosshatch | interlockWeave | 0.6349 |
| sphere | crosshatch | trochoidLoop | 0.6244 |
| sphere | crosshatch | mezzoRegion | 0.6422 |
| sphere | contour | contFieldTouch | 0.6247 |
| sphere | stipple | nibAngle | 0.6243 |
| sphere | stipple | taperedEnds | 0.6243 |
| sphere | stipple | weightModulated | 0.6243 |
| sphere | stipple | isophoteWidth | 0.6243 |
| sphere | stipple | whiteBand | 0.6243 |
| sphere | stipple | weightSmoothstep | 0.6243 |
| sphere | stipple | fineLadder | 0.7266 |
| sphere | stipple | phaseFineLadder | 0.7243 |
| sphere | stipple | perceptualRamp | 0.7243 |
| sphere | stipple | lozengeStipple | 0.7243 |
| sphere | stipple | deepFillTSP | 0.6926 |
| sphere | stipple | bundleCount | 0.7301 |
| sphere | stipple | bundleSubNib | 0.7301 |
| sphere | stipple | bundleEased | 0.7301 |
| sphere | stipple | bundleDither | 0.7301 |
| sphere | stipple | bundleLozenge | 0.7301 |
| sphere | stipple | bundleHandoff | 0.7301 |
| sphere | stipple | contFieldSigmoid | 0.7301 |
| sphere | stipple | contFieldTouch | 0.7301 |
| sphere | stipple | contFieldFore | 0.7301 |
| sphere | stipple | contFieldSurface | 0.7301 |
| sphere | stipple | contFieldQuant | 0.7301 |
| sphere | stipple | penInterleave | 0.6848 |
| sphere | stipple | penStipple | 0.6901 |
| sphere | stipple | penReserve | 0.6894 |
| sphere | stipple | penCross | 0.6409 |
| sphere | stipple | penPitchMatch | 0.7049 |
| sphere | stipple | penFacing | 0.72 |
| sphere | stipple | mkScribble | 0.6966 |
| sphere | stipple | mkTick | 0.6966 |
| sphere | stipple | mkDashRamp | 0.6966 |
| sphere | stipple | mkDotScreen | 0.6966 |
| sphere | stipple | ampSpacing | 0.7288 |
| sphere | stipple | weaveDepth | 0.7292 |
| sphere | stipple | interlockWeave | 0.6243 |
| sphere | stipple | trochoidLoop | 0.6243 |
| sphere | stipple | amplitudeOnly | 0.6675 |
| sphere | stipple | onePenDown | 0.6243 |
| torus | crosshatch | bundleSubNib | 0.6217 |
| torus | crosshatch | contFieldTouch | 0.6811 |
| torus | stipple | fineLadder | 0.6996 |
| torus | stipple | phaseFineLadder | 0.6981 |
| torus | stipple | perceptualRamp | 0.6982 |
| torus | stipple | lozengeStipple | 0.6982 |
| torus | stipple | deepFillTSP | 0.6747 |
| torus | stipple | bundleCount | 0.7111 |
| torus | stipple | bundleSubNib | 0.7111 |
| torus | stipple | bundleEased | 0.7111 |
| torus | stipple | bundleDither | 0.7111 |
| torus | stipple | bundleLozenge | 0.7111 |
| torus | stipple | bundleHandoff | 0.7111 |
| torus | stipple | contFieldSigmoid | 0.7111 |
| torus | stipple | contFieldTouch | 0.7111 |
| torus | stipple | contFieldFore | 0.7111 |
| torus | stipple | contFieldSurface | 0.7111 |
| torus | stipple | contFieldQuant | 0.7111 |
| torus | stipple | penInterleave | 0.6711 |
| torus | stipple | penStipple | 0.6763 |
| torus | stipple | penReserve | 0.6733 |
| torus | stipple | penPitchMatch | 0.683 |
| torus | stipple | penFacing | 0.6881 |
| torus | stipple | mkScribble | 0.6697 |
| torus | stipple | mkTick | 0.6697 |
| torus | stipple | mkDashRamp | 0.6697 |
| torus | stipple | mkDotScreen | 0.6697 |
| torus | stipple | ampSpacing | 0.7066 |
| torus | stipple | weaveDepth | 0.7094 |
| torus | stipple | amplitudeOnly | 0.6551 |
| box | crosshatch | none | 0.6823 |
| box | crosshatch | mezzoRegion | 0.7127 |

### Flat tone grid at med/a (3x3 cell coverage span < 0.08) — 54 rows

| primitive | mapper | style | inkFrac | span |
| --- | --- | --- | --- | --- |
| box | hatch | ladder | 0.0602 | 0.051 |
| box | crosshatch | ladder | 0.0843 | 0.074 |
| box | contour | ladder | 0.0617 | 0.044 |
| box | spiral | ladder | 0.0695 | 0.055 |
| box | stipple | ladder | 0.0635 | 0.052 |
| plane | crosshatch | ladder | 0.0509 | 0.025 |
| plane | contour | ladder | 0.0741 | 0.034 |
| plane | spiral | ladder | 0.0876 | 0.05 |
| plane | stipple | ladder | 0.084 | 0.045 |
| cylinder | contour | ladder | 0.1482 | 0.033 |
| cone | contour | ladder | 0.0861 | 0.063 |
| torus | contour | ladder | 0.1038 | 0.078 |
| torus | spiral | ladder | 0.1152 | 0.07 |
| superellipsoid | contour | ladder | 0.0846 | 0.061 |
| pyramid | contour | ladder | 0.0697 | 0.06 |
| solid | hatch | ladder | 0.0863 | 0.049 |
| solid | contour | ladder | 0.0615 | 0.043 |
| solid | spiral | ladder | 0.0719 | 0.051 |
| solid | stipple | ladder | 0.057 | 0.034 |
| sphere | contour | perceptualRamp | 0.1178 | 0.069 |
| sphere | contour | lozengeStipple | 0.1264 | 0.077 |
| sphere | contour | deepFillTSP | 0.0928 | 0.067 |
| torus | hatch | fineLadder | 0.1253 | 0.078 |
| torus | hatch | mkTick | 0.1088 | 0.068 |
| torus | contour | weightModulated | 0.114 | 0.077 |
| torus | contour | weightSmoothstep | 0.1137 | 0.077 |
| torus | contour | phaseFineLadder | 0.111 | 0.071 |
| torus | contour | perceptualRamp | 0.1093 | 0.068 |
| torus | contour | lozengeStipple | 0.1155 | 0.068 |
| torus | contour | deepFillTSP | 0.102 | 0.067 |
| torus | contour | mkTick | 0.1204 | 0.077 |
| torus | spiral | weightModulated | 0.0918 | 0.068 |
| torus | spiral | weightSmoothstep | 0.0918 | 0.068 |
| torus | spiral | mkScribble | 0.0808 | 0.054 |
| torus | spiral | mkTick | 0.0808 | 0.054 |
| torus | spiral | mkDashRamp | 0.0808 | 0.054 |
| torus | spiral | mkDotScreen | 0.0808 | 0.054 |
| torus | spiral | interlockWeave | 0.0966 | 0.069 |
| torus | spiral | trochoidLoop | 0.0966 | 0.069 |
| torus | spiral | onePenDown | 0.0966 | 0.069 |
| cone | hatch | mkTick | 0.064 | 0.074 |
| cone | contour | fineLadder | 0.0914 | 0.075 |
| cone | contour | phaseFineLadder | 0.0897 | 0.077 |
| cone | contour | perceptualRamp | 0.0853 | 0.064 |
| cone | contour | lozengeStipple | 0.0939 | 0.079 |
| cone | contour | deepFillTSP | 0.0729 | 0.054 |
| cone | contour | mkTick | 0.0778 | 0.047 |
| cone | spiral | mkScribble | 0.0721 | 0.06 |
| cone | spiral | mkTick | 0.0721 | 0.06 |
| cone | spiral | mkDashRamp | 0.0721 | 0.06 |
| cone | spiral | mkDotScreen | 0.0721 | 0.06 |
| cone | spiral | interlockWeave | 0.0903 | 0.079 |
| cone | spiral | trochoidLoop | 0.0903 | 0.079 |
| cone | spiral | onePenDown | 0.0903 | 0.079 |

### Byte-identical style groups (all 6 shots identical) — 45 groups

| primitive | mapper | distinct/total | n | members |
| --- | --- | --- | --- | --- |
| cone | contourSlice | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| sphere | contourSlice | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| torus | contourSlice | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| cone | none | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| sphere | none | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| torus | none | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| cone | spiral | 19/39 | 11 | bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch |
| cone | spiral | 19/39 | 4 | isophoteWidth, nibAngle, taperedEnds, whiteBand |
| cone | spiral | 19/39 | 4 | mkDashRamp, mkDotScreen, mkScribble, mkTick |
| cone | spiral | 19/39 | 3 | interlockWeave, onePenDown, trochoidLoop |
| cone | spiral | 19/39 | 2 | weightModulated, weightSmoothstep |
| cone | spiral | 19/39 | 2 | lozengeStipple, perceptualRamp |
| sphere | spiral | 19/39 | 11 | bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch |
| sphere | spiral | 19/39 | 4 | isophoteWidth, nibAngle, taperedEnds, whiteBand |
| sphere | spiral | 19/39 | 4 | mkDashRamp, mkDotScreen, mkScribble, mkTick |
| sphere | spiral | 19/39 | 3 | interlockWeave, onePenDown, trochoidLoop |
| sphere | spiral | 19/39 | 2 | weightModulated, weightSmoothstep |
| sphere | spiral | 19/39 | 2 | lozengeStipple, perceptualRamp |
| torus | spiral | 18/39 | 11 | bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch |
| torus | spiral | 18/39 | 4 | isophoteWidth, nibAngle, taperedEnds, whiteBand |
| torus | spiral | 18/39 | 4 | mkDashRamp, mkDotScreen, mkScribble, mkTick |
| torus | spiral | 18/39 | 3 | lozengeStipple, perceptualRamp, phaseFineLadder |
| torus | spiral | 18/39 | 3 | interlockWeave, onePenDown, trochoidLoop |
| torus | spiral | 18/39 | 2 | weightModulated, weightSmoothstep |
| cone | stipple | 19/39 | 11 | bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch |
| cone | stipple | 19/39 | 4 | isophoteWidth, nibAngle, taperedEnds, whiteBand |
| cone | stipple | 19/39 | 4 | mkDashRamp, mkDotScreen, mkScribble, mkTick |
| cone | stipple | 19/39 | 3 | interlockWeave, onePenDown, trochoidLoop |
| cone | stipple | 19/39 | 2 | weightModulated, weightSmoothstep |
| cone | stipple | 19/39 | 2 | lozengeStipple, perceptualRamp |
| sphere | stipple | 19/39 | 11 | bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch |
| sphere | stipple | 19/39 | 4 | isophoteWidth, nibAngle, taperedEnds, whiteBand |
| sphere | stipple | 19/39 | 4 | mkDashRamp, mkDotScreen, mkScribble, mkTick |
| sphere | stipple | 19/39 | 3 | interlockWeave, onePenDown, trochoidLoop |
| sphere | stipple | 19/39 | 2 | weightModulated, weightSmoothstep |
| sphere | stipple | 19/39 | 2 | lozengeStipple, perceptualRamp |
| torus | stipple | 19/39 | 11 | bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch |
| torus | stipple | 19/39 | 4 | isophoteWidth, nibAngle, taperedEnds, whiteBand |
| torus | stipple | 19/39 | 4 | mkDashRamp, mkDotScreen, mkScribble, mkTick |
| torus | stipple | 19/39 | 3 | interlockWeave, onePenDown, trochoidLoop |
| torus | stipple | 19/39 | 2 | weightModulated, weightSmoothstep |
| torus | stipple | 19/39 | 2 | lozengeStipple, perceptualRamp |
| cone | wireframe | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| sphere | wireframe | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |
| torus | wireframe | 1/48 | 48 | ampSpacing, amplitudeOnly, bundleCount, bundleDither, bundleEased, bundleHandoff, bundleLozenge, bundleSubNib, contFieldFore, contFieldQuant, contFieldSigmoid, contFieldSurface, contFieldTouch, deepFillTSP, defectSplit, dutyConst, endShorten, etfKang, fineLadder, interlockWeave, isophoteWidth, lozengeStipple, mazeFill, mezzoRegion, mkDashRamp, mkDotScreen, mkScribble, mkTick, nibAngle, none, onePenDown, originSpiral, penCross, penFacing, penInterleave, penPitchMatch, penReserve, penStipple, perceptualRamp, phaseFineLadder, taperedEnds, trochoidLoop, turingStripe, voronoiWeb, weaveDepth, weightModulated, weightSmoothstep, whiteBand |

### Candidate duplicate clusters (67)

#### mapper: contour

- **cone** : weightModulated, weightSmoothstep
- **cone** : bundleCount, bundleDither
- **torus** : bundleCount, bundleDither

#### mapper: contourSlice

- **cone** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill
- **sphere** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill
- **torus** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill

#### mapper: crosshatch

- **cone** : nibAngle, taperedEnds, whiteBand
- **cone** : weightModulated, weightSmoothstep
- **cone** : bundleCount, bundleDither
- **cone** : bundleEased, bundleHandoff
- **sphere** : weightModulated, weightSmoothstep
- **sphere** : bundleCount, bundleDither
- **torus** : bundleCount, bundleDither

#### mapper: hatch

- **cone** : taperedEnds, whiteBand
- **cone** : weightModulated, weightSmoothstep
- **cone** : bundleCount, bundleDither
- **cone** : bundleEased, bundleHandoff
- **sphere** : weightModulated, weightSmoothstep
- **sphere** : bundleCount, bundleDither
- **sphere** : bundleEased, bundleHandoff
- **torus** : bundleCount, bundleDither

#### mapper: none

- **cone** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill
- **sphere** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill
- **torus** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill

#### mapper: spiral

- **cone** (byte-identical at med/a): nibAngle, taperedEnds, isophoteWidth, whiteBand
- **cone** (byte-identical at med/a): weightModulated, weightSmoothstep
- **cone** : phaseFineLadder, perceptualRamp, lozengeStipple
- **cone** (byte-identical at med/a): bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penPitchMatch
- **cone** (byte-identical at med/a): mkScribble, mkTick, mkDashRamp, mkDotScreen
- **cone** (byte-identical at med/a): interlockWeave, trochoidLoop, onePenDown
- **sphere** (byte-identical at med/a): nibAngle, taperedEnds, isophoteWidth, whiteBand
- **sphere** (byte-identical at med/a): weightModulated, weightSmoothstep
- **sphere** : phaseFineLadder, perceptualRamp, lozengeStipple
- **sphere** (byte-identical at med/a): bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penStipple
- **sphere** (byte-identical at med/a): penInterleave, penReserve, penPitchMatch
- **sphere** (byte-identical at med/a): mkScribble, mkTick, mkDashRamp, mkDotScreen
- **sphere** (byte-identical at med/a): interlockWeave, trochoidLoop, onePenDown
- **torus** (byte-identical at med/a): nibAngle, taperedEnds, isophoteWidth, whiteBand
- **torus** (byte-identical at med/a): weightModulated, weightSmoothstep
- **torus** (byte-identical at med/a): phaseFineLadder, perceptualRamp, lozengeStipple
- **torus** (byte-identical at med/a): bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penStipple
- **torus** (byte-identical at med/a): penInterleave, penReserve, penPitchMatch
- **torus** (byte-identical at med/a): mkScribble, mkTick, mkDashRamp, mkDotScreen
- **torus** (byte-identical at med/a): interlockWeave, trochoidLoop, onePenDown

#### mapper: stipple

- **cone** (byte-identical at med/a): nibAngle, taperedEnds, isophoteWidth, whiteBand
- **cone** (byte-identical at med/a): weightModulated, weightSmoothstep
- **cone** : phaseFineLadder, perceptualRamp, lozengeStipple
- **cone** : bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penPitchMatch, weaveDepth
- **cone** (byte-identical at med/a): mkScribble, mkTick, mkDashRamp, mkDotScreen
- **cone** (byte-identical at med/a): interlockWeave, trochoidLoop, onePenDown
- **sphere** (byte-identical at med/a): nibAngle, taperedEnds, isophoteWidth, whiteBand
- **sphere** (byte-identical at med/a): weightModulated, weightSmoothstep
- **sphere** : phaseFineLadder, perceptualRamp, lozengeStipple
- **sphere** : bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penStipple, ampSpacing, weaveDepth
- **sphere** (byte-identical at med/a): penInterleave, penReserve, penPitchMatch
- **sphere** (byte-identical at med/a): mkScribble, mkTick, mkDashRamp, mkDotScreen
- **sphere** (byte-identical at med/a): interlockWeave, trochoidLoop, onePenDown
- **torus** (byte-identical at med/a): nibAngle, taperedEnds, isophoteWidth, whiteBand
- **torus** (byte-identical at med/a): weightModulated, weightSmoothstep
- **torus** : phaseFineLadder, perceptualRamp, lozengeStipple
- **torus** (byte-identical at med/a): bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penStipple
- **torus** (byte-identical at med/a): penInterleave, penReserve, penPitchMatch
- **torus** (byte-identical at med/a): mkScribble, mkTick, mkDashRamp, mkDotScreen
- **torus** (byte-identical at med/a): interlockWeave, trochoidLoop, onePenDown

#### mapper: wireframe

- **cone** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill
- **sphere** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill
- **torus** (byte-identical at med/a): none, nibAngle, taperedEnds, weightModulated, isophoteWidth, whiteBand, weightSmoothstep, fineLadder, phaseFineLadder, perceptualRamp, lozengeStipple, deepFillTSP, bundleCount, bundleSubNib, bundleEased, bundleDither, bundleLozenge, bundleHandoff, contFieldSigmoid, contFieldTouch, contFieldFore, contFieldSurface, contFieldQuant, penInterleave, penStipple, penReserve, penCross, penPitchMatch, penFacing, mkScribble, mkTick, mkDashRamp, mkDotScreen, ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown, etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb, mazeFill

### Near-duplicate (not byte-identical) pairs confirmed on med/b and max/a — 63 of 11176 candidate pairs

| primitive | mapper | a | b | hamming | blockΔ | byte-identical | confirmed med/b | confirmed max/a |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cone | stipple | penStipple | penReserve | 0 | 0 | med/a | y | y |
| sphere | stipple | phaseFineLadder | perceptualRamp | 6 | 0.5 |  | y | y |
| sphere | stipple | phaseFineLadder | lozengeStipple | 6 | 0.5 |  | y | y |
| cone | stipple | bundleCount | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | bundleSubNib | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | bundleEased | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | bundleDither | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | bundleLozenge | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | bundleHandoff | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | contFieldSigmoid | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | contFieldTouch | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | contFieldFore | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | contFieldSurface | weaveDepth | 7 | 0.4 |  | y | y |
| cone | stipple | contFieldQuant | weaveDepth | 7 | 0.4 |  | y | y |
| cone | spiral | phaseFineLadder | perceptualRamp | 9 | 0.1 |  | y | y |
| cone | spiral | phaseFineLadder | lozengeStipple | 9 | 0.1 |  | y | y |
| cone | hatch | weightModulated | weightSmoothstep | 10 | 0.6 |  | y | y |
| sphere | stipple | bundleCount | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | bundleSubNib | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | bundleEased | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | bundleDither | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | bundleLozenge | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | bundleHandoff | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | contFieldSigmoid | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | contFieldTouch | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | contFieldFore | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | contFieldSurface | weaveDepth | 12 | 1.1 |  | y | y |
| sphere | stipple | contFieldQuant | weaveDepth | 12 | 1.1 |  | y | y |
| cone | stipple | phaseFineLadder | perceptualRamp | 12 | 0.3 |  | y | y |
| cone | stipple | phaseFineLadder | lozengeStipple | 12 | 0.3 |  | y | y |
| cone | contour | weightModulated | weightSmoothstep | 13 | 0.6 |  | y | y |
| sphere | crosshatch | bundleCount | bundleDither | 14 | 1.2 |  | y | y |
| sphere | hatch | weightModulated | weightSmoothstep | 15 | 0.7 |  | y | y |
| cone | crosshatch | taperedEnds | whiteBand | 16 | 1.8 |  | y | y |
| cone | hatch | bundleCount | bundleDither | 17 | 1.4 |  | y | y |
| torus | stipple | phaseFineLadder | perceptualRamp | 18 | 0.4 |  | y | y |
| torus | stipple | phaseFineLadder | lozengeStipple | 18 | 0.4 |  | y | y |
| cone | crosshatch | weightModulated | weightSmoothstep | 19 | 0.7 |  | y | y |
| cone | crosshatch | bundleCount | bundleDither | 20 | 1.3 |  | y | y |
| sphere | hatch | bundleCount | bundleDither | 21 | 1.4 |  | y | y |
| cone | hatch | taperedEnds | whiteBand | 21 | 1.2 |  | y | y |
| sphere | stipple | bundleCount | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | bundleSubNib | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | bundleEased | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | bundleDither | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | bundleLozenge | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | bundleHandoff | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | contFieldSigmoid | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | contFieldTouch | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | contFieldFore | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | contFieldSurface | ampSpacing | 23 | 3 |  | y | y |
| sphere | stipple | contFieldQuant | ampSpacing | 23 | 3 |  | y | y |
| cone | crosshatch | nibAngle | whiteBand | 23 | 3.1 |  | y | y |
| sphere | hatch | bundleEased | bundleHandoff | 28 | 3.9 |  | y | y |
| sphere | spiral | phaseFineLadder | perceptualRamp | 28 | 0.7 |  | y | y |
| sphere | spiral | phaseFineLadder | lozengeStipple | 28 | 0.7 |  | y | y |
| torus | contour | bundleCount | bundleDither | 28 | 1.3 |  | y | y |
| cone | hatch | bundleEased | bundleHandoff | 29 | 2.4 |  | y | y |
| cone | crosshatch | bundleEased | bundleHandoff | 30 | 3.4 |  | y | y |
| torus | hatch | bundleCount | bundleDither | 31 | 1.5 |  | y | y |
| sphere | crosshatch | weightModulated | weightSmoothstep | 34 | 2.6 |  | y | y |
| torus | crosshatch | bundleCount | bundleDither | 34 | 1.6 |  | y | y |
| cone | contour | bundleCount | bundleDither | 42 | 1.3 |  | y | y |

### Roster-level duplicate pairs (near-identical on >= 2 primitives) — 3564

| mapper | pair | primitives | byte-identical (all 6 shots) on |
| --- | --- | --- | --- |
| contourSlice | nibAngle ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | none ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ none | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | nibAngle ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| contourSlice | taperedEnds ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | taperedEnds ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | taperedEnds ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | taperedEnds ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | taperedEnds ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | taperedEnds ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | taperedEnds ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | weightModulated ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | weightModulated ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | weaveDepth ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | trochoidLoop ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | turingStripe ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | voronoiWeb ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | isophoteWidth ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | weightSmoothstep ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | weaveDepth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | trochoidLoop ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | turingStripe ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | voronoiWeb ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | weaveDepth ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | trochoidLoop ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | turingStripe ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | voronoiWeb ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | fineLadder ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | phaseFineLadder ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | perceptualRamp ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | lozengeStipple ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | deepFillTSP ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ bundleCount | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ bundleCount | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleCount ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleSubNib ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleEased ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleDither ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleLozenge ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | bundleHandoff ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSigmoid ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldTouch ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldFore ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldSurface ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | contFieldQuant ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penInterleave ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penStipple ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penReserve ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penCross ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ penCross | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penPitchMatch ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | penFacing ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkScribble ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkTick ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDashRamp ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mkDotScreen ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ amplitudeOnly | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | ampSpacing ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | trochoidLoop ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | turingStripe ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | voronoiWeb ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | interlockWeave ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | trochoidLoop ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | trochoidLoop ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | amplitudeOnly ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | onePenDown ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | etfKang ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | defectSplit ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mezzoRegion ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | originSpiral ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | dutyConst ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | endShorten ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| contourSlice | turingStripe ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| contourSlice | mazeFill ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | none ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | none ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | none ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ none | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ none | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ none | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ none | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ none | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ none | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ none | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ none | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ none | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ none | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ none | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ none | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | none ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | none ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | none ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | none ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | none ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ none | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ none | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ none | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ none | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ none | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ none | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ none | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ none | sphere, torus, cone | sphere, torus, cone |
| none | none ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | none ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ none | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | nibAngle ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| none | taperedEnds ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | taperedEnds ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | taperedEnds ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | taperedEnds ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | taperedEnds ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | taperedEnds ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | taperedEnds ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | weightModulated ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | weightModulated ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | weaveDepth ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | trochoidLoop ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | turingStripe ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | voronoiWeb ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | isophoteWidth ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | weightSmoothstep ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | weaveDepth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | trochoidLoop ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | turingStripe ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | voronoiWeb ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | weaveDepth ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | trochoidLoop ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | turingStripe ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | voronoiWeb ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | fineLadder ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | phaseFineLadder ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | perceptualRamp ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | lozengeStipple ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | deepFillTSP ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ bundleCount | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ bundleCount | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | bundleCount ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | bundleSubNib ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | bundleEased ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | bundleDither ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | bundleLozenge ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | bundleHandoff ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSigmoid ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | contFieldTouch ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | contFieldFore ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | contFieldSurface ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | contFieldQuant ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | penInterleave ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | penStipple ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | penReserve ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | penCross ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ penCross | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | penPitchMatch ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | penFacing ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | mkScribble ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | mkTick ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | mkDashRamp ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | mkDotScreen ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ amplitudeOnly | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | ampSpacing ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | trochoidLoop ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | turingStripe ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | voronoiWeb ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | interlockWeave ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | trochoidLoop ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | trochoidLoop ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | amplitudeOnly ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | onePenDown ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | etfKang ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | defectSplit ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | mezzoRegion ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | originSpiral ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | dutyConst ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | endShorten ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| none | turingStripe ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| none | mazeFill ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| spiral | nibAngle ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| spiral | isophoteWidth ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| spiral | nibAngle ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| spiral | isophoteWidth ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| spiral | taperedEnds ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| spiral | weightModulated ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| spiral | isophoteWidth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| spiral | lozengeStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleCount ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleLozenge ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleHandoff ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleSubNib ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleSubNib ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleSubNib ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleSubNib ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleSubNib ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleEased ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleDither ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleHandoff ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleLozenge ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleLozenge ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleLozenge ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleLozenge ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleLozenge ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleHandoff ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleHandoff ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleHandoff ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleHandoff ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | bundleHandoff ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldSigmoid ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldFore ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldSigmoid ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldQuant ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldFore ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldSurface ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldQuant ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldFore ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldFore ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| spiral | contFieldQuant ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| spiral | mkScribble ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| spiral | mkDashRamp ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| spiral | mkDotScreen ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| spiral | mkDashRamp ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| spiral | mkDotScreen ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| spiral | mkDashRamp ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| spiral | interlockWeave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| spiral | interlockWeave ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| spiral | onePenDown ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| stipple | nibAngle ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| stipple | isophoteWidth ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| stipple | nibAngle ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| stipple | isophoteWidth ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| stipple | taperedEnds ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| stipple | weightModulated ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| stipple | isophoteWidth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| stipple | lozengeStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleCount ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleLozenge ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleHandoff ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleSubNib ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleSubNib ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleSubNib ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleSubNib ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleSubNib ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleEased ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleDither ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleHandoff ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleLozenge ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleLozenge ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleLozenge ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleLozenge ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleLozenge ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleHandoff ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleHandoff ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleHandoff ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleHandoff ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | bundleHandoff ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldSigmoid ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldFore ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldSigmoid ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldQuant ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldFore ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldSurface ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldQuant ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldFore ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldFore ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| stipple | contFieldQuant ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| stipple | mkScribble ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| stipple | mkDashRamp ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| stipple | mkDotScreen ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| stipple | mkDashRamp ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| stipple | mkDotScreen ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| stipple | mkDashRamp ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| stipple | interlockWeave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| stipple | interlockWeave ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| stipple | onePenDown ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | none ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ none | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | nibAngle ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ nibAngle | sphere, torus, cone | sphere, torus, cone |
| wireframe | taperedEnds ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | taperedEnds ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | taperedEnds ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | taperedEnds ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | taperedEnds ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | taperedEnds ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | taperedEnds ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ taperedEnds | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | weightModulated ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | weightModulated ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | weaveDepth ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | trochoidLoop ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | turingStripe ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | voronoiWeb ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ weightModulated | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ isophoteWidth | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | isophoteWidth ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | weightSmoothstep ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | weaveDepth ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | trochoidLoop ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | turingStripe ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | voronoiWeb ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ whiteBand | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | weaveDepth ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | trochoidLoop ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | turingStripe ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | voronoiWeb ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ weightSmoothstep | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ fineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | fineLadder ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | phaseFineLadder ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ phaseFineLadder | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | perceptualRamp ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ perceptualRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ lozengeStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | lozengeStipple ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ deepFillTSP | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | deepFillTSP ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ bundleCount | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ bundleCount | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleCount ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ bundleSubNib | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleSubNib ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ bundleEased | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleEased ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ bundleDither | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleDither ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ bundleLozenge | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleLozenge ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ bundleHandoff | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | bundleHandoff ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ contFieldSigmoid | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSigmoid ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ contFieldTouch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldTouch ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ contFieldFore | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldFore ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ contFieldSurface | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldSurface ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ contFieldQuant | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | contFieldQuant ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | penInterleave ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ penInterleave | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | penStipple ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ penStipple | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | penReserve ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ penReserve | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | penCross ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ penCross | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | penPitchMatch ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ penPitchMatch | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | penFacing ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ penFacing | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkScribble ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ mkScribble | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkTick ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ mkTick | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDashRamp ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ mkDashRamp | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | mkDotScreen ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ mkDotScreen | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ amplitudeOnly | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | ampSpacing ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | trochoidLoop ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | turingStripe ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | voronoiWeb ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ weaveDepth | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ interlockWeave | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | interlockWeave ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | trochoidLoop ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | trochoidLoop ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ trochoidLoop | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ defectSplit | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | amplitudeOnly ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | onePenDown ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ onePenDown | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ etfKang | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | etfKang ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ dutyConst | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | defectSplit ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | mezzoRegion ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ mezzoRegion | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | originSpiral ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ originSpiral | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ endShorten | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | dutyConst ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | endShorten ~ mazeFill | sphere, torus, cone | sphere, torus, cone |
| wireframe | turingStripe ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ turingStripe | sphere, torus, cone | sphere, torus, cone |
| wireframe | mazeFill ~ voronoiWeb | sphere, torus, cone | sphere, torus, cone |
| spiral | perceptualRamp ~ phaseFineLadder | sphere, torus, cone | torus |
| spiral | lozengeStipple ~ phaseFineLadder | sphere, torus, cone | torus |
| contour | weightModulated ~ weightSmoothstep | torus, cone | — |
| contour | bundleCount ~ bundleDither | torus, cone | — |
| crosshatch | weightModulated ~ weightSmoothstep | sphere, torus, cone | — |
| crosshatch | bundleCount ~ bundleDither | sphere, torus, cone | — |
| crosshatch | taperedEnds ~ whiteBand | torus, cone | — |
| hatch | weightModulated ~ weightSmoothstep | sphere, cone | — |
| hatch | bundleCount ~ bundleDither | sphere, torus, cone | — |
| hatch | bundleEased ~ bundleHandoff | sphere, cone | — |
| hatch | taperedEnds ~ whiteBand | torus, cone | — |
| stipple | perceptualRamp ~ phaseFineLadder | sphere, torus, cone | — |
| stipple | lozengeStipple ~ phaseFineLadder | sphere, torus, cone | — |
| stipple | ampSpacing ~ bundleCount | sphere, torus | — |
| stipple | bundleCount ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ bundleSubNib | sphere, torus | — |
| stipple | bundleSubNib ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ bundleEased | sphere, torus | — |
| stipple | bundleEased ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ bundleDither | sphere, torus | — |
| stipple | bundleDither ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ bundleLozenge | sphere, torus | — |
| stipple | bundleLozenge ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ bundleHandoff | sphere, torus | — |
| stipple | bundleHandoff ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ contFieldSigmoid | sphere, torus | — |
| stipple | contFieldSigmoid ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ contFieldTouch | sphere, torus | — |
| stipple | contFieldTouch ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ contFieldFore | sphere, torus | — |
| stipple | contFieldFore ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ contFieldSurface | sphere, torus | — |
| stipple | contFieldSurface ~ weaveDepth | sphere, torus, cone | — |
| stipple | ampSpacing ~ contFieldQuant | sphere, torus | — |
| stipple | contFieldQuant ~ weaveDepth | sphere, torus, cone | — |
| stipple | penReserve ~ penStipple | sphere, torus, cone | — |

### Measured coverage at med/a (Tier B, ink fraction of frame; 3x3 tone grid span)

| primitive | mapper | style | cov low | cov med | cov max | tone span |
| --- | --- | --- | --- | --- | --- | --- |
| box | crosshatch | defectSplit | 0.5248 | 0.5248 | 0.5248 | 0.42 |
| box | crosshatch | dutyConst | 0.5688 | 0.5688 | 0.5688 | 0.3 |
| box | crosshatch | endShorten | 0.4192 | 0.4192 | 0.4192 | 0.38 |
| box | crosshatch | etfKang | 0.5566 | 0.5566 | 0.5566 | 0.47 |
| box | crosshatch | mazeFill | 0.3592 | 0.3592 | 0.3592 | 0.19 |
| box | crosshatch | mezzoRegion | 0.7127 | 0.7127 | 0.7127 | 0.46 |
| box | crosshatch | none | 0.0583 | 0.085 | 0.6823 | 0.03 |
| box | crosshatch | originSpiral | 0.5757 | 0.5757 | 0.5757 | 0.48 |
| box | crosshatch | turingStripe | 0.4559 | 0.4559 | 0.4559 | 0.21 |
| box | crosshatch | voronoiWeb | 0.3298 | 0.3298 | 0.3298 | 0.2 |
| box | hatch | defectSplit | 0.5249 | 0.5249 | 0.5249 | 0.42 |
| box | hatch | dutyConst | 0.3705 | 0.3705 | 0.3705 | 0.19 |
| box | hatch | endShorten | 0.2644 | 0.2644 | 0.2644 | 0.25 |
| box | hatch | etfKang | 0.5566 | 0.5566 | 0.5566 | 0.47 |
| box | hatch | mazeFill | 0.3592 | 0.3592 | 0.3592 | 0.19 |
| box | hatch | mezzoRegion | 0.5599 | 0.5599 | 0.5599 | 0.44 |
| box | hatch | none | 0.0415 | 0.0533 | 0.5673 | 0.02 |
| box | hatch | originSpiral | 0.5757 | 0.5757 | 0.5757 | 0.48 |
| box | hatch | turingStripe | 0.4559 | 0.4559 | 0.4559 | 0.21 |
| box | hatch | voronoiWeb | 0.3298 | 0.3298 | 0.3298 | 0.2 |
| cone | contour | amplitudeOnly | 0.1486 | 0.1486 | 0.1735 | 0.2 |
| cone | contour | ampSpacing | 0.3212 | 0.3212 | 0.3255 | 0.5 |
| cone | contour | bundleCount | 0.3745 | 0.3745 | 0.4024 | 0.61 |
| cone | contour | bundleDither | 0.3741 | 0.3741 | 0.3982 | 0.61 |
| cone | contour | bundleEased | 0.3508 | 0.3508 | 0.3807 | 0.66 |
| cone | contour | bundleHandoff | 0.3476 | 0.3476 | 0.3751 | 0.68 |
| cone | contour | bundleLozenge | 0.3351 | 0.3351 | 0.3649 | 0.63 |
| cone | contour | bundleSubNib | 0.3871 | 0.3871 | 0.419 | 0.6 |
| cone | contour | contFieldFore | 0.2127 | 0.2127 | 0.2094 | 0.21 |
| cone | contour | contFieldQuant | 0.22 | 0.22 | 0.217 | 0.22 |
| cone | contour | contFieldSigmoid | 0.1802 | 0.1802 | 0.1764 | 0.17 |
| cone | contour | contFieldSurface | 0.2142 | 0.2142 | 0.2106 | 0.21 |
| cone | contour | contFieldTouch | 0.4539 | 0.4539 | 0.4512 | 0.54 |
| cone | contour | deepFillTSP | 0.0729 | 0.0729 | 0.1416 | 0.05 |
| cone | contour | defectSplit | 0.3381 | 0.3381 | 0.3381 | 0.58 |
| cone | contour | dutyConst | 0.229 | 0.229 | 0.229 | 0.31 |
| cone | contour | endShorten | 0.149 | 0.149 | 0.149 | 0.35 |
| cone | contour | etfKang | 0.366 | 0.366 | 0.366 | 0.61 |
| cone | contour | fineLadder | 0.0914 | 0.0914 | 0.2207 | 0.07 |
| cone | contour | interlockWeave | 0.3235 | 0.3235 | 0.347 | 0.52 |
| cone | contour | isophoteWidth | 0.2741 | 0.2741 | 0.3081 | 0.56 |
| cone | contour | lozengeStipple | 0.0939 | 0.0939 | 0.2305 | 0.08 |
| cone | contour | mazeFill | 0.2236 | 0.2236 | 0.2236 | 0.28 |
| cone | contour | mezzoRegion | 0.3603 | 0.3603 | 0.3603 | 0.6 |
| cone | contour | mkDashRamp | 0.359 | 0.359 | 0.4116 | 0.7 |
| cone | contour | mkDotScreen | 0.3537 | 0.3537 | 0.3758 | 0.65 |
| cone | contour | mkScribble | 0.2402 | 0.2402 | 0.3327 | 0.51 |
| cone | contour | mkTick | 0.0778 | 0.0778 | 0.1687 | 0.05 |
| cone | contour | nibAngle | 0.3028 | 0.3028 | 0.3214 | 0.54 |
| cone | contour | none | 0.0344 | 0.0745 | 0.1146 | 0.05 |
| cone | contour | onePenDown | 0.3113 | 0.3113 | 0.3438 | 0.6 |
| cone | contour | originSpiral | 0.3966 | 0.3966 | 0.3966 | 0.61 |
| cone | contour | penCross | 0.2197 | 0.2197 | 0.2288 | 0.24 |
| cone | contour | penFacing | 0.1669 | 0.1669 | 0.3036 | 0.08 |
| cone | contour | penInterleave | 0.267 | 0.267 | 0.3184 | 0.39 |
| cone | contour | penPitchMatch | 0.2202 | 0.2202 | 0.2955 | 0.32 |
| cone | contour | penReserve | 0.2485 | 0.2485 | 0.3033 | 0.34 |
| cone | contour | penStipple | 0.2412 | 0.2412 | 0.307 | 0.39 |
| cone | contour | perceptualRamp | 0.0853 | 0.0853 | 0.1892 | 0.06 |
| cone | contour | phaseFineLadder | 0.0897 | 0.0897 | 0.1974 | 0.08 |
| cone | contour | taperedEnds | 0.2836 | 0.2836 | 0.3021 | 0.55 |
| cone | contour | trochoidLoop | 0.3256 | 0.3256 | 0.31 | 0.51 |
| cone | contour | turingStripe | 0.282 | 0.282 | 0.282 | 0.35 |
| cone | contour | voronoiWeb | 0.2139 | 0.2139 | 0.2139 | 0.3 |
| cone | contour | weaveDepth | 0.331 | 0.331 | 0.3271 | 0.56 |
| cone | contour | weightModulated | 0.0981 | 0.0981 | 0.2192 | 0.09 |
| cone | contour | weightSmoothstep | 0.0981 | 0.0981 | 0.219 | 0.09 |
| cone | contour | whiteBand | 0.306 | 0.306 | 0.3261 | 0.55 |
| cone | contourSlice | amplitudeOnly | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | ampSpacing | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | bundleCount | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | bundleDither | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | bundleEased | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | bundleHandoff | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | bundleLozenge | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | bundleSubNib | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | contFieldFore | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | contFieldQuant | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | contFieldSigmoid | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | contFieldSurface | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | contFieldTouch | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | deepFillTSP | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | defectSplit | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | dutyConst | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | endShorten | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | etfKang | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | fineLadder | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | interlockWeave | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | isophoteWidth | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | lozengeStipple | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | mazeFill | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | mezzoRegion | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | mkDashRamp | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | mkDotScreen | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | mkScribble | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | mkTick | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | nibAngle | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | none | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | onePenDown | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | originSpiral | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | penCross | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | penFacing | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | penInterleave | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | penPitchMatch | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | penReserve | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | penStipple | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | perceptualRamp | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | phaseFineLadder | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | taperedEnds | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | trochoidLoop | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | turingStripe | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | voronoiWeb | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | weaveDepth | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | weightModulated | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | weightSmoothstep | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | contourSlice | whiteBand | 0.1356 | 0.1356 | 0.1356 | 0.15 |
| cone | crosshatch | amplitudeOnly | 0.2662 | 0.2683 | 0.2986 | 0.39 |
| cone | crosshatch | ampSpacing | 0.4158 | 0.4276 | 0.4217 | 0.62 |
| cone | crosshatch | bundleCount | 0.3902 | 0.4034 | 0.411 | 0.59 |
| cone | crosshatch | bundleDither | 0.3902 | 0.4039 | 0.4118 | 0.59 |
| cone | crosshatch | bundleEased | 0.3675 | 0.3796 | 0.3853 | 0.65 |
| cone | crosshatch | bundleHandoff | 0.3506 | 0.3642 | 0.3704 | 0.69 |
| cone | crosshatch | bundleLozenge | 0.367 | 0.3774 | 0.3853 | 0.58 |
| cone | crosshatch | bundleSubNib | 0.4005 | 0.4125 | 0.4208 | 0.58 |
| cone | crosshatch | contFieldFore | 0.3365 | 0.3365 | 0.3362 | 0.35 |
| cone | crosshatch | contFieldQuant | 0.3391 | 0.3391 | 0.3407 | 0.34 |
| cone | crosshatch | contFieldSigmoid | 0.293 | 0.2932 | 0.2986 | 0.29 |
| cone | crosshatch | contFieldSurface | 0.3515 | 0.3515 | 0.3515 | 0.37 |
| cone | crosshatch | contFieldTouch | 0.4963 | 0.4963 | 0.4962 | 0.64 |
| cone | crosshatch | deepFillTSP | 0.1055 | 0.1104 | 0.2256 | 0.11 |
| cone | crosshatch | defectSplit | 0.3381 | 0.3381 | 0.3381 | 0.58 |
| cone | crosshatch | dutyConst | 0.3482 | 0.3482 | 0.3482 | 0.49 |
| cone | crosshatch | endShorten | 0.2412 | 0.2412 | 0.2412 | 0.57 |
| cone | crosshatch | etfKang | 0.366 | 0.366 | 0.366 | 0.61 |
| cone | crosshatch | fineLadder | 0.1248 | 0.133 | 0.2775 | 0.15 |
| cone | crosshatch | interlockWeave | 0.4216 | 0.4203 | 0.4449 | 0.71 |
| cone | crosshatch | isophoteWidth | 0.3041 | 0.3135 | 0.367 | 0.54 |
| cone | crosshatch | lozengeStipple | 0.1256 | 0.1334 | 0.3211 | 0.12 |
| cone | crosshatch | mazeFill | 0.2236 | 0.2236 | 0.2236 | 0.28 |
| cone | crosshatch | mezzoRegion | 0.4531 | 0.4531 | 0.4531 | 0.69 |
| cone | crosshatch | mkDashRamp | 0.3772 | 0.3688 | 0.4406 | 0.75 |
| cone | crosshatch | mkDotScreen | 0.375 | 0.3866 | 0.4343 | 0.7 |
| cone | crosshatch | mkScribble | 0.3336 | 0.3356 | 0.4013 | 0.68 |
| cone | crosshatch | mkTick | 0.101 | 0.0991 | 0.1952 | 0.09 |
| cone | crosshatch | nibAngle | 0.3408 | 0.3437 | 0.379 | 0.52 |
| cone | crosshatch | none | 0.0564 | 0.1478 | 0.2239 | 0.17 |
| cone | crosshatch | onePenDown | 0.4098 | 0.403 | 0.4181 | 0.65 |
| cone | crosshatch | originSpiral | 0.3966 | 0.3966 | 0.3966 | 0.61 |
| cone | crosshatch | penCross | 0.2265 | 0.2441 | 0.2956 | 0.22 |
| cone | crosshatch | penFacing | 0.1602 | 0.1651 | 0.3106 | 0.18 |
| cone | crosshatch | penInterleave | 0.2974 | 0.3062 | 0.409 | 0.41 |
| cone | crosshatch | penPitchMatch | 0.2555 | 0.2668 | 0.4059 | 0.35 |
| cone | crosshatch | penReserve | 0.2115 | 0.2233 | 0.3281 | 0.29 |
| cone | crosshatch | penStipple | 0.2739 | 0.2871 | 0.4078 | 0.41 |
| cone | crosshatch | perceptualRamp | 0.1191 | 0.1262 | 0.2957 | 0.11 |
| cone | crosshatch | phaseFineLadder | 0.1205 | 0.1263 | 0.255 | 0.12 |
| cone | crosshatch | taperedEnds | 0.3446 | 0.3474 | 0.3856 | 0.54 |
| cone | crosshatch | trochoidLoop | 0.4317 | 0.4297 | 0.442 | 0.73 |
| cone | crosshatch | turingStripe | 0.282 | 0.282 | 0.282 | 0.35 |
| cone | crosshatch | voronoiWeb | 0.2139 | 0.2139 | 0.2139 | 0.3 |
| cone | crosshatch | weaveDepth | 0.4164 | 0.4238 | 0.4225 | 0.64 |
| cone | crosshatch | weightModulated | 0.1291 | 0.1338 | 0.2587 | 0.15 |
| cone | crosshatch | weightSmoothstep | 0.1288 | 0.1335 | 0.2583 | 0.15 |
| cone | crosshatch | whiteBand | 0.3426 | 0.352 | 0.3936 | 0.55 |
| cone | hatch | amplitudeOnly | 0.1687 | 0.1679 | 0.1914 | 0.25 |
| cone | hatch | ampSpacing | 0.3271 | 0.3297 | 0.3161 | 0.52 |
| cone | hatch | bundleCount | 0.282 | 0.2952 | 0.3078 | 0.42 |
| cone | hatch | bundleDither | 0.2822 | 0.2951 | 0.3077 | 0.43 |
| cone | hatch | bundleEased | 0.2635 | 0.2757 | 0.2865 | 0.47 |
| cone | hatch | bundleHandoff | 0.2525 | 0.2662 | 0.2771 | 0.5 |
| cone | hatch | bundleLozenge | 0.2537 | 0.2626 | 0.2739 | 0.4 |
| cone | hatch | bundleSubNib | 0.2981 | 0.3123 | 0.3221 | 0.42 |
| cone | hatch | contFieldFore | 0.2177 | 0.2177 | 0.2196 | 0.22 |
| cone | hatch | contFieldQuant | 0.2174 | 0.2174 | 0.2243 | 0.24 |
| cone | hatch | contFieldSigmoid | 0.1787 | 0.1792 | 0.1912 | 0.26 |
| cone | hatch | contFieldSurface | 0.2376 | 0.2376 | 0.2381 | 0.27 |
| cone | hatch | contFieldTouch | 0.4226 | 0.4226 | 0.4227 | 0.54 |
| cone | hatch | deepFillTSP | 0.0676 | 0.0697 | 0.1409 | 0.09 |
| cone | hatch | defectSplit | 0.3381 | 0.3381 | 0.3381 | 0.58 |
| cone | hatch | dutyConst | 0.229 | 0.229 | 0.229 | 0.31 |
| cone | hatch | endShorten | 0.149 | 0.149 | 0.149 | 0.35 |
| cone | hatch | etfKang | 0.366 | 0.366 | 0.366 | 0.61 |
| cone | hatch | fineLadder | 0.0798 | 0.0839 | 0.1844 | 0.1 |
| cone | hatch | interlockWeave | 0.3244 | 0.317 | 0.3398 | 0.59 |
| cone | hatch | isophoteWidth | 0.2001 | 0.2128 | 0.2642 | 0.34 |
| cone | hatch | lozengeStipple | 0.0791 | 0.0828 | 0.2122 | 0.09 |
| cone | hatch | mazeFill | 0.2236 | 0.2236 | 0.2236 | 0.28 |
| cone | hatch | mezzoRegion | 0.3603 | 0.3603 | 0.3603 | 0.6 |
| cone | hatch | mkDashRamp | 0.2898 | 0.2914 | 0.3898 | 0.64 |
| cone | hatch | mkDotScreen | 0.273 | 0.3001 | 0.356 | 0.59 |
| cone | hatch | mkScribble | 0.2389 | 0.2408 | 0.3033 | 0.52 |
| cone | hatch | mkTick | 0.065 | 0.064 | 0.1229 | 0.07 |
| cone | hatch | nibAngle | 0.2163 | 0.2201 | 0.2286 | 0.3 |
| cone | hatch | none | 0.0395 | 0.0932 | 0.143 | 0.13 |
| cone | hatch | onePenDown | 0.3068 | 0.2974 | 0.3094 | 0.54 |
| cone | hatch | originSpiral | 0.3966 | 0.3966 | 0.3966 | 0.61 |
| cone | hatch | penCross | 0.1651 | 0.1801 | 0.2148 | 0.15 |
| cone | hatch | penFacing | 0.1091 | 0.1104 | 0.218 | 0.15 |
| cone | hatch | penInterleave | 0.2006 | 0.2136 | 0.3086 | 0.29 |
| cone | hatch | penPitchMatch | 0.172 | 0.1793 | 0.3083 | 0.27 |
| cone | hatch | penReserve | 0.1723 | 0.1778 | 0.2729 | 0.21 |
| cone | hatch | penStipple | 0.1854 | 0.1956 | 0.3102 | 0.28 |
| cone | hatch | perceptualRamp | 0.0761 | 0.0794 | 0.1908 | 0.08 |
| cone | hatch | phaseFineLadder | 0.0767 | 0.0788 | 0.1635 | 0.08 |
| cone | hatch | taperedEnds | 0.2344 | 0.2392 | 0.2775 | 0.36 |
| cone | hatch | trochoidLoop | 0.3433 | 0.3324 | 0.3328 | 0.62 |
| cone | hatch | turingStripe | 0.282 | 0.282 | 0.282 | 0.35 |
| cone | hatch | voronoiWeb | 0.2139 | 0.2139 | 0.2139 | 0.3 |
| cone | hatch | weaveDepth | 0.3302 | 0.3239 | 0.3178 | 0.55 |
| cone | hatch | weightModulated | 0.082 | 0.0853 | 0.1767 | 0.11 |
| cone | hatch | weightSmoothstep | 0.0815 | 0.0845 | 0.1759 | 0.11 |
| cone | hatch | whiteBand | 0.2266 | 0.2422 | 0.2834 | 0.37 |
| cone | none | amplitudeOnly | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | ampSpacing | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | bundleCount | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | bundleDither | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | bundleEased | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | bundleHandoff | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | bundleLozenge | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | bundleSubNib | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | contFieldFore | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | contFieldQuant | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | contFieldSigmoid | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | contFieldSurface | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | contFieldTouch | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | deepFillTSP | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | defectSplit | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | dutyConst | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | endShorten | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | etfKang | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | fineLadder | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | interlockWeave | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | isophoteWidth | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | lozengeStipple | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | mazeFill | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | mezzoRegion | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | mkDashRamp | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | mkDotScreen | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | mkScribble | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | mkTick | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | nibAngle | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | none | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | onePenDown | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | originSpiral | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | penCross | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | penFacing | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | penInterleave | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | penPitchMatch | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | penReserve | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | penStipple | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | perceptualRamp | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | phaseFineLadder | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | taperedEnds | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | trochoidLoop | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | turingStripe | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | voronoiWeb | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | weaveDepth | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | weightModulated | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | weightSmoothstep | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | none | whiteBand | 0.0218 | 0.0218 | 0.0218 | 0.02 |
| cone | spiral | amplitudeOnly | 0.1431 | 0.1497 | 0.0912 | 0.15 |
| cone | spiral | ampSpacing | 0.1635 | 0.1704 | 0.2267 | 0.19 |
| cone | spiral | bundleCount | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | bundleDither | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | bundleEased | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | bundleHandoff | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | bundleLozenge | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | bundleSubNib | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | contFieldFore | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | contFieldQuant | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | contFieldSigmoid | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | contFieldSurface | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | contFieldTouch | 0.1673 | 0.1747 | 0.3011 | 0.17 |
| cone | spiral | deepFillTSP | 0.0929 | 0.1002 | 0.1048 | 0.09 |
| cone | spiral | fineLadder | 0.1244 | 0.1327 | 0.1539 | 0.16 |
| cone | spiral | interlockWeave | 0.0887 | 0.0903 | 0.0782 | 0.08 |
| cone | spiral | isophoteWidth | 0.1143 | 0.1145 | 0.0782 | 0.1 |
| cone | spiral | lozengeStipple | 0.1286 | 0.1383 | 0.1483 | 0.15 |
| cone | spiral | mkDashRamp | 0.0683 | 0.0721 | 0.1116 | 0.06 |
| cone | spiral | mkDotScreen | 0.0683 | 0.0721 | 0.1116 | 0.06 |
| cone | spiral | mkScribble | 0.0683 | 0.0721 | 0.1116 | 0.06 |
| cone | spiral | mkTick | 0.0683 | 0.0721 | 0.1116 | 0.06 |
| cone | spiral | nibAngle | 0.1143 | 0.1145 | 0.0782 | 0.1 |
| cone | spiral | none | 0.056 | 0.1516 | 0.2465 | 0.14 |
| cone | spiral | onePenDown | 0.0887 | 0.0903 | 0.0782 | 0.08 |
| cone | spiral | penCross | 0.1518 | 0.1597 | 0.0851 | 0.19 |
| cone | spiral | penFacing | 0.1609 | 0.1682 | 0.1452 | 0.2 |
| cone | spiral | penInterleave | 0.1673 | 0.1747 | 0.1047 | 0.17 |
| cone | spiral | penPitchMatch | 0.1673 | 0.1747 | 0.1123 | 0.17 |
| cone | spiral | penReserve | 0.1673 | 0.1747 | 0.1076 | 0.17 |
| cone | spiral | penStipple | 0.1673 | 0.1747 | 0.1088 | 0.17 |
| cone | spiral | perceptualRamp | 0.1286 | 0.1383 | 0.1483 | 0.15 |
| cone | spiral | phaseFineLadder | 0.1287 | 0.1384 | 0.1483 | 0.15 |
| cone | spiral | taperedEnds | 0.1143 | 0.1145 | 0.0782 | 0.1 |
| cone | spiral | trochoidLoop | 0.0887 | 0.0903 | 0.0782 | 0.08 |
| cone | spiral | weaveDepth | 0.1669 | 0.1742 | 0.2245 | 0.18 |
| cone | spiral | weightModulated | 0.0836 | 0.0852 | 0.0782 | 0.08 |
| cone | spiral | weightSmoothstep | 0.0836 | 0.0852 | 0.0782 | 0.08 |
| cone | spiral | whiteBand | 0.1143 | 0.1145 | 0.0782 | 0.1 |
| cone | stipple | amplitudeOnly | 0.1939 | 0.207 | 0.4575 | 0.18 |
| cone | stipple | ampSpacing | 0.2094 | 0.2245 | 0.5158 | 0.2 |
| cone | stipple | bundleCount | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | bundleDither | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | bundleEased | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | bundleHandoff | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | bundleLozenge | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | bundleSubNib | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | contFieldFore | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | contFieldQuant | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | contFieldSigmoid | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | contFieldSurface | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | contFieldTouch | 0.2153 | 0.2299 | 0.5192 | 0.18 |
| cone | stipple | deepFillTSP | 0.1419 | 0.1511 | 0.4809 | 0.19 |
| cone | stipple | fineLadder | 0.1691 | 0.1808 | 0.5062 | 0.22 |
| cone | stipple | interlockWeave | 0.1304 | 0.1357 | 0.4203 | 0.19 |
| cone | stipple | isophoteWidth | 0.163 | 0.1702 | 0.4203 | 0.18 |
| cone | stipple | lozengeStipple | 0.1753 | 0.1882 | 0.5034 | 0.21 |
| cone | stipple | mkDashRamp | 0.1052 | 0.1124 | 0.483 | 0.17 |
| cone | stipple | mkDotScreen | 0.1052 | 0.1124 | 0.483 | 0.17 |
| cone | stipple | mkScribble | 0.1052 | 0.1124 | 0.483 | 0.17 |
| cone | stipple | mkTick | 0.1052 | 0.1124 | 0.483 | 0.17 |
| cone | stipple | nibAngle | 0.163 | 0.1702 | 0.4203 | 0.18 |
| cone | stipple | none | 0.0347 | 0.1796 | 0.3797 | 0.16 |
| cone | stipple | onePenDown | 0.1304 | 0.1357 | 0.4203 | 0.19 |
| cone | stipple | penCross | 0.1951 | 0.208 | 0.4372 | 0.24 |
| cone | stipple | penFacing | 0.2057 | 0.2202 | 0.507 | 0.22 |
| cone | stipple | penInterleave | 0.2153 | 0.2299 | 0.4741 | 0.18 |
| cone | stipple | penPitchMatch | 0.2153 | 0.2299 | 0.4876 | 0.18 |
| cone | stipple | penReserve | 0.2153 | 0.2299 | 0.477 | 0.18 |
| cone | stipple | penStipple | 0.2153 | 0.2299 | 0.4778 | 0.18 |
| cone | stipple | perceptualRamp | 0.1753 | 0.1882 | 0.5034 | 0.21 |
| cone | stipple | phaseFineLadder | 0.1753 | 0.1881 | 0.5034 | 0.21 |
| cone | stipple | taperedEnds | 0.163 | 0.1702 | 0.4203 | 0.18 |
| cone | stipple | trochoidLoop | 0.1304 | 0.1357 | 0.4203 | 0.19 |
| cone | stipple | weaveDepth | 0.2143 | 0.2289 | 0.5163 | 0.18 |
| cone | stipple | weightModulated | 0.1242 | 0.1297 | 0.4203 | 0.18 |
| cone | stipple | weightSmoothstep | 0.1242 | 0.1297 | 0.4203 | 0.18 |
| cone | stipple | whiteBand | 0.163 | 0.1702 | 0.4203 | 0.18 |
| cone | wireframe | amplitudeOnly | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | ampSpacing | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | bundleCount | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | bundleDither | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | bundleEased | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | bundleHandoff | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | bundleLozenge | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | bundleSubNib | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | contFieldFore | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | contFieldQuant | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | contFieldSigmoid | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | contFieldSurface | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | contFieldTouch | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | deepFillTSP | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | defectSplit | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | dutyConst | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | endShorten | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | etfKang | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | fineLadder | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | interlockWeave | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | isophoteWidth | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | lozengeStipple | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | mazeFill | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | mezzoRegion | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | mkDashRamp | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | mkDotScreen | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | mkScribble | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | mkTick | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | nibAngle | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | none | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | onePenDown | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | originSpiral | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | penCross | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | penFacing | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | penInterleave | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | penPitchMatch | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | penReserve | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | penStipple | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | perceptualRamp | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | phaseFineLadder | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | taperedEnds | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | trochoidLoop | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | turingStripe | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | voronoiWeb | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | weaveDepth | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | weightModulated | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | weightSmoothstep | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| cone | wireframe | whiteBand | 0.2621 | 0.2621 | 0.2621 | 0.27 |
| sphere | contour | amplitudeOnly | 0.2131 | 0.2165 | 0.2487 | 0.2 |
| sphere | contour | ampSpacing | 0.4506 | 0.4523 | 0.4696 | 0.52 |
| sphere | contour | bundleCount | 0.4806 | 0.4875 | 0.5045 | 0.54 |
| sphere | contour | bundleDither | 0.4804 | 0.4831 | 0.5046 | 0.52 |
| sphere | contour | bundleEased | 0.4485 | 0.4551 | 0.472 | 0.61 |
| sphere | contour | bundleHandoff | 0.4373 | 0.4429 | 0.4616 | 0.65 |
| sphere | contour | bundleLozenge | 0.4418 | 0.4514 | 0.4652 | 0.56 |
| sphere | contour | bundleSubNib | 0.4987 | 0.5095 | 0.5713 | 0.58 |
| sphere | contour | contFieldFore | 0.3201 | 0.3195 | 0.3194 | 0.29 |
| sphere | contour | contFieldQuant | 0.2903 | 0.2899 | 0.3065 | 0.23 |
| sphere | contour | contFieldSigmoid | 0.246 | 0.2456 | 0.263 | 0.24 |
| sphere | contour | contFieldSurface | 0.3581 | 0.3578 | 0.3578 | 0.42 |
| sphere | contour | contFieldTouch | 0.5918 | 0.5919 | 0.6247 | 0.48 |
| sphere | contour | deepFillTSP | 0.0914 | 0.0928 | 0.1987 | 0.07 |
| sphere | contour | defectSplit | 0.4809 | 0.4809 | 0.4809 | 0.62 |
| sphere | contour | dutyConst | 0.3168 | 0.3168 | 0.3168 | 0.35 |
| sphere | contour | endShorten | 0.2086 | 0.2086 | 0.2086 | 0.36 |
| sphere | contour | etfKang | 0.4766 | 0.4766 | 0.4766 | 0.57 |
| sphere | contour | fineLadder | 0.1184 | 0.1214 | 0.2959 | 0.13 |
| sphere | contour | interlockWeave | 0.4608 | 0.4584 | 0.4815 | 0.54 |
| sphere | contour | isophoteWidth | 0.3719 | 0.3714 | 0.4497 | 0.57 |
| sphere | contour | lozengeStipple | 0.1218 | 0.1264 | 0.3171 | 0.08 |
| sphere | contour | mazeFill | 0.2995 | 0.2995 | 0.2995 | 0.28 |
| sphere | contour | mezzoRegion | 0.5081 | 0.5081 | 0.5081 | 0.59 |
| sphere | contour | mkDashRamp | 0.5127 | 0.5062 | 0.5632 | 0.76 |
| sphere | contour | mkDotScreen | 0.5011 | 0.4992 | 0.5251 | 0.68 |
| sphere | contour | mkScribble | 0.3935 | 0.4014 | 0.4529 | 0.56 |
| sphere | contour | mkTick | 0.0953 | 0.0978 | 0.2012 | 0.1 |
| sphere | contour | nibAngle | 0.4048 | 0.4016 | 0.4384 | 0.54 |
| sphere | contour | none | 0.0506 | 0.1275 | 0.2053 | 0.1 |
| sphere | contour | onePenDown | 0.4562 | 0.4555 | 0.4704 | 0.61 |
| sphere | contour | originSpiral | 0.5314 | 0.5314 | 0.5314 | 0.62 |
| sphere | contour | penCross | 0.2793 | 0.2792 | 0.3055 | 0.21 |
| sphere | contour | penFacing | 0.2176 | 0.227 | 0.3783 | 0.18 |
| sphere | contour | penInterleave | 0.3403 | 0.3099 | 0.4647 | 0.36 |
| sphere | contour | penPitchMatch | 0.3012 | 0.309 | 0.4644 | 0.42 |
| sphere | contour | penReserve | 0.3023 | 0.3087 | 0.4082 | 0.39 |
| sphere | contour | penStipple | 0.3167 | 0.3323 | 0.4733 | 0.42 |
| sphere | contour | perceptualRamp | 0.1144 | 0.1178 | 0.2727 | 0.07 |
| sphere | contour | phaseFineLadder | 0.1145 | 0.1184 | 0.2598 | 0.08 |
| sphere | contour | taperedEnds | 0.3858 | 0.382 | 0.435 | 0.56 |
| sphere | contour | trochoidLoop | 0.4781 | 0.4716 | 0.4357 | 0.56 |
| sphere | contour | turingStripe | 0.3986 | 0.3986 | 0.3986 | 0.36 |
| sphere | contour | voronoiWeb | 0.3018 | 0.3018 | 0.3018 | 0.31 |
| sphere | contour | weaveDepth | 0.4568 | 0.4574 | 0.4726 | 0.55 |
| sphere | contour | weightModulated | 0.1267 | 0.1284 | 0.2876 | 0.14 |
| sphere | contour | weightSmoothstep | 0.1255 | 0.1288 | 0.2874 | 0.14 |
| sphere | contour | whiteBand | 0.4045 | 0.4014 | 0.4417 | 0.55 |
| sphere | contourSlice | amplitudeOnly | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | ampSpacing | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | bundleCount | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | bundleDither | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | bundleEased | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | bundleHandoff | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | bundleLozenge | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | bundleSubNib | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | contFieldFore | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | contFieldQuant | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | contFieldSigmoid | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | contFieldSurface | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | contFieldTouch | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | deepFillTSP | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | defectSplit | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | dutyConst | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | endShorten | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | etfKang | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | fineLadder | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | interlockWeave | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | isophoteWidth | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | lozengeStipple | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | mazeFill | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | mezzoRegion | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | mkDashRamp | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | mkDotScreen | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | mkScribble | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | mkTick | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | nibAngle | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | none | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | onePenDown | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | originSpiral | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | penCross | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | penFacing | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | penInterleave | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | penPitchMatch | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | penReserve | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | penStipple | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | perceptualRamp | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | phaseFineLadder | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | taperedEnds | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | trochoidLoop | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | turingStripe | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | voronoiWeb | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | weaveDepth | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | weightModulated | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | weightSmoothstep | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | contourSlice | whiteBand | 0.2056 | 0.2056 | 0.2056 | 0.18 |
| sphere | crosshatch | amplitudeOnly | 0.3743 | 0.3743 | 0.4171 | 0.35 |
| sphere | crosshatch | ampSpacing | 0.5699 | 0.5699 | 0.5697 | 0.59 |
| sphere | crosshatch | bundleCount | 0.5946 | 0.5946 | 0.608 | 0.55 |
| sphere | crosshatch | bundleDither | 0.5936 | 0.5936 | 0.6067 | 0.55 |
| sphere | crosshatch | bundleEased | 0.562 | 0.562 | 0.5764 | 0.65 |
| sphere | crosshatch | bundleHandoff | 0.5426 | 0.5426 | 0.5597 | 0.69 |
| sphere | crosshatch | bundleLozenge | 0.5754 | 0.5754 | 0.5897 | 0.55 |
| sphere | crosshatch | bundleSubNib | 0.6092 | 0.6092 | 0.6266 | 0.53 |
| sphere | crosshatch | contFieldFore | 0.4846 | 0.4846 | 0.4855 | 0.33 |
| sphere | crosshatch | contFieldQuant | 0.4854 | 0.4854 | 0.4887 | 0.31 |
| sphere | crosshatch | contFieldSigmoid | 0.4258 | 0.4258 | 0.4348 | 0.33 |
| sphere | crosshatch | contFieldSurface | 0.5226 | 0.5226 | 0.5233 | 0.4 |
| sphere | crosshatch | contFieldTouch | 0.717 | 0.717 | 0.717 | 0.51 |
| sphere | crosshatch | deepFillTSP | 0.1367 | 0.1367 | 0.3008 | 0.19 |
| sphere | crosshatch | defectSplit | 0.4809 | 0.4809 | 0.4809 | 0.62 |
| sphere | crosshatch | dutyConst | 0.4843 | 0.4843 | 0.4843 | 0.55 |
| sphere | crosshatch | endShorten | 0.3677 | 0.3677 | 0.3677 | 0.56 |
| sphere | crosshatch | etfKang | 0.4766 | 0.4766 | 0.4766 | 0.57 |
| sphere | crosshatch | fineLadder | 0.177 | 0.177 | 0.4041 | 0.16 |
| sphere | crosshatch | interlockWeave | 0.6161 | 0.6161 | 0.6349 | 0.67 |
| sphere | crosshatch | isophoteWidth | 0.4947 | 0.4947 | 0.5727 | 0.64 |
| sphere | crosshatch | lozengeStipple | 0.1843 | 0.1843 | 0.4405 | 0.18 |
| sphere | crosshatch | mazeFill | 0.2995 | 0.2995 | 0.2995 | 0.28 |
| sphere | crosshatch | mezzoRegion | 0.6422 | 0.6422 | 0.6422 | 0.68 |
| sphere | crosshatch | mkDashRamp | 0.6198 | 0.6198 | 0.6456 | 0.72 |
| sphere | crosshatch | mkDotScreen | 0.6325 | 0.6325 | 0.6286 | 0.73 |
| sphere | crosshatch | mkScribble | 0.5715 | 0.5715 | 0.5858 | 0.72 |
| sphere | crosshatch | mkTick | 0.1493 | 0.1493 | 0.2889 | 0.19 |
| sphere | crosshatch | nibAngle | 0.5232 | 0.5232 | 0.5809 | 0.6 |
| sphere | crosshatch | none | 0.0716 | 0.2014 | 0.31 | 0.19 |
| sphere | crosshatch | onePenDown | 0.5921 | 0.5921 | 0.6067 | 0.6 |
| sphere | crosshatch | originSpiral | 0.5314 | 0.5314 | 0.5314 | 0.62 |
| sphere | crosshatch | penCross | 0.3394 | 0.3394 | 0.3958 | 0.28 |
| sphere | crosshatch | penFacing | 0.2554 | 0.2554 | 0.4241 | 0.24 |
| sphere | crosshatch | penInterleave | 0.4413 | 0.4413 | 0.5634 | 0.46 |
| sphere | crosshatch | penPitchMatch | 0.3922 | 0.3922 | 0.5632 | 0.43 |
| sphere | crosshatch | penReserve | 0.3241 | 0.3241 | 0.4473 | 0.36 |
| sphere | crosshatch | penStipple | 0.4149 | 0.4149 | 0.5618 | 0.45 |
| sphere | crosshatch | perceptualRamp | 0.1706 | 0.1706 | 0.3833 | 0.18 |
| sphere | crosshatch | phaseFineLadder | 0.1762 | 0.1762 | 0.3595 | 0.16 |
| sphere | crosshatch | taperedEnds | 0.5321 | 0.5321 | 0.5878 | 0.6 |
| sphere | crosshatch | trochoidLoop | 0.6247 | 0.6247 | 0.6244 | 0.69 |
| sphere | crosshatch | turingStripe | 0.3986 | 0.3986 | 0.3986 | 0.36 |
| sphere | crosshatch | voronoiWeb | 0.3018 | 0.3018 | 0.3018 | 0.31 |
| sphere | crosshatch | weaveDepth | 0.57 | 0.57 | 0.5702 | 0.57 |
| sphere | crosshatch | weightModulated | 0.1923 | 0.1923 | 0.3951 | 0.16 |
| sphere | crosshatch | weightSmoothstep | 0.1909 | 0.1909 | 0.3947 | 0.16 |
| sphere | crosshatch | whiteBand | 0.5208 | 0.5208 | 0.5929 | 0.61 |
| sphere | hatch | amplitudeOnly | 0.2306 | 0.2306 | 0.2624 | 0.21 |
| sphere | hatch | ampSpacing | 0.4397 | 0.4397 | 0.4435 | 0.56 |
| sphere | hatch | bundleCount | 0.433 | 0.433 | 0.4438 | 0.46 |
| sphere | hatch | bundleDither | 0.4319 | 0.4319 | 0.4434 | 0.46 |
| sphere | hatch | bundleEased | 0.4062 | 0.4062 | 0.4175 | 0.54 |
| sphere | hatch | bundleHandoff | 0.3927 | 0.3927 | 0.4077 | 0.56 |
| sphere | hatch | bundleLozenge | 0.404 | 0.404 | 0.4198 | 0.45 |
| sphere | hatch | bundleSubNib | 0.4501 | 0.4501 | 0.4735 | 0.46 |
| sphere | hatch | contFieldFore | 0.3115 | 0.3115 | 0.3141 | 0.35 |
| sphere | hatch | contFieldQuant | 0.3081 | 0.3081 | 0.3145 | 0.37 |
| sphere | hatch | contFieldSigmoid | 0.2698 | 0.2698 | 0.287 | 0.4 |
| sphere | hatch | contFieldSurface | 0.3518 | 0.3518 | 0.3534 | 0.42 |
| sphere | hatch | contFieldTouch | 0.5926 | 0.5926 | 0.5926 | 0.62 |
| sphere | hatch | deepFillTSP | 0.0843 | 0.0843 | 0.1956 | 0.11 |
| sphere | hatch | defectSplit | 0.4809 | 0.4809 | 0.4809 | 0.62 |
| sphere | hatch | dutyConst | 0.3168 | 0.3168 | 0.3168 | 0.35 |
| sphere | hatch | endShorten | 0.2086 | 0.2086 | 0.2086 | 0.36 |
| sphere | hatch | etfKang | 0.4766 | 0.4766 | 0.4766 | 0.57 |
| sphere | hatch | fineLadder | 0.1175 | 0.1175 | 0.2802 | 0.1 |
| sphere | hatch | interlockWeave | 0.4705 | 0.4705 | 0.4887 | 0.63 |
| sphere | hatch | isophoteWidth | 0.3427 | 0.3427 | 0.433 | 0.5 |
| sphere | hatch | lozengeStipple | 0.1173 | 0.1173 | 0.3042 | 0.11 |
| sphere | hatch | mazeFill | 0.2995 | 0.2995 | 0.2995 | 0.28 |
| sphere | hatch | mezzoRegion | 0.5081 | 0.5081 | 0.5081 | 0.59 |
| sphere | hatch | mkDashRamp | 0.4812 | 0.4812 | 0.5711 | 0.73 |
| sphere | hatch | mkDotScreen | 0.4877 | 0.4877 | 0.5246 | 0.65 |
| sphere | hatch | mkScribble | 0.41 | 0.41 | 0.4466 | 0.55 |
| sphere | hatch | mkTick | 0.0916 | 0.0916 | 0.1798 | 0.12 |
| sphere | hatch | nibAngle | 0.3334 | 0.3334 | 0.3631 | 0.46 |
| sphere | hatch | none | 0.0475 | 0.1213 | 0.1909 | 0.14 |
| sphere | hatch | onePenDown | 0.437 | 0.437 | 0.4436 | 0.54 |
| sphere | hatch | originSpiral | 0.5314 | 0.5314 | 0.5314 | 0.62 |
| sphere | hatch | penCross | 0.263 | 0.263 | 0.3038 | 0.25 |
| sphere | hatch | penFacing | 0.1751 | 0.1751 | 0.3118 | 0.18 |
| sphere | hatch | penInterleave | 0.3131 | 0.3131 | 0.4369 | 0.35 |
| sphere | hatch | penPitchMatch | 0.2719 | 0.2719 | 0.4432 | 0.34 |
| sphere | hatch | penReserve | 0.2648 | 0.2648 | 0.3705 | 0.27 |
| sphere | hatch | penStipple | 0.2871 | 0.2871 | 0.44 | 0.35 |
| sphere | hatch | perceptualRamp | 0.1107 | 0.1107 | 0.2643 | 0.11 |
| sphere | hatch | phaseFineLadder | 0.1127 | 0.1127 | 0.2403 | 0.11 |
| sphere | hatch | taperedEnds | 0.3663 | 0.3663 | 0.4339 | 0.46 |
| sphere | hatch | trochoidLoop | 0.4975 | 0.4975 | 0.4581 | 0.7 |
| sphere | hatch | turingStripe | 0.3986 | 0.3986 | 0.3986 | 0.36 |
| sphere | hatch | voronoiWeb | 0.3018 | 0.3018 | 0.3018 | 0.31 |
| sphere | hatch | weaveDepth | 0.4264 | 0.4264 | 0.4462 | 0.48 |
| sphere | hatch | weightModulated | 0.1161 | 0.1161 | 0.2552 | 0.1 |
| sphere | hatch | weightSmoothstep | 0.1151 | 0.1151 | 0.2548 | 0.1 |
| sphere | hatch | whiteBand | 0.3441 | 0.3441 | 0.4453 | 0.48 |
| sphere | none | amplitudeOnly | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | ampSpacing | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | bundleCount | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | bundleDither | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | bundleEased | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | bundleHandoff | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | bundleLozenge | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | bundleSubNib | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | contFieldFore | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | contFieldQuant | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | contFieldSigmoid | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | contFieldSurface | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | contFieldTouch | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | deepFillTSP | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | defectSplit | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | dutyConst | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | endShorten | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | etfKang | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | fineLadder | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | interlockWeave | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | isophoteWidth | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | lozengeStipple | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | mazeFill | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | mezzoRegion | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | mkDashRamp | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | mkDotScreen | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | mkScribble | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | mkTick | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | nibAngle | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | none | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | onePenDown | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | originSpiral | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | penCross | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | penFacing | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | penInterleave | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | penPitchMatch | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | penReserve | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | penStipple | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | perceptualRamp | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | phaseFineLadder | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | taperedEnds | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | trochoidLoop | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | turingStripe | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | voronoiWeb | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | weaveDepth | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | weightModulated | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | weightSmoothstep | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | none | whiteBand | 0.0223 | 0.0223 | 0.0223 | 0 |
| sphere | spiral | amplitudeOnly | 0.3019 | 0.3019 | 0.1637 | 0.29 |
| sphere | spiral | ampSpacing | 0.3428 | 0.3428 | 0.3999 | 0.39 |
| sphere | spiral | bundleCount | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | bundleDither | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | bundleEased | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | bundleHandoff | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | bundleLozenge | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | bundleSubNib | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | contFieldFore | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | contFieldQuant | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | contFieldSigmoid | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | contFieldSurface | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | contFieldTouch | 0.3521 | 0.3521 | 0.5297 | 0.33 |
| sphere | spiral | deepFillTSP | 0.19 | 0.19 | 0.1858 | 0.18 |
| sphere | spiral | fineLadder | 0.2631 | 0.2631 | 0.278 | 0.34 |
| sphere | spiral | interlockWeave | 0.1725 | 0.1725 | 0.1283 | 0.17 |
| sphere | spiral | isophoteWidth | 0.2332 | 0.2332 | 0.1283 | 0.22 |
| sphere | spiral | lozengeStipple | 0.2714 | 0.2714 | 0.2661 | 0.34 |
| sphere | spiral | mkDashRamp | 0.1311 | 0.1311 | 0.1985 | 0.12 |
| sphere | spiral | mkDotScreen | 0.1311 | 0.1311 | 0.1985 | 0.12 |
| sphere | spiral | mkScribble | 0.1311 | 0.1311 | 0.1985 | 0.12 |
| sphere | spiral | mkTick | 0.1311 | 0.1311 | 0.1985 | 0.12 |
| sphere | spiral | nibAngle | 0.2332 | 0.2332 | 0.1283 | 0.22 |
| sphere | spiral | none | 0.0863 | 0.2703 | 0.4399 | 0.25 |
| sphere | spiral | onePenDown | 0.1725 | 0.1725 | 0.1283 | 0.17 |
| sphere | spiral | penCross | 0.3194 | 0.3194 | 0.1424 | 0.41 |
| sphere | spiral | penFacing | 0.3379 | 0.3379 | 0.245 | 0.39 |
| sphere | spiral | penInterleave | 0.3494 | 0.3494 | 0.1836 | 0.35 |
| sphere | spiral | penPitchMatch | 0.3494 | 0.3494 | 0.2085 | 0.35 |
| sphere | spiral | penReserve | 0.3494 | 0.3494 | 0.1906 | 0.35 |
| sphere | spiral | penStipple | 0.3521 | 0.3521 | 0.1954 | 0.33 |
| sphere | spiral | perceptualRamp | 0.2714 | 0.2714 | 0.2661 | 0.34 |
| sphere | spiral | phaseFineLadder | 0.2717 | 0.2717 | 0.2663 | 0.34 |
| sphere | spiral | taperedEnds | 0.2332 | 0.2332 | 0.1283 | 0.22 |
| sphere | spiral | trochoidLoop | 0.1725 | 0.1725 | 0.1283 | 0.17 |
| sphere | spiral | weaveDepth | 0.348 | 0.348 | 0.3966 | 0.36 |
| sphere | spiral | weightModulated | 0.1577 | 0.1577 | 0.1283 | 0.16 |
| sphere | spiral | weightSmoothstep | 0.1577 | 0.1577 | 0.1283 | 0.16 |
| sphere | spiral | whiteBand | 0.2332 | 0.2332 | 0.1283 | 0.22 |
| sphere | stipple | amplitudeOnly | 0.3285 | 0.3285 | 0.6675 | 0.34 |
| sphere | stipple | ampSpacing | 0.3554 | 0.3554 | 0.7288 | 0.42 |
| sphere | stipple | bundleCount | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | bundleDither | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | bundleEased | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | bundleHandoff | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | bundleLozenge | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | bundleSubNib | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | contFieldFore | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | contFieldQuant | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | contFieldSigmoid | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | contFieldSurface | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | contFieldTouch | 0.368 | 0.368 | 0.7301 | 0.36 |
| sphere | stipple | deepFillTSP | 0.2325 | 0.2325 | 0.6926 | 0.35 |
| sphere | stipple | fineLadder | 0.2866 | 0.2866 | 0.7266 | 0.26 |
| sphere | stipple | interlockWeave | 0.2087 | 0.2087 | 0.6243 | 0.28 |
| sphere | stipple | isophoteWidth | 0.2683 | 0.2683 | 0.6243 | 0.32 |
| sphere | stipple | lozengeStipple | 0.2977 | 0.2977 | 0.7243 | 0.3 |
| sphere | stipple | mkDashRamp | 0.1686 | 0.1686 | 0.6966 | 0.26 |
| sphere | stipple | mkDotScreen | 0.1686 | 0.1686 | 0.6966 | 0.26 |
| sphere | stipple | mkScribble | 0.1686 | 0.1686 | 0.6966 | 0.26 |
| sphere | stipple | mkTick | 0.1686 | 0.1686 | 0.6966 | 0.26 |
| sphere | stipple | nibAngle | 0.2683 | 0.2683 | 0.6243 | 0.32 |
| sphere | stipple | none | 0.0424 | 0.2437 | 0.486 | 0.29 |
| sphere | stipple | onePenDown | 0.2087 | 0.2087 | 0.6243 | 0.28 |
| sphere | stipple | penCross | 0.3328 | 0.3328 | 0.6409 | 0.42 |
| sphere | stipple | penFacing | 0.3537 | 0.3537 | 0.72 | 0.4 |
| sphere | stipple | penInterleave | 0.3659 | 0.3659 | 0.6848 | 0.36 |
| sphere | stipple | penPitchMatch | 0.3659 | 0.3659 | 0.7049 | 0.36 |
| sphere | stipple | penReserve | 0.3659 | 0.3659 | 0.6894 | 0.36 |
| sphere | stipple | penStipple | 0.368 | 0.368 | 0.6901 | 0.36 |
| sphere | stipple | perceptualRamp | 0.2977 | 0.2977 | 0.7243 | 0.3 |
| sphere | stipple | phaseFineLadder | 0.2977 | 0.2977 | 0.7243 | 0.3 |
| sphere | stipple | taperedEnds | 0.2683 | 0.2683 | 0.6243 | 0.32 |
| sphere | stipple | trochoidLoop | 0.2087 | 0.2087 | 0.6243 | 0.28 |
| sphere | stipple | weaveDepth | 0.364 | 0.364 | 0.7292 | 0.36 |
| sphere | stipple | weightModulated | 0.2017 | 0.2017 | 0.6243 | 0.29 |
| sphere | stipple | weightSmoothstep | 0.2017 | 0.2017 | 0.6243 | 0.29 |
| sphere | stipple | whiteBand | 0.2683 | 0.2683 | 0.6243 | 0.32 |
| sphere | wireframe | amplitudeOnly | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | ampSpacing | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | bundleCount | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | bundleDither | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | bundleEased | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | bundleHandoff | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | bundleLozenge | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | bundleSubNib | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | contFieldFore | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | contFieldQuant | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | contFieldSigmoid | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | contFieldSurface | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | contFieldTouch | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | deepFillTSP | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | defectSplit | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | dutyConst | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | endShorten | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | etfKang | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | fineLadder | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | interlockWeave | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | isophoteWidth | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | lozengeStipple | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | mazeFill | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | mezzoRegion | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | mkDashRamp | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | mkDotScreen | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | mkScribble | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | mkTick | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | nibAngle | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | none | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | onePenDown | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | originSpiral | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | penCross | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | penFacing | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | penInterleave | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | penPitchMatch | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | penReserve | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | penStipple | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | perceptualRamp | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | phaseFineLadder | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | taperedEnds | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | trochoidLoop | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | turingStripe | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | voronoiWeb | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | weaveDepth | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | weightModulated | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | weightSmoothstep | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| sphere | wireframe | whiteBand | 0.3333 | 0.3333 | 0.3333 | 0.25 |
| torus | contour | amplitudeOnly | 0.2255 | 0.2255 | 0.257 | 0.2 |
| torus | contour | ampSpacing | 0.4123 | 0.4123 | 0.4365 | 0.39 |
| torus | contour | bundleCount | 0.3883 | 0.3883 | 0.4042 | 0.32 |
| torus | contour | bundleDither | 0.388 | 0.388 | 0.4031 | 0.32 |
| torus | contour | bundleEased | 0.3458 | 0.3458 | 0.361 | 0.35 |
| torus | contour | bundleHandoff | 0.3181 | 0.3181 | 0.3364 | 0.35 |
| torus | contour | bundleLozenge | 0.3205 | 0.3205 | 0.3371 | 0.37 |
| torus | contour | bundleSubNib | 0.3937 | 0.3937 | 0.4087 | 0.29 |
| torus | contour | contFieldFore | 0.2911 | 0.2911 | 0.2911 | 0.22 |
| torus | contour | contFieldQuant | 0.2811 | 0.2811 | 0.2819 | 0.24 |
| torus | contour | contFieldSigmoid | 0.2185 | 0.2185 | 0.2294 | 0.24 |
| torus | contour | contFieldSurface | 0.3745 | 0.3745 | 0.3745 | 0.36 |
| torus | contour | contFieldTouch | 0.5906 | 0.5906 | 0.5906 | 0.48 |
| torus | contour | deepFillTSP | 0.102 | 0.102 | 0.2004 | 0.07 |
| torus | contour | defectSplit | 0.4476 | 0.4476 | 0.4476 | 0.37 |
| torus | contour | dutyConst | 0.3077 | 0.3077 | 0.3077 | 0.24 |
| torus | contour | endShorten | 0.2268 | 0.2268 | 0.2268 | 0.34 |
| torus | contour | etfKang | 0.4693 | 0.4693 | 0.4693 | 0.46 |
| torus | contour | fineLadder | 0.1106 | 0.1106 | 0.2451 | 0.09 |
| torus | contour | interlockWeave | 0.4006 | 0.4006 | 0.4409 | 0.35 |
| torus | contour | isophoteWidth | 0.2401 | 0.2401 | 0.3023 | 0.21 |
| torus | contour | lozengeStipple | 0.1155 | 0.1155 | 0.2853 | 0.07 |
| torus | contour | mazeFill | 0.2926 | 0.2926 | 0.2926 | 0.22 |
| torus | contour | mezzoRegion | 0.4706 | 0.4706 | 0.4706 | 0.47 |
| torus | contour | mkDashRamp | 0.365 | 0.365 | 0.4955 | 0.54 |
| torus | contour | mkDotScreen | 0.417 | 0.417 | 0.474 | 0.28 |
| torus | contour | mkScribble | 0.3064 | 0.3064 | 0.4021 | 0.33 |
| torus | contour | mkTick | 0.1204 | 0.1204 | 0.1809 | 0.08 |
| torus | contour | nibAngle | 0.3009 | 0.3009 | 0.3613 | 0.31 |
| torus | contour | none | 0.0503 | 0.0892 | 0.1279 | 0.05 |
| torus | contour | onePenDown | 0.3969 | 0.3969 | 0.4275 | 0.39 |
| torus | contour | originSpiral | 0.5862 | 0.5862 | 0.5862 | 0.53 |
| torus | contour | penCross | 0.2869 | 0.2869 | 0.3305 | 0.23 |
| torus | contour | penFacing | 0.1866 | 0.1866 | 0.3314 | 0.15 |
| torus | contour | penInterleave | 0.2792 | 0.2792 | 0.424 | 0.23 |
| torus | contour | penPitchMatch | 0.2403 | 0.2403 | 0.433 | 0.18 |
| torus | contour | penReserve | 0.2837 | 0.2837 | 0.3871 | 0.2 |
| torus | contour | penStipple | 0.2585 | 0.2585 | 0.4272 | 0.2 |
| torus | contour | perceptualRamp | 0.1093 | 0.1093 | 0.2543 | 0.07 |
| torus | contour | phaseFineLadder | 0.111 | 0.111 | 0.2203 | 0.07 |
| torus | contour | taperedEnds | 0.2846 | 0.2846 | 0.3196 | 0.28 |
| torus | contour | trochoidLoop | 0.4267 | 0.4267 | 0.432 | 0.42 |
| torus | contour | turingStripe | 0.3838 | 0.3838 | 0.3838 | 0.27 |
| torus | contour | voronoiWeb | 0.2913 | 0.2913 | 0.2913 | 0.25 |
| torus | contour | weaveDepth | 0.4179 | 0.4179 | 0.4402 | 0.42 |
| torus | contour | weightModulated | 0.114 | 0.114 | 0.2236 | 0.08 |
| torus | contour | weightSmoothstep | 0.1137 | 0.1137 | 0.2231 | 0.08 |
| torus | contour | whiteBand | 0.302 | 0.302 | 0.3551 | 0.31 |
| torus | contourSlice | amplitudeOnly | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | ampSpacing | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | bundleCount | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | bundleDither | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | bundleEased | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | bundleHandoff | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | bundleLozenge | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | bundleSubNib | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | contFieldFore | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | contFieldQuant | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | contFieldSigmoid | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | contFieldSurface | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | contFieldTouch | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | deepFillTSP | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | defectSplit | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | dutyConst | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | endShorten | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | etfKang | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | fineLadder | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | interlockWeave | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | isophoteWidth | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | lozengeStipple | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | mazeFill | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | mezzoRegion | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | mkDashRamp | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | mkDotScreen | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | mkScribble | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | mkTick | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | nibAngle | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | none | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | onePenDown | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | originSpiral | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | penCross | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | penFacing | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | penInterleave | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | penPitchMatch | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | penReserve | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | penStipple | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | perceptualRamp | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | phaseFineLadder | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | taperedEnds | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | trochoidLoop | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | turingStripe | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | voronoiWeb | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | weaveDepth | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | weightModulated | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | weightSmoothstep | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | contourSlice | whiteBand | 0.1842 | 0.1842 | 0.1842 | 0.23 |
| torus | crosshatch | amplitudeOnly | 0.3241 | 0.3241 | 0.3848 | 0.23 |
| torus | crosshatch | ampSpacing | 0.5323 | 0.5323 | 0.5827 | 0.45 |
| torus | crosshatch | bundleCount | 0.5865 | 0.5865 | 0.6022 | 0.46 |
| torus | crosshatch | bundleDither | 0.587 | 0.587 | 0.6023 | 0.46 |
| torus | crosshatch | bundleEased | 0.5232 | 0.5232 | 0.5493 | 0.57 |
| torus | crosshatch | bundleHandoff | 0.4978 | 0.4978 | 0.5176 | 0.64 |
| torus | crosshatch | bundleLozenge | 0.549 | 0.549 | 0.5699 | 0.46 |
| torus | crosshatch | bundleSubNib | 0.6009 | 0.6009 | 0.6217 | 0.43 |
| torus | crosshatch | contFieldFore | 0.4432 | 0.4432 | 0.4456 | 0.26 |
| torus | crosshatch | contFieldQuant | 0.4472 | 0.4472 | 0.4522 | 0.27 |
| torus | crosshatch | contFieldSigmoid | 0.3677 | 0.3677 | 0.3805 | 0.23 |
| torus | crosshatch | contFieldSurface | 0.498 | 0.498 | 0.4973 | 0.28 |
| torus | crosshatch | contFieldTouch | 0.6811 | 0.6811 | 0.6811 | 0.39 |
| torus | crosshatch | deepFillTSP | 0.1565 | 0.1565 | 0.3216 | 0.15 |
| torus | crosshatch | defectSplit | 0.4476 | 0.4476 | 0.4476 | 0.37 |
| torus | crosshatch | dutyConst | 0.4624 | 0.4624 | 0.4624 | 0.37 |
| torus | crosshatch | endShorten | 0.33 | 0.33 | 0.33 | 0.48 |
| torus | crosshatch | etfKang | 0.4693 | 0.4693 | 0.4693 | 0.46 |
| torus | crosshatch | fineLadder | 0.2055 | 0.2055 | 0.4448 | 0.11 |
| torus | crosshatch | interlockWeave | 0.5538 | 0.5538 | 0.5811 | 0.47 |
| torus | crosshatch | isophoteWidth | 0.391 | 0.391 | 0.4671 | 0.53 |
| torus | crosshatch | lozengeStipple | 0.2024 | 0.2024 | 0.4547 | 0.12 |
| torus | crosshatch | mazeFill | 0.2926 | 0.2926 | 0.2926 | 0.22 |
| torus | crosshatch | mezzoRegion | 0.6033 | 0.6033 | 0.6033 | 0.49 |
| torus | crosshatch | mkDashRamp | 0.5649 | 0.5649 | 0.5965 | 0.55 |
| torus | crosshatch | mkDotScreen | 0.5846 | 0.5846 | 0.5875 | 0.51 |
| torus | crosshatch | mkScribble | 0.4951 | 0.4951 | 0.5525 | 0.51 |
| torus | crosshatch | mkTick | 0.1755 | 0.1755 | 0.3261 | 0.09 |
| torus | crosshatch | nibAngle | 0.4881 | 0.4881 | 0.5332 | 0.48 |
| torus | crosshatch | none | 0.0936 | 0.2561 | 0.3872 | 0.14 |
| torus | crosshatch | onePenDown | 0.5428 | 0.5428 | 0.5547 | 0.51 |
| torus | crosshatch | originSpiral | 0.5862 | 0.5862 | 0.5862 | 0.53 |
| torus | crosshatch | penCross | 0.338 | 0.338 | 0.4193 | 0.19 |
| torus | crosshatch | penFacing | 0.3216 | 0.3216 | 0.4629 | 0.14 |
| torus | crosshatch | penInterleave | 0.4862 | 0.4862 | 0.5564 | 0.38 |
| torus | crosshatch | penPitchMatch | 0.4258 | 0.4258 | 0.5533 | 0.44 |
| torus | crosshatch | penReserve | 0.3235 | 0.3235 | 0.4142 | 0.3 |
| torus | crosshatch | penStipple | 0.4392 | 0.4392 | 0.5579 | 0.4 |
| torus | crosshatch | perceptualRamp | 0.1855 | 0.1855 | 0.4015 | 0.12 |
| torus | crosshatch | phaseFineLadder | 0.1992 | 0.1992 | 0.395 | 0.11 |
| torus | crosshatch | taperedEnds | 0.4812 | 0.4812 | 0.5236 | 0.49 |
| torus | crosshatch | trochoidLoop | 0.5613 | 0.5613 | 0.5448 | 0.48 |
| torus | crosshatch | turingStripe | 0.3838 | 0.3838 | 0.3838 | 0.27 |
| torus | crosshatch | voronoiWeb | 0.2913 | 0.2913 | 0.2913 | 0.25 |
| torus | crosshatch | weaveDepth | 0.5604 | 0.5604 | 0.5833 | 0.51 |
| torus | crosshatch | weightModulated | 0.2206 | 0.2206 | 0.4011 | 0.13 |
| torus | crosshatch | weightSmoothstep | 0.2166 | 0.2166 | 0.395 | 0.13 |
| torus | crosshatch | whiteBand | 0.486 | 0.486 | 0.5317 | 0.5 |
| torus | hatch | amplitudeOnly | 0.2005 | 0.2005 | 0.2436 | 0.15 |
| torus | hatch | ampSpacing | 0.3709 | 0.3709 | 0.4091 | 0.36 |
| torus | hatch | bundleCount | 0.4441 | 0.4441 | 0.4708 | 0.39 |
| torus | hatch | bundleDither | 0.4454 | 0.4454 | 0.4708 | 0.38 |
| torus | hatch | bundleEased | 0.3884 | 0.3884 | 0.4242 | 0.47 |
| torus | hatch | bundleHandoff | 0.3754 | 0.3754 | 0.4028 | 0.51 |
| torus | hatch | bundleLozenge | 0.3989 | 0.3989 | 0.4281 | 0.34 |
| torus | hatch | bundleSubNib | 0.4686 | 0.4686 | 0.4979 | 0.35 |
| torus | hatch | contFieldFore | 0.2928 | 0.2928 | 0.2988 | 0.21 |
| torus | hatch | contFieldQuant | 0.2935 | 0.2935 | 0.2976 | 0.23 |
| torus | hatch | contFieldSigmoid | 0.233 | 0.233 | 0.2448 | 0.22 |
| torus | hatch | contFieldSurface | 0.342 | 0.342 | 0.342 | 0.25 |
| torus | hatch | contFieldTouch | 0.5757 | 0.5757 | 0.5757 | 0.45 |
| torus | hatch | deepFillTSP | 0.1031 | 0.1031 | 0.1983 | 0.11 |
| torus | hatch | defectSplit | 0.4476 | 0.4476 | 0.4476 | 0.37 |
| torus | hatch | dutyConst | 0.3077 | 0.3077 | 0.3077 | 0.24 |
| torus | hatch | endShorten | 0.2268 | 0.2268 | 0.2268 | 0.34 |
| torus | hatch | etfKang | 0.4693 | 0.4693 | 0.4693 | 0.46 |
| torus | hatch | fineLadder | 0.1253 | 0.1253 | 0.2892 | 0.08 |
| torus | hatch | interlockWeave | 0.4069 | 0.4069 | 0.4349 | 0.38 |
| torus | hatch | isophoteWidth | 0.2697 | 0.2697 | 0.3412 | 0.39 |
| torus | hatch | lozengeStipple | 0.1243 | 0.1243 | 0.2901 | 0.08 |
| torus | hatch | mazeFill | 0.2926 | 0.2926 | 0.2926 | 0.22 |
| torus | hatch | mezzoRegion | 0.4706 | 0.4706 | 0.4706 | 0.47 |
| torus | hatch | mkDashRamp | 0.4588 | 0.4588 | 0.4961 | 0.56 |
| torus | hatch | mkDotScreen | 0.471 | 0.471 | 0.4643 | 0.49 |
| torus | hatch | mkScribble | 0.3508 | 0.3508 | 0.4063 | 0.42 |
| torus | hatch | mkTick | 0.1088 | 0.1088 | 0.2001 | 0.07 |
| torus | hatch | nibAngle | 0.32 | 0.32 | 0.3513 | 0.34 |
| torus | hatch | none | 0.0673 | 0.1591 | 0.2488 | 0.1 |
| torus | hatch | onePenDown | 0.4003 | 0.4003 | 0.3954 | 0.42 |
| torus | hatch | originSpiral | 0.5862 | 0.5862 | 0.5862 | 0.53 |
| torus | hatch | penCross | 0.2364 | 0.2364 | 0.3157 | 0.18 |
| torus | hatch | penFacing | 0.2108 | 0.2108 | 0.3141 | 0.16 |
| torus | hatch | penInterleave | 0.3122 | 0.3122 | 0.4053 | 0.29 |
| torus | hatch | penPitchMatch | 0.288 | 0.288 | 0.4258 | 0.33 |
| torus | hatch | penReserve | 0.2641 | 0.2641 | 0.3418 | 0.23 |
| torus | hatch | penStipple | 0.3068 | 0.3068 | 0.4173 | 0.36 |
| torus | hatch | perceptualRamp | 0.1153 | 0.1153 | 0.25 | 0.09 |
| torus | hatch | phaseFineLadder | 0.1192 | 0.1192 | 0.249 | 0.09 |
| torus | hatch | taperedEnds | 0.335 | 0.335 | 0.3872 | 0.35 |
| torus | hatch | trochoidLoop | 0.4309 | 0.4309 | 0.3825 | 0.42 |
| torus | hatch | turingStripe | 0.3838 | 0.3838 | 0.3838 | 0.27 |
| torus | hatch | voronoiWeb | 0.2913 | 0.2913 | 0.2913 | 0.25 |
| torus | hatch | weaveDepth | 0.403 | 0.403 | 0.4155 | 0.43 |
| torus | hatch | weightModulated | 0.1358 | 0.1358 | 0.2599 | 0.09 |
| torus | hatch | weightSmoothstep | 0.1333 | 0.1333 | 0.2551 | 0.09 |
| torus | hatch | whiteBand | 0.3385 | 0.3385 | 0.3954 | 0.36 |
| torus | none | amplitudeOnly | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | ampSpacing | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | bundleCount | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | bundleDither | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | bundleEased | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | bundleHandoff | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | bundleLozenge | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | bundleSubNib | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | contFieldFore | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | contFieldQuant | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | contFieldSigmoid | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | contFieldSurface | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | contFieldTouch | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | deepFillTSP | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | defectSplit | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | dutyConst | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | endShorten | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | etfKang | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | fineLadder | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | interlockWeave | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | isophoteWidth | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | lozengeStipple | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | mazeFill | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | mezzoRegion | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | mkDashRamp | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | mkDotScreen | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | mkScribble | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | mkTick | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | nibAngle | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | none | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | onePenDown | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | originSpiral | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | penCross | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | penFacing | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | penInterleave | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | penPitchMatch | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | penReserve | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | penStipple | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | perceptualRamp | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | phaseFineLadder | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | taperedEnds | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | trochoidLoop | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | turingStripe | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | voronoiWeb | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | weaveDepth | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | weightModulated | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | weightSmoothstep | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | none | whiteBand | 0.0363 | 0.0363 | 0.0363 | 0.03 |
| torus | spiral | amplitudeOnly | 0.152 | 0.152 | 0.105 | 0.11 |
| torus | spiral | ampSpacing | 0.1646 | 0.1646 | 0.2086 | 0.12 |
| torus | spiral | bundleCount | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | bundleDither | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | bundleEased | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | bundleHandoff | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | bundleLozenge | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | bundleSubNib | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | contFieldFore | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | contFieldQuant | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | contFieldSigmoid | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | contFieldSurface | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | contFieldTouch | 0.1733 | 0.1733 | 0.3062 | 0.14 |
| torus | spiral | deepFillTSP | 0.107 | 0.107 | 0.1202 | 0.08 |
| torus | spiral | fineLadder | 0.1235 | 0.1235 | 0.1515 | 0.09 |
| torus | spiral | interlockWeave | 0.0966 | 0.0966 | 0.0892 | 0.07 |
| torus | spiral | isophoteWidth | 0.1213 | 0.1213 | 0.0892 | 0.1 |
| torus | spiral | lozengeStipple | 0.1293 | 0.1293 | 0.1462 | 0.09 |
| torus | spiral | mkDashRamp | 0.0808 | 0.0808 | 0.1251 | 0.05 |
| torus | spiral | mkDotScreen | 0.0808 | 0.0808 | 0.1251 | 0.05 |
| torus | spiral | mkScribble | 0.0808 | 0.0808 | 0.1251 | 0.05 |
| torus | spiral | mkTick | 0.0808 | 0.0808 | 0.1251 | 0.05 |
| torus | spiral | nibAngle | 0.1213 | 0.1213 | 0.0892 | 0.1 |
| torus | spiral | none | 0.0691 | 0.162 | 0.2543 | 0.13 |
| torus | spiral | onePenDown | 0.0966 | 0.0966 | 0.0892 | 0.07 |
| torus | spiral | penCross | 0.146 | 0.146 | 0.0886 | 0.09 |
| torus | spiral | penFacing | 0.1584 | 0.1584 | 0.1308 | 0.11 |
| torus | spiral | penInterleave | 0.1716 | 0.1716 | 0.1159 | 0.14 |
| torus | spiral | penPitchMatch | 0.1716 | 0.1716 | 0.1298 | 0.14 |
| torus | spiral | penReserve | 0.1716 | 0.1716 | 0.1205 | 0.14 |
| torus | spiral | penStipple | 0.1733 | 0.1733 | 0.1264 | 0.14 |
| torus | spiral | perceptualRamp | 0.1293 | 0.1293 | 0.1462 | 0.09 |
| torus | spiral | phaseFineLadder | 0.1293 | 0.1293 | 0.1462 | 0.09 |
| torus | spiral | taperedEnds | 0.1213 | 0.1213 | 0.0892 | 0.1 |
| torus | spiral | trochoidLoop | 0.0966 | 0.0966 | 0.0892 | 0.07 |
| torus | spiral | weaveDepth | 0.1682 | 0.1682 | 0.2137 | 0.12 |
| torus | spiral | weightModulated | 0.0918 | 0.0918 | 0.0892 | 0.07 |
| torus | spiral | weightSmoothstep | 0.0918 | 0.0918 | 0.0892 | 0.07 |
| torus | spiral | whiteBand | 0.1213 | 0.1213 | 0.0892 | 0.1 |
| torus | stipple | amplitudeOnly | 0.2383 | 0.2383 | 0.6551 | 0.21 |
| torus | stipple | ampSpacing | 0.2511 | 0.2511 | 0.7066 | 0.19 |
| torus | stipple | bundleCount | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | bundleDither | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | bundleEased | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | bundleHandoff | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | bundleLozenge | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | bundleSubNib | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | contFieldFore | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | contFieldQuant | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | contFieldSigmoid | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | contFieldSurface | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | contFieldTouch | 0.2636 | 0.2636 | 0.7111 | 0.23 |
| torus | stipple | deepFillTSP | 0.1795 | 0.1795 | 0.6747 | 0.16 |
| torus | stipple | fineLadder | 0.196 | 0.196 | 0.6996 | 0.13 |
| torus | stipple | interlockWeave | 0.1621 | 0.1621 | 0.5898 | 0.13 |
| torus | stipple | isophoteWidth | 0.2008 | 0.2008 | 0.5898 | 0.16 |
| torus | stipple | lozengeStipple | 0.2094 | 0.2094 | 0.6982 | 0.15 |
| torus | stipple | mkDashRamp | 0.1326 | 0.1326 | 0.6697 | 0.1 |
| torus | stipple | mkDotScreen | 0.1326 | 0.1326 | 0.6697 | 0.1 |
| torus | stipple | mkScribble | 0.1326 | 0.1326 | 0.6697 | 0.1 |
| torus | stipple | mkTick | 0.1326 | 0.1326 | 0.6697 | 0.1 |
| torus | stipple | nibAngle | 0.2008 | 0.2008 | 0.5898 | 0.16 |
| torus | stipple | none | 0.0537 | 0.2301 | 0.432 | 0.18 |
| torus | stipple | onePenDown | 0.1621 | 0.1621 | 0.5898 | 0.13 |
| torus | stipple | penCross | 0.227 | 0.227 | 0.5992 | 0.16 |
| torus | stipple | penFacing | 0.2455 | 0.2455 | 0.6881 | 0.19 |
| torus | stipple | penInterleave | 0.2617 | 0.2617 | 0.6711 | 0.23 |
| torus | stipple | penPitchMatch | 0.2617 | 0.2617 | 0.683 | 0.23 |
| torus | stipple | penReserve | 0.2617 | 0.2617 | 0.6733 | 0.23 |
| torus | stipple | penStipple | 0.2636 | 0.2636 | 0.6763 | 0.23 |
| torus | stipple | perceptualRamp | 0.2094 | 0.2094 | 0.6982 | 0.15 |
| torus | stipple | phaseFineLadder | 0.2089 | 0.2089 | 0.6981 | 0.15 |
| torus | stipple | taperedEnds | 0.2008 | 0.2008 | 0.5898 | 0.16 |
| torus | stipple | trochoidLoop | 0.1621 | 0.1621 | 0.5898 | 0.13 |
| torus | stipple | weaveDepth | 0.2597 | 0.2597 | 0.7094 | 0.22 |
| torus | stipple | weightModulated | 0.153 | 0.153 | 0.5898 | 0.13 |
| torus | stipple | weightSmoothstep | 0.153 | 0.153 | 0.5898 | 0.13 |
| torus | stipple | whiteBand | 0.2008 | 0.2008 | 0.5898 | 0.16 |
| torus | wireframe | amplitudeOnly | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | ampSpacing | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | bundleCount | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | bundleDither | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | bundleEased | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | bundleHandoff | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | bundleLozenge | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | bundleSubNib | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | contFieldFore | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | contFieldQuant | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | contFieldSigmoid | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | contFieldSurface | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | contFieldTouch | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | deepFillTSP | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | defectSplit | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | dutyConst | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | endShorten | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | etfKang | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | fineLadder | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | interlockWeave | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | isophoteWidth | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | lozengeStipple | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | mazeFill | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | mezzoRegion | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | mkDashRamp | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | mkDotScreen | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | mkScribble | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | mkTick | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | nibAngle | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | none | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | onePenDown | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | originSpiral | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | penCross | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | penFacing | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | penInterleave | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | penPitchMatch | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | penReserve | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | penStipple | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | perceptualRamp | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | phaseFineLadder | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | taperedEnds | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | trochoidLoop | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | turingStripe | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | voronoiWeb | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | weaveDepth | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | weightModulated | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | weightSmoothstep | 0.336 | 0.336 | 0.336 | 0.26 |
| torus | wireframe | whiteBand | 0.336 | 0.336 | 0.336 | 0.26 |
