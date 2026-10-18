# Legacy `.vectura` corpus

Real project files written by old builds. `tests/integration/legacy-vectura-corpus.test.js`
opens each one through the current file-open path and checks it migrates, draws and
matches a committed geometry summary (`tests/baselines/golden-values/legacy-vectura-corpus.json`).

Never edit these files. They are the point: bytes an old build wrote.

| File | Written by | Layers | How it was made |
|---|---|---|---|
| `0.5.42-harmonograph.vectura` | 0.5.42 | harmonograph | Copy of `examples/harmonograph-trinodal.vectura` |
| `0.5.47-petalis.vectura` | 0.5.47 | petalis (legacy type name) | Copy of `examples/petalis-bloom.vectura` |
| `0.5.55-rings.vectura` | 0.5.55 | rings | Copy of `examples/rings-collide.vectura` |
| `0.8.0-mixed.vectura` | v0.8.0 | wavetable, rings, spiral, mirror modifier group | Generated (below) |
| `0.8.0-organic.vectura` | v0.8.0 | petalisDesigner, flowfield, phylla | Generated |
| `1.0.0-mixed.vectura` | v1.0.0 | wavetable, rings, spiral, mirror modifier group | Generated |
| `1.0.0-organic.vectura` | v1.0.0 | petalisDesigner, flowfield, phylla | Generated |
| `1.1.61-shapepack.vectura` | 1.1.61 | shapePack | Copy of `user-presets/shape_pack/hexagonal_mosaic.vectura` (a full project saved by the app) |
| `1.2.0-curves.vectura` | v1.2.0 | wavetable, harmonograph, shapePack | Generated |
| `1.3.0-text.vectura` | v1.3.0 | text, harmonograph, shapePack | Generated |
| `1.3.35-scene-monolith.vectura` | 1.3.35 (commit `cb293a99`, on main; no tag) | monolith scene3d (format 1), lissajous | Generated |
| `1.4.0-mixed.vectura` | v1.4.0 | wavetable, rings, spiral, mirror modifier group | Generated |
| `1.4.0-scene.vectura` | v1.4.0 | scene3d tree (format 2), lissajous | Generated |

Files without `formatVersion` are format 0 (pre-1.3.x). Text first shipped in 1.3.0 and the
3D scene in 1.3.x; the 1.3.35 build is the last one before the scene tree (v1.3.56+), so
its scene is the inline monolith form that the open path now expands into a tree.

## How the generated files were made

A one-off script, run once on 2026-10-18 and not part of the suite (tests never read git
history):

1. `git archive <tag> -- index.html src | tar -x -C trees/<tag>` for v0.8.0, v1.0.0, v1.2.0,
   v1.3.0, v1.4.0 and commit cb293a99.
2. Load that old tree in jsdom with `tests/helpers/load-vectura-runtime.js`
   (`rootDir: trees/<tag>`, full stack) and boot that version's own `App`.
3. Add the layers through that version's `engine.addLayer(type)` (seeds 1000, 1001, ...;
   regenerate), plus `engine.addModifierLayer('mirror')` for the "mixed" recipe.
4. Save through that version's own `ui.saveVecturaFile()`; capture the JSON Blob it builds.

So every byte comes from the old serializer. Where an old build lacked a layer type,
`addLayer` fell back to its default type, which is why the files list what they contain,
not what was asked for.

To add a file: generate it the same way (or copy a real saved project), add a row here and
an `EXPECTED_TYPES` entry in the test, then regenerate the goldens.
