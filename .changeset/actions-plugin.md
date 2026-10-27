---
'@crypte/core': patch
'@crypte/actions': patch
'@crypte/cli': patch
---

New `@crypte/actions` plugin: every function prop of a story is logged when the component calls it, in a panel, and one the story leaves out no longer breaks on the first click. It joins `defaultPlugins`. Preview modules get a `beforeMount` hook, the one moment a plugin may change a story's props, with their `details`.
