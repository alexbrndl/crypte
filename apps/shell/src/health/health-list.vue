<script setup lang="ts">
import { Checkbox } from '@crypte/ui'
import { computed } from 'vue'
import { texts } from '../i18n'
import { singular } from '../plural'
import {
  CRITERIA,
  ORPHANS,
  READY,
  sinceOf,
  tokenRow,
  type ComponentRow,
  type Criterion,
  type Dashboard,
  type Focus,
  type Group,
} from './dashboard'

// La liste du dashboard : une ligne par composant à corriger, groupée par
// gravité, puis les alias cassés et les orphelins. Les lignes cochées font le
// prompt ; une ligne choisie remplit le panneau.
const props = defineProps<{
  dashboard: Dashboard
  abbreviations: ReadonlyMap<string, string>
  focus: Focus
  // Ce qui est survolé ou choisi : la ligne prend la barre de survol.
  hovered: string | null
  selected: string | null
  checked: ReadonlySet<string>
}>()
const emit = defineEmits<{
  hover: [item: string | null]
  select: [item: string, event: MouseEvent]
  check: [keys: string[], on: boolean]
}>()

const t = texts({
  en: {
    inPrompt: '{count} of {total} in the prompt',
    blocking: 'blocking',
    improve: 'to improve',
    valid: 'valid',
    empty: 'empty',
    components: 'components',
    tokens: 'tokens',
    story: 'story',
    render: 'render',
    a11y: 'a11y',
    doc: 'doc',
    status: 'status',
    props: 'props',
    usages: 'usages',
    cause: 'cause',
    changed: 'changed',
    groupBlocking: 'blocking',
    groupImprove: 'to improve',
    groupReady: 'ready',
    readyOne: '{count} ready',
    readyMany: '{count} ready',
    family: 'family',
    readers: 'readers',
    value: 'value',
    readBy: 'read by {count}',
    absent: 'missing',
    broken: 'broken alias',
    orphanOne: '{count} orphan',
    orphanMany: '{count} orphans',
    familyOne: '{count} family',
    familyMany: '{count} families',
    neverOne: '{count} value never read',
    neverMany: '{count} values never read',
    readyReadOne: '{count} reads {token}: {names}',
    readyReadMany: '{count} read {token}: {names}',
    check: 'Add {name} to the prompt',
  },
  fr: {
    inPrompt: '{count} sur {total} dans le prompt',
    blocking: 'bloquant',
    improve: 'à améliorer',
    valid: 'validé',
    empty: 'vide',
    components: 'composants',
    tokens: 'tokens',
    story: 'story',
    render: 'rendu',
    a11y: 'a11y',
    doc: 'doc',
    status: 'statut',
    props: 'props',
    usages: 'usages',
    cause: 'en cause',
    changed: 'changé',
    groupBlocking: 'bloquant',
    groupImprove: 'à améliorer',
    groupReady: 'prêts',
    readyOne: '{count} prêt',
    readyMany: '{count} prêts',
    family: 'famille',
    readers: 'lecteurs',
    value: 'valeur',
    readBy: 'lu par {count}',
    absent: 'absent',
    broken: 'alias cassé',
    orphanOne: '{count} orphelin',
    orphanMany: '{count} orphelins',
    familyOne: '{count} famille',
    familyMany: '{count} familles',
    neverOne: '{count} valeur jamais lue',
    neverMany: '{count} valeurs jamais lues',
    readyReadOne: '{count} lit {token} : {names}',
    readyReadMany: '{count} lisent {token} : {names}',
    check: 'Ajouter {name} au prompt',
  },
})

const groups = computed(() =>
  (['blocking', 'improve', 'ready'] as const).map((group) => ({
    group,
    rows: props.dashboard.rows.filter((one) => one.group === group),
  })),
)
const nameOf = (key: string) =>
  props.dashboard.rows.find((one) => one.key === key)?.component.name ?? key

