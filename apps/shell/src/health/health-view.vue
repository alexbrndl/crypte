<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { computed, ref } from 'vue'
import Icon from '../ui/icon.vue'
import { ago } from '../navigation/recent'
import type { Failure, Finding } from './audit'
import { dayOf, keyOf, PAGES, rowsOf, type HealthComponent, type HealthPage } from './health'

// Le canvas de la vue santé : le tableau de la page choisie, une ligne par
// composant. Choisir une ligne remplit le panneau de droite.
const props = defineProps<{
  components: HealthComponent[]
  page: HealthPage
  selected: string | null
  // Les violations de l'audit passé, ou `null` avant : la colonne a11y dit alors
  // que rien n'est testé.
  findings: Finding[] | null
  failures: Failure[] | null
  stories: StoryEntry[]
  hrefOf: (key: string) => string
  hrefOfHealth: (page: HealthPage, key: string) => string
}>()
const emit = defineEmits<{
  select: [key: string, event: MouseEvent]
  health: [page: HealthPage, key: string, event: MouseEvent]
}>()

const rows = computed(() => rowsOf(props.page, props.components))
const title = computed(() => PAGES.find((one) => one.page === props.page)!.label)

// Les violations des stories d'un composant, ou rien à dire sans audit ni story.
const a11yOf = (one: HealthComponent) => {
  if (props.findings === null || one.stories.length === 0) return null
  return props.findings.filter((found) => one.stories.includes(found.id)).length
}

// Ce que compte le badge de Santé, une ligne chacun avec où le faire : une story
// qui ne rend pas peut appartenir à un composant hors du dossier, absent du
// tableau, et ne se lirait nulle part ailleurs ici.
const nameOf = (id: string) => {
  const story = props.stories.find((one) => one.id === id)
  return story ? `${story.path.at(-1)} / ${story.name}` : id
}
const todo = computed(() =>
  props.page !== 'overview'
    ? []
    : [
        ...(props.failures ?? []).map((one) => ({
          page: 'failures' as const,
          key: one.key,
          label: `Fix the render of ${nameOf(one.id)}`,
        })),
        ...(props.findings ?? []).map((one) => ({
          page: 'accessibility' as const,
          key: one.key,
          label: `Fix ${one.violation.rule} in ${nameOf(one.id)}`,
        })),
        ...rowsOf('unstoried', props.components).map((one) => ({
          page: 'unstoried' as const,
          key: keyOf(one),
          label: `Write the story of ${one.name}`,
        })),
      ],
)

const NOTES: Record<HealthPage, string> = {
  overview: 'sorted by problems',
  unstoried: 'sorted by props',
  failures: '',
  accessibility: '',
  statuses: 'deprecated first',
}

// Le squelette copié, dit sur sa ligne le temps de le lire.
const copied = ref<string | null>(null)
async function copy(one: HealthComponent) {
  if (!one.skeleton) return
  try {
    await navigator.clipboard.writeText(one.skeleton.source)
    copied.value = keyOf(one)
  } catch {
    copied.value = null
  }
}
</script>

