<script setup lang="ts">
import { Tooltip } from '@crypte/ui'
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import Icon from '../ui/icon.vue'
import { texts } from '../i18n'
import { singular } from '../plural'

// La ligne du score de la santé : le chiffre, ce qu'il moyenne en infobulle, et
// les bloquants quand il y en a. Avant l'audit, la santé est partielle.
const props = defineProps<{
  score: number
  blocking: number
  // L'audit n'a pas tourné : rendu et a11y restent vides.
  partial: boolean
}>()

const t = texts({
  en: {
    score: 'score {score} %',
    detail: 'mean of the 8 criteria, empty cells left out',
    overall: 'overall health',
    partial: 'partial health, render and a11y waiting for the audit plugin',
    one: '· {count} blocking',
    many: '· {count} blocking',
  },
  fr: {
    score: 'score {score} %',
    detail: 'moyenne des 8 critères, cases vides exclues',
    overall: 'santé globale',
    partial: "santé partielle, rendu et a11y en attente du plugin d'audit",
    one: '· {count} bloquant',
    many: '· {count} bloquants',
  },
})
</script>

<template>
  <div class="health-score">
    <span class="figure" :data-partial="partial || undefined">{{ props.score }} %</span>
    <Tooltip :content="t('score', { score: props.score })" :detail="t('detail')">
      <button type="button" class="info" :aria-label="t('score', { score: props.score })">
        <Icon :icon="InformationCircleIcon" />
      </button>
    </Tooltip>
    <span class="overall">{{ partial ? t('partial') : t('overall') }}</span>
    <span v-if="blocking > 0" class="blocking">{{
      singular(blocking) ? t('one', { count: blocking }) : t('many', { count: blocking })
    }}</span>
  </div>
</template>

<style scoped>
.health-score {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

/* role/display of the Figma file. */
.figure {
  color: var(--text-primary);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-3xl);
  letter-spacing: var(--tracking-tight);
}

.figure[data-partial] {
  color: var(--text-subtle);
}

.info {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-subtle);
  cursor: help;
}

.info:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-focus);
}

.overall,
.blocking {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.overall {
  color: var(--text-muted);
}

.blocking {
  color: var(--error-text);
}
</style>
