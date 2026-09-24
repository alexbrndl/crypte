---
'@crypte/cli': patch
---

`crypte dev` now rewrites `.crypte/fingerprint.json` when a change to `crypte.config.ts` alters the catalogue, so `crypte check` no longer fails after changing the `stories` path mid-session.
