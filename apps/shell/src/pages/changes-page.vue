<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { computed } from 'vue'
import { componentOfId, type Change, type Changes } from './changes'
import { componentIdOf } from '../navigation/tree'
import { placeSearch, sameTab } from '../navigation/url'

// Ce qui a changé dans le catalogue depuis le dernier commit : des identifiants,
// des statuts et des noms de props, jamais un pixel. Trois natures, séparées parce
// qu'elles n'appellent pas la même réaction.
const props = defineProps<{ changes: Changes | null; stories: StoryEntry[] }>()
const emit = defineEmits<{ show: [id: string]; open: [component: string] }>()

const list = computed(() =>
  props.changes !== null && 'changes' in props.changes ? props.changes.changes : [],
)
const groups = computed(() =>
  (
    [
      ['appeared', 'Appeared'],
      ['changed', 'Changed'],
      ['disappeared', 'Disappeared'],
    ] as const
  )
    .map(([kind, title]) => ({ kind, title, rows: list.value.filter((one) => one.kind === kind) }))
    .filter((group) => group.rows.length > 0),
)

const story = (id: string) => props.stories.find((one) => one.id === id)

// Une story partie mène à la page de son composant, s'il en reste une.
const remaining = (id: string) => {
  const component = componentOfId(id)
  return component !== null && props.stories.some((one) => componentIdOf(one.path) === component)
    ? component
    : null
}

const added = (change: Change) =>
  change.kind === 'changed' && change.props
    ? change.props.after.filter((one) => !change.props!.before.includes(one))
    : []
const removed = (change: Change) =>
  change.kind === 'changed' && change.props
    ? change.props.before.filter((one) => !change.props!.after.includes(one))
    : []

function follow(event: MouseEvent, go: () => void) {
  if (!sameTab(event)) return
  event.preventDefault()
  go()
}
</script>

<template>
  <section class="changes-page" aria-label="Changes">
    <h2>Changes since the last commit</h2>
    <p v-if="changes === null" class="note">Reading the changes…</p>
    <p v-else-if="'reason' in changes" class="note">
      The changes cannot be read: {{ changes.reason }}.
    </p>
    <p v-else-if="list.length === 0" class="note">Nothing changed in the catalogue.</p>

    <section v-for="group of groups" :key="group.kind" :class="group.kind">
      <h3>{{ group.title }} · {{ group.rows.length }}</h3>
      <ul>
        <li v-for="change of group.rows" :key="change.id">
          <a
            v-if="change.kind !== 'disappeared' && story(change.id)"
            :href="placeSearch({ mode: 'entry', id: change.id })"
            @click="follow($event, () => emit('show', change.id))"
          >
            {{ story(change.id)!.path.join(' / ') }} / {{ story(change.id)!.name }}
          </a>
          <a
            v-else-if="change.kind === 'disappeared' && remaining(change.id)"
            :href="placeSearch({ mode: 'component', id: remaining(change.id)! })"
            @click="follow($event, () => emit('open', remaining(change.id)!))"
          >
            <code>{{ change.id }}</code>
          </a>
          <code v-else>{{ change.id }}</code>

          <span v-for="prop of added(change)" :key="`+${prop}`" class="added">+{{ prop }}</span>
          <span v-for="prop of removed(change)" :key="`-${prop}`" class="removed">−{{ prop }}</span>
          <span v-if="change.kind === 'changed' && change.status" class="status">
            {{ change.status.before }} → {{ change.status.after }}
          </span>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.changes-page {
  min-height: 70vh;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-3xl);
  letter-spacing: var(--tracking-tight);
}

table {
  border-collapse: collapse;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

/* The rows of the Figma tables: a 24 px header, 32 px items, 12 px between cells. */
thead th {
  padding-block: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

th,
td {
  text-align: left;
  vertical-align: top;
  padding: var(--space-1-5) var(--space-3) var(--space-1-5) 0;
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-light);
}

/* Mono text on a 14 px line: aligned on the baseline, it grew each row by 1 px. */
td code {
  vertical-align: top;
}

a {
  color: var(--text-current);
  text-decoration: none;
}

a:hover {
  color: var(--text-current-hover);
}

code {
  font-size: var(--text-xs);
}

h3 {
  margin: var(--space-6) 0 var(--space-1-5);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  padding: var(--space-1-5) 0;
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-light);
}

.note {
  color: var(--text-muted);
}

.added,
.removed,
.status {
  margin-left: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.added {
  color: var(--text-current);
}

.removed {
  color: var(--error-text);
}

.status {
  color: var(--text-muted);
}
</style>
