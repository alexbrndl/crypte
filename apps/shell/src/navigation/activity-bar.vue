<!-- L'activity bar du fichier Figma : la marque, la recherche, une entrée par vue,
     le thème en pied. Une vue change tout l'espace de travail, sidebar, canvas et
     panneaux ensemble. Une entrée sans `href` n'a pas de vue à montrer et n'est pas
     dessinée. -->
<script setup lang="ts">
import { plural } from '../plural'
import {
  ComponentIcon,
  GitCompareArrowsIcon,
  FavouriteIcon,
  Hexagon01Icon,
  Search01Icon,
  Sun02Icon,
} from '@hugeicons/core-free-icons'
import { Button, Tooltip, Badge } from '@crypte/ui'
import type { PluginView } from '@crypte/core/protocol'
import { computed } from 'vue'
import Icon from '../ui/icon.vue'
import HealthIcon from './health-icon.vue'
import Logo from '../ui/logo.vue'

export type BuiltIn = 'tokens' | 'stories' | 'health' | 'versions'
// Une vue de plugin, `view:<nom>`, section 6.1.
export type View = BuiltIn | `view:${string}`

// Le badge `sm` tient deux caractères au plus, plafonné à 9+ comme la maquette :
// le compte exact reste dans le détail de l'infobulle.
const capped = (count: number) => (count > 9 ? '9+' : String(count))

const props = defineProps<{
  current: View
  hrefs: Record<BuiltIn, string | null>
  // Les vues des plugins, sous un séparateur après versions. Toutes à la suite :
  // le menu « plus » que la maquette ouvre au-delà de trois attend un quatrième
  // plugin qui ait une vue, un seul en a une aujourd'hui.
  plugins?: { name: string; label: string; icon: PluginView['icon']; href: string }[]
  // Le compte des écarts de la vue versions, `null` quand il ne se lit pas.
  counter: number | null
  // Ce qu'il reste à faire, le badge de Santé.
  todo?: number
  // Le score de santé, de 0 à 100, qui remplit le cœur ; `null` sans mesure.
  score?: number | null
  searchKeys: string
  searchShortcuts: string
  themeLabel: string
}>()
const emit = defineEmits<{ go: [view: View, event: MouseEvent]; search: []; theme: [] }>()

const GROUPS: { view: BuiltIn; label: string; icon: typeof Search01Icon }[][] = [
  [
    { view: 'tokens', label: 'tokens', icon: Hexagon01Icon },
    { view: 'stories', label: 'stories', icon: ComponentIcon },
  ],
  [
    // Dessiné par `HealthIcon`, qui le remplit selon le score.
    { view: 'health', label: 'health', icon: FavouriteIcon },
    { view: 'versions', label: 'versions', icon: GitCompareArrowsIcon },
  ],
]

// Le détail du tooltip de chaque vue : ce que son badge compte.
const detailOf = (view: BuiltIn) =>
  view === 'versions' && props.counter !== null
    ? `${plural(props.counter, 'difference')}`
    : view === 'health' && (props.score != null || props.todo)
      ? [props.score != null ? `${props.score} %` : null, props.todo ? `${props.todo} to do` : null]
          .filter(Boolean)
          .join(' · ')
      : undefined

const groups = computed(() =>
  GROUPS.map((group) => group.filter((item) => props.hrefs[item.view] !== null)).filter(
    (group) => group.length > 0,
  ),
)
</script>

<template>
  <nav class="activity-bar" aria-label="Views">
    <h1 class="logo"><Logo /></h1>
    <Tooltip content="Search or run" :keys="searchKeys" side="right">
      <Button
        variant="ghost"
        class="icon-button"
        aria-label="Search or run"
        :aria-keyshortcuts="searchShortcuts"
        @click="emit('search')"
      >
        <Icon :icon="Search01Icon" />
      </Button>
    </Tooltip>
    <template v-for="(group, at) of groups" :key="at">
      <span class="separator" aria-hidden="true" />
      <Tooltip
        v-for="item of group"
        :key="item.view"
        :content="item.label"
        :detail="detailOf(item.view)"
        side="right"
      >
        <a
          class="item"
          :href="hrefs[item.view]!"
          :aria-current="current === item.view ? 'page' : undefined"
          @click="emit('go', item.view, $event)"
        >
          <span class="glyph">
            <HealthIcon v-if="item.view === 'health'" :score="score ?? null" />
            <Icon v-else :icon="item.icon" />
            <Badge v-if="item.view === 'versions' && counter !== null" size="sm" class="count">{{
              capped(counter)
            }}</Badge>
            <Badge v-if="item.view === 'health' && todo" size="sm" class="count">{{
              capped(todo)
            }}</Badge>
          </span>
          <span class="label">{{ item.label }}</span>
        </a>
      </Tooltip>
    </template>
    <template v-if="plugins && plugins.length > 0">
      <span class="separator" aria-hidden="true" />
      <Tooltip v-for="one of plugins" :key="one.name" :content="one.label" side="right">
        <a
          class="item"
          :href="one.href"
          :aria-current="current === `view:${one.name}` ? 'page' : undefined"
          @click="emit('go', `view:${one.name}`, $event)"
        >
          <span class="glyph"><Icon :icon="one.icon as typeof Search01Icon" /></span>
          <span class="label">{{ one.label }}</span>
        </a>
      </Tooltip>
    </template>
    <span class="spacer" />
    <Tooltip :content="themeLabel" keys="T" side="right">
      <Button
        variant="ghost"
        class="icon-button"
        :aria-label="themeLabel"
        aria-keyshortcuts="t"
        @click="emit('theme')"
      >
        <Icon :icon="Sun02Icon" />
      </Button>
    </Tooltip>
  </nav>
</template>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  align-items: center;
  box-sizing: border-box;
  width: 52px;
  height: 100%;
  padding: var(--space-2-5) var(--space-0-5);
  border-radius: var(--radius-lg);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-light);
  background: var(--background-raised);
}

.logo {
  display: flex;
  margin: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

/* Le bouton icône lg du fichier Figma : 32 × 32. */
.icon-button {
  --button-height: 32px;
  --button-padding: var(--space-2);
}

.separator {
  flex: none;
  width: 24px;
  height: var(--stroke-hairline);
  background: var(--border-base);
}

.item {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
  align-items: center;
  width: 48px;
  color: var(--text-primary);
  text-decoration: none;
}

.glyph {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
}

.item:hover .glyph {
  background: var(--background-hover);
}

.item[aria-current='page'] .glyph {
  background: var(--background-current);
  color: var(--accent-base);
}

.item[aria-current='page']:hover .glyph {
  background: var(--background-current-hover);
  color: var(--accent-hover);
}

.item:focus-visible {
  outline: none;
}

.item:focus-visible .glyph {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.count {
  position: absolute;
  right: calc(-1 * var(--space-0-5));
  bottom: calc(-1 * var(--space-0-5));
}

/* role/bar-label : 10 px annoncés, 9 dans le fichier Figma, hors de l'échelle. */
.label {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  line-height: var(--leading-2xs);
  letter-spacing: -0.04em;
}

.spacer {
  flex: 1;
}
</style>
