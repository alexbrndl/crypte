<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { Button, CardTable, EmptyNote, SectionHeader, ViewCanvas } from '@crypte/ui'
import { computed } from 'vue'
import { cleanOf, findingsOf, unjudgedOf, type AuditResult } from './audit'
import { storyName } from './health'
import { texts } from '../i18n'
import { singular } from '../plural'

// La page accessibilité de la vue santé : l'audit de chaque story, en light et en
// dark, lancé à la demande, puis ses violations, une ligne par story et par règle.
const props = defineProps<{
  // Sans le plugin a11y, rien ne dit ce qu'une story enfreint.
  plugin: boolean
  audit: AuditResult[] | null
  // Le nombre de rendus faits et à faire pendant l'audit, `null` hors audit.
  running: { done: number; total: number } | null
  // Pourquoi le dernier audit n'a pas tourné.
  failed: string | null
  stories: StoryEntry[]
  selected: string | null
  hrefOf: (key: string) => string
}>()
const emit = defineEmits<{ run: []; select: [key: string, event: MouseEvent] }>()

const findings = computed(() => (props.audit ? findingsOf(props.audit) : []))
const counts = computed(() => ({
  ...(props.audit ? cleanOf(props.audit) : { clean: 0, audited: 0 }),
  serious: findings.value.filter((one) => one.violation.impact === 'serious').length,
  critical: findings.value.filter((one) => one.violation.impact === 'critical').length,
}))

// Les stories qu'axe n'a pas pu juger sans qu'elles lèvent : la jauge a11y ne les
// compte pas, et rien d'autre ne les nommerait.
const unaudited = computed(() => unjudgedOf(props.audit ?? []))

const nameOf = (id: string) => storyName(props.stories, id)
const t = texts({
  en: {
    region: 'Health, accessibility',
    title: 'accessibility',
    audited: '{count} stories · light and dark themes',
    every: 'every story, light and dark',
    again: 'Run again',
    failed: 'The audit could not run: {reason}.',
    install: 'Install',
    addTo: 'and add it to',
    toAudit: 'to audit every story.',
    running: 'Auditing, {done} of {total} renders.',
    explain:
      'The audit renders every story in light and in dark, out of sight, and lists what axe finds.',
    run: 'Run the audit',
    cleanOne: 'story without violation',
    cleanMany: 'stories without violation',
    seriousOne: 'serious violation',
    seriousMany: 'serious violations',
    criticalOne: 'critical violation',
    criticalMany: 'critical violations',
    unaudited: 'Could not be audited: {names}.',
    none: 'No violation found.',
    story: 'story',
    rule: 'rule',
    problem: 'problem',
    impact: 'impact',
    both: 'in light and dark',
    light: 'in light',
    dark: 'in dark',
  },
  fr: {
    region: 'Santé, accessibilité',
    title: 'accessibilité',
    audited: '{count} stories · thèmes clair et sombre',
    every: 'chaque story, clair et sombre',
    again: 'Relancer',
    failed: "L'audit n'a pas pu tourner : {reason}.",
    install: 'Installez',
    addTo: 'et ajoutez-le à',
    toAudit: 'pour auditer chaque story.',
    running: 'Audit en cours, {done} sur {total} rendus.',
    explain:
      "L'audit rend chaque story en clair et en sombre, hors de vue, et liste ce que trouve axe.",
    run: "Lancer l'audit",
    cleanOne: 'story sans violation',
    cleanMany: 'stories sans violation',
    seriousOne: 'violation sérieuse',
    seriousMany: 'violations sérieuses',
    criticalOne: 'violation critique',
    criticalMany: 'violations critiques',
    unaudited: 'Audit impossible : {names}.',
    none: 'Aucune violation trouvée.',
    story: 'story',
    rule: 'règle',
    problem: 'problème',
    impact: 'impact',
    both: 'en clair et en sombre',
    light: 'en clair',
    dark: 'en sombre',
  },
})

const themesOf = (themes: string[]) =>
  themes.length === 2 ? t('both') : t(themes[0] === 'dark' ? 'dark' : 'light')
</script>

<template>
  <ViewCanvas class="health-view" :aria-label="t('region')">
    <SectionHeader
      :title="t('title')"
      count="axe"
      :note="audit ? t('audited', { count: counts.audited }) : t('every')"
    >
      <template v-if="plugin && audit && !running" #action>
        <Button class="run" @click="emit('run')">{{ t('again') }}</Button>
      </template>
    </SectionHeader>

    <EmptyNote v-if="failed && !running" failed role="alert">
      {{ t('failed', { reason: failed }) }}
    </EmptyNote>
    <EmptyNote v-if="!plugin">
      {{ t('install') }} <code>@crypte/a11y</code> {{ t('addTo') }} <code>plugins</code>
      {{ t('toAudit') }}
    </EmptyNote>
    <EmptyNote v-else-if="running" role="status">
      {{ t('running', { done: running.done, total: running.total }) }}
    </EmptyNote>
    <div v-else-if="!audit" class="start">
      <EmptyNote>
        {{ t('explain') }}
      </EmptyNote>
      <Button class="run" @click="emit('run')">{{ t('run') }}</Button>
    </div>
    <template v-else>
      <ul class="cards">
        <li>
          <strong>{{ counts.clean }}</strong
          >{{ ' ' }}<span>{{ t(singular(counts.clean) ? 'cleanOne' : 'cleanMany') }}</span>
        </li>
        <li>
          <strong>{{ counts.serious }}</strong
          >{{ ' ' }}<span>{{ t(singular(counts.serious) ? 'seriousOne' : 'seriousMany') }}</span>
        </li>
        <li>
          <strong>{{ counts.critical }}</strong
          >{{ ' ' }}<span>{{ t(singular(counts.critical) ? 'criticalOne' : 'criticalMany') }}</span>
        </li>
      </ul>
      <EmptyNote v-if="unaudited.length > 0" class="unaudited">
        {{ t('unaudited', { names: unaudited.map(nameOf).join(', ') }) }}
      </EmptyNote>
      <EmptyNote v-if="findings.length === 0">{{ t('none') }}</EmptyNote>
      <CardTable v-else>
        <thead>
          <tr>
            <th scope="col">{{ t('story') }}</th>
            <th scope="col">{{ t('rule') }}</th>
            <th scope="col" class="grow">{{ t('problem') }}</th>
            <th scope="col">{{ t('impact') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="one of findings"
            :key="one.key"
            :data-selected="one.key === selected || undefined"
            @click="emit('select', one.key, $event)"
          >
            <th scope="row">
              <a
                :href="hrefOf(one.key)"
                :aria-current="one.key === selected ? 'true' : undefined"
                @click.stop="emit('select', one.key, $event)"
                >{{ nameOf(one.id) }}</a
              >
            </th>
            <td class="code">{{ one.violation.rule }}</td>
            <td class="grow">{{ one.violation.help }}, {{ themesOf(one.themes) }}</td>
            <td class="code" :data-ink="one.violation.impact === 'critical' ? 'error' : undefined">
              {{ one.violation.impact }}
            </td>
          </tr>
        </tbody>
      </CardTable>
    </template>
  </ViewCanvas>
</template>

<style scoped>
.start {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}

/* Les trois cartes de la maquette : le chiffre en 24, le libellé dessous. */
.cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cards li {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-3-5);
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.cards strong {
  color: var(--text-primary);
  font-size: var(--text-2xl);
  font-weight: var(--weight-medium);
  line-height: var(--leading-2xl);
}

code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
</style>
