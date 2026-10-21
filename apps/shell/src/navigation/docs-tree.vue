<script setup lang="ts">
import { ColumnTitle, EmptyNote, Tree, type TreeNode } from '@crypte/ui'
import type { PageEntry, StoryEntry } from '@crypte/core/protocol'
import { computed } from 'vue'
import { docsOf, type Node } from './tree'

// L'arbre de la vue docs. `component` ou `page` : ce qui est ouvert, par son
// identifiant.
const props = defineProps<{
  stories: StoryEntry[]
  pages: PageEntry[]
  component: string | null
  page: string | null
}>()
const emit = defineEmits<{ open: [component: string]; show: [page: string] }>()

const shown = computed(() => docsOf(props.stories, props.pages))

const leaves = (nodes: readonly Node[]): Node[] =>
  nodes.flatMap((node) => (node.kind === 'folder' ? leaves(node.children) : [node]))
const all = computed(() => leaves(shown.value))

const selected = computed(
  () =>
    all.value.find((node) =>
      node.kind === 'component' ? node.id === props.component : node.key === props.page,
    )?.key ?? null,
)

function pick(key: string) {
  const node = all.value.find((one) => one.key === key)
  if (node?.kind === 'component') emit('open', node.id)
  if (node?.kind === 'page') emit('show', node.entry.id)
}

// Un dossier se plie seulement, ses pages comptées à droite.
const toItems = (nodes: readonly Node[]): TreeNode[] =>
  nodes.map((node) =>
    node.kind === 'folder'
      ? {
          key: node.key,
          label: node.name,
          kind: node.kind,
          children: toItems(node.children),
          count: leaves(node.children).length,
          selectable: false,
        }
      : { key: node.key, label: node.name, kind: node.kind },
  )
const items = computed(() => toItems(shown.value))
</script>

<template>
  <div class="docs-tree">
    <ColumnTitle title="Docs" :count="all.length" />
    <EmptyNote v-if="all.length === 0">No page.</EmptyNote>
    <Tree :items="items" :selected="selected" label="Docs" @select="pick" />
  </div>
</template>

<style scoped>
.docs-tree {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  --empty-note-padding: var(--space-0-5) var(--space-3);
}
</style>
