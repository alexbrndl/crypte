<script setup lang="ts">
import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  ListboxContent,
  ListboxFilter,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxRoot,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { componentIdOf, fold } from './tree'

// La palette : un nom mène à sa story, à son composant, à sa famille de tokens ou
// au mode changements, et les actions du shell s'y lancent, leur raccourci
// affiché. Pas de commandes de plugin : ce serait une clé de plus au contrat figé
// (§6.1), et aucun plugin n'en demande. Rouvert quand un plugin réel en demande une.

export interface Action {
  label: string
  keys?: string
  run: () => void
}

const props = defineProps<{ entries: (StoryEntry | TokensEntry)[]; actions: Action[] }>()
const emit = defineEmits<{ show: [id: string]; open: [component: string]; changes: [] }>()
const open = defineModel<boolean>('open', { required: true })

interface Command extends Action {
  key: string
  group: string
}

const GROUPS = ['Actions', 'Components', 'Stories', 'Tokens', 'Pages']

// Dans l'ordre du manifeste, comme l'arbre.
const commands = computed<Command[]>(() => {
  const components = new Map<string, string>()
  const entries: Command[] = []

  for (const entry of props.entries) {
    const label = [...entry.path, entry.name].join(' / ')
    const group = entry.type === 'tokens' ? 'Tokens' : 'Stories'
    entries.push({ key: entry.id, group, label, run: () => emit('show', entry.id) })
    if (entry.type === 'story') components.set(componentIdOf(entry.path), entry.path.join(' / '))
  }

  return [
    ...props.actions.map((one) => ({ ...one, key: `action:${one.label}`, group: 'Actions' })),
    ...[...components].map(([id, label]) => ({
      key: `component:${id}`,
      group: 'Components',
      label,
      run: () => emit('open', id),
    })),
    ...entries,
    {
      key: 'changes',
      group: 'Pages',
      label: 'Changes since the last commit',
      run: () => emit('changes'),
    },
  ]
})

const query = ref('')

const groups = computed(() => {
  const wanted = fold(query.value)
  const kept = commands.value.filter((one) => fold(one.label).includes(wanted))
  return GROUPS.map((name) => ({ name, items: kept.filter((one) => one.group === name) })).filter(
    (group) => group.items.length > 0,
  )
})

watch(open, (now) => {
  if (now) query.value = ''
})

// Lancée une fois la palette fermée, et sans le focus que la fermeture rend au
// bouton qui l'a ouverte : la recherche de l'arbre le perdait aussitôt pris.
// Mesuré dans Chromium.
let pending: (() => void) | null = null

function choose(command: Command) {
  pending = command.run
  open.value = false
}

function settle(event: Event) {
  if (!pending) return
  event.preventDefault()
  const run = pending
  pending = null
  run()
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="overlay" />
      <DialogContent class="palette" :aria-describedby="undefined" @close-auto-focus="settle">
        <DialogTitle class="title">Commands</DialogTitle>
        <ListboxRoot highlight-on-hover>
          <ListboxFilter
            v-model="query"
            auto-focus
            class="filter"
            aria-label="Go to or run"
            placeholder="Go to a story, a component, tokens, or run an action"
          />
          <ListboxContent class="results">
            <p v-if="groups.length === 0" class="none">Nothing matches.</p>
            <ListboxGroup v-for="group of groups" :key="group.name">
              <ListboxGroupLabel class="group">{{ group.name }}</ListboxGroupLabel>
              <ListboxItem
                v-for="one of group.items"
                :key="one.key"
                :value="one.key"
                class="item"
                @select="choose(one)"
              >
                <span>{{ one.label }}</span>
                <kbd v-if="one.keys">{{ one.keys }}</kbd>
              </ListboxItem>
            </ListboxGroup>
          </ListboxContent>
        </ListboxRoot>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(17 24 39 / 0.3);
}

.palette {
  position: fixed;
  top: 12vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, 90vw);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgb(17 24 39 / 0.18);
  font-family: system-ui, sans-serif;
  font-size: 13px;
}

.title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.filter {
  box-sizing: border-box;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  font: inherit;
  font-size: 14px;
  outline: none;
}

.results {
  max-height: 50vh;
  overflow-y: auto;
  padding: 4px;
}

.group {
  padding: 8px 10px 4px;
  color: #6b7280;
  font-size: 11px;
}

.item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.item[data-highlighted] {
  background: #f3f4f6;
}

kbd {
  color: #6b7280;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.none {
  margin: 0;
  padding: 10px;
  color: #6b7280;
}
</style>
