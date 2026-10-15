<script setup lang="ts">
import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { ToggleGroupItem, ToggleGroupRoot, TreeItem, TreeRoot } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import Icon from '../ui/icon.vue'
import {
  STATUSES,
  branchKeys,
  componentIdOf,
  dimmed,
  keysAbove,
  treeOf,
  type Node,
  type Status,
} from './tree'

// `component` : la page composant ouverte, par son identifiant ; sinon l'entrée
// `current`, story ou famille de tokens, est celle qu'on regarde.
const props = defineProps<{
  entries: (StoryEntry | TokensEntry)[]
  current: string | null
  component: string | null
}>()
const emit = defineEmits<{ show: [id: string]; open: [component: string] }>()

// Un statut à la fois, ou tous : les onglets du fichier Figma.
const status = ref<Status | 'all'>('all')

// Le filtre n'apparaît que si un composant déclare un statut : sinon il
// n'aurait rien à filtrer, et choisir un statut viderait l'arbre.
const declared = computed(() =>
  STATUSES.filter((status) =>
    props.entries.some((entry) => entry.type === 'story' && entry.meta?.status === status),
  ),
)

// Un statut choisi que plus aucun composant ne déclare ne grise plus rien : son
// onglet disparaît avec lui. Il reste choisi, comme un repli reste replié, et
// revient avec le composant qui le porte.
const chosen = computed(() =>
  status.value !== 'all' && declared.value.includes(status.value) ? status.value : null,
)

const shown = computed(() => treeOf(props.entries))
const grey = computed(() => dimmed(shown.value, chosen.value))

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

const expanded = computed(() =>
  branchKeys(shown.value).filter((key) => !folded.value.includes(key)),
)

// Ce qui est replié hors de la vue reste replié : un composant qu'un fichier
// cassé retire un instant reviendrait sinon ouvert dès qu'on replie autre chose.
function unfold(next: string[]) {
  const visible = branchKeys(shown.value)
  const closed = visible.filter((key) => !next.includes(key))
  keep([...folded.value.filter((key) => !visible.includes(key)), ...closed])
}

// Ce qu'on regarde reste atteignable : y arriver rouvre ce qui le contient, les
// dossiers au-dessus d'un composant, et le composant d'une story. Pas le composant
// d'une page : ouvrir sa page n'efface pas un repli choisi.
watch(
  () => [props.current, props.component] as const,
  ([id, component]) => {
    const entry =
      component === null
        ? props.entries.find((one) => one.id === id)
        : props.entries.find((one) => one.type === 'story' && componentIdOf(one.path) === component)
    if (!entry) return
    const above = component === null ? keysAbove(entry) : keysAbove(entry).slice(0, -1)
    if (folded.value.some((key) => above.includes(key)))
      keep(folded.value.filter((key) => !above.includes(key)))
  },
  { immediate: true },
)

const find = (nodes: readonly Node[], key: string): Node | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node
    const inside = 'children' in node ? find(node.children, key) : undefined
    if (inside) return inside
  }
  return undefined
}

const selected = computed(() => {
  if (props.component !== null) return find(shown.value, `component:${props.component}`)
  return props.current === null ? undefined : find(shown.value, props.current)
})

// Une story, une famille et un composant se choisissent, un dossier se plie
// seulement.
function pick(node: Node | undefined) {
  if (node?.kind === 'story' || node?.kind === 'tokens') emit('show', node.entry.id)
  if (node?.kind === 'component') emit('open', node.id)
}

// Le clic sur le libellé d'un composant ouvre sa page sans le plier : le chevron
// plie, le libellé mène quelque part. Au clavier, les flèches plient toujours.
const notFolding = (node: Node, event: CustomEvent<{ originalEvent: Event }>) => {
  if (node.kind === 'component' && event.detail.originalEvent.type === 'click')
    event.preventDefault()
}

const childrenOf = (node: Node) => ('children' in node ? node.children : undefined)

// Les entrées sous un dossier, stories et familles : le compte de la ligne.
const count = (node: Node): number =>
  node.kind === 'story' || node.kind === 'tokens'
    ? 1
    : 'children' in node
      ? node.children.reduce((n, one) => n + count(one), 0)
      : 0
const stories = computed(() => props.entries.filter((entry) => entry.type === 'story').length)

