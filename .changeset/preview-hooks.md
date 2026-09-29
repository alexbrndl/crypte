---
'@crypte/core': minor
'@crypte/cli': minor
---

A plugin's preview module now exports hooks, `afterMount` after each render and `onMessage` for what its panel sends, and plugin messages cross between the shell and the preview under the plugin's name. A preview module that exports anything else is refused and named in the shell. `beforeMount`, `onPropsChange` and `beforeUnmount` are no longer part of the contract.
