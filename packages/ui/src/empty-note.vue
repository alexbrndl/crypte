<script setup lang="ts">
// What a list says when it has nothing to show, or is busy, or failed, in red.
// The context sets its inset through `--empty-note-padding`.
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
