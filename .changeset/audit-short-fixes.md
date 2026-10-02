---
'@crypte/core': patch
'@crypte/cli': patch
---

A plugin factory passed without being called, `plugins: [controls]`, is refused with its reason instead of doing nothing. A preview hook left `undefined` no longer gets its whole module refused, and a plugin named `constructor` receives `null` until its preview module speaks.