const all = computed(() => props.dashboard.coverage.families.flatMap((one) => one.tokens))
const broken = computed(() => all.value.filter((one) => one.state === 'broken'))
const orphans = computed(() => all.value.filter((one) => one.state === 'orphan'))
const tokenKeys = computed(() => [
  ...broken.value.map((one) => tokenRow(one.name)),
  ...(orphans.value.length > 0 ? [ORPHANS] : []),
])

// Cochée si toutes ses lignes le sont, mixte si une partie, vide sinon.
const stateOf = (keys: string[]) => {
  const on = keys.filter((key) => props.checked.has(key)).length
  return { checked: on > 0 && on === keys.length, indeterminate: on > 0 && on < keys.length }
}
const toggle = (keys: string[]) => emit('check', keys, !stateOf(keys).checked)

const componentKeys = computed(() =>
  props.dashboard.rows.filter((one) => one.group !== 'ready').map((one) => one.key),
)
const inPrompt = computed(
  () => props.dashboard.checkable.filter((key) => props.checked.has(key)).length,
)

const columns = computed(() => props.dashboard.columns)
const LABEL: Record<Criterion, () => string> = {
  story: () => t('story'),
  render: () => t('render'),
  a11y: () => t('a11y'),
  doc: () => t('doc'),
  status: () => t('status'),
  props: () => t('props'),
  usages: () => t('usages'),
}
const GROUP: Record<Group, () => string> = {
  blocking: () => t('groupBlocking'),
  improve: () => t('groupImprove'),
  ready: () => t('groupReady'),
}

const focused = (key: string) => props.focus.components !== null && props.focus.components.has(key)
const lit = (key: string) => props.hovered === key || focused(key)

const families = computed(() => new Set(orphans.value.map((one) => one.family)).size)
const readyNames = computed(() => groups.value[2]!.rows.map((one) => one.component.name).join(', '))

// La ligne des prêts dit lesquels lisent le token en focus.
const readyPhrase = computed(() => {
  const token = props.hovered?.startsWith('token:') ? props.hovered : props.selected
  if (!token?.startsWith('token:') || props.focus.components === null) return readyNames.value
  const readers = groups.value[2]!.rows.filter((one) => props.focus.components!.has(one.key))
  if (readers.length === 0) return readyNames.value
  const values = {
    count: readers.length,
    token: `--${token.slice('token:'.length)}`,
    names: readers.map((one) => one.component.name).join(', '),
  }
  return singular(readers.length) ? t('readyReadOne', values) : t('readyReadMany', values)
})

const rowEvents = (key: string) => ({
  mouseenter: () => emit('hover', key),
  mouseleave: () => emit('hover', null),
  click: (event: MouseEvent) => emit('select', key, event),
})

const cellsOf = (row: ComponentRow) => CRITERIA.map((one) => ({ key: one, ...row.criteria[one] }))
</script>

