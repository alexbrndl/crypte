<script setup lang="ts">
import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { Clock01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { Button, Field, Input } from '@crypte/ui'
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
import { computed, ref, useTemplateRef, watch } from 'vue'
import Icon from '../ui/icon.vue'
import { complete, FILTERS, readQuery, type Key } from './filters'
import { ago, type Visit } from './recent'
import { componentIdOf, fold } from './tree'

// La palette : un nom mène à sa story, à son composant, à sa famille de tokens ou
// à la vue versions, et les actions du shell s'y lancent, leur raccourci affiché.
// Pas de commandes de plugin : ce serait une clé de plus au contrat figé (§6.1),
// et aucun plugin n'en demande. Rouvert quand un plugin réel en demande une.

export interface Action {
  label: string
  keys?: string
  run: () => void
}

const props = defineProps<{
  entries: (StoryEntry | TokensEntry)[]
  actions: Action[]
  recent: Visit[]
}>()
const emit = defineEmits<{ show: [id: string]; open: [component: string]; changes: [] }>()
const open = defineModel<boolean>('open', { required: true })

// La ligne `palette/row` : le contexte en mono, le libellé, et en fin de ligne le
// raccourci, le statut ou l'ancienneté.
interface Command {
  key: string
  group: string
  type: 'action' | 'page' | (typeof FILTERS.type)[number]
  context: string
  label: string
  keys?: string
  status?: string
  run: () => void
}

const GROUPS = ['Actions', 'Components', 'Stories', 'Tokens', 'Pages']

const installing = ref(false)

// Dans l'ordre du manifeste, comme l'arbre.
const commands = computed<Command[]>(() => {
  const components = new Map<string, string[]>()
  const entries: Command[] = []

  for (const entry of props.entries) {
    const context = entry.path.join(' / ')
    if (entry.type === 'tokens') {
      entries.push({
        key: entry.id,
        group: 'Tokens',
        type: 'token',
        context,
        label: entry.name,
        run: () => emit('show', entry.id),
      })
      continue
    }
    entries.push({
      key: entry.id,
      group: 'Stories',
      type: 'story',
      context,
      label: entry.name,
      ...(entry.meta?.status ? { status: entry.meta.status } : {}),
      run: () => emit('show', entry.id),
    })
    components.set(componentIdOf(entry.path), entry.path)
  }

  return [
    ...props.actions.map((one) => ({
      ...one,
      key: `action:${one.label}`,
      group: 'Actions',
      type: 'action' as const,
      context: '',
    })),
    {
      key: 'action:install',
      group: 'Actions',
      type: 'action',
      context: '',
      label: 'Install a plugin…',
      run: () => (installing.value = true),
    },
    ...[...components].map(([id, path]) => ({
      key: `component:${id}`,
      group: 'Components',
      type: 'component' as const,
      context: path.slice(0, -1).join(' / '),
      label: path.at(-1)!,
      run: () => emit('open', id),
    })),
    ...entries,
    {
      key: 'changes',
      group: 'Pages',
      type: 'page',
      context: '',
      label: 'Changes since the last commit',
      run: () => emit('changes'),
    },
  ]
})

const query = ref('')

// Un `is:` ne garde que ce qui porte un statut, un `type:` que ce qui en est un.
const kept = computed(() => {
  const { is, type, text } = readQuery(query.value)
  const wanted = fold(text)
  return commands.value.filter(
    (one) =>
      (is.length === 0 || (one.status !== undefined && is.includes(one.status))) &&
      (type.length === 0 || type.includes(one.type)) &&
      fold([one.context, one.label].filter(Boolean).join(' / ')).includes(wanted),
  )
})

// Rien de tapé : les récents d'abord, ceux dont la commande existe encore.
const recentRows = computed(() =>
  query.value.trim() === ''
    ? props.recent.flatMap((visit) => {
        const command = commands.value.find((one) => one.key === visit.key)
        return command ? [{ ...command, key: `recent:${visit.key}`, at: visit.at }] : []
      })
    : [],
)

const groups = computed(() =>
  GROUPS.map((name) => ({ name, items: kept.value.filter((one) => one.group === name) })).filter(
    (group) => group.items.length > 0,
  ),
)

// Proposés tant qu'aucun nom n'est tapé : choisir une clé l'écrit dans le champ.
const filterRows = computed(() =>
  readQuery(query.value).text === ''
    ? (Object.keys(FILTERS) as Key[]).map((key) => ({ key, values: FILTERS[key].join(' · ') }))
    : [],
)

const count = computed(() => {
  if (query.value.trim() === '') return 'is: type: to filter'
  const found = kept.value.length
  return `${found} ${found === 1 ? 'result' : 'results'}`
})

const filter = useTemplateRef<{ $el: HTMLInputElement }>('filter')

watch(open, (now) => {
  if (!now) return
  query.value = ''
  installing.value = false
  copied.value = false
})

function choose(command: Command) {
  if (command.key === 'action:install') return void command.run()
  open.value = false
  command.run()
}

function addFilter(key: Key) {
  query.value = `${query.value.trimEnd()} ${key}:`.trimStart()
  filter.value?.$el.focus()
}

// ⇥ complète un filtre ; sans rien à compléter, il garde son rôle.
function tab(event: KeyboardEvent) {
  const done = complete(query.value)
  if (done === null) return
  event.preventDefault()
  query.value = done
}

// Ni catalogue ni installation à chaud : la commande à copier, et la ligne à
// ajouter à la configuration.
const name = ref('')
const copied = ref(false)
const command = computed(() => `npm install -D ${name.value.trim() || '<package>'}`)

async function copy() {
  try {
    await navigator.clipboard.writeText(command.value)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="overlay" />
      <DialogContent class="palette" :aria-describedby="undefined">
        <DialogTitle class="title">{{ installing ? 'Install a plugin' : 'Commands' }}</DialogTitle>
        <section v-if="installing" class="install">
          <h2>Install a plugin</h2>
          <p>
            Crypte installs nothing itself: add the package with npm, then call it in
            <code>plugins</code>.
          </p>
          <Field v-slot="{ id }" label="Package">
            <Input
              :id="id"
              :value="name"
              autofocus
              placeholder="crypte-plugin-figma"
              @input="(event: Event) => (name = (event.target as HTMLInputElement).value)"
            />
          </Field>
          <div class="snippet">
            <code>{{ command }}</code>
            <Button variant="secondary" class="copy" :disabled="name.trim() === ''" @click="copy">
              {{ copied ? 'Copied' : 'Copy' }}
            </Button>
          </div>
          <pre><code>// crypte.config.ts
plugins: [plugin()],</code></pre>
        </section>
        <ListboxRoot v-else highlight-on-hover>
          <div class="query">
            <Icon :icon="Search01Icon" />
            <ListboxFilter
              ref="filter"
              v-model="query"
              auto-focus
              class="filter"
              aria-label="Go to or run"
              placeholder="Search or run"
              @keydown.tab="tab"
            />
            <span class="count">{{ count }}</span>
          </div>
          <ListboxContent class="results" aria-label="Results">
            <p v-if="groups.length === 0 && filterRows.length === 0" class="none">
              Nothing matches.
            </p>
            <ListboxGroup v-if="recentRows.length > 0">
              <ListboxGroupLabel class="group"
                ><Icon :icon="Clock01Icon" />Recent</ListboxGroupLabel
              >
              <ListboxItem
                v-for="one of recentRows"
                :key="one.key"
                :value="one.key"
                class="item"
                @select="choose(one)"
              >
                <span class="context">{{ one.context }}</span>
                <span class="label">{{ one.label }}</span>
                <span class="trailing">{{ ago(one.at) }}</span>
              </ListboxItem>
            </ListboxGroup>
            <ListboxGroup v-for="group of groups" :key="group.name">
              <ListboxGroupLabel class="group">{{ group.name }}</ListboxGroupLabel>
              <ListboxItem
                v-for="one of group.items"
                :key="one.key"
                :value="one.key"
                class="item"
                @select="choose(one)"
              >
                <span class="context">{{ one.context }}</span>
                <span class="label">{{ one.label }}</span>
                <span class="trailing">
                  <kbd v-if="one.keys">{{ one.keys }}</kbd>
                  <template v-else-if="one.status">{{ one.status }}</template>
                </span>
              </ListboxItem>
            </ListboxGroup>
            <ListboxGroup v-if="filterRows.length > 0">
              <ListboxGroupLabel class="group">Filters</ListboxGroupLabel>
              <ListboxItem
                v-for="one of filterRows"
                :key="one.key"
                :value="`filter:${one.key}`"
                class="item"
                @select.prevent="addFilter(one.key)"
              >
                <span class="context">{{ one.key }}:</span>
                <span class="label">{{ one.values }}</span>
                <span class="trailing" />
              </ListboxItem>
            </ListboxGroup>
          </ListboxContent>
          <footer class="footer">
            <span>↑↓ browse</span>
            <span>↵ open</span>
            <span class="hint">⇥ complete a filter</span>
            <span class="hint">filters combine</span>
          </footer>
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

/* La palette du fichier Figma : 640 de large, rayon md, ombre 0 8 24. */
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
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--stone-950) 18%, transparent);
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

/* La ligne `query` : padding 12/16, gap 8, le compte à droite. */
.query {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-base);
  color: var(--text-muted);
}

