---
'@crypte/core': minor
'@crypte/cli': minor
---

A plugin's `shell` and `preview` are now the file URL of a module, `new URL('./shell.mjs', import.meta.url).href`, which `crypte dev` loads in the shell and in the preview. A shell module runs on the shell's own Vue: declare `vue` as a peer dependency and keep it out of the bundle.
