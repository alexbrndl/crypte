<script setup lang="ts">
import EmptyNote from '../ui/empty-note.vue'
import SidebarLink from '../ui/sidebar-link.vue'
import ColumnTitle from '../ui/column-title.vue'
import type { Category } from './categories'

// La sidebar de la vue tokens : une ligne par catégorie, avec son compte, comme
// la liste plate de la maquette.
defineProps<{
  categories: Category[]
  current: string | null
  hrefOf: (category: string) => string
}>()
const emit = defineEmits<{ pick: [category: string, event: MouseEvent] }>()
</script>

<template>
  <div class="categories">
    <ColumnTitle title="Tokens" :count="categories.reduce((sum, one) => sum + one.count, 0)" />
    <EmptyNote v-if="categories.length === 0">No tokens.</EmptyNote>
    <ul aria-label="Tokens">
      <li v-for="category of categories" :key="category.name">
        <SidebarLink
          :href="hrefOf(category.name)"
          :current="category.name === current"
          :count="category.count"
          @click="(event) => emit('pick', category.name, event)"
          >{{ category.name }}</SidebarLink
        >
      </li>
    </ul>
  </div>
</template>

<style scoped>
.categories {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  --empty-note-padding: var(--space-0-5) var(--space-3);
}

ul {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: var(--space-2) 0;
  list-style: none;
}
</style>
