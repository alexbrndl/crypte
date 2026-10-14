---
'@crypte/ui': patch
'@crypte/cli': patch
---

`@crypte/ui` ships the design tokens of the Figma file as CSS custom properties, light and dark, and `Alert` takes `color` as `info`, `success`, `warning` or `error`. The shell follows the system theme, and switches between light and dark with `t` or from the command palette, remembering the choice. It is set in Geist and Geist Mono.
