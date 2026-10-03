# Real-device checklist (D8)

Rows below come from TUX-007, TUX-013, TUX-015 and TUX-036. TUX-062 consolidates this file.

| # | Device | Check | Source |
|---|--------|-------|--------|
| TUX-007-a | iPhone, landscape, Safari toolbar shown | The canvas fills at least half of the screen. The rail is one row. No rail, modifier or context-bar button is covered. Status: pending. | TUX-007 |
| TUX-007-b | iPhone, landscape, Safari toolbar hidden (full screen) | Same checks as TUX-007-a. The canvas fills at least 60 % of the screen. Status: pending. | TUX-007 |
| TUX-007-c | iPhone with Dynamic Island, landscape, island on the left, then rotate so it is on the right | The rail, the modifier column and the formula chip stay clear of the island and the home indicator on both sides. Status: pending. | TUX-007 |
| TUX-007-d | iPhone, landscape | Safe-area insets (left and right about 62 px, bottom about 21 px): no tool button sits inside the inset band. Status: pending. | TUX-007 |
| TUX-007-e | iPhone, landscape | Collapse and expand the Safari URL bar while editing. The art does not jump after the first fit, unless the person pinched or panned (CODE-040). Status: pending. | TUX-007 |
| TUX-007-f | iPhone, landscape | Select the Type tool and open the keyboard. The canvas stays visible (TUX-032). Status: deferred-by-Jay unless verified. | TUX-007, TUX-032 |
| TUX-007-g | iPhone | Rotate portrait to landscape and back with a layer selected. The art stays in view and no handle error appears. Status: pending. | TUX-007 |
| TUX-013-a | iPhone, standalone home-screen app, portrait | The tool rail is 52 px or less, directly under the header, and clear of the Dynamic Island. | TUX-013 |
| TUX-013-b | iPad, standalone, portrait | The tool rail is one row. Tap `⋯` and pick a tool from the drawer. | TUX-013 |
| TUX-013-c | iPhone and iPad | Long-press on a rail button: no iOS callout, no text loupe. | TUX-013, TUX-014 |
| TUX-015-a | iPhone, portrait and landscape, Safari toolbar shown and hidden | Open the All Tools drawer. It stays inside the visible area. It clears the notch and the home indicator. Status: deferred-by-Jay unless verified. | TUX-015 |
| TUX-015-b | iPhone and iPad | Drag inside the drawer body. It scrolls with momentum. The page behind does not scroll. Status: deferred-by-Jay unless verified. | TUX-015 |
| TUX-015-c | iPad, portrait | The drawer opens below the horizontal rail. Every tool is fully tappable. Status: deferred-by-Jay unless verified. | TUX-015 |
| TUX-016-a | iPad, landscape | Drag the floating toolbar grip and the ctxbar grip 10 times each. Each bar follows the finger with no page bounce, edge-swipe or back gesture, and no later touch moves a bar. Status: pending. | TUX-016 |
| TUX-036-a | iPhone and iPad | Modifier buttons do not keep an iOS sticky-hover state. Status: deferred-by-Jay unless verified. | TUX-036 |
| TUX-036-b | iPhone and iPad | A gallery row selects on the first tap. No hover-only first tap. Status: deferred-by-Jay unless verified. | TUX-036 |
| TUX-036-c | iPad with trackpad | A finger tap on an inactive layer row never fires a hidden action. Status: deferred-by-Jay unless verified. | TUX-036 |
| TUX-036-d | iPad with Apple Pencil | Pencil hover reveal leaves no visible-but-inert buttons. Status: deferred-by-Jay unless verified. | TUX-036 |
