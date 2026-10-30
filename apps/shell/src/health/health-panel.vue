<script setup lang="ts">
import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { PanelSection } from '@crypte/ui'
import { computed } from 'vue'
import { componentIdOf } from '../navigation/tree'
import { texts } from '../i18n'
import { plural, singular } from '../plural'
import { nameOf } from '../tokens/categories'
import {
  CRITERIA,
  ORPHANS,
  READY,
  sinceOf,
  type ComponentRow,
  type Criterion,
  type Dashboard,
  type Group,
  type State,
  type TokenHealth,
} from './dashboard'
import { dayOf } from './health'

// Le panneau de la santé : le détail de ce que le dashboard a choisi, un
// composant, un token, les orphelins ou les prêts. Fermé au repos : il ne répète
// pas ce que la page montre déjà.
const props = defineProps<{
  dashboard: Dashboard
  item: string | null
  stories: StoryEntry[]
  families: readonly TokensEntry[]
  hrefOfStory: (id: string) => string
  hrefOfComponent: (id: string) => string
  hrefOfToken: (name: string) => string | null
  hrefOfChanges: string
}>()
const emit = defineEmits<{
  story: [id: string, event: MouseEvent]
  component: [id: string, event: MouseEvent]
  token: [name: string, event: MouseEvent]
  changes: [event: MouseEvent]
}>()

const t = texts({
  en: {
    componentTitle: 'component · detail',
    tokenTitle: 'token · detail',
    orphansTitle: 'tokens · orphans',
    readyTitle: 'components · ready',
    story: 'story',
    render: 'render',
    a11y: 'a11y',
    doc: 'doc',
    status: 'status',
    props: 'props',
    usages: 'usages',
    tokens: 'tokens',
    valid: 'ok',
    improve: 'to improve',
    blocking: 'blocking',
    empty: 'waiting',
    stories: 'stories',
    renders: 'light and dark',
    fails: 'fails to render',
    clean: 'no violation',
    violation: 'violation',
    violations: 'violations',
    written: 'page written',
    missing: 'page missing',
    noStatus: 'no status',
    since: '{status} since {day}',
    file: 'file',
    files: 'files',
    reads: 'reads {count}',
    stateBlocking: 'blocked, {causes}',
    stateImprove: 'to improve, {causes}',
    stateReady: 'every criterion is green',
    todo: 'to do, in order',
    openStory: 'See the story {name}',
    openComponent: 'Open the page of {name}',
    used: 'read by components',
    orphan: 'read by no component and no alias',
    brokenAlias: 'points at {target}, which is not declared',
    suspect: 'behind a contrast violation',
    readBy: 'read by {count}: {blocking} blocking, {improve} to improve, {ready} ready',
    fixOnce: 'fix it once, {count} follow',
    openToken: 'Fix it at the source, in the tokens view',
    orphansSentence: 'declared in the style sheet, read by no component and no alias',
    openOrphans: 'See them in the tokens view',
    readySentence: 'every criterion green, nothing to fix, ready to publish',
    many: 'more than 20 usages',
    some: '5 to 20',
    few: 'less than 5',
    recent: 'changed lately',
    publish: 'Publish a version',
    seeStories: 'See them in the stories view',
  },
  fr: {
    componentTitle: 'composant · détail',
    tokenTitle: 'token · détail',
    orphansTitle: 'tokens · orphelins',
    readyTitle: 'composants · prêts',
    story: 'story',
    render: 'rendu',
    a11y: 'a11y',
    doc: 'doc',
    status: 'statut',
    props: 'props',
    usages: 'usages',
    tokens: 'tokens',
    valid: 'ok',
    improve: 'à améliorer',
    blocking: 'bloquant',
    empty: 'en attente',
    stories: 'stories',
    renders: 'light et dark',
    fails: 'échoue au rendu',
    clean: 'aucune violation',
    violation: 'violation',
    violations: 'violations',
    written: 'page écrite',
    missing: 'page manquante',
    noStatus: 'sans statut',
    since: '{status} depuis le {day}',
    file: 'fichier',
    files: 'fichiers',
    reads: 'lit {count}',
    stateBlocking: 'bloqué, {causes}',
    stateImprove: 'à améliorer, {causes}',
    stateReady: 'tous les critères au vert',
    todo: "à faire, dans l'ordre",
    openStory: 'Voir la story {name}',
    openComponent: 'Ouvrir la page de {name}',
    used: 'lu par des composants',
    orphan: 'lu par aucun composant ni alias',
    brokenAlias: "pointe vers {target}, qui n'est pas déclaré",
    suspect: "en cause d'une violation de contraste",
    readBy: 'lu par {count} : {blocking} bloquant, {improve} à traiter, {ready} prêts',
    fixOnce: 'corriger une fois, {count} suivent',
    openToken: 'Corriger à la source, dans la vue tokens',
    orphansSentence: 'déclarés dans la feuille de style, lus par aucun composant ni alias',
    openOrphans: 'Les voir dans la vue tokens',
    readySentence: 'tous les critères au vert, rien à corriger, prêts à publier',
    many: '+ de 20 usages',
    some: '5 à 20',
    few: '- de 5',
    recent: 'changés récemment',
    publish: 'Publier une version',
    seeStories: 'Les voir dans la vue stories',
  },
})

