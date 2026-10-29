---
'@crypte/cli': patch
---

`plugins` adds to the default plugins: `plugins: [a11y()]` keeps `controls`, `tokens`, `source` and `actions`, a plugin listed under one of their names replaces it in its place, and `defaultPlugins: false` keeps only what `plugins` lists.
