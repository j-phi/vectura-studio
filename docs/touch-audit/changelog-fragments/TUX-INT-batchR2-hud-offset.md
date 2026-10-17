# TUX integration, batch R2 item 4 (HUD width token)

## CHANGELOG
- Touch: on iPhone landscape the open formula sheet and the status strip end 8 px left of the canvas HUD. Their right offset comes from one token (`--canvas-hud-w`, 134 px) instead of a stale 156 px.

## plans.md line
- [x] TUX-020 nit: iPhone landscape sheet and status strip derive their right offset from `--canvas-hud-w`.
