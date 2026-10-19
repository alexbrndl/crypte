<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { computed } from 'vue'
import { cleanOf, findingsOf, type AuditResult } from './audit'

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

// Les stories que l'audit n'a pas pu juger, une fois chacune : la jauge les compte
// comme non propres, et rien d'autre ne les nommerait.
const unaudited = computed(() => [
  ...new Set((props.audit ?? []).filter((one) => 'error' in one).map((one) => one.id)),
])

const nameOf = (id: string) => {
  const story = props.stories.find((one) => one.id === id)
  return story ? `${story.path.at(-1)} / ${story.name}` : id
}
const themesOf = (themes: string[]) =>
  themes.length === 2 ? 'in light and dark' : `in ${themes[0]}`
</script>

<template>
  <section class="health-view" aria-label="Health, accessibility">
    <header class="section">
      <h2>accessibility</h2>
      <span class="badge">axe</span>
      <span class="note">{{
        audit ? `${counts.audited} stories · light and dark themes` : 'every story, light and dark'
      }}</span>
      <Button v-if="plugin && audit && !running" class="run" @click="emit('run')">Run again</Button>
    </header>

    <p v-if="failed && !running" class="empty failed" role="alert">
      The audit could not run: {{ failed }}.
    </p>
    <p v-if="!plugin" class="empty">
      Install <code>@crypte/a11y</code> and add it to <code>plugins</code> to audit every story.
    </p>
    <p v-else-if="running" class="empty" role="status">
      Auditing, {{ running.done }} of {{ running.total }} renders.
    </p>
    <div v-else-if="!audit" class="start">
      <p class="empty">
        The audit renders every story in light and in dark, out of sight, and lists what axe finds.
      </p>
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
      <p v-if="unaudited.length > 0" class="empty unaudited">
        Could not be audited: {{ unaudited.map(nameOf).join(', ') }}.
      </p>
      <p v-if="findings.length === 0" class="empty">No violation found.</p>
      <table v-else>
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
            <td class="grow problem">{{ one.violation.help }}, {{ themesOf(one.themes) }}</td>
            <td class="code" :data-ink="one.violation.impact === 'critical' ? 'error' : undefined">
              {{ one.violation.impact }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
.health-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  background: var(--background-subtle);
}

.section {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding-bottom: var(--space-1);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* Muted, not the subtle of the Figma file: subtle falls under 4.5:1 here. */
.section h2 {
  margin: 0;
  color: var(--text-muted);
  font-size: inherit;
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.badge {
  padding: var(--space-0-5) var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--background-raised);
  color: var(--text-current);
  font-family: var(--font-mono);
}

.note {
  flex: 1;
  color: var(--text-muted);
  text-align: right;
}

.empty {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

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

table {
  width: 100%;
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-md);
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  background: var(--background-raised);
}

th,
td {
  padding: 9px var(--space-3);
  text-align: left;
  vertical-align: top;
}

thead th {
  padding-block: var(--space-1-5);
  background: var(--background-subtle);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xs);
  white-space: nowrap;
}

tbody tr {
  cursor: pointer;
}

tbody th,
tbody td {
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-light);
}

tbody tr:hover {
  background: var(--background-hover);
}

tbody tr[data-selected] {
  background: var(--background-current);
}

tbody th {
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
  line-height: var(--leading-sm);
  white-space: nowrap;
}

tbody th a {
  color: var(--text-primary);
  text-decoration: none;
}

.grow {
  width: 100%;
}

.problem {
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

.code {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  white-space: nowrap;
}

[data-ink='error'] {
  color: var(--error-text);
}

code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
</style>
