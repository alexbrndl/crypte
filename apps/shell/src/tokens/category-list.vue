<script setup lang="ts">
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
    <p v-if="categories.length === 0" class="none">no tokens</p>
    <ul aria-label="Tokens">
      <li v-for="category of categories" :key="category.name">
        <a
          :href="hrefOf(category.name)"
          :aria-current="category.name === current ? 'page' : undefined"
          @click="emit('pick', category.name, $event)"
        >
          <span class="name">{{ category.name }}</span>
          <span class="meta">{{ category.count }}</span>
        </a>
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
}

.meta {
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

ul {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: var(--space-2) 0;
  list-style: none;
}

/* Indented as a tree row of the first level, past the slot of its chevron. */
a {
  position: relative;
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
  padding: var(--space-0-5) var(--space-3) var(--space-0-5)
    calc(var(--space-3) + var(--size-icon) + var(--space-1-5));
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-decoration: none;
}

a:hover {
  background: var(--background-hover);
  color: var(--text-primary);
}

a:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

/* La ligne courante de l'arbre : la bande et le marqueur partent à 8 px, le
   libellé en accent. */
a[aria-current='page'] {
  --band: var(--background-current);
  --marker: var(--accent-base);
  background: linear-gradient(
    to right,
    transparent var(--space-2),
    var(--marker) var(--space-2),
    var(--marker) calc(var(--space-2) + var(--stroke-marker)),
    var(--band) calc(var(--space-2) + var(--stroke-marker))
  );
  color: var(--text-current);
  font-weight: var(--weight-medium);
}

a[aria-current='page']:hover {
  --band: var(--background-current-hover);
  --marker: var(--accent-hover);
  color: var(--text-current-hover);
}

a[aria-current='page'] .meta {
  color: var(--text-current);
}

.name {
  flex: 1;
}

.none {
  margin: 0;
  padding: var(--space-0-5) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
</style>
