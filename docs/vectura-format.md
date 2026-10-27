# The `.vectura` File Format

A `.vectura` file is a JSON document. Two kinds exist, sharing the `type: 'vectura'`
marker and the `formatVersion` schema field (AUD-02):

## Project files (Save / Open)

Written by `saveVecturaFile` (`src/ui/ui-file-io.js`), read by `openVecturaFile`.

```jsonc
{
  "type": "vectura",
  "version": "1.3.0",          // cosmetic app-version display string — never compared
  "created": "2026-07-18T…",
  "state": {
    "engine": {
      "formatVersion": 1,       // SCHEMA version — the field that is compared on load
      "activeLayerId": "…",
      "layers": [ /* full layer dumps: params, paramStates, masks, fills, … */ ]
    },
    "settings": { /* SETTINGS snapshot */ },
    "selectedLayerId": "…",
    "selectedLayerIds": []
  },
  "images": { /* noise-image payloads */ }
}
```

### `settings.paper` (paper selector, v1.4.20)

Additive field; the format version is unchanged.

```jsonc
"settings": {
  "paper": { "type": "cold-press", "color": "#f7f2e6", "texture": 0.7, "bleed": 0.55, "seed": 1 },
  "bgColor": "#f7f2e6"   // still written: the paper colour, for older builds
}
```

- `type` is a key of `Vectura.PAPERS.TYPES` (`src/config/papers.js`); unknown → `none`.
- `color` is a strict hex colour (anything else falls back to `bgColor`, then the stock colour).
- `texture` / `bleed` are 0..1; `seed` is a positive integer (texture grain).
- On open: `settings.paper` > legacy `settings.bgColor` (opens as a plain `none` sheet) >
  the user's default paper > the built-in default (`Vectura.Paper.resolveProjectPaper`).
- Paper is a canvas preview only; SVG export never includes it.

#### `settings.paper.custom` (custom papers, v1.4.30)

A project on a custom paper ("My papers") carries the paper's realism with it, so the file
opens identically on a machine whose library does not have it:

```jsonc
"paper": {
  "type": "custom-k3j9x2a",            // /^custom-[a-z0-9]{1,24}$/
  "color": "#f6f1e4", "texture": 0.8, "bleed": 0.4, "seed": 1,
  "custom": {
    "name": "Arches 300 lb rough",     // ≤ 48 chars, control characters stripped
    "base": "rough",                    // the built-in type it started from
    "color": "#f6f1e4",                 // its stock colour
    "params": { "grainMm": 2.3, "grainAngle": 0.5, "grainStretch": 1.3, "tooth": 0.52,
                "fiberDensity": 0.14, "fiberLenMm": 2.6, "fiberTone": 0.35, "speckle": 0,
                "mottle": 0.28, "absorbency": 0.6, "bleedMm": 0.13, "feather": 0.4,
                "dryskip": 0.62, "inkOpacity": 0.93 }
  }
}
```

- `custom` is written whenever `type` is a custom id and read by `Vectura.Paper.normalize`:
  unknown keys are dropped, every param is clamped to `PAPERS.PARAM_LIMITS` (non-numbers
  take the base type's value), the colour must be a strict hex.
- On open the embedded block is registered as `PAPERS.TYPES[type]` (`Paper.registerCustomType`)
  and **wins over a library entry with the same id**; the Paper panel then shows
  "From file — Save to my papers" (or "Changed from your saved paper").
- Older builds keep the `type` verbatim and render a plain sheet in `color`.
- The same block is embedded in the stored default paper (`vectura.paperDefault`).
- **Image papers** add `custom.image = { ref, tileMm, w, h, tile, height? }`: `tile`/`height`
  are base64 PNG/JPEG/WebP data URLs (≤ 1.5 MB, magic bytes checked; anything else rejects the
  block), `ref` is the content hash `img-…` (recomputed from the tile), `tileMm` the physical
  tile width (5–2000 mm). Texture attribution goes in `custom.source = { provider, providerId,
  assetId, title, author, licence, licenceUrl, url, attribution }` (https URLs only). The stored
  default and library entries keep `{ ref, tileMm, w, h }` only (pixels in IndexedDB); library
  exports inline them again. See `docs/paper-textures.md`.

### My papers library file (`vectura-papers`, v1)

`localStorage['vectura.customPapers']` and the Export / Import files share one shape
(`src/core/user-library-store.js`, `Vectura.Paper.customLibrary()`):

```jsonc
{ "schema": "vectura-papers", "version": 1, "appVersion": "1.4.30",
  "papers": [ { "id": "custom-k3j9x2a", "name": "…", "base": "rough", "color": "#f6f1e4",
                "defaultTexture": 0.8, "defaultBleed": 0.4, "params": { /* as above */ } } ] }
```

Import (merge only): papers files with images may be up to 64 MB (each tile re-validated,
decoded and stored in IndexedDB; an unusable image rejects that paper); without images, files
over 512 KB, invalid JSON, another `schema`, a higher `version`
or no papers are refused with a message; each paper is rebuilt from whitelisted keys
(malformed ids get a fresh `custom-xxxxxxx`); content identical to a saved paper is
skipped; a clashing id gets a new id and a clashing name becomes "Name (2)". At most 64
papers. Storage failures (quota, private mode) are reported, never thrown.

### Pen model fields in `settings.pens[]` (pen models, v1.4.31)

Additive; the format version is unchanged. A plain pen keeps exactly
`{ id, name, color, width, lineCap?, themeManaged? }` (byte-identical to older
files). A model pen adds:

```jsonc
{ "id": "pen-2", "name": "Pen 2", "color": "#1c1c1e", "width": 0.85,
  "model": "pentel-sign-pen",            // Vectura.PEN_MODELS id (/^[a-z0-9-]{1,48}$/)
  "size": "fine fibre",                  // a size label of the model, or "custom"
  "effect": "metallic",                  // optional special ink (metallic, dual-metallic,
                                         //   fluorescent, glow, glitter, white)
  "color2": "#dfe2e8",                   // optional second ink colour (dual metallic)
  "ink": { "wetness": 0.7, "roughness": 0.2, "opacity": 0.9,
           "blobs": 1.2, "skips": 0.02, "jitter": 0.05 } }  // overrides only
```

- `width` is the plotted width; picking a model / size writes the size's laid
  width there, and the SVG export plots it. Nothing else reaches the SVG
  (a pen group gets `data-vectura-pen-model` / `data-vectura-ink-effect` only
  when set).
- Validation (`Vectura.PenValidate.validatePen`, also used for the preference
  snapshot): invalid fields are dropped; an unknown `model` id is kept (and
  drawn as a plain pen) so files from newer builds round-trip; `ink` keeps only
  `PEN_MODELS.INK_KEYS` with finite values clamped to `PARAM_LIMITS`
  (`effectStrength` 0–1 and `flakeDensity` 0–600 flakes/mm² tune the
  special-inks layer).
- `effect` works on any pen (plain or model); a model's own default effect
  applies when it is unset. `"effect": "plain"` is kept only on a model pen:
  it switches the model's built-in special ink off (Ink settings ▸ No special
  ink on a Gelly Roll Metallic, Moonlight, …). `color2` is normalised to
  `#rrggbb` (`#rgb` expanded, an alpha byte dropped). For `glow`, `color2` is the emission colour shown
  with **View ▸ Lights Off** (default `#7dff9a`); for `dual-metallic` it is the
  second (flake) colour. "Lights off" itself is view state and is never saved.
