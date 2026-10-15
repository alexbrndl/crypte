---
'@crypte/ui': patch
'@crypte/cli': patch
---

`@crypte/ui` depends on `reka-ui` rather than bundling it, and the shell builds its `vendor/ui.js` itself: the shell and `@crypte/ui` share one copy of Reka, 19 kB gzip lighter. The zoom menu says its keys at its foot instead of in a tooltip.
