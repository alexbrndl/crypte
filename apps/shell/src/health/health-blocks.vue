<script setup lang="ts">
import { Tooltip } from '@crypte/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { locale, texts } from '../i18n'
import { plural, singular } from '../plural'
import { tokenRow, type Dashboard, type Focus, type Group, type TokenHealth } from './dashboard'
import { arrowTarget } from './roving'

// Les deux blocs du dashboard, composants et tokens : un titre, une barre de
// répartition et une grille de cases. Survoler ou choisir une case met en focus
// ce qu'elle lit, ou ce qui la lit.
const props = defineProps<{
  dashboard: Dashboard
  abbreviations: ReadonlyMap<string, string>
  focus: Focus
  selected: string | null
  // Le complément des titres quand un focus est actif.
  notes: { components?: string; tokens?: string }
}>()
const emit = defineEmits<{
  hover: [item: string | null]
  select: [item: string, event: MouseEvent]
}>()

const t = texts({
  en: {
    components: 'components',
    tokens: 'tokens',
    used: '{used}/{total} used',
    blockingOne: '{count} blocking',
    blockingMany: '{count} blocking',
    improve: '{count} to improve',
    readyOne: '{count} ready',
    readyMany: '{count} ready',
    usedCount: '{count} used',
    orphanOne: '{count} orphan',
    orphanMany: '{count} orphans',
    brokenOne: '{count} broken alias',
    brokenMany: '{count} broken aliases',
    groupBlocking: 'blocking',
    groupImprove: 'to improve',
    groupReady: 'ready',
    story: 'story',
    stories: 'stories',
    noStatus: 'no status',
    readBy: 'read by {count}',
    stateUsed: 'used',
    stateOrphan: 'orphan',
    stateBroken: 'broken alias',
    suspect: 'suspect of a contrast violation',
  },
  fr: {
    components: 'composants',
    tokens: 'tokens',
    used: '{used}/{total} utilisés',
    blockingOne: '{count} bloque',
    blockingMany: '{count} bloquent',
    improve: '{count} à améliorer',
    readyOne: '{count} prêt',
    readyMany: '{count} prêts',
    usedCount: '{count} utilisés',
    orphanOne: '{count} orphelin',
    orphanMany: '{count} orphelins',
    brokenOne: '{count} alias cassé',
    brokenMany: '{count} alias cassés',
    groupBlocking: 'bloquant',
    groupImprove: 'à améliorer',
    groupReady: 'prêt',
    story: 'story',
    stories: 'stories',
    noStatus: 'sans statut',
    readBy: 'lu par {count}',
    stateUsed: 'utilisé',
    stateOrphan: 'orphelin',
    stateBroken: 'alias cassé',
    suspect: "suspect d'une violation de contraste",
  },
})

const GROUP: Record<Group, () => string> = {
  blocking: () => t('groupBlocking'),
  improve: () => t('groupImprove'),
  ready: () => t('groupReady'),
}

