---
'@crypte/tokens': patch
---

A token written as `light-dark(a, b)` now reads as its light and dark values, each resolved through its own `var()` chain, instead of one unknown value.
