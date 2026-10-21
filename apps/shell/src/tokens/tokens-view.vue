<script setup lang="ts">
import { SectionHeader, ViewCanvas } from '@crypte/ui'
import { computed } from 'vue'
import { shown, valueIn, type Category, type Token } from './categories'

// Une catégorie de tokens, dessinée selon ce qu'elle porte : des nuanciers pour
// les couleurs, des barres à l'échelle pour l'espace, des spécimens pour la
// typographie, des tuiles pour les rayons et les traits, une liste sinon. Les
// valeurs sont celles du thème affiché par le shell.
const props = defineProps<{
  category: Category
  theme: string
  selected: string | null
  hrefOf: (token: string) => string
}>()
const emit = defineEmits<{ select: [token: string, event: MouseEvent] }>()

const layout = computed(() => {
  const name = props.category.name
  if (name === 'color' || name === 'palette') return 'swatches'
  if (name === 'space' || name === 'radius' || name === 'stroke' || name === 'typography')
    return name
  return 'list'
})

const value = (token: Token) => valueIn(token.value, props.theme)

// La largeur d'une barre d'espace, en pixels, coupée à la piste : un `rem` vaut
// 16 px, ce que le navigateur prend sans réglage de l'utilisateur.
const TRACK = 480
function width(token: Token): number {
  const found = /^(-?\d*\.?\d+)(px|rem)?$/.exec(value(token) ?? '')
  if (!found) return 0
  const pixels = Number(found[1]) * (found[2] === 'rem' ? 16 : 1)
  return Math.min(Math.max(pixels, 0), TRACK)
}

// Le spécimen d'un token de typographie, selon sa famille.
function specimen(token: Token): Record<string, string> {
  const held = value(token)
  if (held === undefined) return {}
  if (token.family === 'text') return { fontSize: held }
  if (token.family === 'leading') return { lineHeight: held }
  if (token.family === 'weight') return { fontWeight: held }
  if (token.family === 'tracking') return { letterSpacing: held }
  if (token.family === 'font') return { fontFamily: held }
  return {}
}
</script>

<template>
  <ViewCanvas class="tokens-view" :aria-label="category.name" :data-layout="layout">
    <section v-for="group of category.groups" :key="group.id" class="group">
      <SectionHeader :title="group.family" :count="group.tokens.length" />
      <ul class="items">
        <li v-for="token of group.tokens" :key="token.key">
          <a
            class="item"
            :href="hrefOf(token.name)"
            :aria-current="token.name === selected ? 'true' : undefined"
            @click="emit('select', token.name, $event)"
          >
            <!-- `background-color` et non `background` : une valeur en `url(…)`
                 y est ignorée au lieu d'être chargée. -->
            <span
              v-if="layout === 'swatches'"
              class="swatch"
              :style="{ backgroundColor: value(token) }"
            />
            <span v-if="layout === 'space'" class="track">
              <span class="bar" :style="{ width: `${width(token)}px` }" />
            </span>
            <span
              v-if="layout === 'radius'"
              class="shape"
              :style="{ borderRadius: value(token) }"
            />
            <span v-if="layout === 'stroke'" class="shape" :style="{ borderWidth: value(token) }" />
            <span class="meta">
              <code class="name">{{ token.label }}</code>
              <code class="value">{{
                value(token) === undefined ? 'not declared' : shown(value(token)!)
              }}</code>
            </span>
            <span v-if="layout === 'typography'" class="specimen" :style="specimen(token)">
              Order summary 348.00
            </span>
          </a>
        </li>
      </ul>
    </section>
  </ViewCanvas>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.items {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  text-decoration: none;
}

.item:hover {
  background: var(--background-hover);
}

.item[aria-current='true'] {
  background: var(--background-current);
  color: var(--text-current);
}

.item[aria-current='true']:hover {
  background: var(--background-current-hover);
  color: var(--text-current-hover);
}

.item:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.meta {
  display: flex;
  gap: var(--space-3);
  min-width: 0;
}

.name,
.value {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.name {
  width: 112px;
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  color: var(--text-muted);
}

/* En ligne, une colonne de valeurs à largeur fixe : barres et spécimens partent
   du même bord. */
[data-layout='space'] .value,
[data-layout='typography'] .value,
[data-layout='list'] .value {
  width: 64px;
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Les nuanciers du fichier Figma : 112 × 82, la couleur au-dessus du nom. */
[data-layout='swatches'] .items,
[data-layout='radius'] .items,
[data-layout='stroke'] .items {
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--space-2);
}

[data-layout='swatches'] .item,
[data-layout='radius'] .item,
[data-layout='stroke'] .item {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: 112px;
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-raised);
}

[data-layout='swatches'] .item[aria-current='true'],
[data-layout='radius'] .item[aria-current='true'],
[data-layout='stroke'] .item[aria-current='true'] {
  box-shadow: inset 0 0 0 var(--stroke-marker) var(--accent-base);
  background: var(--background-raised);
}

[data-layout='swatches'] .item[aria-current='true']:hover,
[data-layout='radius'] .item[aria-current='true']:hover,
[data-layout='stroke'] .item[aria-current='true']:hover {
  box-shadow: inset 0 0 0 var(--stroke-marker) var(--accent-hover);
  background: var(--background-raised);
}

[data-layout='swatches'] .meta,
[data-layout='radius'] .meta,
[data-layout='stroke'] .meta {
  flex-direction: column;
  gap: 0;
  padding: var(--space-1-5) var(--space-2);
}

/* Inset by the item's stroke, as in Figma (110 wide in 112): flush, its fill would
   cover the stroke, which the item draws under its children. */
.swatch {
  height: 36px;
  margin: var(--stroke-hairline) var(--stroke-hairline) 0;
  border-radius: calc(var(--radius-md) - var(--stroke-hairline))
    calc(var(--radius-md) - var(--stroke-hairline)) 0 0;
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-base);
}

.item[aria-current='true'] .swatch {
  margin: var(--stroke-marker) var(--stroke-marker) 0;
}

.shape {
  align-self: center;
  width: 56px;
  height: 56px;
  margin: var(--space-4) 0 var(--space-2);
  border: var(--stroke-hairline) solid var(--accent-base);
  background: var(--background-current);
}

[data-layout='stroke'] .shape {
  width: 80px;
  height: 40px;
  border-color: var(--text-primary);
  border-style: solid;
  background: none;
}

/* Les barres d'espace, à l'échelle 1:1 et coupées à 480 px. */
.track {
  order: 1;
  width: 480px;
  flex: none;
}

.bar {
  display: block;
  height: var(--space-2);
  border-radius: var(--radius-xs);
  background: var(--border-strong);
}

.item[aria-current='true'] .bar {
  background: var(--accent-base);
}

.specimen {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
