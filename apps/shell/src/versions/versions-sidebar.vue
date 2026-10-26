<script setup lang="ts">
import { VisuallyHidden } from 'reka-ui'
import { ComponentIcon, Hexagon01Icon } from '@hugeicons/core-free-icons'
import { Field, Input, Select, EmptyNote, SidebarLink, ColumnTitle } from '@crypte/ui'
import { computed, ref } from 'vue'
import Icon from '../ui/icon.vue'
import type { Difference } from './differences'
import { texts } from '../i18n'

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
  // Quand `crypte build` a tourné, `null` sous `crypte dev`.
  built: string | null
  tokens: Difference[]
  stories: Difference[]
  selected: string | null
  hrefOf: (key: string) => string
}>()
const emit = defineEmits<{ since: [since: Since]; select: [key: string, event: MouseEvent] }>()

const t = texts({
  en: {
    defaultBranch: 'Default branch',
    lastCommit: 'Last commit',
    last7: 'Last 7 days',
    last30: 'Last 30 days',
    added: 'added',
    modified: 'modified',
    removed: 'removed',
    tokens: 'Tokens',
    stories: 'Stories',
    versions: 'Versions',
    from: 'From',
    typed: 'Or a commit, a tag or a date',
    none: 'No difference.',
  },
  fr: {
    defaultBranch: 'Branche par défaut',
    lastCommit: 'Dernier commit',
    last7: '7 derniers jours',
    last30: '30 derniers jours',
    added: 'ajouté',
    modified: 'modifié',
    removed: 'supprimé',
    tokens: 'Tokens',
    stories: 'Stories',
    versions: 'Versions',
    from: 'Depuis',
    typed: 'Ou un commit, un tag ou une date',
    none: 'Aucun écart.',
  },
})

// Une date d'il y a N jours, au jour près : le CLI la lit comme son minuit. Sur
// un build, avant le build et en UTC, comme `crypte build` a nommé ses fichiers.
const daysAgo = (days: number) => {
  if (props.built)
    return new Date(Date.parse(props.built) - days * 86_400_000).toISOString().slice(0, 10)
  const at = new Date(Date.now() - days * 86_400_000)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

// Les points proposés : le point par défaut, la branche par défaut, deux périodes
// et les tags, plus le point de l'adresse quand il n'est aucun d'eux. Le point par
// défaut est le dernier commit, ou sur un build la branche par défaut, qu'il ne
// répète donc pas : le dernier commit d'un build déployé ne dit rien.
const options = computed(() => {
  const branch = props.versions?.branch
  const found: { value: string; label: string }[] = [
    { value: 'default', label: props.built ? (branch ?? t('defaultBranch')) : t('lastCommit') },
  ]
  if (branch && !props.built) found.push({ value: `ref:${branch}`, label: branch })
  found.push(
    { value: `before:${daysAgo(7)}`, label: t('last7') },
    { value: `before:${daysAgo(30)}`, label: t('last30') },
  )
  for (const tag of props.versions?.tags ?? [])
    found.push({ value: `ref:${tag.name}`, label: `${tag.name} · ${tag.date.slice(0, 10)}` })
  const current = chosen.value
  if (!found.some((one) => one.value === current))
    found.push({ value: current, label: current.replace(/^(ref|before):/, '') })
  return found
})

const chosen = computed(() =>
  props.since.before
    ? `before:${props.since.before}`
    : props.since.from
      ? `ref:${props.since.from}`
      : 'default',
)

function choose(value: string | undefined) {
  if (value === undefined || value === chosen.value) return
  if (value === 'default') {
    emit('since', {})
    return
  }
  const [kind, ...rest] = value.split(':')
  const point = rest.join(':')
  emit('since', kind === 'before' ? { before: point } : { from: point })
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
const word = (kind: keyof typeof WORDS) => t(WORDS[kind])
const groups = computed(() =>
  [
    { title: t('tokens'), rows: props.tokens },
    { title: t('stories'), rows: props.stories },
  ].filter((group) => group.rows.length > 0),
)
const total = computed(() => props.tokens.length + props.stories.length)
</script>

<template>
  <div class="versions">
    <ColumnTitle :title="t('versions')" :count="total" />
    <div class="since">
      <Field v-slot="{ id }" :label="t('from')">
        <Select :id="id" :model-value="chosen" :options="options" @update:model-value="choose" />
      </Field>
      <Field v-slot="{ id }" :label="t('typed')">
        <Input
          :id="id"
          :value="typed"
          @input="(event: Event) => (typed = (event.target as HTMLInputElement).value)"
          placeholder="a3f19c2, v1.4.0, 2026-09-16"
          @keydown.enter="apply"
        />
      </Field>
    </div>
    <EmptyNote v-if="total === 0">{{ t('none') }}</EmptyNote>
    <section v-for="group of groups" :key="group.title" class="group">
      <ColumnTitle :title="group.title" :count="group.rows.length" />
      <ul>
        <li v-for="row of group.rows" :key="row.key">
          <SidebarLink
            :href="hrefOf(row.key)"
            :data-kind="row.kind"
            :current="row.key === selected"
            @click="(event) => emit('select', row.key, event)"
          >
            <template #icon>
              <span class="sign" :title="word(row.kind)"
                >{{ SIGNS[row.kind] }}<VisuallyHidden> {{ word(row.kind) }}</VisuallyHidden></span
              >
              <Icon :icon="row.nature === 'token' ? Hexagon01Icon : ComponentIcon" />
            </template>
            {{ row.label }}
            <template #detail
              ><span class="detail">{{ row.detail }}</span></template
            >
          </SidebarLink>
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
  --empty-note-padding: var(--space-0-5) var(--space-3);
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

[data-kind='disappeared'] :deep(.label) {
  text-decoration: line-through;
}

.detail {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-link[aria-current='page'] .detail {
  color: var(--text-current);
}
</style>
