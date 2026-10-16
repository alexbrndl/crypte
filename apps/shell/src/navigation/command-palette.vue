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

function choose(command: Command) {
  open.value = false
  command.run()
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="overlay" />
      <DialogContent class="palette" :aria-describedby="undefined">
        <DialogTitle class="title">Commands</DialogTitle>
        <ListboxRoot highlight-on-hover>
          <ListboxFilter
            v-model="query"
            auto-focus
            class="filter"
            aria-label="Go to or run"
            placeholder="Go to a story, a component, tokens, or run an action"
          />
          <ListboxContent class="results" aria-label="Results">
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
  background: color-mix(in srgb, var(--stone-950) 30%, transparent);
}

.palette {
  position: fixed;
  top: 12vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, 90vw);
  overflow: hidden;
  background: var(--background-raised);
  /* A real border: the highlighted option would cover an inset one. */
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--stone-950) 18%, transparent);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
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
  padding: var(--space-3) var(--space-4);
  border: 0;
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-base);
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-base);
  line-height: var(--leading-base);
  outline: none;
}

.filter::placeholder {
  color: var(--text-muted);
}

.results {
  max-height: 50vh;
  overflow-y: auto;
}

.group {
  padding: var(--space-2) var(--space-4) var(--space-1);
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-light);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.item {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-1-5) var(--space-4);
  color: var(--text-primary);
  cursor: pointer;
}

.item[data-highlighted] {
  background: var(--background-current);
  color: var(--text-current);
}

kbd {
  padding: var(--space-0-5) var(--space-1);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  border-radius: var(--radius-xs);
  background: var(--background-subtle);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.none {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  color: var(--text-muted);
}
</style>
