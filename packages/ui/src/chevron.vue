<script setup lang="ts">
// The chevron of a row that folds, the Hugeicons `ArrowDown01` and
// `ArrowRight01` paths drawn inline: the icon set weighs 80 MB installed, and
// every plugin installs this package as a peer.
defineProps<{ open: boolean }>()
</script>

<template>
  <svg
    class="icon"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.875"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="open" d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" />
    <path v-else d="M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18" />
  </svg>
</template>