- Older builds ignore the extra keys and draw a plain pen at `width`.

### Pen files and My pens (`vectura-pens`, v1.4.32)

Pens ⋯ ▸ **Export pens** (and Ink settings ▸ **Export this pen**) download:

```jsonc
{ "schema": "vectura-pens", "version": 1, "appVersion": "1.4.32",
  "pens": [
    { "name": "Gold", "color": "#c9a24a", "width": 0.55, "effect": "metallic" },
    { "name": "Signo white", "color": "#f6f6f2", "width": 0.7,
      "model": "uniball-signo-broad-um153", "size": "1.0", "effect": "white",
      "ink": { "opacity": 0.8, "effectStrength": 0.6 } } ] }
```

- A file pen has the pen fields above without `id` / `themeManaged`
  (`lineCap`, `model`, `size`, `effect`, `color2`, `ink` only when set).
- **Import pens…** (`Vectura.PenLibrary.parseImport`): ≤ 256 KB, ≤ 64 pens;
  `schema` must be `vectura-pens`; a higher major `version` is refused with a
  message (update the app). Each pen is re-validated by
  `PenValidate.validatePen` (invalid pens are skipped and counted, and so is
  a width outside 0 < w ≤ 20 mm — never clamped); names are control- and
  bidi-override-stripped plain text, capped at 48 characters and always rendered
  escaped. Imported pens are **added** with fresh `pen-xxxxxxx` ids (never
  overwriting a pen) in one undo step.
- **My pens** is the same document in `localStorage["vectura.penLibrary"]`
  (`Vectura.UserLibraryStore`; entries get `mypen-xxxxxxx` ids; ≤ 128 pens;
  a full or blocked storage is reported, never thrown). It is not cleared by
  "Clear saved preferences".

## Preset files (`user-presets/<type>/*.vectura`)

Written by `PresetSync.buildDoc` (`src/ui/preset-sync.js`), read by `parseDoc` and the
bundler (`scripts/build-user-presets.js`).

```jsonc
{
  "type": "vectura",
  "version": "1.3.0",           // cosmetic
  "formatVersion": 1,           // schema version (top level — presets have no state.engine)
  "name": "…",
  "meta": { "presetId": "…", "group": "…", "system": "…", "savedAt": 0 },
  "layers": [{ "type": "…", "params": { } }]
}
```

## `formatVersion` semantics

- **Current version: 1** — `Vectura.VECTURA_FORMAT_VERSION`, defined next to the
  migration table in `src/core/engine.js`.
- **Absent field = version 0** (legacy, pre-1.3.x). Version 0 is byte-identical to
  version 1 except for the field itself; the 0→1 migration is a no-op.
- **Older files** are upgraded on load by `migrateEngineState` in `src/core/engine.js`:
  `STATE_MIGRATIONS[n]` transforms a version-`n` payload to version `n+1`, and
  `importState` walks the chain. When `exportState`'s shape changes incompatibly, bump
  `VECTURA_FORMAT_VERSION` and add the migration step there — that is the only place a
  format change lives.
- **Newer files** (`formatVersion` greater than the app knows) load best-effort:
  migrations don't run, unknown params flow through the existing sanitizers, and
  `openVecturaFile` shows a non-blocking warning toast ("saved by a newer version …").

Regression coverage: `tests/unit/vectura-format-version.test.js` and
`tests/integration/vectura-format-version.test.js`.
