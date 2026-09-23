---
'@crypte/cli': patch
---

Props typed `VariantProps<typeof x>` now come out as enums with their options and default, read from the `cva(…)` call when `x` is declared in the same file.
