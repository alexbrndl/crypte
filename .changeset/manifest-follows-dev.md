---
'@crypte/cli': patch
---

`crypte dev` now rewrites `.crypte/manifest.json` when a story changes, so a tool reading the file sees the catalogue the shell shows instead of the one from start-up.
