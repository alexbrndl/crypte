---
'@crypte/cli': minor
---

A configuration with no `plugins` key now gets `controls`, `tokens` and `source`, exported as `defaultPlugins`. A `plugins` key still takes exactly what it lists: spread `defaultPlugins` to keep the preset beside your own plugins.
