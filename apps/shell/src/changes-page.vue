<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { computed } from 'vue'
import { componentOfId, type Change, type Changes } from './changes'
import { componentIdOf } from './tree'
import { placeSearch, sameTab } from './url'

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
  font-size: 13px;
}

h2 {
  margin: 0 0 12px;
  font-size: 20px;
}

h3 {
  margin: 16px 0 6px;
  font-size: 13px;
}

ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
}

.note {
  color: #6b7280;
}

.added,
.removed,
.status {
  margin-left: 8px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.added {
  color: #166534;
}

.removed {
  color: #991b1b;
}

.status {
  color: #6b7280;
}
</style>
