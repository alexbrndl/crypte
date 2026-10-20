<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import type { Failure } from './audit'

// La page des rendus en échec : les stories qui lèvent quand on les rend, une
// ligne chacune, ses thèmes ensemble. Rien avant le premier audit.
const props = defineProps<{
  failures: Failure[] | null
  running: { done: number; total: number } | null
  // Pourquoi le dernier audit n'a pas tourné.
  failed: string | null
  stories: StoryEntry[]
  selected: string | null
  hrefOf: (key: string) => string
}>()
const emit = defineEmits<{ run: []; select: [key: string, event: MouseEvent] }>()

const nameOf = (id: string) => {
  const story = props.stories.find((one) => one.id === id)
  return story ? `${story.path.at(-1)} / ${story.name}` : id
}
const themesOf = (themes: string[]) => (themes.length === 2 ? 'light and dark' : themes[0])
</script>

<template>
  <section class="health-view" aria-label="Health, render errors">
    <header class="section">
      <h2>render errors</h2>
      <span v-if="failures" class="badge">{{ failures.length }}</span>
      <span class="note">every story, light and dark</span>
      <Button v-if="!running" class="run" @click="emit('run')">{{
        failures ? 'Run again' : 'Run the audit'
      }}</Button>
    </header>
    <p v-if="failed && !running" class="empty failed" role="alert">
      The audit could not run: {{ failed }}.
    </p>
    <p v-if="running" class="empty" role="status">
      Rendering every story, {{ running.done }} of {{ running.total }} renders.
    </p>
    <p v-else-if="failures === null" class="empty">The audit has not run yet.</p>
    <p v-else-if="failures.length === 0" class="empty">Every story renders.</p>
    <table v-else>
      <thead>
        <tr>
          <th scope="col">story</th>
          <th scope="col" class="grow">error</th>
          <th scope="col">themes</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="one of failures"
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
          <td class="grow message">{{ one.message }}</td>
          <td class="code">{{ themesOf(one.themes) }}</td>
        </tr>
      </tbody>
    </table>
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

.message {
  color: var(--error-text);
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
</style>
