# Pen models

Vectura's pens are plain colour + diameter pens by default. A pen can also name
a **pen model**: a real plotter pen whose ink behaviour the preview imitates
(laid width, edge bleed, blobs, skips, opacity). The catalogue lives in
`src/config/pen-models.js` (`Vectura.PEN_MODELS`); the pen × paper maths in
`src/core/pen-model.js` (`Vectura.PenModel`); the drawing in
`src/render/ink-renderer.js` (`Vectura.InkRenderer`).

Everything here is **preview only**. SVG export plots each pen as a stroke in
`pen.color` at `pen.width`; picking a model and size writes the size's *laid*
width (what the pen really puts on paper) to `pen.width`, so the plot and the
preview agree. Ink effects never reach the SVG.

## Where the numbers come from

The 0..1 parameters are estimates worked back from macro photos, plotter-artist
write-ups and reviews, not lab measurements. Fineliner widths are the makers'
published line widths (high confidence); gel pens lay about 0.65× the ball
size (±25 %). Each model carries a `confidence` (0.25–0.75): treat anything
under 0.5 as a plausible starting point, and use the ink-settings sliders to
match your own pen.

Key sources: Evil Mad Scientist wiki "Pens for AxiDraw"; Dirt Alley Design
(favourite pens, CMYK with all the pens); penplotterartwork.com (Gelly Roll,
Posca); lostpixels.io (fountain pens on plotters); Tyler Hobbs' essay on
plotting; A. Blair Neal; the ZSA blog; softsolder (Micron widths); r/PlotterArt;
white-pen tests (BoingBoing, TinkerLab, unsharpen, Parkablogs); macro reviews
(The Pen Addict, The Gentleman Stationer, The Well-Appointed Desk, Little
Coffee Fox).

