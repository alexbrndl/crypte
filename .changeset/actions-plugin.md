---
'@crypte/core': patch
'@crypte/actions': patch
'@crypte/cli': patch
---

New `@crypte/actions` plugin: its panel lists a story's function props in a table, each with how many times the component called it and its last arguments when they hold more than an event, and a prop the story leaves out no longer breaks on the first click. It joins `defaultPlugins`. Preview modules get a `beforeMount` hook, the one moment a plugin may change a story's props, with their `details`.
