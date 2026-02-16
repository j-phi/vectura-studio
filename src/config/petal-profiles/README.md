# Petal Profile Library

Place Petalis profile JSON files in this folder.

Supported profile format:

```json
{
  "type": "vectura-petal-profile",
  "version": 1,
  "id": "my-profile-id",
  "name": "My Profile Name",
  "inner": { "profile": "teardrop", "anchors": [] },
  "outer": { "profile": "heart", "anchors": [] }
}
```

Valid shape fields:
- `inner` and/or `outer` (full anchor payloads from exported profiles)
- `shape` + `target` (`inner`, `outer`, or `both`) for one-shape profiles

`index.json` can list files explicitly, and directory listing ingestion is also supported when the static host exposes folder listings.
Petalis now populates PROFILE dropdowns from this directory only.

Notes:
- Project profiles in this folder should use explicit `inner`/`outer` anchor payloads (no built-in alias fallback).
- `library.js` is the preloaded profile bundle used for `file://` local runs where JSON `fetch()` is blocked by browser CORS rules.