const LABEL: Record<Criterion, () => string> = {
  story: () => t('story'),
  render: () => t('render'),
  a11y: () => t('a11y'),
  doc: () => t('doc'),
  status: () => t('status'),
  props: () => t('props'),
  usages: () => t('usages'),
}
const STATE: Record<State, () => string> = {
  valid: () => t('valid'),
  improve: () => t('improve'),
  blocking: () => t('blocking'),
  empty: () => t('empty'),
}

const row = computed(() => props.dashboard.rows.find((one) => one.key === props.item) ?? null)
const tokens = computed(() => props.dashboard.coverage.families.flatMap((one) => one.tokens))
const token = computed(() =>
  props.item?.startsWith('token:')
    ? (tokens.value.find((one) => `token:${one.name}` === props.item) ?? null)
    : null,
)
const nameOfKey = (key: string) =>
  props.dashboard.rows.find((one) => one.key === key)?.component.name ?? key
const ownStories = (one: ComponentRow) =>
  props.stories.filter((story) => one.component.stories.includes(story.id))

// La valeur d'un critère, ce que la case de la liste ne dit pas.
function valueOf(one: ComponentRow, criterion: Criterion): string {
  const { component, criteria } = one
  const state = criteria[criterion].state
  if (criterion === 'story') return plural(component.stories.length, t('story'), t('stories'))
  if (state === 'empty' && criterion !== 'status') return '—'
  if (criterion === 'render') return state === 'blocking' ? t('fails') : t('renders')
  if (criterion === 'a11y') return state === 'valid' ? t('clean') : t('violations')
  if (criterion === 'doc') return state === 'valid' ? t('written') : t('missing')
  if (criterion === 'status')
    return component.status
      ? component.statusSince
        ? t('since', { status: component.status, day: dayOf(component.statusSince) })
        : component.status
      : t('noStatus')
  if (criterion === 'props')
    return [criteria.props.text, ...(component.unexercised ?? [])].filter(Boolean).join(', ') || '0'
  return plural(component.usedIn?.length ?? 0, t('file'), t('files'))
}

const stateOf = (one: ComponentRow) =>
  one.group === 'ready'
    ? t('stateReady')
    : one.group === 'blocking'
      ? t('stateBlocking', { causes: one.phrase })
      : t('stateImprove', { causes: one.phrase })

// Les stories à ouvrir pour corriger.
const todo = computed(() => (row.value ? ownStories(row.value) : []))

const valuesOf = (one: TokenHealth) => {
  const entry = props.families.find((family) => family.id === one.family)
  const held = entry
    ? Object.entries(entry.tokens).find(([key]) => nameOf(entry.name, key) === one.name)?.[1]
    : undefined
  return Object.entries(held?.themes ?? {}).map(([theme, value]) => ({ theme, value: value.value }))
}
const readersOf = (one: TokenHealth) => {
  const of = (group: Group) =>
    one.readers.filter(
      (key) => props.dashboard.rows.find((row) => row.key === key)?.group === group,
    )
  return { blocking: of('blocking'), improve: of('improve'), ready: of('ready') }
}

const orphans = computed(() => {
  const found = new Map<string, string[]>()
  for (const family of props.dashboard.coverage.families) {
    const names = family.tokens.filter((one) => one.state === 'orphan').map((one) => one.name)
    if (names.length > 0) found.set(family.name, names)
  }
  return [...found]
})

const ready = computed(() => props.dashboard.rows.filter((one) => one.group === 'ready'))
const byUsage = computed(() => {
  const used = (one: ComponentRow) => one.component.usedIn?.length ?? 0
  return [
    { label: t('many'), rows: ready.value.filter((one) => used(one) > 20) },
    { label: t('some'), rows: ready.value.filter((one) => used(one) >= 5 && used(one) <= 20) },
    { label: t('few'), rows: ready.value.filter((one) => used(one) < 5) },
  ].filter((group) => group.rows.length > 0)
})
const recent = computed(() =>
  ready.value
    .filter((one) => one.component.changed)
    .sort((one, other) => other.component.changed!.localeCompare(one.component.changed!))
    .slice(0, 3),
)
const firstReadyStory = computed(() =>
  props.stories.find((story) => ready.value[0]?.component.stories.includes(story.id)),
)
</script>

