---
'@crypte/cli': patch
'@crypte/core': patch
---

A panel removed from the configuration takes its edits with it: they no longer stay in the render, nor come back when the plugin returns. While a preview module is still loading, a message no hook receives is reported as such, rather than as one that module would have taken.
