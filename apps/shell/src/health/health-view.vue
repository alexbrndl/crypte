<script setup lang="ts">
import { plural } from '../plural'
import type { StoryEntry } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { VisuallyHidden } from 'reka-ui'
import { computed, watch } from 'vue'
import { useCopy } from '../clipboard'
import CardTable from '../ui/card-table.vue'
import Badge from '../ui/badge.vue'
import EmptyNote from '../ui/empty-note.vue'
import Icon from '../ui/icon.vue'
import SectionHeader from '../ui/section-header.vue'
import ViewCanvas from '../ui/view-canvas.vue'
import { ago } from '../navigation/recent'
import type { Failure, Finding } from './audit'
import { promptOf } from './prompt'
import {
  dayOf,
  keyOf,
  PAGES,
  rowsOf,
  storyName,
  type HealthComponent,
  type HealthPage,
} from './health'

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

const nameOf = (id: string) => storyName(props.stories, id)

// Ce que compte le badge de Santé, une ligne chacun avec où le faire : une story
// qui ne rend pas peut appartenir à un composant hors du dossier, absent du
// tableau, et ne se lirait nulle part ailleurs ici.
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

// Le squelette copié, dit sur sa ligne ; le prompt de tout ce qui reste, sur
// la liste à faire.
const { copied, copy } = useCopy()
const prompt = computed(() =>
  promptOf(
    {
      failures: props.failures ?? [],
      findings: props.findings ?? [],
      unstoried: rowsOf('unstoried', props.components),
    },
    props.stories,
  ),
)
watch(prompt, () => (copied.value = null))
</script>

<template>
  <ViewCanvas class="health-view" :aria-label="`Health, ${title}`">
    <SectionHeader :title="title" :count="rows.length" :note="NOTES[page]" />
    <section v-if="todo.length > 0" class="todo" aria-label="Everything to do">
      <div class="band">
        <h3>
          to do <Badge tone="inverse">{{ todo.length }}</Badge>
        </h3>
        <Button variant="ghost" class="prompt" @click="copy(prompt, 'prompt')">{{
          copied === 'prompt' ? 'Prompt copied' : 'Copy the prompt for your agent'
        }}</Button>
      </div>
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
    <EmptyNote v-if="rows.length === 0">Nothing to list here.</EmptyNote>
    <CardTable v-else>
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
          <th scope="col"><VisuallyHidden>skeleton</VisuallyHidden></th>
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
                    : `${plural(a11yOf(one) ?? 0, 'violation')}`
              }}
            </td>
            <td class="code">{{ one.status ?? '' }}</td>
            <td class="code">{{ one.changed ? ago(Date.parse(one.changed)) : '' }}</td>
          </template>
          <template v-else-if="page === 'unstoried'">
            <td class="code">{{ one.file }}</td>
            <td class="code">{{ one.props }}</td>
            <td class="action">
              <button
                v-if="one.skeleton"
                type="button"
                class="link"
                @click.stop="copy(one.skeleton.source, keyOf(one))"
              >
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
                  : `${plural(one.stories.length, 'story', 'stories')}`
              }}
            </td>
          </template>
        </tr>
      </tbody>
    </CardTable>
  </ViewCanvas>
</template>

<style scoped>
/* La liste à faire : la même carte que la table, une action par ligne. */
.todo {
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-md);
  background: var(--background-raised);
}

.band {
  display: flex;
  align-items: center;
  padding: var(--space-1-5) var(--space-3);
  background: var(--background-subtle);
}

.band h3 {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

/* The sm button of the Figma header, 24 px high, at the right of the band. */
.prompt {
  --button-height: 24px;
  --button-padding: var(--space-0-5) var(--space-2);
  margin-left: auto;
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

.action {
  white-space: nowrap;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-current);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  cursor: pointer;
}
</style>
