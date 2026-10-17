---
'@crypte/core': patch
'@crypte/cli': patch
---

`render` carries an optional `theme`, which the preview sets as `data-theme` and `color-scheme` on its root before drawing. The preview follows the shell's theme, and the stage shows a story in light and in dark side by side.