<template>
  <section class="health-view" :aria-label="`Health, ${title}`">
    <header class="section">
      <h2>{{ title }}</h2>
      <span class="badge">{{ rows.length }}</span>
      <span class="note">{{ NOTES[page] }}</span>
    </header>
    <section v-if="todo.length > 0" class="todo" aria-label="Everything to do">
      <h3>
        to do <span class="badge">{{ todo.length }}</span>
      </h3>
      <ul>
        <li v-for="one of todo" :key="`${one.page}:${one.key}`">
          <a
            :href="hrefOfHealth(one.page, one.key)"
            @click="emit('health', one.page, one.key, $event)"
          >
            <Icon :icon="Alert02Icon" />
            {{ one.label }}
          </a>
        </li>
      </ul>
    </section>
    <p v-if="rows.length === 0" class="empty">Nothing to list here.</p>
    <table v-else>
      <thead>
        <tr v-if="page === 'overview'">
          <th scope="col" class="grow">component</th>
          <th scope="col">stories</th>
          <th scope="col">a11y</th>
          <th scope="col">status</th>
          <th scope="col">changed</th>
        </tr>
        <tr v-else-if="page === 'unstoried'">
          <th scope="col" class="grow">component</th>
          <th scope="col">source file</th>
          <th scope="col">props</th>
          <th scope="col"><span class="hidden">skeleton</span></th>
        </tr>
        <tr v-else>
          <th scope="col" class="grow">component</th>
          <th scope="col">status</th>
          <th scope="col">since</th>
          <th scope="col">used in</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="one of rows"
          :key="keyOf(one)"
          :data-selected="keyOf(one) === selected || undefined"
          @click="emit('select', keyOf(one), $event)"
        >
          <th scope="row" class="grow">
            <a
              :href="hrefOf(keyOf(one))"
              :aria-current="keyOf(one) === selected ? 'true' : undefined"
              @click.stop="emit('select', keyOf(one), $event)"
              >{{ one.name }}</a
            >
          </th>
          <template v-if="page === 'overview'">
            <td class="code" :data-ink="one.stories.length === 0 ? 'error' : undefined">
              {{ one.stories.length }}
            </td>
            <td class="code" :data-ink="(a11yOf(one) ?? 0) > 0 ? 'error' : undefined">
              {{
                a11yOf(one) === null
                  ? 'not tested'
                  : a11yOf(one) === 0
                    ? '0'
                    : `${a11yOf(one)} ${a11yOf(one) === 1 ? 'violation' : 'violations'}`
              }}
            </td>
            <td class="code">{{ one.status ?? '' }}</td>
            <td class="code">{{ one.changed ? ago(Date.parse(one.changed)) : '' }}</td>
          </template>
          <template v-else-if="page === 'unstoried'">
            <td class="code">{{ one.file }}</td>
            <td class="code">{{ one.props }}</td>
            <td>
              <button type="button" class="link" @click.stop="copy(one)">
                {{ copied === keyOf(one) ? 'copied' : 'copy the skeleton' }}
              </button>
            </td>
          </template>
          <template v-else>
            <td class="code">{{ one.status }}</td>
            <td class="code">{{ one.statusSince ? dayOf(one.statusSince) : '' }}</td>
            <td
              class="code"
              :data-ink="
                one.status === 'deprecated' && one.stories.length > 0 ? 'error' : undefined
              "
            >
              {{
                one.stories.length === 0
                  ? 'no story'
                  : `${one.stories.length} ${one.stories.length === 1 ? 'story' : 'stories'}`
              }}
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
/* Le canvas de la maquette : padding 20/24, gap 16, sur le fond subtil. */
.health-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  background: var(--background-subtle);
}

/* Le section-header : intitulé, le compte en badge, une note à droite. */
.section {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding-bottom: var(--space-1);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* Muted, not the subtle of the Figma file, here and in the table head: subtle
   falls under 4.5:1 on the subtle background. */
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

/* La liste à faire : la même carte que la table, une action par ligne. */
.todo {
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-md);
  background: var(--background-raised);
}

.todo h3 {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  padding: var(--space-1-5) var(--space-3);
  background: var(--background-subtle);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.todo ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.todo a {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-light);
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-decoration: none;
}

.todo a:hover {
  background: var(--background-hover);
}

.todo .icon {
  color: var(--error-text);
}

.empty {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* La table de la maquette : un cadre arrondi, l'en-tête sur le fond subtil, des
   lignes de 38 px séparées d'un filet clair. */
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
  white-space: nowrap;
}

thead th {
  padding-block: var(--space-1-5);
  background: var(--background-subtle);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xs);
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

.grow {
  width: 100%;
}

tbody th {
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
  line-height: var(--leading-sm);
}

tbody th a {
  color: var(--text-primary);
  text-decoration: none;
}

tbody th a:focus-visible {
  border-radius: var(--radius-xs);
  outline: var(--stroke-focus) solid var(--accent-focus);
}

.code,
.link {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

[data-ink='error'] {
  color: var(--error-text);
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-current);
  cursor: pointer;
}

.hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
