<script setup lang="ts">
import { plural } from '../plural'
import type { StoryEntry } from '@crypte/core/protocol'
import {
  AiMagicIcon,
  Alert02Icon,
  ComponentIcon,
  Copy01Icon,
  FileAddIcon,
  Hexagon01Icon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { computed, ref, watch } from 'vue'
import { useCopy } from '../clipboard'
import Icon from '../ui/icon.vue'
import PanelSection from '../panels/panel-section.vue'
import EmptyNote from '../ui/empty-note.vue'
import { keep, kept } from '../storage'
import { ago } from '../navigation/recent'
import { componentIdOf } from '../navigation/tree'
import type { Failure, Finding } from './audit'
import { dayOf, type HealthComponent, type HealthPage } from './health'
import { promptOf } from './prompt'

// Les deux panneaux de la vue santé, pour ce qui est choisi : « To do », ce qu'il
// reste à faire, et « Links », ce qui s'y rattache. Ce qui est choisi est un
// composant, une violation ou un rendu en échec ; les deux derniers ramènent au
// composant de leur story.
const props = defineProps<{
  component: HealthComponent | null
  finding: Finding | null
  failure: Failure | null
  // Ce que l'audit a trouvé, pour les actions d'un composant.
  findings: Finding[]
  failures: Failure[]
  stories: StoryEntry[]
  hrefOfStory: (id: string) => string
  hrefOfComponent: (id: string) => string
  hrefOfHealth: (page: HealthPage, key: string) => string
  // Où mène un token qu'une story lit, `null` s'il n'est dans aucune catégorie.
  hrefOfToken: (name: string) => string | null
}>()
const emit = defineEmits<{
  story: [id: string, event: MouseEvent]
  page: [id: string, event: MouseEvent]
  health: [page: HealthPage, key: string, event: MouseEvent]
  token: [name: string, event: MouseEvent]
}>()

// Les stories de ce qui est choisi : celles du composant, ou la seule story de la
// violation ou du rendu.
const ids = computed(() =>
  props.finding
    ? [props.finding.id]
    : props.failure
      ? [props.failure.id]
      : (props.component?.stories ?? []),
)
const own = computed(() =>
  ids.value.flatMap((id) => {
    const entry = props.stories.find((one) => one.id === id)
    return entry ? [entry] : []
  }),
)
const page = computed(() => (own.value[0] ? componentIdOf(own.value[0].path) : null))
const file = computed(() => props.component?.file ?? own.value[0]?.component.file ?? null)
const tokens = computed(() => [
  ...new Set(own.value.flatMap((entry) => entry.component.tokens ?? [])),
])
const chosen = computed(
  () => props.component !== null || props.finding !== null || props.failure !== null,
)
const title = computed(() =>
  props.finding
    ? props.finding.violation.rule
    : props.failure
      ? (own.value[0]?.name ?? props.failure.id)
      : (props.component?.name ?? ''),
)

// Ce qu'un composant demande : sa story, ses rendus, ses violations, un statut
// déprécié encore rendu.
const mine = computed(() => {
  const stories = new Set(props.component?.stories ?? [])
  return {
    failures: props.failures.filter((one) => stories.has(one.id)),
    findings: props.findings.filter((one) => stories.has(one.id)),
  }
})
const replace = computed(
  () => props.component?.status === 'deprecated' && props.component.stories.length > 0,
)
const state = computed(() => {
  const one = props.component
  if (!one) return null
  return [
    one.status
      ? `${one.status}${one.statusSince ? ` since ${dayOf(one.statusSince)}` : ''}`
      : 'no status',
    one.changed ? `changed ${ago(Date.parse(one.changed))}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
})
const nothing = computed(
  () =>
    props.component !== null &&
    !props.component.skeleton &&
    mine.value.failures.length === 0 &&
    mine.value.findings.length === 0 &&
    !replace.value,
)

// Ouverts au départ, retenus comme les panneaux des stories.
const KEYS = { todo: 'crypte:panel:shell:todo', links: 'crypte:panel:shell:links' }
const open = ref({ todo: kept(KEYS.todo) !== false, links: kept(KEYS.links) !== false })
const toggle = (which: 'todo' | 'links') => {
  open.value[which] = !open.value[which]
  keep(KEYS[which], open.value[which] ? undefined : false)
}

// Le prompt de ce qui est choisi : la violation, le rendu, ou tout ce que le
// composant demande.
const prompt = computed(() =>
  promptOf(
    props.finding
      ? { failures: [], findings: [props.finding], unstoried: [] }
      : props.failure
        ? { failures: [props.failure], findings: [], unstoried: [] }
        : {
            ...mine.value,
            unstoried:
              props.component && props.component.stories.length === 0 ? [props.component] : [],
          },
    props.stories,
  ),
)

const { copied, copy } = useCopy()
watch(
  [() => props.component, () => props.finding, () => props.failure],
  () => (copied.value = null),
)
</script>

<template>
  <PanelSection
    :title="chosen ? `${title} · to do` : 'To do'"
    :open="open.todo"
    aria-label="To do"
    @toggle="toggle('todo')"
  >
    <div class="rows">
      <EmptyNote v-if="!chosen">Select a row to see what it needs.</EmptyNote>

      <template v-else-if="finding">
        <p class="caption">{{ finding.violation.help }}</p>
        <p class="caption">
          {{ plural(finding.violation.targets.length, 'element') }} at fault,
          {{ finding.themes.length === 2 ? 'in light and dark' : `in ${finding.themes[0]}` }}
        </p>
        <p v-for="one of finding.violation.targets" :key="one" class="row">
          <code class="label">{{ one }}</code>
        </p>
        <a class="row link" :href="finding.violation.helpUrl" target="_blank" rel="noreferrer">
          <span class="label">How to fix {{ finding.violation.rule }}</span>
          <Icon :icon="LinkSquare02Icon" />
        </a>
      </template>

      <template v-else-if="failure">
        <p class="caption">
          fails to render,
          {{ failure.themes.length === 2 ? 'in light and dark' : `in ${failure.themes[0]}` }}
        </p>
        <p class="row message">{{ failure.message }}</p>
        <pre v-if="failure.stack" class="stack">{{
          failure.stack.split('\n').slice(0, 6).join('\n')
        }}</pre>
      </template>

      <template v-else-if="component">
        <p class="caption">{{ state }}</p>
        <template v-if="component.skeleton">
          <p class="row">
            <Icon :icon="FileAddIcon" />
            <code class="label">{{ component.skeleton.file }}</code>
            <span class="meta">to create</span>
          </p>
          <button
            type="button"
            class="row link copy"
            @click="copy(component.skeleton.source, 'skeleton')"
          >
            <Icon :icon="Copy01Icon" />
            <span class="label">{{
              copied === 'skeleton' ? 'Skeleton copied' : 'Copy the skeleton'
            }}</span>
          </button>
          <p class="caption required">
            {{
              component.required === 0
                ? 'No required prop: its Default story is enough.'
                : `${plural(component.required, 'required prop')} to fill in its Default story.`
            }}
          </p>
        </template>
        <a
          v-for="one of mine.failures"
          :key="one.key"
          class="row link"
          :href="hrefOfHealth('failures', one.key)"
          @click="emit('health', 'failures', one.key, $event)"
        >
          <Icon :icon="Alert02Icon" />
          <span class="label"
            >Fix the render of
            {{ stories.find((entry) => entry.id === one.id)?.name ?? one.id }}</span
          >
        </a>
        <a
          v-if="mine.findings.length > 0"
          class="row link"
          :href="hrefOfHealth('accessibility', mine.findings[0]!.key)"
          @click="emit('health', 'accessibility', mine.findings[0]!.key, $event)"
        >
          <Icon :icon="Alert02Icon" />
          <span class="label">Fix {{ plural(mine.findings.length, 'violation') }}</span>
        </a>
        <p v-if="replace" class="row">
          <Icon :icon="Alert02Icon" />
          <span class="label"
            >Deprecated: replace it in
            {{ plural(component.stories.length, 'story', 'stories') }}</span
          >
        </p>
        <EmptyNote v-if="nothing">Nothing to do.</EmptyNote>
      </template>

      <button v-if="prompt" type="button" class="row link copy" @click="copy(prompt, 'prompt')">
        <Icon :icon="AiMagicIcon" />
        <span class="label">{{
          copied === 'prompt' ? 'Fix prompt copied' : 'Copy fix prompt'
        }}</span>
      </button>
    </div>
  </PanelSection>

  <PanelSection
    v-if="chosen"
    title="Links"
    :open="open.links"
    aria-label="Links"
    @toggle="toggle('links')"
  >
    <div class="rows">
      <template v-if="own.length > 0">
        <p class="caption">{{ plural(own.length, 'story', 'stories') }}</p>
        <a
          v-for="one of own"
          :key="one.id"
          class="row link"
          :href="hrefOfStory(one.id)"
          @click="emit('story', one.id, $event)"
        >
          <Icon :icon="ComponentIcon" />
          <span class="label">{{ one.name }}</span>
          <Icon :icon="LinkSquare02Icon" />
        </a>
      </template>
      <template v-if="page || file">
        <p class="caption">component</p>
        <a
          v-if="page"
          class="row link"
          :href="hrefOfComponent(page)"
          @click="emit('page', page, $event)"
        >
          <span class="label">Its component page</span>
          <Icon :icon="LinkSquare02Icon" />
        </a>
        <p v-if="file" class="row">
          <code class="label">{{ file }}</code>
        </p>
      </template>
      <template v-if="tokens.length > 0">
        <p class="caption">tokens read · {{ tokens.length }}</p>
        <template v-for="one of tokens" :key="one">
          <a
            v-if="hrefOfToken(one)"
            class="row link"
            :href="hrefOfToken(one)!"
            @click="emit('token', one, $event)"
          >
            <Icon :icon="Hexagon01Icon" />
            <code class="label">{{ one }}</code>
          </a>
          <p v-else class="row">
            <Icon :icon="Hexagon01Icon" />
            <code class="label">{{ one }}</code>
          </p>
        </template>
      </template>
    </div>
  </PanelSection>
</template>

<style scoped>
.copy {
  width: 100%;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

code.label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.message {
  color: var(--error-text);
}

.stack {
  margin: 0 var(--space-3);
  padding: var(--space-2);
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--background-subtle);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}
</style>