.filter {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-base);
  line-height: var(--leading-base);
  outline: none;
}

.filter::placeholder {
  color: var(--text-subtle);
}

.count {
  flex: none;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.results {
  max-height: 50vh;
  overflow-y: auto;
}

[role='group'] + [role='group'] {
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-base);
}

/* L'en-tête de groupe : padding 6/16, gap 8, capitales en text/subtle. */
.group {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-1-5) var(--space-4);
  color: var(--text-subtle);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* `palette/row` : trois colonnes, 170 / le reste / 96, padding 6/16, gap 12. */
.item {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-1-5) var(--space-4);
  color: var(--text-primary);
  cursor: pointer;
}

.item[data-highlighted] {
  background: var(--background-current);
}

.item[data-highlighted] .label {
  color: var(--text-current);
}

.context,
.trailing {
  flex: none;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context {
  width: 170px;
}

.trailing {
  width: 96px;
  text-align: right;
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Le pied : padding 8/16, gap 12, sur le fond de base. */
.footer {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-base);
  background: var(--background-base);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.footer .hint {
  color: var(--text-subtle);
}

.install {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.install h2,
.install p,
.install pre {
  margin: 0;
}

.install h2 {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  line-height: var(--leading-base);
}

.install p {
  color: var(--text-muted);
}

.snippet {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

code,
pre {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

pre {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--background-subtle);
  color: var(--text-muted);
}
</style>
