---
'@crypte/react': minor
---

`Adapter.mount` now requires its fourth argument, the wrappers. A caller that leaves it out is told at the call site rather than mounting the story without its wrappers in silence. Implementations are unaffected: a three-parameter `mount` still satisfies the interface, which is what the optional marker was believed to protect and never did.
