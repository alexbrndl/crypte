---
'@crypte/core': patch
'@crypte/cli': minor
'@crypte/vue': patch
---

A Vue adapter, `@crypte/vue`: `adapter: vue()`, with `defineStories` and `story` typed from a Vue component's props. A Vue project adds `vue()` from `@vitejs/plugin-vue` to `vite.plugins`, as a React project adds `react()`.

The adapter's type now lives in the core, `Adapter` from `@crypte/core/preview`, and `@crypte/cli` re-exports it: the `adapter` of `crypte.config.ts` must have `mount` and `unmount`, where any value was accepted before.
