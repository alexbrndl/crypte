<script setup lang="ts">
import { Tooltip } from '@crypte/ui'
import { locale, texts } from '../i18n'
import { tokenRow, type Dashboard, type TokenHealth } from './dashboard'

// Une famille de la grille des tokens, à part pour que `v-memo` y tienne : dans
// un `v-for` imbriqué, son cache est partagé entre les familles et ne sert
// jamais. À 1 200 tokens, chaque survol recréait alors toutes les infobulles,
// 600 ms par rendu dans jsdom.
const props = defineProps<{
  family: Dashboard['coverage']['families'][number]
  // Les tokens en focus, `null` sans focus.
  lit: ReadonlySet<string> | null
  selected: string | null
  // La case qui tient la tabulation (roving tabindex), aucune sans token.
  entry: string | undefined
}>()
const emit = defineEmits<{
  hover: [item: string | null]
  select: [item: string, event: MouseEvent]
}>()

const t = texts({
  en: {
    readBy: 'read by {count}',
    stateUsed: 'used',
    stateOrphan: 'orphan',
    stateBroken: 'broken alias',
    suspect: 'suspect of a contrast violation',
  },
  fr: {
    readBy: 'lu par {count}',
    stateUsed: 'utilisé',
    stateOrphan: 'orphelin',
    stateBroken: 'alias cassé',
    suspect: "suspect d'une violation de contraste",
  },
})

const stateOf = (one: TokenHealth) =>
  one.state === 'broken'
    ? t('stateBroken')
    : one.suspect
      ? t('suspect')
      : one.state === 'orphan'
        ? t('stateOrphan')
        : t('stateUsed')
</script>

<template>
  <div class="family" :data-focused="lit !== null || undefined">
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
        v-memo="[
          one,
          props.selected === tokenRow(one.name),
          props.lit?.has(one.name) ?? false,
          props.entry === one.key,
          locale,
        ]"
        :content="`--${one.name}`"
        :detail="t('readBy', { count: one.readers.length })"
      >
        <button
          type="button"
          class="cell"
          :data-state="one.state"
          :data-suspect="(one.state === 'used' && one.suspect) || undefined"
          :data-selected="selected === tokenRow(one.name) || undefined"
          :data-lit="lit?.has(one.name) || undefined"
          :data-key="one.key"
          :tabindex="entry === one.key ? 0 : -1"
          :aria-label="`--${one.name}, ${stateOf(one)}`"
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
</template>

<style scoped>
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

.family[data-focused] .cell:not([data-lit]) {
  opacity: 0.25;
}

/* Après la sélection, de même spécificité : le focus clavier reste visible sur
   une case choisie. */
.cell:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-focus);
}
</style>
