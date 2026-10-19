<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import {
  ComponentIcon,
  Copy01Icon,
  FileAddIcon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { computed, ref, watch } from 'vue'
import Icon from '../ui/icon.vue'
import { componentIdOf } from '../navigation/tree'
import type { Finding } from './audit'
import type { HealthComponent } from './health'

// Le panneau « à faire » de la maquette, pour le composant choisi : ce qui mène
// quelque part aujourd'hui. Créer sa story s'il n'en a pas, sinon ses stories et
// sa page ; déprécié, les stories qui l'utilisent encore.
const props = defineProps<{
  component: HealthComponent | null
  // Sur la page accessibilité, la violation choisie, à la place d'un composant.
  finding?: Finding | null
  stories: StoryEntry[]
  hrefOfStory: (id: string) => string
  hrefOfComponent: (id: string) => string
}>()
const emit = defineEmits<{
  story: [id: string, event: MouseEvent]
  page: [id: string, event: MouseEvent]
}>()

const own = computed(() =>
  (props.component?.stories ?? []).flatMap((id) => {
    const entry = props.stories.find((one) => one.id === id)
    return entry ? [entry] : []
  }),
)
const page = computed(() => (own.value[0] ? componentIdOf(own.value[0].path) : null))

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
    <header class="head">
      <h3>
        {{
          finding !== undefined
            ? finding
              ? `${finding.violation.rule} · to fix`
              : 'To fix'
            : component
              ? `${component.name} · to do`
              : 'To do'
        }}
      </h3>
      <span class="source">{{ finding !== undefined ? 'a11y' : 'health' }}</span>
    </header>
    <div v-if="finding !== undefined" class="body">
      <p v-if="finding === null" class="caption">Select a violation to see where it is.</p>
      <template v-else>
        <p class="caption">story</p>
        <a
          class="row link"
          :href="hrefOfStory(finding.id)"
          @click="emit('story', finding.id, $event)"
        >
          <Icon :icon="ComponentIcon" />
          <span class="label">{{
            stories.find((one) => one.id === finding!.id)?.name ?? finding.id
          }}</span>
          <Icon :icon="LinkSquare02Icon" />
        </a>
        <p class="caption">
          {{ finding.violation.targets.length }}
          {{ finding.violation.targets.length === 1 ? 'element' : 'elements' }} at fault
        </p>
        <p v-for="one of finding.violation.targets" :key="one" class="row">
          <code class="label">{{ one }}</code>
        </p>
        <p class="caption">rule</p>
        <a class="row link" :href="finding.violation.helpUrl" target="_blank" rel="noreferrer">
          <span class="label">How to fix {{ finding.violation.rule }}</span>
          <Icon :icon="LinkSquare02Icon" />
        </a>
      </template>
    </div>
    <div v-else class="body">
      <p v-if="component === null" class="caption">Select a component to see what it needs.</p>
      <template v-else-if="component.skeleton">
        <p class="caption">create its story</p>
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
          {{ component.props }} {{ component.props === 1 ? 'prop' : 'props' }}: the skeleton renders
          it with none, its required ones are left to fill in.
        </p>
      </template>
      <template v-else>
        <p class="caption">
          {{
            component.status === 'deprecated'
              ? `still used in ${own.length} ${own.length === 1 ? 'story' : 'stories'}`
              : `${own.length} ${own.length === 1 ? 'story' : 'stories'}`
          }}
        </p>
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
        <template v-if="page">
          <p class="caption">elsewhere</p>
          <a class="row link" :href="hrefOfComponent(page)" @click="emit('page', page, $event)">
            <span class="label">Its component page</span>
            <Icon :icon="LinkSquare02Icon" />
          </a>
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
  display: flex;
  box-sizing: border-box;
  gap: var(--space-2);
  align-items: center;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  background: var(--background-subtle);
}

h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.source {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
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
</style>
