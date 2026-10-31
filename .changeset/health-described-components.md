---
'@crypte/cli': patch
---

The health view counts every export a story describes as a component, even one that never returns an element, so a component that only throws shows its failing render.
