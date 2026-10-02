---
'@crypte/cli': patch
---

A panel edit holding something other than primitives is refused and named with its plugin and prop, instead of leaving the preview blank. When several panels edit a story, their values are merged in the order of `plugins`, the later panel winning a prop both edit.
