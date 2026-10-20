<script setup lang="ts">
// Le canvas d'une vue, celui de la maquette : padding 20/24, gap 16, sur le
// fond subtil.
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
