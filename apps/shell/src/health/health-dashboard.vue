<script setup lang="ts">
import { ViewCanvas } from '@crypte/ui'
import { computed, ref } from 'vue'
import { texts } from '../i18n'
import { singular } from '../plural'
import { abbreviationsOf, focusOf, ORPHANS, READY, type Dashboard } from './dashboard'
import HealthBlocks from './health-blocks.vue'
import HealthList from './health-list.vue'
import HealthScore from './health-score.vue'

// Le canvas de la santé : le score, les blocs composants et tokens, puis la
// liste qui fait le prompt. Survoler un élément met en focus ce qui s'y
// rattache ; le choisi le garde quand rien n'est survolé.
const props = defineProps<{
  dashboard: Dashboard
  checked: ReadonlySet<string>
  selected: string | null
  // L'audit n'a pas tourné.
  partial: boolean
}>()
const emit = defineEmits<{
  select: [item: string, event: MouseEvent]
  check: [keys: string[], on: boolean]
}>()

const t = texts({
  en: {
    region: 'Health',
    readTokenOne: '{count} reads {token}',
    readTokenMany: '{count} read {token}',
    readByOne: '{count} read by {name}',
    readByMany: '{count} read by {name}',
    readyOne: '{count} ready',
    readyMany: '{count} ready',
    orphans: 'none reads the orphans',
  },
  fr: {
    region: 'Santé',
    readTokenOne: '{count} lit {token}',
    readTokenMany: '{count} lisent {token}',
    readByOne: '{count} lu par {name}',
    readByMany: '{count} lus par {name}',
    readyOne: '{count} prêt',
    readyMany: '{count} prêts',
    orphans: 'aucun ne lit les orphelins',
  },
})

const hovered = ref<string | null>(null)
const item = computed(() => hovered.value ?? props.selected)
const focus = computed(() => focusOf(props.dashboard, item.value))

const abbreviations = computed(() => {
  const rows = props.dashboard.rows
  const shown = abbreviationsOf(rows.map((one) => one.component.name))
  return new Map(rows.map((one, at) => [one.key, shown[at]!]))
})

// Le complément des titres de bloc, quand un focus est actif.
const notes = computed((): { components?: string; tokens?: string } => {
  const at = item.value
  if (at === null) return {}
  if (at === ORPHANS) return { components: t('orphans') }
  if (at === READY) {
    const count = focus.value.components?.size ?? 0
    return { components: singular(count) ? t('readyOne', { count }) : t('readyMany', { count }) }
  }
  if (at.startsWith('token:')) {
    const count = focus.value.components?.size ?? 0
    const values = { count, token: `--${at.slice('token:'.length)}` }
    return { components: singular(count) ? t('readTokenOne', values) : t('readTokenMany', values) }
  }
  const row = props.dashboard.rows.find((one) => one.key === at)
  if (!row) return {}
  const values = { count: focus.value.tokens?.size ?? 0, name: row.component.name }
  return { tokens: singular(values.count) ? t('readByOne', values) : t('readByMany', values) }
})
</script>

<template>
  <ViewCanvas class="health-dashboard" :aria-label="t('region')">
    <HealthScore :score="dashboard.score" :blocking="dashboard.blocking" :partial="partial" />
    <HealthBlocks
      :dashboard="dashboard"
      :abbreviations="abbreviations"
      :focus="focus"
      :selected="selected"
      :notes="notes"
      @hover="(one) => (hovered = one)"
      @select="(one, event) => emit('select', one, event)"
    />
    <HealthList
      :dashboard="dashboard"
      :abbreviations="abbreviations"
      :focus="focus"
      :hovered="hovered"
      :selected="selected"
      :checked="checked"
      @hover="(one) => (hovered = one)"
      @select="(one, event) => emit('select', one, event)"
      @check="(keys, on) => emit('check', keys, on)"
    />
  </ViewCanvas>
</template>

<style scoped>
.health-dashboard {
  min-width: 0;
  overflow-y: auto;
}
</style>
