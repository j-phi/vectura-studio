# Paper textures: image papers and online collections

Custom papers ("My papers", v1.4.30) can be made from a photo or scan of paper. This page
covers the import pipeline, storage and portability, the online texture search, the curated
bundle script, and the collections that were considered and rejected.

## Image papers

**Pen / Paper ▸ Paper ▸ Texture… ▸ Upload image… / Search online textures…**

Import (`src/render/paper-image.js`, `Vectura.PaperImage.processImport`):

1. The file must really be PNG, JPEG or WebP (magic bytes; SVG, HTML and other `data:` types
   are refused), ≤ 40 MB. Its pixel size is read from the **header before anything is
   decoded** (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X): 16–16384 px per side and ≤ 64 MP in
   total, so a tiny file declaring a huge canvas (a decompression bomb) is refused without
   decoding. Embedded tiles (documents, exports) are capped at 2048 px per side the same way.
2. Decoded off the main thread (`createImageBitmap`; data URLs go through a Blob first),
   read back in 128-row strips and downscaled to a 2048 px working size. Every pixel pass is a
   row generator driven in ≤ 12 ms slices (`PaperImage.runSliced`), so a 4096 px import never
   blocks the UI (measured: longest task ≈ 60 ms, was 1.5 s). Closing the dialog aborts the
   processing. Transparent pixels are composited over white first.
3. Linear-light luminance, divided by a heavily blurred copy (σ ≈ 7 % of the image, mirrored
   borders) so lighting gradients and vignetting go; rescaled to mean 0.5.
4. Made tileable: a separable four-way cross-fade of the image and its half-offset copies
   (x, y, x+y) with weights `sin²` per axis, so every copy's own wrap seam sits exactly where its
   weight is zero — no seam at the tile edge and none through the centre. The blend is
   variance-preserving (deviation from the mean ÷ √Σw²), so cross-faded regions keep the
   paper's contrast instead of turning into soft blobs. (The first version weighted the offset
   copy by `max(dx, dy)`, which exposed its seam at the edge midpoints and showed a grid at A1;
   the test suite keeps it as a mutation witness.) Repetition at A1 is not randomised per tile:
   flipping or offsetting tiles would re-introduce seams; a larger `tileMm` or a bigger source
   image is the remedy.
5. An optional height/displacement map (or a provider's displacement map) goes through the
   same tiling; otherwise height is derived from the tile's fine detail.
6. The tile is encoded as grey WebP (JPEG fallback) ≤ 1024 px and ≤ 1.5 MB (halved until it
   fits). The photo's mean colour becomes the paper colour.

**Physical size.** The dialog asks for the scan resolution (default 300 dpi; mm per px =
25.4 / dpi) or the image width in mm. Provider metadata (ambientCG `dimensions`, cm) prefills
it; when a source states no size the dialog says so and pre-fills an estimate (≈ 300 mm for
watercolour/kraft/cardboard, ≈ 150 mm otherwise).

**Rendering** (`src/render/paper-texture.js`). A registered custom type with an `image` block
samples its maps in document millimetres (`tileMm` per tile, wrapping), from the mip level
nearest the chunk's px/mm (no aliasing when zoomed out). Albedo = the paper colour × a small
residual (`lum / mean − 1`), so the Color control re-tints the photo; height drives the same
emboss, dry-skip pits and bleed modulation as the procedural paper, with a gentler emboss.
Past the image's native resolution the procedural tooth is blended in and the chunk's fine
octave and fibre web keep the surface sharp. Papers without an image never enter this path
(None and the 10 procedural papers are byte-identical).

**Colour.** The texture is luminance-only: the photo's mean colour becomes the paper colour and
the tile is a light/dark residual on it, so the Color control re-tints it predictably.
Coloured flecks in recycled or confetti papers lose their hue (they keep their tone). A chroma
residual was considered but not added: it would only look right while the colour is unchanged,
and a re-tinted sheet with leftover original hues reads as a mistake.

**Storage and portability.** Library entries (`localStorage['vectura.customPapers']`) stay
small: an image paper stores `image: { ref, tileMm, w, h }`; the pixels live in IndexedDB
(`vectura-textures` / `textures`, `src/core/texture-store.js`) under a content ref. A document
embeds the tile in `settings.paper.custom.image.tile` (+ `height`), so it opens on any
machine. The default paper and the preference snapshot keep refs only and are re-hydrated from
IndexedDB on load. Library exports inline the pixels; imports re-validate every tile (format,
size, decode), store it in IndexedDB and keep the entry lean. Quota errors are reported.
Saving any image paper to My papers (Save as custom, Save to my papers, Update saved paper,
Texture…) stores the pixels **before** the library entry; if that fails nothing is saved. If a
library paper's image is not in this browser (cleared storage), the panel says **Texture image
missing** and offers **Re-upload image…** (same paper, new image) instead of silently showing
the base paper. Without IndexedDB (private mode / blocked storage) a new image paper is applied
to the open document only (embedded in the file) with a notice. Deleting a library paper deletes
its image once no library paper, open document or default paper references it. A library saved
in another tab appears via the `storage` event (images: re-checked on focus).
Validated tiles and their content refs are cached by string identity, so editing an image paper
(Advanced sliders) never re-validates or re-hashes the 1.5 MB tile (measured: ~18 ms per slider
input, was 360 ms).

**Attribution.** A texture from a collection keeps `source: { provider, providerId, assetId,
title, author, licence, licenceUrl, url, attribution }` (Openverse's ready-made attribution
string when present). It is shown in the Paper panel with a link to the source page, saved in
the `.vectura` custom block and in library exports. CC BY-SA textures carry a note: a paper
made from them stays under BY-SA.

## Online collections

Declarative records in `src/config/paper-texture-sources.js`, read by
`src/core/paper-texture-search.js` (parallel queries, 12 s timeout each, 5 min result cache,
https-only URLs, NC/ND/non-free licences dropped; HTTP 429 shows "Rate limited — try again
shortly"; ambientCG results are kept for the whole session; the absent bundle index is probed
once per session). Downloads use `fetch` in CORS mode. Results whose host is known to allow it
(upload.wikimedia.org, the bundle) carry a **Direct** badge. When a host refuses, Openverse
results retry through Openverse's own image proxy (`/v1/images/{id}/thumb/?full_size=true`,
labelled as possibly lower resolution; the parameter is from the API source, not verified live);
otherwise the card offers **Open source page** (new tab, `rel=noopener noreferrer`) and **Upload
the file**, which feeds the same pipeline and keeps the attribution. There is no third-party CORS
proxy. The licence is linked wherever it is shown (panel, dialog, result badges). ambientCG uses
the documented v3 API and falls back to the v2 `full_json` shape (observed live) when v3 fails or
changes shape.

