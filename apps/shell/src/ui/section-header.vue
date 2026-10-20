<script setup lang="ts">
import Badge from './badge.vue'

// Le `section-header` de la maquette : l'intitulé, le compte en badge, une note
// à droite, puis l'action.
defineProps<{ title: string; count?: number | string; note?: string }>()
defineSlots<{ action?(): unknown }>()
</script>

<template>
  <header class="section-header">
    <h2>{{ title }}</h2>
    <Badge v-if="count !== undefined" tone="inverse">{{ count }}</Badge>
    <span class="note">{{ note }}</span>
    <slot name="action" />
  </header>
</template>

<style scoped>
.section-header {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding-bottom: var(--space-1);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* Muted, not the subtle of the Figma file: subtle falls under 4.5:1 on the
   subtle background. */
h2 {
  margin: 0;
  color: var(--text-muted);
  font-size: inherit;
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.note {
  flex: 1;
  color: var(--text-muted);
  text-align: right;
}
</style>