<template>
  <div class="health-list">
    <div class="selection">
      <span class="in-prompt">{{
        t('inPrompt', { count: inPrompt, total: dashboard.checkable.length })
      }}</span>
      <span class="legend" aria-hidden="true">
        <span class="key" data-state="blocking">{{ t('blocking') }}</span>
        <span class="key" data-state="improve">{{ t('improve') }}</span>
        <span class="key" data-state="valid">{{ t('valid') }}</span>
        <span class="key" data-state="empty">{{ t('empty') }}</span>
      </span>
    </div>

    <div class="header" role="presentation">
      <span class="check">
        <Checkbox
          v-if="componentKeys.length > 0"
          v-bind="stateOf(componentKeys)"
          :aria-label="t('components')"
          @change="toggle(componentKeys)"
        />
      </span>
      <span class="name section"
        >{{ t('components') }} <span class="count">{{ dashboard.rows.length }}</span></span
      >
      <span class="cells">
        <span v-for="one of CRITERIA" :key="one" class="column"
          ><span class="column-name">{{ LABEL[one]() }}</span>
          <span class="column-count">{{ columns[one].valid }}/{{ columns[one].total }}</span></span
        >
      </span>
      <span class="phrase quiet">{{ t('cause') }}</span>
      <span class="changed quiet">{{ t('changed') }}</span>
    </div>

    <template v-for="{ group, rows } of groups" :key="group">
      <template v-if="rows.length > 0">
        <div class="group" :data-group="group">
          <span class="check">
            <Checkbox
              v-if="group !== 'ready'"
              v-bind="stateOf(rows.map((one) => one.key))"
              :aria-label="GROUP[group]()"
              @change="toggle(rows.map((one) => one.key))"
            />
          </span>
          <span class="group-name"
            >{{ GROUP[group]() }} <span class="count">{{ rows.length }}</span></span
          >
        </div>

        <template v-if="group !== 'ready'">
          <div
            v-for="row of rows"
            :key="row.key"
            class="row"
            :data-hovered="lit(row.key) || undefined"
            :data-selected="selected === row.key || undefined"
            :data-blocking="group === 'blocking' || undefined"
            v-on="rowEvents(row.key)"
          >
            <span class="check" @click.stop>
              <Checkbox
                :checked="checked.has(row.key)"
                :aria-label="t('check', { name: row.component.name })"
                @change="emit('check', [row.key], !checked.has(row.key))"
              />
            </span>
            <span class="name">
              <span class="abbreviation" :data-shown="lit(row.key) || undefined">{{
                abbreviations.get(row.key)
              }}</span>
              <button type="button" class="label" @click.stop="emit('select', row.key, $event)">
                {{ row.component.name }}
              </button>
            </span>
            <span class="cells">
              <span
                v-for="cell of cellsOf(row)"
                :key="cell.key"
                class="cell"
                :data-state="cell.state"
                >{{ cell.state === 'empty' ? '' : (cell.text ?? '') }}</span
              >
            </span>
            <span class="phrase">{{ row.phrase }}</span>
            <span class="changed">{{
              row.component.changed ? sinceOf(row.component.changed) : ''
            }}</span>
          </div>
        </template>

        <!-- Les prêts tiennent une ligne, sans chevron : choisie, le panneau les liste. -->
        <div
          v-else
          class="row"
          :data-hovered="hovered === READY || undefined"
          :data-selected="selected === READY || undefined"
          v-on="rowEvents(READY)"
        >
          <span class="check" />
          <span class="name"
            ><span class="abbreviation" /><button
              type="button"
              class="label"
              @click.stop="emit('select', READY, $event)"
            >
              {{
                singular(rows.length)
                  ? t('readyOne', { count: rows.length })
                  : t('readyMany', { count: rows.length })
              }}
            </button></span
          >
          <span class="cells">
            <span v-for="one of CRITERIA" :key="one" class="cell" data-state="valid" />
          </span>
          <span class="phrase">{{ readyPhrase }}</span>
          <span class="changed" />
        </div>
      </template>
    </template>

    <template v-if="tokenKeys.length > 0">
      <div class="header tokens" role="presentation">
        <span class="check">
          <Checkbox
            v-bind="stateOf(tokenKeys)"
            :aria-label="t('tokens')"
            @change="toggle(tokenKeys)"
          />
        </span>
        <span class="name section"
          >{{ t('tokens') }}
          <span class="count"
            >{{ dashboard.coverage.used }}/{{ dashboard.coverage.total }}</span
          ></span
        >
        <span class="cells token-cells">
          <span class="span-2 quiet">{{ t('family') }}</span>
          <span class="span-2 quiet">{{ t('readers') }}</span>
          <span class="span-3 quiet">{{ t('value') }}</span>
        </span>
        <span class="phrase quiet">{{ t('cause') }}</span>
        <span class="changed quiet">{{ t('changed') }}</span>
      </div>

      <div
        v-for="one of broken"
        :key="one.key"
        class="row"
        data-blocking
        :data-hovered="hovered === tokenRow(one.name) || undefined"
        :data-selected="selected === tokenRow(one.name) || undefined"
        v-on="rowEvents(tokenRow(one.name))"
      >
        <span class="check" @click.stop>
          <Checkbox
            :checked="checked.has(tokenRow(one.name))"
            :aria-label="t('check', { name: `--${one.name}` })"
            @change="emit('check', [tokenRow(one.name)], !checked.has(tokenRow(one.name)))"
          />
        </span>
        <span class="name"
          ><span class="abbreviation" /><button
            type="button"
            class="label"
            @click.stop="emit('select', tokenRow(one.name), $event)"
            data-code
          >
            --{{ one.name }}
          </button></span
        >
        <span class="cells token-cells">
          <span class="span-2"
            ><span class="pill">{{
              dashboard.coverage.families.find((family) => family.id === one.family)?.name
            }}</span></span
          >
          <span class="span-2 code muted"
            >{{ t('readBy', { count: one.readers.length })
            }}{{ one.readers.length > 0 ? ` · ${one.readers.map(nameOf).join(', ')}` : '' }}</span
          >
          <span class="span-3 code muted"
            >→ --{{ one.target }} <span class="absent">{{ t('absent') }}</span></span
          >
        </span>
        <span class="phrase">{{ t('broken') }}</span>
        <span class="changed" />
      </div>

      <div
        v-if="orphans.length > 0"
        class="row"
        :data-hovered="hovered === ORPHANS || undefined"
        :data-selected="selected === ORPHANS || undefined"
        v-on="rowEvents(ORPHANS)"
      >
        <span class="check" @click.stop>
          <Checkbox
            :checked="checked.has(ORPHANS)"
            :aria-label="
              t('check', {
                name: singular(orphans.length)
                  ? t('orphanOne', { count: orphans.length })
                  : t('orphanMany', { count: orphans.length }),
              })
            "
            @change="emit('check', [ORPHANS], !checked.has(ORPHANS))"
          />
        </span>
        <span class="name"
          ><span class="abbreviation" /><button
            type="button"
            class="label"
            @click.stop="emit('select', ORPHANS, $event)"
          >
            {{
              singular(orphans.length)
                ? t('orphanOne', { count: orphans.length })
                : t('orphanMany', { count: orphans.length })
            }}
          </button></span
        >
        <span class="cells token-cells">
          <span class="span-2"
            ><span class="pill">{{
              singular(families)
                ? t('familyOne', { count: families })
                : t('familyMany', { count: families })
            }}</span></span
          >
          <span class="span-2 code muted">{{ t('readBy', { count: 0 }) }}</span>
          <span class="span-3 code muted">{{
            singular(orphans.length)
              ? t('neverOne', { count: orphans.length })
              : t('neverMany', { count: orphans.length })
          }}</span>
        </span>
        <span class="phrase">{{ orphans.map((one) => `--${one.name}`).join(', ') }}</span>
        <span class="changed" />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* La largeur de la phrase suit celle de la liste : 360 px, 150 px quand le
   panneau ou une fenêtre étroite la réduit. */
