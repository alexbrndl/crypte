<script setup lang="ts">
// Le titre d'une colonne, `column-title` de la maquette : 32 px, haut plus
// grand, le compte à droite.
defineProps<{ title: string; count?: number | string }>()
</script>

<template>
  <div class="column-title">
    <h2>{{ title }}</h2>
    <span v-if="count !== undefined" class="count">{{ count }}</span>
  </div>
</template>

<style scoped>
.column-title {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2-5) var(--space-3) var(--space-1-5);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

h2 {
  flex: 1;
  margin: 0;
  color: var(--text-muted);
  font-size: inherit;
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.count {
  color: var(--text-subtle);
}
</style>
