---
'@crypte/cli': patch
---

The props of a `.vue` component are read from its `<script setup>` block, or its `props` option: `defineProps<T>()` with a local type, `defineProps({ … })`, `withDefaults` and a destructured `defineProps`. The docs table and `controls` now show them, without the Vue compiler.
