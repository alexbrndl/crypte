<script setup lang="ts">
// The canvas of a view, the Figma file's: padding 20/24, gap 16, on the subtle
// background.
</script>

<template>
  <section class="view-canvas"><slot /></section>
</template>

<style scoped>
.view-canvas {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  background: var(--background-subtle);
}
</style>
