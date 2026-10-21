<script setup lang="ts">
import { computed } from 'vue'
import { rendered } from './markdown'

const props = defineProps<{ body: string }>()
const html = computed(() => rendered(props.body))
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>

<style scoped>
.markdown-body {
  max-width: 72ch;
  font-size: var(--text-base);
  line-height: var(--leading-base);
}

.markdown-body :deep(:is(h2, h3, h4, h5, h6)) {
  margin: var(--space-6) 0 var(--space-2);
  font-weight: var(--weight-semibold);
}

.markdown-body :deep(:is(h2, h3)) {
  font-size: var(--text-xl);
  line-height: var(--leading-xl);
}

.markdown-body :deep(:is(h4, h5, h6)) {
  font-size: var(--text-base);
}

.markdown-body :deep(:is(p, ul, ol, pre, table, blockquote)) {
  margin: 0 0 var(--space-3);
}

.markdown-body :deep(:is(ul, ol)) {
  padding-left: var(--space-5);
}

.markdown-body :deep(a) {
  color: var(--text-current);
}

.markdown-body :deep(a:hover) {
  color: var(--text-current-hover);
}

.markdown-body :deep(code) {
  font-size: var(--text-xs);
}

.markdown-body :deep(pre) {
  padding: var(--space-3);
  overflow-x: auto;
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.markdown-body :deep(:is(th, td)) {
  padding: var(--space-1-5) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
}

.markdown-body :deep(blockquote) {
  padding-left: var(--space-3);
  border-left: 2px solid var(--border-subtle);
  color: var(--text-muted);
}
</style>
