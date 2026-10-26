<script setup lang="ts">
import { EmptyNote, SidebarLink, ColumnTitle } from '@crypte/ui'
import type { Category } from './categories'
import { texts } from '../i18n'

// La sidebar de la vue tokens : une ligne par catégorie, avec son compte, comme
// la liste plate de la maquette.
defineProps<{
  categories: Category[]
  current: string | null
  hrefOf: (category: string) => string
}>()
const emit = defineEmits<{ pick: [category: string, event: MouseEvent] }>()

const t = texts({
  en: { tokens: 'Tokens', none: 'No tokens.' },
  fr: { tokens: 'Tokens', none: 'Aucun token.' },
})
</script>

<template>
  <div class="categories">
    <ColumnTitle
      :title="t('tokens')"
      :count="categories.reduce((sum, one) => sum + one.count, 0)"
    />
    <EmptyNote v-if="categories.length === 0">{{ t('none') }}</EmptyNote>
    <ul :aria-label="t('tokens')">
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
