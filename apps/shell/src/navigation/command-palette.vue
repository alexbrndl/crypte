<script setup lang="ts">
import { plural } from '../plural'
import { Clock01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { Button, Field, Input, EmptyNote } from '@crypte/ui'
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
  VisuallyHidden,
} from 'reka-ui'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import Icon from '../ui/icon.vue'
import { complete, editing, FILTERS, keysStarted, readQuery, type Key } from './filters'
import { ago, type Visit } from './recent'
import { componentIdOf, fold, type Listed } from './tree'

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
  entries: Listed[]
  actions: Action[]
  recent: Visit[]
  // La clé de l'endroit affiché, que les récents taisent.
  here: string | null
  // Les vues des plugins, qui s'ouvrent d'ici comme de l'activity bar.
  views?: { name: string; label: string }[]
}>()
const emit = defineEmits<{
  show: [id: string]
  open: [component: string]
  changes: []
  view: [plugin: string]
}>()
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

// Dans l'ordre du manifeste, comme l'arbre. Le statut est celui du composant, lu
// sur sa première story comme le filtre de la sidebar : `meta` se déclare par
// fichier, et `is:stable` garde ou écarte un composant avec toutes ses stories.
const commands = computed<Command[]>(() => {
  const components = new Map<string, { path: string[]; status?: string }>()
  const entries: Command[] = []

  for (const entry of props.entries) {
    const context = entry.path.join(' / ')
    if (entry.type === 'page') {
      entries.push({
        key: entry.id,
        group: 'Pages',
        type: 'page',
        context,
        label: entry.name,
        run: () => emit('show', entry.id),
      })
      continue
    }
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
    const id = componentIdOf(entry.path)
    if (!components.has(id))
      components.set(id, {
        path: entry.path,
        ...(entry.meta?.status ? { status: entry.meta.status } : {}),
      })
    const { status } = components.get(id)!
    entries.push({
      key: entry.id,
      group: 'Stories',
      type: 'story',
      context,
      label: entry.name,
      ...(status ? { status } : {}),
      run: () => emit('show', entry.id),
    })
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
    ...[...components].map(([id, { path, status }]) => ({
      key: `component:${id}`,
      group: 'Components',
      type: 'component' as const,
      context: path.slice(0, -1).join(' / '),
      label: path.at(-1)!,
      ...(status ? { status } : {}),
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
    ...(props.views ?? []).map((one) => ({
      key: `view:${one.name}`,
      group: 'Pages',
      type: 'page' as const,
      context: 'view',
      label: one.label,
      run: () => emit('view', one.name),
    })),
  ]
})

const query = ref('')

// Un `is:` ne garde que ce qui porte un statut, un `type:` que ce qui en est un.
// Dans un filtre, `type:` ou `is:st`, la liste ne propose que ses valeurs.
const inFilter = computed(() => editing(query.value))
const valueRows = computed(() => {
  const at = inFilter.value
  if (at === null) return []
  return FILTERS[at.key]
    .filter((value) => value.startsWith(at.partial))
    .map((value) => ({ key: at.key, value }))
})

const kept = computed(() => {
  if (inFilter.value !== null) return []
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
        if (visit.key === props.here) return []
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

// Sous les résultats : toutes les clés sans nom tapé, sinon celles que le dernier
// mot commence, `ty` pour `type:`. Choisir une clé l'écrit dans le champ.
const filterRows = computed(() => {
  if (inFilter.value !== null) return []
  const keys =
    readQuery(query.value).text === '' ? (Object.keys(FILTERS) as Key[]) : keysStarted(query.value)
  return keys.map((key) => ({ key, values: FILTERS[key].join(' · ') }))
})

const count = computed(() => {
  if (query.value.trim() === '') return 'is: type: to filter'
  if (inFilter.value !== null) {
    const values = valueRows.value.length
    return `${plural(values, 'value')}`
  }
  const found = kept.value.length
  return `${plural(found, 'result')}`
})

const filter = useTemplateRef<{ $el: HTMLInputElement }>('filter')
const listbox = useTemplateRef<{ highlightFirstItem: () => void }>('listbox')

// Une requête écrite par la palette, et non tapée : Reka ne surligne la première
// ligne qu'à la frappe, et Entrée resterait sans effet.
async function write(next: string) {
  query.value = next
  filter.value?.$el.focus()
  await nextTick()
  listbox.value?.highlightFirstItem()
}

watch(open, (now) => {
  if (!now) return
  query.value = ''
  installing.value = false
  name.value = ''
  copied.value = false
})

function choose(command: Command) {
  if (command.key === 'action:install') return void command.run()
  open.value = false
  command.run()
}

// La clé remplace le mot qui la commençait, ou s'ajoute après les autres.
function addFilter(key: Key) {
  const start = query.value.search(/\S*$/)
  const word = query.value.slice(start)
  const before = key.startsWith(word) ? query.value.slice(0, start) : `${query.value.trimEnd()} `
  void write(`${before.trimStart()}${key}:`)
}

function addValue(value: string) {
  const at = inFilter.value
  if (at === null) return
  void write(`${query.value.slice(0, at.start)}${at.key}:${value} `)
}

// ⇥ complète un filtre ; sans rien à compléter, il garde son rôle.
function tab(event: KeyboardEvent) {
  const done = complete(query.value)
  if (done === null) return
  event.preventDefault()
  void write(done)
}

// Ni catalogue ni installation à chaud : la commande à copier, et la ligne à
// ajouter à la configuration.
const name = ref('')
const copied = ref(false)
const field = useTemplateRef<{ $el: HTMLInputElement }>('field')

// Le champ arrive après l'ouverture : `autofocus` ne vaut qu'à l'insertion de la
// page, et le focus resterait sur le champ de recherche disparu.
watch(installing, async (now) => {
  if (!now) return
  await nextTick()
  field.value?.$el.focus()
})
const command = computed(() => `npm install -D ${name.value.trim() || '<package>'}`)

// Le paquet sans sa version, `@acme/x@2` s'importe `@acme/x`, et le nom de
// l'import qu'il donne : `@acme/crypte-plugin-figma` donne `figma`. Un mot
// réservé, `default`, ne se déclare pas : il prend `Plugin` en suffixe.
const RESERVED = new Set(
  'arguments await break case catch class const continue debugger default delete do else enum eval export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield'.split(
    ' ',
  ),
)
const bare = computed(() => name.value.trim().replace(/^(@?[^@]+)@.*$/, '$1'))
const binding = computed(() => {
  const last = bare.value
    .split('/')
    .at(-1)!
    .replace(/^crypte-(plugin-)?/, '')
  const camel = last.replace(/[^a-zA-Z0-9]+(.)?/g, (_, next?: string) => next?.toUpperCase() ?? '')
  if (!/^[a-zA-Z]/.test(camel)) return 'plugin'
  return RESERVED.has(camel) ? `${camel}Plugin` : camel
})
const config = computed(
  () =>
    `// crypte.config.ts\nimport ${binding.value} from '${bare.value || '<package>'}'\n\nplugins: [${binding.value}()],`,
)

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
        <VisuallyHidden as-child
          ><DialogTitle>{{
            installing ? 'Install a plugin' : 'Commands'
          }}</DialogTitle></VisuallyHidden
        >
        <section v-if="installing" class="install">
          <h2>Install a plugin</h2>
          <p>
            Crypte installs nothing itself: add the package with npm, then call it in
            <code>plugins</code>.
          </p>
          <Field v-slot="{ id }" label="Package">
            <Input
              :id="id"
              ref="field"
              :value="name"
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
          <pre class="config"><code>{{ config }}</code></pre>
        </section>
        <ListboxRoot v-else ref="listbox" highlight-on-hover>
          <div class="query">
            <Icon :icon="Search01Icon" />
            <ListboxFilter
              ref="filter"
              v-model="query"
              auto-focus
              class="filter"
              aria-label="Go to or run"
              placeholder="Search or run"
              @keydown.tab.exact="tab"
            />
            <span class="count">{{ count }}</span>
          </div>
          <ListboxContent class="results" aria-label="Results">
            <EmptyNote
              v-if="groups.length === 0 && filterRows.length === 0 && valueRows.length === 0"
            >
              Nothing matches.
            </EmptyNote>
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
            <ListboxGroup v-if="valueRows.length > 0">
              <ListboxGroupLabel class="group">Values</ListboxGroupLabel>
              <ListboxItem
                v-for="one of valueRows"
                :key="one.value"
                :value="`value:${one.value}`"
                class="item"
                @select.prevent="addValue(one.value)"
              >
                <span class="context">{{ one.key }}:</span>
                <span class="label">{{ one.value }}</span>
                <span class="trailing" />
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
  --empty-note-padding: var(--space-3) var(--space-4);
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
  letter-spacing: var(--tracking-wider);
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
