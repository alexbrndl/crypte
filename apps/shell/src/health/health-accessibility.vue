<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { computed } from 'vue'
import { cleanOf, findingsOf, unjudgedOf, type AuditResult } from './audit'
import CardTable from '../ui/card-table.vue'
import EmptyNote from '../ui/empty-note.vue'
import SectionHeader from '../ui/section-header.vue'
import ViewCanvas from '../ui/view-canvas.vue'
import { storyName } from './health'

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
const themesOf = (themes: string[]) =>
  themes.length === 2 ? 'in light and dark' : `in ${themes[0]}`
</script>

<template>
  <ViewCanvas class="health-view" aria-label="Health, accessibility">
    <SectionHeader
      title="accessibility"
      count="axe"
      :note="
        audit ? `${counts.audited} stories · light and dark themes` : 'every story, light and dark'
      "
    >
      <template v-if="plugin && audit && !running" #action>
        <Button class="run" @click="emit('run')">Run again</Button>
      </template>
    </SectionHeader>

    <EmptyNote v-if="failed && !running" failed role="alert">
      The audit could not run: {{ failed }}.
    </EmptyNote>
    <EmptyNote v-if="!plugin">
      Install <code>@crypte/a11y</code> and add it to <code>plugins</code> to audit every story.
    </EmptyNote>
    <EmptyNote v-else-if="running" role="status">
      Auditing, {{ running.done }} of {{ running.total }} renders.
    </EmptyNote>
    <div v-else-if="!audit" class="start">
      <EmptyNote>
        The audit renders every story in light and in dark, out of sight, and lists what axe finds.
      </EmptyNote>
      <Button class="run" @click="emit('run')">Run the audit</Button>
    </div>
    <template v-else>
      <ul class="cards">
        <li>
          <strong>{{ counts.clean }}</strong
          >{{ ' ' }}<span>{{ counts.clean === 1 ? 'story' : 'stories' }} without violation</span>
        </li>
        <li>
          <strong>{{ counts.serious }}</strong
          >{{ ' ' }}<span>serious {{ counts.serious === 1 ? 'violation' : 'violations' }}</span>
        </li>
        <li>
          <strong>{{ counts.critical }}</strong
          >{{ ' ' }}<span>critical {{ counts.critical === 1 ? 'violation' : 'violations' }}</span>
        </li>
      </ul>
      <EmptyNote v-if="unaudited.length > 0" class="unaudited">
        Could not be audited: {{ unaudited.map(nameOf).join(', ') }}.
      </EmptyNote>
      <EmptyNote v-if="findings.length === 0">No violation found.</EmptyNote>
      <CardTable v-else>
        <thead>
          <tr>
            <th scope="col">story</th>
            <th scope="col">rule</th>
            <th scope="col" class="grow">problem</th>
            <th scope="col">impact</th>
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
