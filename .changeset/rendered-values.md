---
'@crypte/core': minor
'@crypte/controls': patch
'@crypte/cli': patch
---

`rendered` now carries `values`, the primitive props a story rendered with, overrides included, and a panel reads them as its `values` prop. `@crypte/controls` fills its fields with them, so a field shows what the component shows.
