<script setup lang="ts">
import { plural } from '../plural'
import type { StoryEntry } from '@crypte/core/protocol'
import { ComponentIcon, Hexagon01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { computed, ref } from 'vue'
import Icon from '../ui/icon.vue'
import PanelSection from '../panels/panel-section.vue'
import ColorSwatch from '../ui/color-swatch.vue'
import EmptyNote from '../ui/empty-note.vue'
import { keep, kept } from '../storage'
import { componentIdOf } from '../navigation/tree'
import { shown, type Category, type Token } from './categories'

// Le panneau d'un token : sa valeur dans chaque
// thème, son nom CSS, les tokens qui pointent vers lui et les composants qui le
// lisent. Natif au shell : ses lignes, le `panel/row` du fichier Figma, restent
// ici tant qu'aucun panneau de plugin ne les dessine. Les `{{ ' ' }}` séparent ce
// qu'un lecteur d'écran lit d'un bloc : le gap le dessine, le flex l'ignore.
const props = defineProps<{
  token: Token | null
  categories: Category[]
  stories: StoryEntry[]
  hrefOfToken: (category: string, token: string) => string
  hrefOfComponent: (id: string) => string
}>()
const emit = defineEmits<{
  token: [category: string, token: string, event: MouseEvent]
  component: [id: string, event: MouseEvent]
}>()

const KEY = 'crypte:panel:shell:token'
const open = ref(kept(KEY) !== false)
const toggle = () => {
  open.value = !open.value
  keep(KEY, open.value ? undefined : false)
}

// Un token au format des variables Figma, `accent/base` ; un nom qu'aucun token
// ne porte reste tel quel.
const tokens = computed(() =>
  props.categories.flatMap((category) => category.groups.flatMap((group) => group.tokens)),
)
const figma = (token: Token) =>
  token.label === token.family ? token.family : `${token.family}/${token.label}`
const figmaOf = (name: string) => {
  const found = tokens.value.find((one) => one.name === name)
  return found ? figma(found) : name
}

// Les thèmes dans l'ordre où le token les déclare, chacun avec le bout de sa chaîne.
const themes = computed(() =>
  Object.entries(props.token?.value.themes ?? {}).map(([theme, held]) => ({
    theme,
    end: held.alias?.at(-1),
    value: held.value,
  })),
)

// Les tokens dont une chaîne passe par celui-ci, dans un thème au moins.
const pointing = computed(() => {
  const name = props.token?.name
  if (name === undefined) return []
  return props.categories.flatMap((category) =>
    category.groups.flatMap((group) =>
      group.tokens
        .filter((one) => Object.values(one.value.themes).some((held) => held.alias?.includes(name)))
        .map((one) => ({ category: category.name, token: one })),
    ),
  )
})

// Un composant une fois, par son fichier et son export : plusieurs stories le portent.
const users = computed(() => {
  const name = props.token?.name
  if (name === undefined) return []
  const found = new Map<
    string,
    { key: string; id: string; name: string; file: string; folder: string }
  >()
  for (const story of props.stories) {
    const { component } = story
    if (!component.tokens?.includes(name)) continue
    const key = `${component.file}#${component.export}`
    if (!found.has(key))
      found.set(key, {
        key,
        id: componentIdOf(story.path),
        name: story.path.at(-1)!,
        file: component.file,
        folder: story.path.slice(0, -1).join(' / '),
      })
  }
  return [...found.values()]
})
</script>

<template>
  <PanelSection
    :title="token ? figma(token) : 'Token'"
    :open="open"
    :aria-label="token ? token.name : 'Token'"
    @toggle="toggle"
  >
    <div class="rows">
      <EmptyNote v-if="token === null">Select a token to see its values and its uses.</EmptyNote>
      <template v-else>
        <p class="caption">value</p>
        <p v-for="one of themes" :key="one.theme" class="row value">
          <code class="key">{{ one.theme }}</code
          >{{ ' ' }}
          <ColorSwatch v-if="token.value.type === 'color'" :color="one.value" />
          <code>{{
            one.end ? `${figmaOf(one.end)} · ${shown(one.value)}` : shown(one.value)
          }}</code>
        </p>
        <p class="row value">
          <code class="key">css</code>{{ ' ' }}
          <code>var(--{{ token.name }})</code>
        </p>

        <template v-if="pointing.length > 0">
          <p class="caption">aliases pointing here · {{ pointing.length }}</p>
          <a
            v-for="one of pointing"
            :key="one.token.key"
            class="row link"
            :href="hrefOfToken(one.category, one.token.name)"
            @click="emit('token', one.category, one.token.name, $event)"
          >
            <Icon :icon="Hexagon01Icon" />
            <span class="label">{{ figma(one.token) }}</span
            >{{ ' ' }}
            <code class="meta">{{ one.category }}</code>
          </a>
        </template>

        <p class="caption">used by · {{ plural(users.length, 'component') }}</p>
        <EmptyNote v-if="users.length === 0">No component reads it.</EmptyNote>
        <a
          v-for="one of users"
          :key="one.key"
          class="row link"
          :href="hrefOfComponent(one.id)"
          @click="emit('component', one.id, $event)"
        >
          <Icon :icon="ComponentIcon" />
          <span class="label">{{ one.name }}</span
          >{{ ' ' }}
          <code v-if="one.folder" class="meta">{{ one.folder }}</code>
          <Icon :icon="LinkSquare02Icon" />
        </a>
      </template>
    </div>
  </PanelSection>
</template>

<style scoped>
.value code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.value .key {
  width: 48px;
  flex: none;
  color: var(--text-muted);
}
</style>
