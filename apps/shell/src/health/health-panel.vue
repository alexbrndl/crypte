<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ComponentIcon,
  Copy01Icon,
  FileAddIcon,
  Hexagon01Icon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { computed, ref, watch } from 'vue'
import Icon from '../ui/icon.vue'
import { ago } from '../navigation/recent'
import { componentIdOf } from '../navigation/tree'
import type { Failure, Finding } from './audit'
import { dayOf, type HealthComponent, type HealthPage } from './health'

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

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`

// Ouverts au départ, repliables comme les panneaux des stories.
const open = ref({ todo: true, links: true })

const copied = ref(false)
watch(
  () => props.component,
  () => (copied.value = false),
)
async function copy() {
  if (!props.component?.skeleton) return
  try {
    await navigator.clipboard.writeText(props.component.skeleton.source)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <section class="panel" aria-label="To do">
    <h3 class="head">
      <button
        type="button"
        class="toggle"
        :aria-expanded="open.todo"
        aria-controls="health-todo"
        @click="open.todo = !open.todo"
      >
        <Icon :icon="open.todo ? ArrowDown01Icon : ArrowRight01Icon" />
        <span class="title">{{ chosen ? `${title} · to do` : 'To do' }}</span>
      </button>
    </h3>
    <div v-show="open.todo" id="health-todo" class="body">
      <p v-if="!chosen" class="caption">Select a row to see what it needs.</p>

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
          <button type="button" class="row link copy" @click="copy">
            <Icon :icon="Copy01Icon" />
            <span class="label">{{ copied ? 'Skeleton copied' : 'Copy the skeleton' }}</span>
          </button>
          <p class="note">
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
        <p v-if="nothing" class="note">Nothing to do.</p>
      </template>
    </div>
  </section>

  <section v-if="chosen" class="panel" aria-label="Links">
    <h3 class="head">
      <button
        type="button"
        class="toggle"
        :aria-expanded="open.links"
        aria-controls="health-links"
        @click="open.links = !open.links"
      >
        <Icon :icon="open.links ? ArrowDown01Icon : ArrowRight01Icon" />
        <span class="title">Links</span>
      </button>
    </h3>
    <div v-show="open.links" id="health-links" class="body">
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
  </section>
</template>

<style scoped>
.panel {
  /* A border: the opaque head would cover an inset one. */
  border-bottom: var(--stroke-hairline) solid var(--border-base);
}

.head {
  margin: 0;
  background: var(--background-subtle);
}

/* Tout l'en-tête plie le panneau : le bouton en couvre la surface, 40 px comme
   l'en-tête des panneaux des stories. */
.toggle {
  display: flex;
  box-sizing: border-box;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
}

.toggle:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.toggle .icon {
  flex: none;
  color: var(--text-subtle);
}

.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.body {
  padding: var(--space-1) 0 var(--space-2-5);
}

.row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

.caption,
.note {
  margin: 0;
  padding: var(--space-2-5) var(--space-3) var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.link {
  min-height: 28px;
  box-sizing: border-box;
  color: var(--text-primary);
  text-decoration: none;
}

.link:hover {
  background: var(--background-hover);
}

.link:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.copy {
  width: 100%;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

code.label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.meta {
  color: var(--text-muted);
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
