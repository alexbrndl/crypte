<script setup lang="ts">
// Le compte d'un en-tête en badge, `badge` de la maquette.
</script>

<template>
  <span class="count-badge"><slot /></span>
</template>

<style scoped>
.count-badge {
  padding: var(--space-0-5) var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--background-raised);
  color: var(--text-current);
  font-family: var(--font-mono);
  letter-spacing: 0;
  text-transform: none;
}
</style>