// Un pourcentage à l'entier, au dixième sous 1 %, à la manière de la langue.
const percent = (count: number, total: number) => {
  const value = total === 0 ? 0 : (count / total) * 100
  const digits = value > 0 && value < 1 ? 1 : 0
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: digits }).format(value)} %`
}

const counts = computed(() => {
  const rows = props.dashboard.rows
  const of = (group: Group) => rows.filter((one) => one.group === group).length
  return {
    blocking: of('blocking'),
    improve: of('improve'),
    ready: of('ready'),
    total: rows.length,
  }
})
const coverage = computed(() => props.dashboard.coverage)

const componentLabel = (row: Dashboard['rows'][number]) =>
  `${row.component.name}, ${GROUP[row.group]()}`
const componentDetail = (row: Dashboard['rows'][number]) =>
  [
    plural(row.component.stories.length, t('story'), t('stories')),
    row.component.status ?? t('noStatus'),
    GROUP[row.group](),
  ].join(' · ')

const tokenState = (one: TokenHealth) =>
  one.state === 'broken'
    ? t('stateBroken')
    : one.suspect
      ? t('suspect')
      : one.state === 'orphan'
        ? t('stateOrphan')
        : t('stateUsed')

const dimmed = (set: ReadonlySet<string> | null, key: string) => set !== null && !set.has(key)

// Toutes les familles ont le même nombre de lignes, le plus petit qui tienne
// dans la largeur du bloc : une famille fait `ceil(n / R) × 14 − 2` px.
const grid = useTemplateRef<HTMLElement>('grid')
const width = ref(0)
// Une seule source pour le calcul et pour le CSS, passées en variables : un
// écart changé d'un seul côté fausserait le nombre de lignes sans que rien le dise.
const CELL = 12
const CELL_GAP = 2
const FAMILY_GAP = 12
const sizes = {
  '--cell': `${CELL}px`,
  '--cell-gap': `${CELL_GAP}px`,
  '--family-gap': `${FAMILY_GAP}px`,
}
const rowsOf = computed(() => {
  const counts = coverage.value.families.map((one) => one.tokens.length).filter((one) => one > 0)
  if (counts.length === 0 || width.value === 0) return 8
  const tallest = Math.max(...counts)
  for (let rows = 1; rows <= tallest; rows += 1) {
    const used =
      counts.reduce((sum, one) => sum + Math.ceil(one / rows) * (CELL + CELL_GAP) - CELL_GAP, 0) +
      FAMILY_GAP * (counts.length - 1)
    if (used <= width.value) return rows
  }
  return tallest
})
let observer: ResizeObserver | undefined
onMounted(() => {
  // Absent de jsdom : la grille garde alors huit lignes.
  if (typeof ResizeObserver === 'undefined' || !grid.value) return
  observer = new ResizeObserver(([entry]) => (width.value = entry?.contentRect.width ?? 0))
  observer.observe(grid.value)
})
onBeforeUnmount(() => observer?.disconnect())

// L'entrée de chaque grille au clavier, dans l'état et non dans le DOM : la
// case où les flèches ont mené, sinon la choisie si elle est dans la grille,
// sinon la première. Oubliée quand la sélection change.
const tokens = computed(() => coverage.value.families.flatMap((one) => one.tokens))
const movedCase = ref<string | null>(null)
const movedCell = ref<string | null>(null)
watch(
  () => props.selected,
  () => {
    movedCase.value = null
    movedCell.value = null
  },
)
// Une case partie à la relecture rend l'entrée à la choisie ou à la première.
const caseEntry = computed(
  () =>
    (props.dashboard.rows.some((one) => one.key === movedCase.value) ? movedCase.value : null) ??
    (props.dashboard.rows.some((one) => one.key === props.selected)
      ? props.selected
      : props.dashboard.rows[0]?.key),
)
const cellEntry = computed(
  () =>
    (tokens.value.some((one) => one.key === movedCell.value) ? movedCell.value : null) ??
    tokens.value.find((one) => tokenRow(one.name) === props.selected)?.key ??
    tokens.value[0]?.key,
)

function keys(event: KeyboardEvent, grid: 'case' | 'cell') {
  const moved = grid === 'case' ? movedCase : movedCell
  const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')]
  const to = arrowTarget(event, buttons)
  if (to === null) return
  moved.value = buttons[to]!.dataset['key'] ?? null
  void nextTick(() => buttons[to]!.focus())
}
</script>

<template>
  <div class="health-blocks">
    <section class="block" :aria-label="t('components')">
      <h2 class="title">
        <span class="name">{{ t('components') }}</span>
        <span class="count">{{ counts.total }}</span>
        <span v-if="notes.components" class="note">· {{ notes.components }}</span>
      </h2>
      <div class="bar">
        <div class="labels">
          <span v-if="counts.blocking > 0" class="label" data-state="blocking"
            >{{
              singular(counts.blocking)
                ? t('blockingOne', { count: counts.blocking })
                : t('blockingMany', { count: counts.blocking })
            }}
            <span class="pill">{{ percent(counts.blocking, counts.total) }}</span></span
          >
          <span v-if="counts.improve > 0" class="label" data-state="improve"
            >{{ t('improve', { count: counts.improve }) }}
            <span class="pill">{{ percent(counts.improve, counts.total) }}</span></span
          >
          <span v-if="counts.ready > 0" class="label" data-state="ready"
            >{{
              singular(counts.ready)
                ? t('readyOne', { count: counts.ready })
                : t('readyMany', { count: counts.ready })
            }}
            <span class="pill">{{ percent(counts.ready, counts.total) }}</span></span
          >
        </div>
        <div class="segments" aria-hidden="true">
          <span
            v-for="group in ['blocking', 'improve', 'ready'] as const"
            v-show="counts[group] > 0"
            :key="group"
            class="segment"
            :data-state="group"
            :style="{ flexGrow: counts[group] }"
          />
        </div>
      </div>
      <!-- Roving tabindex : une seule case dans l'ordre de tabulation, les flèches
           pour les autres. -->
      <div
        class="components"
        role="group"
        :aria-label="t('components')"
        @keydown="(event) => keys(event, 'case')"
      >
        <Tooltip
          v-for="row of dashboard.rows"
          :key="row.key"
          :content="row.component.name"
          :detail="componentDetail(row)"
        >
          <button
            type="button"
            class="case"
            :data-group="row.group"
            :data-selected="selected === row.key || undefined"
            :data-dimmed="dimmed(focus.components, row.key) || undefined"
            :data-key="row.key"
            :tabindex="caseEntry === row.key ? 0 : -1"
            :aria-label="componentLabel(row)"
            :aria-pressed="selected === row.key"
            @mouseenter="emit('hover', row.key)"
            @mouseleave="emit('hover', null)"
            @focus="emit('hover', row.key)"
            @blur="emit('hover', null)"
            @click="emit('select', row.key, $event)"
          >
            <span class="abbreviation">{{ abbreviations.get(row.key) }}</span>
            <span class="stories">{{ row.component.stories.length }}</span>
          </button>
        </Tooltip>
      </div>
    </section>

    <div class="rule" aria-hidden="true" />

    <section class="block" :aria-label="t('tokens')">
      <h2 class="title">
        <span class="name">{{ t('tokens') }}</span>
        <span class="count">{{ t('used', { used: coverage.used, total: coverage.total }) }}</span>
        <span v-if="notes.tokens" class="note">· {{ notes.tokens }}</span>
      </h2>
      <div class="bar">
        <div class="labels">
          <span class="label" data-state="ready"
            >{{ t('usedCount', { count: coverage.used }) }}
            <span class="pill">{{ percent(coverage.used, coverage.total) }}</span></span
          >
          <span class="push" />
          <span v-if="coverage.orphans > 0" class="label" data-state="orphan"
            >{{
              coverage.orphans === 1
                ? t('orphanOne', { count: coverage.orphans })
                : t('orphanMany', { count: coverage.orphans })
            }}
            <span class="pill">{{ percent(coverage.orphans, coverage.total) }}</span></span
          >
          <span v-if="coverage.broken > 0" class="label" data-state="blocking"
            >{{
              coverage.broken === 1
                ? t('brokenOne', { count: coverage.broken })
                : t('brokenMany', { count: coverage.broken })
            }}
            <span class="pill">{{ percent(coverage.broken, coverage.total) }}</span></span
          >
        </div>
        <div class="segments" aria-hidden="true">
          <span
            v-show="coverage.used > 0"
            class="segment"
            data-state="ready"
            :style="{ flexGrow: coverage.used }"
          />
          <span
            v-show="coverage.orphans > 0"
            class="segment"
            data-state="orphan"
            :style="{ flexGrow: coverage.orphans }"
          />
          <span
            v-show="coverage.broken > 0"
            class="segment"
            data-state="blocking"
            :style="{ flexGrow: coverage.broken }"
          />
        </div>
      </div>
      <div
        ref="grid"
        class="families"
        role="group"
        :aria-label="t('tokens')"
        :style="{ '--rows': rowsOf, ...sizes }"
        @keydown="(event) => keys(event, 'cell')"
      >
        <div v-for="family of coverage.families" :key="family.id" class="family">
          <span class="family-name">{{ family.name }}</span>
          <span
            class="family-count"
            :data-problem="family.tokens.some((one) => one.state === 'broken') || undefined"
            >{{ family.tokens.filter((one) => one.state === 'used').length }}/{{
              family.tokens.length
            }}</span
          >
          <div class="cells">
            <Tooltip
              v-for="one of family.tokens"
              :key="one.key"
              :content="`--${one.name}`"
              :detail="t('readBy', { count: one.readers.length })"
            >
              <button
                type="button"
                class="cell"
                :data-state="one.state"
                :data-suspect="(one.state === 'used' && one.suspect) || undefined"
                :data-selected="selected === tokenRow(one.name) || undefined"
                :data-dimmed="dimmed(focus.tokens, one.name) || undefined"
                :data-key="one.key"
                :tabindex="cellEntry === one.key ? 0 : -1"
                :aria-label="`--${one.name}, ${tokenState(one)}`"
                :aria-pressed="selected === tokenRow(one.name)"
                @mouseenter="emit('hover', tokenRow(one.name))"
                @mouseleave="emit('hover', null)"
                @focus="emit('hover', tokenRow(one.name))"
                @blur="emit('hover', null)"
                @click="emit('select', tokenRow(one.name), $event)"
              />
            </Tooltip>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Deux colonnes de même largeur, un filet entre elles. */
.health-blocks {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--space-5);
}

.rule {
  width: var(--stroke-hairline);
  background: var(--border-base);
}

.block {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-2-5);
}

/* role/section of the Figma file. Sur une ligne : le complément qui apparaît au
   survol ne doit pas grandir le bloc, la liste glisserait sous le pointeur. */
.title {
  display: flex;
  min-width: 0;
  white-space: nowrap;
  gap: var(--space-2);
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.count {
  font-family: var(--font-mono);
  letter-spacing: 0;
  text-transform: none;
}

.note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-current);
  letter-spacing: 0;
  text-transform: none;
}

.bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
}

.labels {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.push {
  flex: 1;
}

.label {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  white-space: nowrap;
}

.label[data-state='blocking'] {
  color: var(--error-text);
}

.label[data-state='improve'] {
  color: var(--warning-text);
}

.label[data-state='ready'] {
  color: var(--success-text);
}

.label[data-state='orphan'] {
  color: var(--text-muted);
}

.pill {
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--background-sunken);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}

.segments {
  display: flex;
  gap: var(--space-1);
  height: 6px;
}

.segment {
  min-width: 6px;
  flex-basis: 0;
  border-radius: 3px;
}

.segment[data-state='blocking'] {
  background: var(--error-solid);
}

.segment[data-state='improve'] {
  background: var(--warning-solid);
}

.segment[data-state='ready'] {
  background: var(--success-solid);
}

/* L'orphelin, vide : un contour pointillé, pas de fond. */
.segment[data-state='orphan'] {
  box-sizing: border-box;
  border: var(--stroke-hairline) dashed var(--border-strong);
}

.components {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

/* Une entité qui a un contenu n'est jamais en vert plein : fond clair, contour
   de l'état. */
.case {
  position: relative;
  display: grid;
  width: 40px;
  height: 34px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  cursor: pointer;
}

.case[data-group='blocking'] {
  background: var(--error-background);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--error-border);
  color: var(--error-text);
}

.case[data-group='improve'] {
  background: var(--warning-background);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--warning-border);
  color: var(--warning-text);
}

.case[data-group='ready'] {
  background: var(--success-background);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--success-solid);
  color: var(--text-muted);
}

.case[data-selected] {
  box-shadow: inset 0 0 0 2px var(--accent-base);
}

/* Hors du focus, la case perd sa couleur et pas son nom : une opacité de 0.3
   rendait l'abréviation illisible (axe, 1.5:1). */
.case[data-dimmed] {
  background: var(--background-raised);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  color: var(--text-muted);
}

.abbreviation {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.stories {
  position: absolute;
  top: 1px;
  right: 3px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1;
}

.case[data-group='ready'] .stories {
  color: var(--text-subtle);
}

.families {
  display: flex;
  gap: var(--family-gap);
  align-items: flex-start;
}

.family {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
}

.family-name,
.family-count {
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1.2;
  white-space: nowrap;
}

.family-name {
  color: var(--text-muted);
}

.family-count {
  color: var(--text-muted);
}

.family-count[data-problem] {
  color: var(--error-text);
}

.cells {
  display: grid;
  grid-auto-columns: var(--cell);
  grid-auto-flow: column;
  grid-template-rows: repeat(var(--rows), var(--cell));
  gap: var(--cell-gap);
  margin-top: var(--space-1);
}

/* Les critères sont pleins ; l'orphelin est vide, en pointillé. */
.cell {
  box-sizing: border-box;
  width: var(--cell);
  height: var(--cell);
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.cell[data-state='used'] {
  background: var(--success-solid);
}

.cell[data-suspect] {
  background: var(--warning-solid);
}

.cell[data-state='broken'] {
  background: var(--error-solid);
}

.cell[data-state='orphan'] {
  border: var(--stroke-hairline) dashed var(--border-strong);
  background: none;
}

.cell[data-selected] {
  outline: 2px solid var(--text-primary);
  outline-offset: 1px;
}

.cell[data-dimmed] {
  opacity: 0.25;
}

/* Après la sélection, de même spécificité : le focus clavier reste visible sur
   une case choisie. */
.case:focus-visible,
.cell:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-focus);
}
</style>
