<script setup lang="ts">
import { ColumnTitle, EmptyNote, Tree, type TreeNode } from '@crypte/ui'
import { ViewIcon } from '@hugeicons/core-free-icons'
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { keep, kept } from '../storage'
import Icon from '../ui/icon.vue'
import {
  STATUSES,
  branchKeys,
  componentIdOf,
  dimmed,
  keysAbove,
  treeOf,
  type Listed,
  type Node,
  type Status,
} from './tree'

// `current` : l'entrée qu'on regarde. `label` titre la colonne et nomme l'arbre,
// `none` dit qu'il est vide. Un composant se plie au clic ; son œil, en bout de
// ligne, ouvre sa page dans la vue docs.
const props = defineProps<{
  entries: Listed[]
  current: string | null
  label: string
  none: string
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

// Le titre compte les stories : une page n'en est pas une.
const stories = computed(() => props.entries.filter((entry) => entry.type === 'story').length)

const shown = computed(() => treeOf(props.entries))
const grey = computed(() => dimmed(shown.value, chosen.value))

// Ce qui est replié, et pas ce qui est ouvert : un composant écrit depuis la
// dernière visite arrive ouvert, comme tout l'arbre la première fois. Retenu par
// le shell, comme l'ouverture d'un panneau.
const KEY = 'crypte:tree:folded'

const stored = kept(KEY)
const folded = ref<string[]>(
  Array.isArray(stored) ? stored.filter((one): one is string => typeof one === 'string') : [],
)

const fold = (keys: string[]) => {
  folded.value = keys
  keep(KEY, keys)
}

const expanded = computed(() =>
  branchKeys(shown.value).filter((key) => !folded.value.includes(key)),
)

// Ce qui est replié hors de la vue reste replié : un composant qu'un fichier
// cassé retire un instant reviendrait sinon ouvert dès qu'on replie autre chose.
function unfold(next: string[]) {
  const visible = branchKeys(shown.value)
  const closed = visible.filter((key) => !next.includes(key))
  fold([...folded.value.filter((key) => !visible.includes(key)), ...closed])
}

// Ce qu'on regarde reste atteignable : y arriver rouvre ce qui le contient, les
// dossiers et le composant d'une story.
watch(
  () => props.current,
  (id) => {
    const entry = props.entries.find((one) => one.id === id)
    if (!entry) return
    const above = keysAbove(entry)
    if (folded.value.some((key) => above.includes(key)))
      fold(folded.value.filter((key) => !above.includes(key)))
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

const selected = computed(() =>
  props.current === null ? undefined : find(shown.value, props.current),
)

// Une entrée se choisit, un dossier et un composant se plient.
function pick(node: Node | undefined) {
  if (node !== undefined && 'entry' in node) emit('show', node.entry.id)
}

// Le composant dont l'œil se montre : celui de la ligne survolée, ou de la story
// survolée. Les lignes de `Tree` sont sœurs, un sélecteur CSS n'atteint pas la
// ligne du composant depuis celle d'une story.
const lit = ref<string | null>(null)
function hover(event: PointerEvent) {
  const key = (event.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key
  const node = key === undefined ? undefined : find(shown.value, key)
  lit.value =
    node?.kind === 'component'
      ? node.key
      : node?.kind === 'story'
        ? `component:${componentIdOf(node.entry.path)}`
        : null
}

// Les entrées sous un dossier : le compte de la ligne.
const count = (node: Node): number =>
  'children' in node ? node.children.reduce((n, one) => n + count(one), 0) : 1

// Les nœuds que `Tree` dessine : un dossier se plie seulement, ses entrées
// comptées à droite ; ce que le statut choisi laisse de côté est grisé.
const toItems = (nodes: readonly Node[]): TreeNode[] =>
  nodes.map((node) => ({
    key: node.key,
    label: node.name,
    kind: node.kind,
    ...('children' in node ? { children: toItems(node.children) } : {}),
    ...(node.kind === 'folder' ? { count: count(node), selectable: false } : {}),
    ...(node.kind === 'component' ? { selectable: false } : {}),
    ...(grey.value.has(node.key) ? { dimmed: true } : {}),
  }))
const items = computed(() => toItems(shown.value))
</script>

<template>
  <div class="story-tree" @pointerover="hover" @pointerleave="lit = null">
    <ColumnTitle :title="label" :count="stories" />
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
    <EmptyNote v-if="entries.length === 0">{{ none }}</EmptyNote>
    <Tree
      :items="items"
      :selected="selected?.key ?? null"
      :label="label"
      :expanded="expanded"
      @update:expanded="unfold"
      @select="(key) => pick(find(shown, key))"
    >
      <template #trailing="{ node }">
        <button
          v-if="node.kind === 'component'"
          type="button"
          class="eye"
          :data-lit="node.key === lit || undefined"
          :aria-label="`Open the docs page of ${node.label}`"
          @click.stop="emit('open', node.key.slice('component:'.length))"
        >
          <Icon :icon="ViewIcon" />
        </button>
      </template>
    </Tree>
  </div>
</template>

<style scoped>
.story-tree {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  --empty-note-padding: var(--space-0-5) var(--space-3);
}

.eye {
  display: flex;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-subtle);
  cursor: pointer;
  opacity: 0;
}

.eye[data-lit],
.eye:focus-visible {
  opacity: 1;
}

.eye:hover {
  color: var(--text-primary);
}

.tabs {
  display: flex;
  margin: 0 var(--space-3);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  border-radius: var(--radius-sm);
  background: var(--background-raised);
}

.tabs button {
  flex: 1;
  padding: var(--space-1) var(--space-1-5);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) transparent;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  cursor: pointer;
}

.tabs button[data-state='on'] {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--accent-base);
  background: var(--background-current);
  color: var(--text-current);
}

.tabs button[data-state='on']:hover {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--accent-hover);
  background: var(--background-current-hover);
  color: var(--text-current-hover);
}
</style>
