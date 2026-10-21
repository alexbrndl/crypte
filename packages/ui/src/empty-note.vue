<script setup lang="ts">
// Ce qu'une liste dit quand elle n'a rien à montrer, en cours, ou en échec en
// rouge. Le contexte règle son retrait par `--empty-note-padding`.
defineProps<{ failed?: boolean }>()
</script>

<template>
  <p class="empty-note" :data-failed="failed || undefined"><slot /></p>
</template>

<style scoped>
.empty-note {
  margin: 0;
  padding: var(--empty-note-padding, 0);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

.empty-note[data-failed] {
  color: var(--error-text);
}
</style>
