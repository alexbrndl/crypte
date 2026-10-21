<script setup lang="ts">
import type { PageEntry } from '@crypte/core/protocol'
import MarkdownBody from './markdown-body.vue'

// Une page générale : un markdown du dossier des stories qu'aucun fichier de
// stories ne rattache à un composant.
defineProps<{ page: PageEntry }>()
</script>

<template>
  <article class="markdown-page" :aria-label="page.name">
    <h2>{{ page.name }}</h2>
    <p class="file">
      <code>{{ page.file }}</code>
    </p>
    <MarkdownBody :body="page.body" />
  </article>
</template>

<style scoped>
h2 {
  margin: 0 0 var(--space-3);
  color: var(--text-primary);
  font-size: var(--text-3xl);
  font-weight: var(--weight-medium);
  line-height: var(--leading-3xl);
}

.file {
  margin: 0 0 var(--space-6);
  color: var(--text-muted);
}

code {
  font-size: var(--text-xs);
}
</style>
