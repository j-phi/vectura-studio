# voronoiWeb — live visual evidence

Shot in the real app (Playwright against `python3 -m http.server 8406` serving this
worktree), not in the vitest harness. Reproduce with:

```bash
python3 -m http.server 8406          # from this worktree
node scripts/voronoi-evidence.js
```

Fixture: a 46 mm sphere, orthographic camera front-on, one directional light at
azimuth 90 / elevation 30, `toneLaw: 'voronoiWeb'`, `fillDensity: 60`, pen 0.3 mm.
The highlight therefore sits up and to the right, the terminator down and to the left.

| File | What it shows |
|---|---|
| `1-full-sphere.png` | The whole form. One unbroken web; the cell-size gradient runs smoothly from the small cells at the lower left to the large open cells at the upper right. |
| `2-crop-shadow.png` | Equal window centred at (0.20 W, 0.70 H) — inside the terminator. |
| `3-crop-highlight.png` | The same window centred at (0.74 W, 0.30 H) — on the lit side. |
| `stats.json` | Path/ink counts of the shot frame, and the measured screen bbox. |

The two crops are the same size at the same zoom, so the cell-size difference between
them is the tone. The numbers behind them are asserted in
`tests/unit/scene3d-voronoi-web-integrity.test.js`.