.health-list {
  --phrase: 360px;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
}

@container (max-width: 1100px) {
  .header,
  .row {
    --phrase: 150px;
  }
}

.selection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.in-prompt {
  color: var(--text-muted);
}

.legend {
  display: flex;
  gap: var(--space-3);
  color: var(--text-muted);
}

.key {
  display: inline-flex;
  gap: var(--space-1-5);
  align-items: center;
}

.key::before {
  width: 12px;
  height: 8px;
  box-sizing: border-box;
  border-radius: var(--radius-xs);
  content: '';
}

.key[data-state='blocking']::before {
  background: var(--error-solid);
}

.key[data-state='improve']::before {
  background: var(--warning-solid);
}

.key[data-state='valid']::before {
  background: var(--success-solid);
}

.key[data-state='empty']::before {
  border: var(--stroke-hairline) dashed var(--border-strong);
}

/* Un en-tête encadré de deux séparateurs, marges 6 au-dessus et en dessous. */
.header {
  display: flex;
  align-items: center;
  margin: var(--space-1-5) 0;
  padding: var(--space-1-5) var(--space-2);
  border-top: var(--stroke-hairline) solid var(--border-base);
  border-bottom: var(--stroke-hairline) solid var(--border-base);
}

.check {
  display: flex;
  width: 24px;
  flex: none;
  align-items: center;
}

