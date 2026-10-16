<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { computed } from 'vue'
import { componentIdOf } from '../navigation/tree'
import { componentOfId, type Changes } from '../pages/changes'
import type { Difference } from './differences'

// Le canvas de la vue versions : ce qui a changé depuis le point choisi, puis le
// détail de l'écart sélectionné. Pour un token, sa valeur avant et après dans
// chaque thème et les composants qui le lisent ; pour une story, ce qui a bougé.
// Des valeurs et des noms, jamais un rendu d'avant : il faudrait l'ancien code.
const props = defineProps<{
  changes: Changes | null
  difference: Difference | null
  count: number
  stories: StoryEntry[]
  hrefOfStory: (id: string) => string
  hrefOfComponent: (id: string) => string
}>()
const emit = defineEmits<{
  story: [id: string, event: MouseEvent]
  component: [id: string, event: MouseEvent]
}>()

const since = computed(() =>
  props.changes !== null && 'from' in props.changes
    ? props.changes.from.ref === 'HEAD'
      ? 'the last commit'
      : props.changes.from.ref
    : null,
)

// Les thèmes du token, de part et d'autre, chacun avec sa valeur avant et après.
const themes = computed(() => {
  const change = props.difference?.nature === 'token' ? props.difference.change : null
  if (change === null) return []
  const before = change.kind === 'appeared' ? {} : change.before
  const after = change.kind === 'disappeared' ? {} : change.after
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((theme) => ({
    theme,
    before: before[theme],
    after: after[theme],
  }))
})

// Les composants qui lisent le token aujourd'hui, une fois chacun.
const readers = computed(() => {
  const name = props.difference?.nature === 'token' ? props.difference.name : null
  if (name === null) return []
  const found = new Map<string, { id: string; name: string }>()
  for (const story of props.stories) {
    if (!story.component.tokens?.includes(name)) continue
    const key = `${story.component.file}#${story.component.export}`
    if (!found.has(key)) found.set(key, { id: componentIdOf(story.path), name: story.path.at(-1)! })
  }
  return [...found.values()]
})

const props_ = computed(() => {
  const change = props.difference?.nature === 'story' ? props.difference.change : null
  if (change?.kind !== 'changed' || !change.props) return null
  const { before, after } = change.props
  return {
    added: after.filter((one) => !before.includes(one)),
    removed: before.filter((one) => !after.includes(one)),
  }
})

// Une story partie mène à la page de son composant, s'il en reste une.
const remaining = computed(() => {
  const difference = props.difference
  if (difference?.nature !== 'story' || difference.kind !== 'disappeared') return null
  const component = componentOfId(difference.change.id)
  return component !== null && props.stories.some((one) => componentIdOf(one.path) === component)
    ? component
    : null
})

const isColor = (value: string | undefined) =>
  value !== undefined && /^(#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\()/i.test(value)
</script>

<template>
  <section class="versions-view" aria-label="Versions">
    <h2>{{ since ? `What changed since ${since}` : 'What changed' }}</h2>
    <p v-if="changes === null" class="note">Reading the changes…</p>
    <p v-else-if="'reason' in changes" class="note">
      The changes cannot be read: {{ changes.reason }}.
    </p>
    <template v-else>
      <p class="note">
        {{
          count === 0
            ? 'Nothing changed in the catalogue.'
            : `${count} ${count === 1 ? 'difference' : 'differences'} from ${changes.from.commit}.`
        }}
        <template v-if="changes.tokens === null">
          The tokens have no history before this commit: its fingerprint predates them.
        </template>
      </p>

      <article v-if="difference?.nature === 'token'" class="change">
        <h3>
          <code>{{ difference.name }}</code>
        </h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Theme</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="one of themes"
              :key="one.theme"
              :data-moved="one.before !== one.after || undefined"
            >
              <th scope="row">
                <code>{{ one.theme }}</code>
              </th>
              <td v-for="side of [one.before, one.after]" :key="String(side)">
                <template v-if="side !== undefined">
                  <span v-if="isColor(side)" class="swatch" :style="{ backgroundColor: side }" />
                  <code>{{ side }}</code>
                </template>
                <span v-else class="absent">none</span>
              </td>
            </tr>
          </tbody>
        </table>
        <h4>
          Read by {{ readers.length }} {{ readers.length === 1 ? 'component' : 'components' }}
        </h4>
        <ul v-if="readers.length > 0" class="readers">
          <li v-for="one of readers" :key="one.id">
            <a :href="hrefOfComponent(one.id)" @click="emit('component', one.id, $event)">{{
              one.name
            }}</a>
          </li>
        </ul>
      </article>

      <article v-else-if="difference?.nature === 'story'" class="change">
        <h3>
          <a
            v-if="difference.entry"
            :href="hrefOfStory(difference.entry.id)"
            @click="emit('story', difference.entry!.id, $event)"
            >{{ difference.entry.path.join(' / ') }} / {{ difference.entry.name }}</a
          >
          <a
            v-else-if="remaining"
            :href="hrefOfComponent(remaining)"
            @click="emit('component', remaining!, $event)"
            ><code>{{ difference.change.id }}</code></a
          >
          <code v-else>{{ difference.change.id }}</code>
        </h3>
        <p v-if="difference.kind === 'appeared'">A new story.</p>
        <p v-if="difference.kind === 'disappeared'">This story is gone.</p>
        <p v-if="difference.change.kind === 'changed' && difference.change.status">
          Status: {{ difference.change.status.before }} → {{ difference.change.status.after }}
        </p>
        <p v-if="props_ && props_.added.length > 0">
          Props added: <code v-for="one of props_.added" :key="one" class="added">{{ one }}</code>
        </p>
        <p v-if="props_ && props_.removed.length > 0">
          Props removed:
          <code v-for="one of props_.removed" :key="one" class="removed">{{ one }}</code>
        </p>
      </article>

      <p v-else-if="count > 0" class="note">Select a difference to see what moved.</p>
    </template>
  </section>
</template>

<style scoped>
.versions-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 70vh;
}

h2 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xl);
  letter-spacing: var(--tracking-tight);
}

.note {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

/* Le bloc `changement` de la maquette : padding 14/16, gap 16. */
.change {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3-5) var(--space-4);
  border-radius: var(--radius-lg);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-raised);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

.change h3,
.change h4,
.change p {
  margin: 0;
}

.change h3 {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  line-height: var(--leading-base);
}

.change h4 {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

a {
  color: var(--text-current);
  text-decoration: none;
}

a:hover {
  color: var(--text-current-hover);
}

code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

table {
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-1-5) var(--space-3) var(--space-1-5) 0;
  text-align: left;
  vertical-align: top;
}

thead th {
  padding-block: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
}

td {
  display: table-cell;
}

td > * + * {
  margin-left: var(--space-1-5);
}

tr[data-moved] th code {
  color: var(--text-current);
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-xs);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  vertical-align: middle;
}

.absent {
  color: var(--text-muted);
}

.readers {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

code + code {
  margin-left: var(--space-1-5);
}

.added {
  color: var(--success-text);
}

.removed {
  color: var(--error-text);
  text-decoration: line-through;
}
</style>
