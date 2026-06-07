# User Presets

Drop `.vectura` files here to make them available as named presets in the gallery.

## Folder naming — MUST be camelCase

Each subfolder name must **exactly** match the layer `type` field inside the `.vectura` file (which is the same as the `preset_system` value in `src/config/presets.js`). Several names are camelCase — using the wrong case causes the build script to silently skip the file:

| Algorithm | Correct folder name |
|---|---|
| Shape Pack | `shapePack` |
| SVG Distort | `svgDistort` |
| Petalis Designer | `petalisDesigner` |
| Attractor | `attractor` |
| Boids | `boids` |
| Flow Field | `flowfield` |
| Grid | `grid` |
| Harmonograph | `harmonograph` |
| Hyphae | `hyphae` |
| Lissajous | `lissajous` |
| Pendula | `pendula` |
| Phylla | `phylla` |
| Rainfall | `rainfall` |
| Rings | `rings` |
| Spiral | `spiral` |
| Terrain | `terrain` |
| Topo | `topo` |
| Wavetable | `wavetable` |

## Adding a preset

1. Save or export a `.vectura` file from the app.
2. Place it in the matching `user-presets/<layerType>/` folder.
3. Run `npm run user-presets:bundle` to regenerate `src/config/user-presets.js`.

To override the display name, add a top-level `"name"` key to the `.vectura` JSON before bundling. Otherwise the filename stem is title-cased automatically.

## Adding a new algorithm

When a new algorithm is introduced, create `user-presets/<layerType>/` (exact camelCase match) with a `.gitkeep` at the same time as the algorithm PR.