<template>
  <PanelSection v-if="row" :title="t('componentTitle')" :open="true">
    <div class="rows">
      <p class="row heading">{{ row.component.name }}</p>
      <p class="caption">{{ stateOf(row) }}</p>
      <p v-for="one of CRITERIA" :key="one" class="row criterion">
        <span class="dot" :data-state="row.criteria[one].state" aria-hidden="true" />
        <span class="label">{{ LABEL[one]() }}</span>
        <span class="meta">{{ valueOf(row, one) }} · {{ STATE[row.criteria[one].state]() }}</span>
      </p>
      <p class="row criterion">
        <span class="dot" aria-hidden="true" />
        <span class="label">{{ t('tokens') }}</span>
        <span class="meta">{{
          t('reads', { count: dashboard.coverage.reads.get(row.key)?.size ?? 0 })
        }}</span>
      </p>
      <template v-if="row.group !== 'ready' && todo.length > 0">
        <p class="caption">{{ t('todo') }}</p>
        <a
          v-for="story of todo"
          :key="story.id"
          class="row link"
          :href="hrefOfStory(story.id)"
          @click="emit('story', story.id, $event)"
          >{{ t('openStory', { name: story.name }) }}</a
        >
        <a
          v-if="todo[0]"
          class="row link"
          :href="hrefOfComponent(componentIdOf(todo[0].path))"
          @click="emit('component', componentIdOf(todo[0].path), $event)"
          >{{ t('openComponent', { name: row.component.name }) }}</a
        >
      </template>
    </div>
  </PanelSection>

  <PanelSection v-else-if="token" :title="t('tokenTitle')" :open="true">
    <div class="rows">
      <p class="row heading code">--{{ token.name }}</p>
      <p class="caption">
        {{
          token.state === 'broken'
            ? t('brokenAlias', { target: `--${token.target}` })
            : token.state === 'orphan'
              ? t('orphan')
              : token.suspect
                ? t('suspect')
                : t('used')
        }}
      </p>
      <p v-for="one of valuesOf(token)" :key="one.theme" class="row">
        <span class="label">{{ one.theme }}</span>
        <span class="meta">{{ one.value }}</span>
      </p>
      <p class="caption">
        {{
          t('readBy', {
            count: token.readers.length,
            blocking: readersOf(token).blocking.length,
            improve: readersOf(token).improve.length,
            ready: readersOf(token).ready.length,
          })
        }}
      </p>
      <template v-for="group of ['blocking', 'improve', 'ready'] as const" :key="group">
        <p v-if="readersOf(token)[group].length > 0" class="row">
          <span class="dot" :data-state="group === 'ready' ? 'valid' : group" aria-hidden="true" />
          <span class="meta">{{ readersOf(token)[group].map(nameOfKey).join(', ') }}</span>
        </p>
      </template>
      <p v-if="token.readers.length > 1" class="caption">
        {{ t('fixOnce', { count: token.readers.length }) }}
      </p>
      <a
        v-if="hrefOfToken(token.name)"
        class="row link"
        :href="hrefOfToken(token.name)!"
        @click="emit('token', token.name, $event)"
        >{{ t('openToken') }}</a
      >
    </div>
  </PanelSection>

  <PanelSection v-else-if="item === ORPHANS" :title="t('orphansTitle')" :open="true">
    <div class="rows">
      <p class="row heading">{{ dashboard.coverage.orphans }}</p>
      <p class="caption">{{ t('orphansSentence') }}</p>
      <p v-for="[family, names] of orphans" :key="family" class="row">
        <span class="label">{{ family }}</span>
        <span class="meta">{{ names.map((one) => `--${one}`).join(', ') }}</span>
      </p>
      <a
        v-if="orphans[0] && hrefOfToken(orphans[0][1][0]!)"
        class="row link"
        :href="hrefOfToken(orphans[0][1][0]!)!"
        @click="emit('token', orphans[0][1][0]!, $event)"
        >{{ t('openOrphans') }}</a
      >
    </div>
  </PanelSection>

  <PanelSection v-else-if="item === READY" :title="t('readyTitle')" :open="true">
    <div class="rows">
      <p class="row heading">{{ ready.length }}</p>
      <p class="caption">{{ t('readySentence') }}</p>
      <p v-for="group of byUsage" :key="group.label" class="row">
        <span class="label">{{ group.label }}</span>
        <span class="meta">{{ group.rows.map((one) => one.component.name).join(', ') }}</span>
      </p>
      <template v-if="recent.length > 0">
        <p class="caption">{{ t('recent') }}</p>
        <p v-for="one of recent" :key="one.key" class="row">
          <span class="label">{{ one.component.name }}</span>
          <span class="meta">{{ sinceOf(one.component.changed!) }}</span>
        </p>
      </template>
      <a class="row link" :href="hrefOfChanges" @click="emit('changes', $event)">{{
        t('publish')
      }}</a>
      <a
        v-if="firstReadyStory"
        class="row link"
        :href="hrefOfStory(firstReadyStory.id)"
        @click="emit('story', firstReadyStory.id, $event)"
        >{{ t('seeStories') }}</a
      >
    </div>
  </PanelSection>
</template>

<style scoped>
.heading {
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.heading.code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.criterion .label {
  flex: none;
  width: 64px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.dot {
  width: 8px;
  height: 8px;
  flex: none;
  box-sizing: border-box;
  border-radius: var(--radius-full);
  border: var(--stroke-hairline) dashed var(--border-strong);
}

.dot[data-state='valid'] {
  border: 0;
  background: var(--success-solid);
}

.dot[data-state='improve'] {
  border: 0;
  background: var(--warning-solid);
}

.dot[data-state='blocking'] {
  border: 0;
  background: var(--error-solid);
}

.link {
  color: var(--text-current);
}
</style>
