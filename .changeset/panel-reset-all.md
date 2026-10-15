---
'@crypte/core': patch
'@crypte/ui': patch
'@crypte/controls': patch
'@crypte/cli': patch
---

The shell hands a panel back what it edited, as its `overrides` prop, and shows a Reset all in the panel's head while there is any. `@crypte/controls` reads its values from that prop and drops its Back to the story button. `@crypte/ui` adds the `ghost` button.