| Collection | Search | Licence | Height maps | Notes |
|---|---|---|---|---|
| Openverse | `api.openverse.org/v1/images` (no key) | per item: CC0, PDM, CC BY, CC BY-SA | no | "Powered by Openverse"; originals on provider hosts (CORS varies) |
| ambientCG | `ambientcg.com/api/v3/assets` | CC0 | yes (Displacement) | preview maps direct; **High-res (ZIP)** unpacks the 2K zip in the browser (`DecompressionStream`) |
| Wikimedia Commons | MediaWiki API, `origin=*` | per file (free licences only) | no | Artist HTML stripped to text |
| Pexels | `api.pexels.com/v1/search` | Pexels Licence | no | needs the user's own key; "Photo by X on Pexels" |
| Unsplash | `api.unsplash.com/search/photos` | Unsplash Licence | no | needs the user's own key; hotlinks + `download_location` ping; "Photo by X on Unsplash" |
| Curated CC0 papers | same-origin `assets/paper-textures/index.json` | CC0 | some | appears only when a maintainer has fetched the bundle |

API keys are pasted in the search sheet (API keys), stored in `localStorage['vectura.textureKeys']`
in this browser only, and never exported.

**Verification status (v1.4.30).** The build container could not reach any provider. The
ambientCG v2 response shape was fetched once; every provider is otherwise **mock-tested only**
(see PRH-043 for the live check).

### Rejected collections

| Collection | Reason |
|---|---|
| ShareTextures | Terms forbid automated downloads, hotlinking and embedding downloads in apps |
| Pixabay | No permanent hotlinking; key required; large images capped at 1280 px |
| Poly Haven | No paper textures (fabric only) |
| cgbookcase | No paper category, no API |
| FreePBR | Not an open licence (commercial use is paid), no API |
| Smithsonian Open Access | Needs a key; little blank-paper material |
| Flickr API | Needs a key; open-licence photos are covered by Openverse |

## Curated bundle (maintainers)

`src/config/paper-texture-bundle.js` lists ~48 CC0 candidates (ambientCG Paper001–006 and
Cardboard001–004, TextureCan Paper 0001–0037, 3DTextures Watercolor Paper 001). No image files
are committed. To build the bundle locally:

```bash
node scripts/fetch-paper-textures.js --dry-run          # list entries + landing pages
npm i -D sharp                                          # optional: downscale to ≤ 2048 px WebP + thumbnails
node scripts/fetch-paper-textures.js                    # ambientCG + reviewed TextureCan entries
node scripts/fetch-paper-textures.js --include-review   # also the TextureCan entries flagged for review
```

The script checks each file is a real PNG/JPEG/WebP and that the licence **the manifest
declares** is on the allowlist, then fetches each landing page and skips entries whose page does
not mention that licence (`--trust-manifest` keeps them with a warning). This is a sanity check,
not legal verification: re-check each landing page by eye before shipping. It writes
`assets/paper-textures/index.json` (`albedo`, `heightMap`, `thumb`, real output `width`/`height`). `manual` entries (no stable direct URL) are downloaded by hand into
`assets/paper-textures/<id>.jpg` and added to the index. TextureCan entries flagged `review`
may be printed wrapping-paper patterns rather than blank paper.
