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
