<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { ComponentIcon, Hexagon01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { computed, ref } from 'vue'
import Icon from '../ui/icon.vue'
import PanelSection from '../panels/panel-section.vue'
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
    <div class="content">
      <p v-if="token === null" class="caption">Select a token to see its values and its uses.</p>
      <template v-else>
        <p class="caption">value</p>
        <p v-for="one of themes" :key="one.theme" class="row value">
          <code class="key">{{ one.theme }}</code
          >{{ ' ' }}
          <span
            v-if="token.value.type === 'color'"
            class="swatch"
            :style="{ backgroundColor: one.value }"
          />
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

        <p class="caption">
          used by · {{ users.length }} {{ users.length === 1 ? 'component' : 'components' }}
        </p>
        <p v-if="users.length === 0" class="row empty">No component reads it.</p>
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
.swatch {
  width: 12px;
  height: 12px;
  flex: none;
  border-radius: var(--radius-xs);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
}

/* Le corps du panneau Figma : les lignes portent leur propre padding de 12. */
.content {
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

.caption {
  margin: 0;
  padding: var(--space-2-5) var(--space-3) var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

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

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: var(--text-muted);
}
</style>
