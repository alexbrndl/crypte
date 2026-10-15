---
'@crypte/ui': patch
'@crypte/controls': minor
'@crypte/a11y': minor
'@crypte/cli': patch
---

`@crypte/ui` adds `Button`, `Input`, `Select` and `Checkbox`, drawn from the Figma file. The shell serves `@crypte/ui` through its import map next to `vue`, so a panel draws with the shell's own components. `@crypte/controls` and `@crypte/a11y` use them, and declare `@crypte/ui` as a peer dependency.
