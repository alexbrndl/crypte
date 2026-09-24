---
'@crypte/core': patch
---

No change to the published code: the `sideEffects: false` the core declares is now checked by its own tests, which read every source file and fail on anything that runs at import.