// Les guides sont au centre du chevron de chaque ancêtre, à 20, 32, 44 px. Une ligne
// sélectionnée remplace le guide de son parent par son marqueur, et sa bande part de
// là : la sélection se pose dans la hiérarchie au lieu de la couvrir.
const GUIDE = 20
const STEP = 12
const guides = (level: number, selected: boolean) =>
  Array.from({ length: level - 1 - (selected ? 1 : 0) }, (_, at) => GUIDE + at * STEP)
const marker = (level: number) => (level > 1 ? GUIDE + (level - 2) * STEP : 8)
</script>

<template>
  <div class="tree">
    <div class="title">
      <h2>Stories</h2>
      <span class="meta">{{ stories }}</span>
    </div>
    <ToggleGroupRoot
      v-if="declared.length > 0"
      :model-value="chosen ?? 'all'"
      type="single"
      class="tabs"
      aria-label="Filter by status"
      @update:model-value="(value) => (status = (value as Status | 'all' | undefined) || 'all')"
    >
      <ToggleGroupItem value="all">all</ToggleGroupItem>
      <ToggleGroupItem v-for="one of declared" :key="one" :value="one">
        {{ one }}
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
        v-slot="{ isExpanded, isSelected, handleToggle }"
        v-bind="item.bind"
        :class="item.value.kind"
        :data-dimmed="grey.has(item.value.key) || undefined"
        :style="{ paddingLeft: `${12 + (item.level - 1) * STEP}px` }"
        @select="(event) => item.value.kind === 'folder' && event.preventDefault()"
        @toggle="(event) => notFolding(item.value, event)"
      >
        <span
          v-for="left of guides(item.level, isSelected)"
          :key="left"
          class="guide"
          :style="{ left: `${left}px` }"
        />
        <template v-if="isSelected">
          <span class="band" :style="{ left: `${marker(item.level)}px` }" />
          <span class="marker" :style="{ left: `${marker(item.level)}px` }" />
        </template>
        <!-- L'emplacement est réservé sur chaque ligne ; vide, il laisse passer le clic à la
             ligne, qui choisit la story. -->
        <span
          class="chevron"
          @click="
            (event: MouseEvent) => item.hasChildren && (event.stopPropagation(), handleToggle())
          "
        >
          <Icon v-if="item.hasChildren" :name="isExpanded ? 'arrow-down-01' : 'arrow-right-01'" />
        </span>
        <span class="name">{{ item.value.name }}</span>
        <span v-if="item.value.kind === 'folder'" class="meta">{{ count(item.value) }}</span>
        <span v-if="item.value.kind === 'component' && item.value.status" class="status">
          {{ item.value.status }}
        </span>
      </TreeItem>
    </TreeRoot>
    <p v-if="entries.length === 0" class="none">no story</p>
  </div>
</template>

<style scoped>
.tree {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.title {
  display: flex;
  align-items: center;
  padding: var(--space-1-5) var(--space-3);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.title h2 {
  flex: 1;
  margin: 0;
  color: var(--text-muted);
  font-size: inherit;
  font-weight: var(--weight-medium);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.meta,
.status {
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.tabs {
  display: flex;
  margin: 0 var(--space-3);
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-sm);
  background: var(--background-raised);
}

.tabs button {
  flex: 1;
  padding: var(--space-1) var(--space-1-5);
  border: var(--stroke-hairline) solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  cursor: pointer;
}

.tabs button[data-state='on'] {
  border-color: var(--accent-base);
  background: var(--background-current);
  color: var(--text-current);
}

.nodes {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: var(--space-2) 0;
  list-style: none;
}

.nodes li {
  position: relative;
  z-index: 0;
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
  padding-block: var(--space-0-5);
  padding-right: var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  cursor: pointer;
}

.nodes li:hover {
  background: var(--background-hover);
  color: var(--text-primary);
}

.nodes li:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.nodes li[data-selected] {
  color: var(--text-current);
  font-weight: var(--weight-medium);
}

.nodes li[data-dimmed] {
  opacity: 0.4;
}

/* Sous le fond de la ligne, comme le veut le composant row du fichier Figma. */
.guide {
  position: absolute;
  inset-block: 0;
  z-index: -1;
  border-left: var(--stroke-hairline) solid var(--border-base);
}

.band {
  position: absolute;
  inset-block: 0;
  right: 0;
  z-index: -1;
  background: var(--background-current);
}

.marker {
  position: absolute;
  inset-block: 0;
  width: var(--stroke-marker);
  background: var(--accent-base);
}

.chevron {
  display: flex;
  width: var(--size-icon);
  height: var(--size-icon);
  color: var(--text-subtle);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.none {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--text-subtle);
  font-size: var(--text-sm);
}
</style>
