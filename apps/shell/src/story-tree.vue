<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { ToggleGroupItem, ToggleGroupRoot, TreeItem, TreeRoot } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import {
  STATUSES,
  branchKeys,
  componentIdOf,
  filtered,
  keysAbove,
  treeOf,
  type Node,
  type Status,
} from './tree'

// `component` : la page composant ouverte, par son identifiant ; sinon la story
// `current` est celle qu'on regarde.
const props = defineProps<{
  entries: StoryEntry[]
  current: string | null
  component: string | null
}>()
const emit = defineEmits<{ show: [id: string]; open: [component: string] }>()

const query = ref('')
const statuses = ref<Status[]>([])

// Le filtre n'apparaît que si un composant déclare un statut : sinon il
// n'aurait rien à filtrer, et choisir un statut viderait l'arbre.
const declared = computed(() =>
  STATUSES.filter((status) => props.entries.some((entry) => entry.meta?.status === status)),
)

// Un statut choisi que plus aucun composant ne déclare ne filtre plus : son bouton
// disparaît avec lui, et l'arbre resterait vide sans rien pour en sortir. Il reste
// choisi, comme un repli reste replié, et revient avec le composant qui le porte.
const chosen = computed(() => statuses.value.filter((status) => declared.value.includes(status)))

const tree = computed(() => treeOf(props.entries))
const shown = computed(() => filtered(tree.value, query.value, chosen.value))

// Ce qui est replié, et pas ce qui est ouvert : un composant écrit depuis la
// dernière visite arrive ouvert, comme tout l'arbre la première fois. Retenu par
// le shell, comme l'ouverture d'un panneau.
const KEY = 'crypte:tree:folded'

const read = (): string[] => {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(kept) ? kept.filter((one) => typeof one === 'string') : []
  } catch {
    return []
  }
}

const folded = ref<string[]>(read())

const keep = (keys: string[]) => {
  folded.value = keys
  try {
    localStorage.setItem(KEY, JSON.stringify(keys))
  } catch {
    // Stockage refusé : l'arbre se replie le temps de la session.
  }
}

// Une recherche ouvre tout ce qu'elle trouve, sans toucher à ce qui est retenu :
// replier pendant qu'on cherche ne vaut que pour cette recherche.
const foldedWhileSearching = ref<string[]>([])
const searching = computed(() => query.value.trim() !== '')
watch(query, () => {
  foldedWhileSearching.value = []
})

const expanded = computed(() => {
  const hidden = searching.value ? foldedWhileSearching.value : folded.value
  return branchKeys(shown.value).filter((key) => !hidden.includes(key))
})

// Ce qui est replié hors de la vue reste replié : un composant que le filtre de
// statut cache, ou qu'un fichier cassé retire un instant, reviendrait sinon
// ouvert dès qu'on replie autre chose.
function unfold(next: string[]) {
  const visible = branchKeys(shown.value)
  const closed = visible.filter((key) => !next.includes(key))
  if (searching.value) foldedWhileSearching.value = closed
  else keep([...folded.value.filter((key) => !visible.includes(key)), ...closed])
}

// Ce qu'on regarde reste atteignable : y arriver par son adresse rouvre ce qui le
// contient.
watch(
  () => [props.current, props.component] as const,
  ([id, component]) => {
    const entry =
      component === null
        ? props.entries.find((one) => one.id === id)
        : props.entries.find((one) => componentIdOf(one.path) === component)
    if (!entry) return
    const above = keysAbove(entry)
    if (folded.value.some((key) => above.includes(key)))
      keep(folded.value.filter((key) => !above.includes(key)))
  },
  { immediate: true },
)

const find = (nodes: readonly Node[], key: string): Node | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node
    const inside = node.kind === 'story' ? undefined : find(node.children, key)
    if (inside) return inside
  }
  return undefined
}

const selected = computed(() => {
  if (props.component !== null) return find(shown.value, `component:${props.component}`)
  return props.current === null ? undefined : find(shown.value, props.current)
})

// Une story et un composant se choisissent, un dossier se plie seulement.
function pick(node: Node | undefined) {
  if (node?.kind === 'story') emit('show', node.entry.id)
  if (node?.kind === 'component') emit('open', node.id)
}

// Le clic sur le libellé d'un composant ouvre sa page sans le plier : le chevron
// plie, le libellé mène quelque part. Au clavier, les flèches plient toujours.
const notFolding = (node: Node, event: CustomEvent<{ originalEvent: Event }>) => {
  if (node.kind === 'component' && event.detail.originalEvent.type === 'click')
    event.preventDefault()
}

const childrenOf = (node: Node) => (node.kind === 'story' ? undefined : node.children)
</script>

<template>
  <div class="tree">
    <input v-model="query" type="search" class="search" aria-label="Search" placeholder="Search" />
    <ToggleGroupRoot
      v-if="declared.length > 0"
      v-model="statuses"
      type="multiple"
      class="statuses"
      aria-label="Filter by status"
    >
      <ToggleGroupItem v-for="status of declared" :key="status" :value="status">
        {{ status }}
      </ToggleGroupItem>
    </ToggleGroupRoot>
    <TreeRoot
      v-slot="{ flattenItems }"
      :items="shown"
      :get-key="(node: Node) => node.key"
      :get-children="childrenOf"
      :expanded="expanded"
      :model-value="selected"
      selection-behavior="replace"
      class="nodes"
      aria-label="Stories"
      @update:expanded="unfold"
      @update:model-value="pick"
    >
      <TreeItem
        v-for="item of flattenItems"
        :key="item._id"
        v-slot="{ isExpanded, handleToggle }"
        v-bind="item.bind"
        :class="item.value.kind"
        :style="{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }"
        @select="(event) => item.value.kind === 'folder' && event.preventDefault()"
        @toggle="(event) => notFolding(item.value, event)"
      >
        <span
          v-if="item.hasChildren"
          class="chevron"
          aria-hidden="true"
          @click.stop="handleToggle()"
          >{{ isExpanded ? '▾' : '▸' }}</span
        >
        <span class="name">{{ item.value.name }}</span>
        <span v-if="item.value.kind === 'component' && item.value.status" class="status">
          {{ item.value.status }}
        </span>
      </TreeItem>
    </TreeRoot>
    <p v-if="entries.length === 0">no story</p>
    <p v-else-if="shown.length === 0">nothing matches</p>
  </div>
</template>

<style scoped>
.search {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 4px 8px;
}

.statuses {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.statuses button {
  border: 1px solid #e5e7eb;
  background: none;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}

.statuses button[data-state='on'] {
  background: #e5e7eb;
}

.nodes {
  list-style: none;
  margin: 0;
  padding: 0;
}

.nodes li {
  display: flex;
  gap: 4px;
  align-items: baseline;
  padding-block: 4px;
  padding-right: 8px;
  cursor: pointer;
}

.nodes li:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}

.nodes li.folder,
.nodes li.component {
  font-weight: 600;
}

.nodes li[data-selected] {
  background: #e5e7eb;
  font-weight: 600;
}

.chevron {
  width: 1em;
}

.status {
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: #6b7280;
}
</style>