| Model id | Pen | Ink | Laid widths (mm) | Confidence | Sources |
|---|---|---|---|---|---|
| `sakura-pigma-micron` | Sakura Pigma Micron | pigment-fineliner | 003 0.17, 005 0.22, 01 0.27, 02 0.32, 03 0.36, 05 0.46, 08 0.55, 1 0.65 | 0.75 | [1](https://softsolder.com/wp-content/uploads/2017/12/img_20171224_124700-mpcnc-sakura-micron-black-pen-widths.jpg) [2](https://softsolder.com/wp-content/uploads/2017/12/img_20171224_124625-mpcnc-sakura-micron-08-black-detail.jpg) [3](https://softsolder.com/wp-content/uploads/2017/12/img_20171224_124635-mpcnc-sakura-micron-005-black-detail.jpg) |
| `rotring-isograph` | Rotring Isograph / Rapidograph technical pen | technical-pen | 0.1 0.12, 0.18 0.2, 0.25 0.27, 0.35 0.37, 0.5 0.52, 0.7 0.72, 1.0 1.02 | 0.55 | [1](https://images.squarespace-cdn.com/content/v1/5005c8fc84ae929b37214ebd/1457701895537-T067FKCVMLDVBH0958ON/image-asset.jpeg) [2](https://images.squarespace-cdn.com/content/v1/5005c8fc84ae929b37214ebd/1457702048954-DRPMIS5PSV09V0JVXRDF/image-asset.jpeg) |
| `stabilo-point-88` | Stabilo Point 88 | dye-fineliner | 0.4 0.48 | 0.6 | [1](https://cdn.shopify.com/s/files/1/1622/4127/files/stabilofinepoint_1024x1024.jpg?v=1590347983) [2](https://cdn.shopify.com/s/files/1/1622/4127/files/may-1-cmyk-rainbow-1_1024x1024.jpg?v=1590348987) [3](https://cdn.shopify.com/s/files/1/1622/4127/products/blue_diamond_stars_white_balance_brighter_1024x1024.jpg?v=1610174660) |
| `pentel-sign-pen` | Pentel Sign Pen S520 | dye-fineliner | fine fibre 0.85 | 0.45 | [1](https://images.squarespace-cdn.com/content/v1/5349ba13e4b095a3fb0ba65c/6275e546-a305-466f-a19f-06e82ddbf99f/Pentel-Sign-Pen-Tip-Writing-Samples.jpg) [2](https://images.squarespace-cdn.com/content/v1/5349ba13e4b095a3fb0ba65c/94ff287b-be19-4e50-bceb-59d9a390ca41/Pentel-Sign-Pen-Planner.jpg) |
| `sharpie-ultra-fine` | Sharpie Ultra Fine Point permanent marker | alcohol-marker | Ultra Fine 0.65, Extra Fine 0.7 | 0.55 | [1](https://lh6.googleusercontent.com/-FbvOqcKb2y4/VHCXgjCXH7I/AAAAAAAA0X8/Nmq7YNrvIr0/w500/sharpie.jpg) [2](https://lh3.googleusercontent.com/-GRANMoAEGoI/UygQwm8QEvI/AAAAAAAAONk/Dbr4k5ykkT0/w500/seah-st.jpg) |
| `pilot-precise-v5-v7` | Pilot Precise V5/V7 & Hi-Tecpoint V5/V7 (liquid ink) | liquid-rollerball | V5 (0.5) 0.33, V7 (0.7) 0.45 | 0.5 | [1](https://blog.zsa.io/cdn-cgi/image/fit=scale-down,quality=80,format=auto,width=2080/zsa-loves-pen-plotting/16.jpg) [2](https://blog.zsa.io/cdn-cgi/image/fit=scale-down,quality=80,format=auto,width=2080/zsa-loves-pen-plotting/17.jpg) [3](http://farm5.static.flickr.com/4108/5068250333_8f517908eb_b.jpg) |
| `pilot-kakuno-fountain` | Pilot Kakuno / Metropolitan (fountain, sheen inks) | fountain-dye | EF 0.3, F 0.38, M 0.5 | 0.55 | [1](https://res.cloudinary.com/dtz3cezyb/image/upload/c_limit,w_1920/f_auto/q_auto/v1/DSCF_0808_1d51909c1d?_a=BAVAZGID0) [2](https://res.cloudinary.com/dtz3cezyb/image/upload/c_limit,w_1920/f_auto/q_auto/v1/DSCF_0788_9f19236292?_a=BAVAZGID0) [3](https://res.cloudinary.com/dtz3cezyb/image/upload/c_limit,w_1920/f_auto/q_auto/v1/DSCF_0809_160a526814?_a=BAVAZGID0) |
| `sakura-gelly-roll-classic` | Sakura Gelly Roll Classic (incl. white) | gel | 05 0.25, 06 0.3, 08 0.4, 10 0.5 | 0.7 | [1](https://penplotterartwork.com/wp-content/uploads/2021/10/floris_generative_truchet_tiles-1024x1024.jpg) [2](https://penplotterartwork.com/wp-content/uploads/2021/10/generative_michelle_chandra-1024x1024.jpg) [3](https://penplotterartwork.com/wp-content/uploads/2021/10/diana_generative_white_gelly_roll-1024x1018.jpg) |
| `uniball-signo-broad-um153` | Uni-ball Signo Broad UM-153 (white / gold / silver) | gel | 1.0 0.7 | 0.6 | [1](https://www.parkablogs.com/sites/default/files/2025/white-uniball-signo-broad-02.jpg) [2](https://tinkerlab.com/wp-content/uploads/2015/05/white-pen-on-black-paper-drawing.jpg) [3](https://images.squarespace-cdn.com/content/v1/5005c8fc84ae929b37214ebd/1433738195562-E8ASTRQCSE4K2HO8THBE/image-asset.jpeg) |
| `sakura-gelly-roll-metallic` | Sakura Gelly Roll Metallic | metallic-gel | 08 0.45, 10 0.55 | 0.65 | [1](https://penplotterartwork.com/wp-content/uploads/2021/10/vernon_miller_generative_landscape-1024x1024.jpg) [2](https://penplotterartwork.com/wp-content/uploads/2021/10/adam_generative_rainbow_gelly_rolls-1024x1024.jpg) [3](https://cdn.shopify.com/s/files/1/1622/4127/files/kickstarter_header_1024x1024.jpg?v=1579407014) |
| `pentel-hybrid-dual-metallic` | Pentel Hybrid Dual Metallic K110 | metallic-gel | 1.0 0.55 | 0.55 | [1](https://cdn.shopify.com/s/files/1/1622/4127/files/penteldualhybrid_8e141efa-cd0c-4043-8ea5-e6e776a06f87_1024x1024.jpg?v=1590347164) [2](https://i0.wp.com/www.wellappointeddesk.com/wp-content/uploads/2026/04/IMG_1437.jpeg?resize=1000%2C750&ssl=1) [3](https://unsharpen.com/wp-content/uploads/Sparkle-Scan-1024x703.jpg) |
| `sakura-gelly-roll-moonlight` | Sakura Gelly Roll Moonlight (fluorescent) | fluorescent-gel | 06 0.3, 08 0.4, 10 0.5 | 0.45 | [1](https://www.royaltalens.com/cdn/shop/collections/gelly-roll-moonlight-573878.jpg?v=1750230008&width=800) [2](https://ablairneal.com/wp-content/uploads/2023/03/IMG_0902-scaled.jpeg) |
| `sakura-gelly-roll-stardust` | Sakura Gelly Roll Stardust (glitter) | glitter-gel | 10 (bold) 0.5, fine 0.42 | 0.4 | [1](https://unsharpen.com/wp-content/uploads/Sparkle-Scan-1024x703.jpg) [2](https://cdn.modulor.de/products/d22kz/1_768_768_r_sakura_glitter_gelroller_stardust.jpg) |
| `uni-posca-pc1mr` | Uni Posca PC-1MR / PC-1M / PC-3M | paint-marker | PC-1MR (0.7 pin) 0.8, PC-1M (0.7-1.0 bullet) 1.0, PC-3M (0.9-1.3) 1.3 | 0.6 | [1](https://penplotterartwork.com/wp-content/uploads/2021/09/space_rays_generative_art-1024x1024.jpg) [2](https://penplotterartwork.com/wp-content/uploads/2021/09/warp_drive_generative_art_2-1024x1024.jpg) [3](https://penplotterartwork.com/wp-content/uploads/2021/09/space_rays_code_art_mac1-1024x1024.jpg) |
| `glow-phosphorescent-marker` | Phosphorescent marker (Glow-Writer, Markal, glow paint in a tech pen) | paint-marker | fine nib 0.9 | 0.25 | [1](https://www.2spi.com/catalog/items/04962-AB.jpg) [2](https://cdn.hackaday.io/images/resize/600x600/1091971578962718025.png) [3](https://www.youtube.com/watch?v=jDtk6HzuQ1o) |

Deferred models (logged as PRH-110): brush pens (Pentel Pocket Brush, Tombow
Fudenosuke — pressure-driven width needs a speed/pressure model), the HP
7475A fibre pens, and the remaining fineliner and gel variants in the research
set.

## Model fields

| Field | Meaning |
|---|---|
| `sizes[]` | `{ label, nominalWidthMm, laidWidthMm }`; picking a size writes `laidWidthMm` to `pen.width` |
| `absorbentWidthGainMm` | extra width on absorbent paper |
| `opacity` / `coverOnDark` | coverage on light / dark stock |
| `blend` | `multiply` (translucent dye) or `source-over` (opaque gel, paint) |
| `overlapDarkening` | how much crossings darken |
| `edge { roughness, scaleMm }` | edge lumpiness and its scale |
| `bleed { wetness, featherResponse }` | how much the ink wicks into the sheet |
| `dryskipResponse` | how much paper tooth breaks the line |
| `startBlob`, `endPool`, `cornerPool` | ink pooled at pen-down, lift and turns |
| `starvation { lengthMm, strength }` | thinning along one long stroke |
| `skip { rate, lengthMm }` | fraction of the line skipped and the gap length |
| `widthJitter { amount, scaleMm }` | slow width wobble |
| `nibDirectional` | fountain nib: width varies with stroke direction |
| `effect`, `fx` | default special ink and its parameters (metallic, glitter, …); effects render as their base ink for now |

## Pen × paper

Pen fields scale the paper's (`src/config/papers.js`). With `bleed` the
paper's Ink bleed slider and `wet` the pen's wetness (model value or the
pen's Bleed override):

```
laidW   = pen.width + absorbency · bleed · absorbentWidthGainMm · (wet / model wetness)
feather = paper.feather · featherResponse · (0.5 + wet)
edgeAmp = ½ · laidW · roughness · (0.5 + feather) · (0.3 + 1.4 · bleed)   (0.35 on paper None)
alpha   = dark stock ? coverOnDark · (opacity / model opacity) : opacity
```

A plain pen on realistic paper uses `PEN_MODELS.PLAIN_TRAITS` (a light
fibre-tip default) so its edges bleed too. A plain pen on paper **None** is
never touched: it draws through the exact pre-model renderer path.

## Ink settings (per pen)

The ink-settings popover writes overrides to `pen.ink` (each replaces the
model default; Reset removes them): Bleed (`wetness`), Edge roughness
(`roughness`), Opacity, Blobs & pools (`blobs`, a multiplier), Skips
(`skips`, the skip rate) and Width jitter (`jitter`). Limits are in
`PEN_MODELS.PARAM_LIMITS`; the validator clamps imported values to them.
