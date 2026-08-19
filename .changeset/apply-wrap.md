---
'@crypte/cli': minor
'@crypte/core': minor
'@crypte/react': minor
---

Stories render inside the wrappers they declare.

Section 2.5 of the contracts says the config's `wrap` wraps the file's, which wraps the component. Until now `wrap` was read, typed, validated, and then thrown away: a story declaring a `ThemeProvider` rendered without its context, with nothing said.

All three forms work: one component, an array of components, and an array whose entries carry their own props. In the array form the first entry is the outermost.

`Adapter.mount` takes the flattened list as an optional fourth argument, so an adapter written against the previous shape keeps compiling, and a story with no wrapper mounts with no extra element in its tree.

**A relative import in `crypte.config.ts` now travels correctly.** The generated preview entry is a virtual module, so `./src/components/Frame` used to resolve against its own path and fail to load. Config imports are rewritten root-absolute, like story imports already were, and one that points outside the project is refused by name. An adapter imported relatively hit the same wall before this release.
