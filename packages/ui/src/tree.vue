<script setup lang="ts">
import { TreeItem, TreeRoot } from 'reka-ui'
import { computed, ref } from 'vue'
import Chevron from './chevron.vue'
import type { TreeNode } from './tree'

// A tree that folds, the `row` of the Figma sidebar at each level: a guide
// under each ancestor, the chosen row's band starting from its parent's guide.
// `expanded` lists the open branches; given, the parent keeps it, say to
// remember it, and absent, every branch starts open.
const props = defineProps<{
  items: TreeNode[]
  selected: string | null
  // Names the tree for a screen reader.
  label: string
  expanded?: string[]
}>()
const emit = defineEmits<{ select: [key: string]; 'update:expanded': [keys: string[]] }>()

const branches = (nodes: readonly TreeNode[]): string[] =>
  nodes.flatMap((node) => (node.children ? [node.key, ...branches(node.children)] : []))
// Without `expanded`, what was folded, not what is open: a branch arriving
// after the mount, a view's data through the channel, starts open like the rest.
const folded = ref<string[]>([])
const open = computed(
  () => props.expanded ?? branches(props.items).filter((key) => !folded.value.includes(key)),
)
function expand(keys: string[]) {
  if (props.expanded === undefined)
    folded.value = branches(props.items).filter((key) => !keys.includes(key))
  emit('update:expanded', keys)
}

const find = (nodes: readonly TreeNode[], key: string): TreeNode | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node
    const inside = node.children ? find(node.children, key) : undefined
    if (inside) return inside
  }
  return undefined
}
const chosen = computed(() =>
  props.selected === null ? undefined : find(props.items, props.selected),
)

// A row that can be chosen does not fold on a click on its label: the chevron folds,
// the label leads somewhere. The arrow keys always fold.
const notFolding = (node: TreeNode, event: CustomEvent<{ originalEvent: Event }>) => {
  if (node.selectable !== false && event.detail.originalEvent.type === 'click')
    event.preventDefault()
}

// The guides sit at the middle of each ancestor's chevron, at 20, 32, 44 px. A
// chosen row puts its marker in place of its parent's guide, and its band starts
// there: the choice sits in the hierarchy rather than covering it.
const GUIDE = 20
const STEP = 12
const guides = (level: number, selected: boolean) =>
  Array.from({ length: level - 1 - (selected ? 1 : 0) }, (_, at) => GUIDE + at * STEP)
const marker = (level: number) => (level > 1 ? GUIDE + (level - 2) * STEP : 0)
</script>

<template>
  <TreeRoot
    v-slot="{ flattenItems }"
    :items="items"
    :get-key="(node: TreeNode) => node.key"
    :get-children="(node: TreeNode) => node.children"
    :expanded="open"
    :model-value="chosen"
    selection-behavior="replace"
    class="tree"
    :aria-label="label"
    @update:expanded="expand"
    @update:model-value="(node) => node && emit('select', (node as TreeNode).key)"
  >
    <TreeItem
      v-for="item of flattenItems"
      :key="item._id"
      v-slot="{ isExpanded, isSelected, handleToggle }"
      v-bind="item.bind"
      :data-kind="item.value.kind"
      :data-dimmed="item.value.dimmed || undefined"
      :style="{ paddingLeft: `${12 + (item.level - 1) * STEP}px` }"
      @select="(event) => item.value.selectable === false && event.preventDefault()"
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
      <!-- Kept on every row; empty, it lets the click through to the row. -->
      <span
        class="chevron"
        @click="
          (event: MouseEvent) => item.hasChildren && (event.stopPropagation(), handleToggle())
        "
      >
        <Chevron v-if="item.hasChildren" :open="isExpanded" />
      </span>
      <span class="name">{{ item.value.label }}</span>
      <span v-if="item.value.count !== undefined" class="count">{{ item.value.count }}</span>
    </TreeItem>
  </TreeRoot>
</template>

<style scoped>
.tree {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: var(--space-2) 0;
  list-style: none;
}

.tree li {
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

.tree li:hover {
  background: var(--background-hover);
  color: var(--text-primary);
}

.tree li:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.tree li[data-selected] {
  color: var(--text-current);
  font-weight: var(--weight-medium);
}

.tree li[data-selected]:hover {
  color: var(--text-current-hover);
}

.tree li[data-selected]:hover .band {
  background: var(--background-current-hover);
}

.tree li[data-selected]:hover .marker {
  background: var(--accent-hover);
}

.tree li[data-dimmed] {
  opacity: 0.4;
}

/* Under the row's background, as the Figma row component wants. */
.guide {
  position: absolute;
  inset-block: 0;
  z-index: -1;
  /* A border: the guide has no width, an inset shadow would draw nothing. */
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

.count {
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}
</style>
