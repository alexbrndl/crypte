<script setup lang="ts">
import { plural } from '../plural'
import type { PageEntry, StoryEntry } from '@crypte/core/protocol'
import { PanelSection, EmptyNote } from '@crypte/ui'
import {
  BookOpen01Icon,
  ComponentIcon,
  Hexagon01Icon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { computed, ref } from 'vue'
import Icon from '../ui/icon.vue'
import { keep, kept } from '../storage'
import { componentIdOf } from '../navigation/tree'
import { cites, citing } from './links'

// « Links », le panneau de la vue docs. Pour un composant : ses stories, les tokens
// qu'il lit et les pages qui le citent. Pour une page générale : les composants
// qu'elle cite.
const props = defineProps<{
  // Les stories du composant ouvert, vides sur une page générale.
  own: StoryEntry[]
  // La page ouverte : celle du composant, ou la page générale.
  page: PageEntry | null
  stories: StoryEntry[]
  pages: PageEntry[]
  hrefOfStory: (id: string) => string
  hrefOfComponent: (id: string) => string
  hrefOfPage: (id: string) => string
  hrefOfToken: (name: string) => string | null
}>()
const emit = defineEmits<{
  story: [id: string, event: MouseEvent]
  component: [id: string, event: MouseEvent]
  page: [id: string, event: MouseEvent]
  token: [name: string, event: MouseEvent]
}>()

const name = computed(() => props.own[0]?.path.at(-1) ?? null)
const tokens = computed(() => [
  ...new Set(props.own.flatMap((entry) => entry.component.tokens ?? [])),
])
const citedBy = computed(() =>
  name.value === null ? [] : citing(props.pages, name.value, props.page ?? undefined),
)
// Un composant par nom, dans l'ordre du manifeste.
const cited = computed(() => {
  if (name.value !== null || props.page === null) return []
  const body = props.page.body
  const found = new Map<string, string[]>()
  for (const entry of props.stories) {
    const component = entry.path.at(-1) ?? ''
    if (cites(body, component)) found.set(componentIdOf(entry.path), entry.path)
  }
  return [...found].map(([id, path]) => ({ id, path }))
})

const KEY = 'crypte:panel:docs:links'
const open = ref(kept(KEY) !== false)
function toggle() {
  open.value = !open.value
  keep(KEY, open.value ? undefined : false)
}
</script>

<template>
  <PanelSection title="Links" :open="open" aria-label="Links" @toggle="toggle">
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
      <template v-if="citedBy.length > 0">
        <p class="caption">pages that cite {{ name }} · {{ citedBy.length }}</p>
        <a
          v-for="one of citedBy"
          :key="one.id"
          class="row link"
          :href="hrefOfPage(one.id)"
          @click="emit('page', one.id, $event)"
        >
          <Icon :icon="BookOpen01Icon" />
          <span class="label">{{ one.name }}</span>
          <Icon :icon="LinkSquare02Icon" />
        </a>
      </template>
      <template v-if="cited.length > 0">
        <p class="caption">{{ plural(cited.length, 'component') }} cited</p>
        <a
          v-for="one of cited"
          :key="one.id"
          class="row link"
          :href="hrefOfComponent(one.id)"
          @click="emit('component', one.id, $event)"
        >
          <Icon :icon="BookOpen01Icon" />
          <span class="label">{{ one.path.at(-1) }}</span>
          <span class="meta">{{ one.path.slice(0, -1).join(' / ') }}</span>
        </a>
      </template>
      <EmptyNote
        v-if="own.length === 0 && tokens.length === 0 && citedBy.length === 0 && cited.length === 0"
      >
        No link.
      </EmptyNote>
    </div>
  </PanelSection>
</template>

<style scoped>
code.label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}
</style>
