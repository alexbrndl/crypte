<script setup lang="ts">
import { ComponentIcon, Hexagon01Icon } from '@hugeicons/core-free-icons'
import { Field, Input, Select } from '@crypte/ui'
import { computed, ref } from 'vue'
import Icon from '../ui/icon.vue'
import type { Difference } from './differences'

// La sidebar de la vue versions : d'où part la comparaison, puis les écarts, les
// tokens d'abord, chacun signé + ~ − comme une liste de contrôle de source.

export interface Since {
  from?: string
  before?: string
}

// La forme de `/@crypte/versions.json`, `packages/cli/src/catalogue/versions.ts`,
// que le shell ne peut pas importer : tenue par le cas qui dessine les tags.
export interface Versions {
  branch: string | null
  tags: { name: string; date: string }[]
}

const props = defineProps<{
  since: Since
  versions: Versions | null
  tokens: Difference[]
  stories: Difference[]
  selected: string | null
  hrefOf: (key: string) => string
}>()
const emit = defineEmits<{ since: [since: Since]; select: [key: string, event: MouseEvent] }>()

// Une date d'il y a N jours, au jour près : le CLI la lit comme son minuit.
const daysAgo = (days: number) => {
  const at = new Date(Date.now() - days * 86_400_000)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

// Les points proposés : le dernier commit, la branche par défaut, deux périodes et
// les tags, plus le point de l'adresse quand il n'est aucun d'eux.
const options = computed(() => {
  const found: { value: string; label: string }[] = [{ value: 'ref:HEAD', label: 'Last commit' }]
  if (props.versions?.branch)
    found.push({ value: `ref:${props.versions.branch}`, label: props.versions.branch })
  found.push(
    { value: `before:${daysAgo(7)}`, label: 'Last 7 days' },
    { value: `before:${daysAgo(30)}`, label: 'Last 30 days' },
  )
  for (const tag of props.versions?.tags ?? [])
    found.push({ value: `ref:${tag.name}`, label: `${tag.name} · ${tag.date.slice(0, 10)}` })
  const current = chosen.value
  if (!found.some((one) => one.value === current))
    found.push({ value: current, label: current.replace(/^(ref|before):/, '') })
  return found
})

const chosen = computed(() =>
  props.since.before ? `before:${props.since.before}` : `ref:${props.since.from ?? 'HEAD'}`,
)

function choose(value: string | undefined) {
  if (value === undefined || value === chosen.value) return
  const [kind, ...rest] = value.split(':')
  const point = rest.join(':')
  emit('since', kind === 'before' ? { before: point } : point === 'HEAD' ? {} : { from: point })
}

// Un commit, un tag ou une date, tapé : une date si elle se lit comme une date.
const typed = ref('')
function apply() {
  const point = typed.value.trim()
  if (point === '') return
  // Une date entière seulement : `2026-09-16-hotfix` est un tag.
  emit('since', /^\d{4}-\d{2}-\d{2}$/.test(point) ? { before: point } : { from: point })
  typed.value = ''
}

const SIGNS = { appeared: '+', changed: '~', disappeared: '−' } as const
const WORDS = { appeared: 'added', changed: 'modified', disappeared: 'removed' } as const
const groups = computed(() =>
  [
    { title: 'Tokens', rows: props.tokens },
    { title: 'Stories', rows: props.stories },
  ].filter((group) => group.rows.length > 0),
)
const total = computed(() => props.tokens.length + props.stories.length)
</script>

<template>
  <div class="versions">
    <div class="title">
      <h2>Versions</h2>
      <span class="meta">{{ total }}</span>
    </div>
    <div class="since">
      <Field v-slot="{ id }" label="From">
        <Select :id="id" :model-value="chosen" :options="options" @update:model-value="choose" />
      </Field>
      <Field v-slot="{ id }" label="Or a commit, a tag or a date">
        <Input
          :id="id"
          :value="typed"
          @input="(event: Event) => (typed = (event.target as HTMLInputElement).value)"
          placeholder="a3f19c2, v1.4.0, 2026-09-16"
          @keydown.enter="apply"
        />
      </Field>
    </div>
    <p v-if="total === 0" class="none">no difference</p>
    <section v-for="group of groups" :key="group.title" class="group">
      <h3>
        {{ group.title }}<span class="meta">{{ group.rows.length }}</span>
      </h3>
      <ul>
        <li v-for="row of group.rows" :key="row.key">
          <a
            :href="hrefOf(row.key)"
            :data-kind="row.kind"
            :aria-current="row.key === selected ? 'true' : undefined"
            @click="emit('select', row.key, $event)"
          >
            <span class="sign" :title="WORDS[row.kind]"
              >{{ SIGNS[row.kind] }}<span class="hidden"> {{ WORDS[row.kind] }}</span></span
            >
            <Icon :icon="row.nature === 'token' ? Hexagon01Icon : ComponentIcon" />
            <span class="label">{{ row.label }}</span>
            <span class="detail">{{ row.detail }}</span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.versions {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}

/* The column-title of the Figma sidebar, 32 px with its taller top. */
.title,
h3 {
  display: flex;
  align-items: center;
  margin: 0;
  padding: var(--space-2-5) var(--space-3) var(--space-1-5);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.title h2 {
  flex: 1;
  margin: 0;
  font: inherit;
}

h3 .meta {
  margin-left: var(--space-2);
}

.meta {
  color: var(--text-subtle);
  font-weight: var(--weight-normal);
  letter-spacing: 0;
}

/* Les versions comparées : padding 4/12/10/12, gap 6. */
.since {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  padding: var(--space-1) var(--space-3) var(--space-2-5);
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* La ligne `row` du fichier Figma : 24 px, gap 6, padding 2/12. */
a {
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
  padding: var(--space-0-5) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-decoration: none;
}

a:hover {
  background: var(--background-hover);
  color: var(--text-primary);
}

a[aria-current='true'] {
  background: var(--background-current);
  box-shadow: inset var(--stroke-marker) 0 0 var(--accent-base);
  color: var(--text-current);
}

a:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

/* Le signe `row/sign` : + success, ~ info, − error, la ligne retirée barrée. */
.sign {
  width: 12px;
  flex: none;
  font-family: var(--font-mono);
  text-align: center;
}

[data-kind='appeared'] .sign {
  color: var(--success-text);
}

[data-kind='changed'] .sign {
  color: var(--info-text);
}

[data-kind='disappeared'] .sign {
  color: var(--error-text);
}

[data-kind='disappeared'] .label {
  text-decoration: line-through;
}

.hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a[aria-current='true'] .detail {
  color: var(--text-current);
}

.none {
  margin: 0;
  padding: var(--space-0-5) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
</style>
