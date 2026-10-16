<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { ComponentIcon, Hexagon01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { computed } from 'vue'
import Icon from '../ui/icon.vue'
import { componentIdOf } from '../navigation/tree'
import type { Category, Token } from './categories'

// Le panneau d'un token, source « token » de la maquette : sa valeur dans chaque
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
  const found = new Map<string, { id: string; name: string; file: string }>()
  for (const story of props.stories) {
    const { component } = story
    if (!component.tokens?.includes(name)) continue
    const key = `${component.file}#${component.export}`
    if (!found.has(key))
      found.set(key, {
        id: componentIdOf(story.path),
        name: story.path.at(-1)!,
        file: component.file,
      })
  }
  return [...found.values()]
})
</script>

<template>
  <section class="panel" :aria-label="token ? token.name : 'Token'">
    <header class="head">
      <h3>{{ token?.name ?? 'Token' }}</h3>
      <span class="source">token</span>
    </header>
    <div class="body">
      <p v-if="token === null" class="caption">Select a token to see its values and its uses.</p>
      <template v-else>
        <p class="caption">value</p>
        <p v-for="one of themes" :key="one.theme" class="row value">
          <code class="key">{{ one.theme }}</code
          >{{ ' ' }}
          <code>{{ one.end ? `${one.end} · ${one.value}` : one.value }}</code>
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
            <span class="label">{{ one.token.name }}</span
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
          :key="one.file"
          class="row link"
          :href="hrefOfComponent(one.id)"
          @click="emit('component', one.id, $event)"
        >
          <Icon :icon="ComponentIcon" />
          <span class="label">{{ one.name }}</span
          >{{ ' ' }}
          <code class="meta">{{ one.file }}</code>
          <Icon :icon="LinkSquare02Icon" />
        </a>
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

/* Muted, not the subtle of the Figma header: subtle falls to 4.39:1 on its
   background. */
.source {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* Le corps du panneau Figma : les lignes portent leur propre padding de 12. */
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