.name {
  display: flex;
  width: 152px;
  min-width: 0;
  flex: none;
  gap: var(--space-1-5);
  align-items: center;
}

/* role/section of the Figma file. */
.section,
.group-name {
  gap: var(--space-2);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.section {
  color: var(--text-primary);
}

.count {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-weight: var(--weight-normal);
  letter-spacing: 0;
}

.cells {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: var(--space-1);
  align-items: center;
}

.column {
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  gap: var(--space-1);
  align-items: baseline;
  overflow: hidden;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.column-name {
  color: var(--text-primary);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.column-count {
  color: var(--text-muted);
  font-size: 11px;
  line-height: var(--leading-2xs);
}

.phrase {
  box-sizing: border-box;
  width: var(--phrase);
  flex: none;
  overflow: hidden;
  padding: 0 var(--space-3) 0 var(--space-2-5);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.changed {
  width: 44px;
  flex: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  white-space: nowrap;
}

/* role/caption of the Figma file, the same for every header label. */
.quiet {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.group {
  display: flex;
  align-items: center;
  padding: var(--space-2-5) var(--space-2) var(--space-0-5);
}

.group[data-group='blocking'] .group-name {
  color: var(--error-text);
}

.group[data-group='improve'] .group-name {
  color: var(--warning-text);
}

.group[data-group='ready'] .group-name {
  color: var(--success-text);
}

.group-name {
  display: flex;
  margin-left: var(--space-2);
}

.row {
  position: relative;
  display: flex;
  height: 28px;
  box-sizing: border-box;
  align-items: center;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

/* La barre de survol et de sélection, à gauche. */
.row[data-hovered],
.row[data-selected] {
  background: var(--background-hover);
}

.row[data-selected] {
  background: var(--background-current);
}

.row[data-hovered]::before,
.row[data-selected]::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: var(--accent-base);
  content: '';
}

.row[data-blocking] .phrase {
  color: var(--error-text);
}

.abbreviation {
  width: 32px;
  flex: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  visibility: hidden;
}

.abbreviation[data-shown] {
  visibility: visible;
}

/* role/label-strong of the Figma file. Un bouton : la ligne se choisit au
   clavier, celles des prêts et des orphelins n'ayant pas d'autre entrée. */
.label {
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-focus);
}

.label[data-code],
.code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xs);
}

.muted {
  color: var(--text-muted);
}

.cell {
  display: grid;
  height: 20px;
  min-width: 0;
  box-sizing: border-box;
  flex: 1 1 0;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-xs);
  /* Blanc en clair, comme la maquette, foncé en sombre : Lc 64 à 73 en APCA sur
     le vert et l'orange. Seules props et usages portent un texte, et jamais sur
     du rouge, où le foncé tombe à Lc 50 en sombre. */
  color: var(--text-inverse);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.cell[data-state='valid'] {
  background: var(--success-solid);
}

.cell[data-state='improve'] {
  background: var(--warning-solid);
}

.cell[data-state='blocking'] {
  background: var(--error-solid);
}

.cell[data-state='empty'] {
  border: var(--stroke-hairline) dashed var(--border-strong);
}

/* Les colonnes des tokens, calées sur la grille des sept cases. */
.token-cells {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.span-2,
.span-3 {
  overflow: hidden;
  padding-left: var(--space-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.span-2 {
  grid-column: span 2;
}

.span-3 {
  grid-column: span 3;
}

.pill {
  padding: var(--space-0-5) var(--space-1-5);
  border-radius: var(--radius-full);
  background: var(--background-sunken);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.absent {
  color: var(--error-text);
}
</style>
