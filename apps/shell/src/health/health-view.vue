<script setup lang="ts">
import { CardTable, Badge, EmptyNote, SectionHeader, ViewCanvas } from '@crypte/ui'
import { plural } from '../plural'
import { texts } from '../i18n'
import type { StoryEntry } from '@crypte/core/protocol'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { VisuallyHidden } from 'reka-ui'
import { computed } from 'vue'
import { useCopy } from '../clipboard'
import Icon from '../ui/icon.vue'
import { ago } from '../navigation/recent'
import type { Failure, Finding } from './audit'
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
  // La vue versions depuis le dernier commit avant cette date.
  hrefOfChanges: (before: string) => string
}>()
const emit = defineEmits<{
  select: [key: string, event: MouseEvent]
  health: [page: HealthPage, key: string, event: MouseEvent]
  changes: [before: string, event: MouseEvent]
}>()

const t = texts({
  en: {
    region: 'Health, {title}',
    fixRender: 'Fix the render of {name}',
    fix: 'Fix {rule} in {name}',
    write: 'Write the story of {name}',
    overview: 'sorted by problems',
    unstoried: 'sorted by props',
    statuses: 'deprecated first',
    coverage: 'least exercised first',
    everything: 'Everything to do',
    toDo: 'to do',
    nothing: 'Nothing to list here.',
    component: 'component',
    components: 'components',
    stories: 'stories',
    a11y: 'a11y',
    status: 'status',
    changed: 'changed',
    sourceFile: 'source file',
    props: 'props',
    skeleton: 'skeleton',
    since: 'since',
    usedBy: 'used by',
    unexercised: 'never exercised',
    usedIn: 'used in',
    file: 'file',
    files: 'files',
    nowhere: 'nowhere',
    notTested: 'not tested',
    violation: 'violation',
    violations: 'violations',
    copied: 'copied',
    copy: 'copy the skeleton',
    noComponent: 'no component',
  },
  fr: {
    region: 'Santé, {title}',
    fixRender: 'Réparer le rendu de {name}',
    fix: 'Corriger {rule} dans {name}',
    write: 'Écrire la story de {name}',
    overview: 'par problèmes',
    unstoried: 'par props',
    statuses: "obsolètes d'abord",
    coverage: "les moins exercés d'abord",
    everything: 'Tout ce qui est à faire',
    toDo: 'à faire',
    nothing: 'Rien à lister ici.',
    component: 'composant',
    components: 'composants',
    stories: 'stories',
    a11y: 'a11y',
    status: 'statut',
    changed: 'modifié',
    sourceFile: 'fichier source',
    props: 'props',
    skeleton: 'squelette',
    since: 'depuis',
    usedBy: 'utilisé par',
    unexercised: 'jamais exercées',
    usedIn: 'utilisé dans',
    file: 'fichier',
    files: 'fichiers',
    nowhere: 'nulle part',
    notTested: 'non testé',
    violation: 'violation',
    violations: 'violations',
    copied: 'copié',
    copy: 'copier le squelette',
    noComponent: 'aucun composant',
  },
})

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
          label: t('fixRender', { name: nameOf(one.id) }),
        })),
        ...(props.findings ?? []).map((one) => ({
          page: 'accessibility' as const,
          key: one.key,
          label: t('fix', { rule: one.violation.rule, name: nameOf(one.id) }),
        })),
        ...rowsOf('unstoried', props.components).map((one) => ({
          page: 'unstoried' as const,
          key: keyOf(one),
          label: t('write', { name: one.name }),
        })),
      ],
)

const noteOf = (page: HealthPage) =>
  page === 'overview' || page === 'unstoried' || page === 'statuses' || page === 'coverage'
    ? t(page)
    : ''

// Le squelette copié, dit sur sa ligne.
const { copied, copy } = useCopy()
</script>

<template>
  <ViewCanvas class="health-view" :aria-label="t('region', { title })">
    <SectionHeader :title="title" :count="rows.length" :note="noteOf(page)" />
    <section v-if="todo.length > 0" class="todo" :aria-label="t('everything')">
      <h3>
        {{ t('toDo') }} <Badge tone="inverse">{{ todo.length }}</Badge>
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
    <EmptyNote v-if="rows.length === 0">{{ t('nothing') }}</EmptyNote>
    <CardTable v-else>
      <thead>
        <tr v-if="page === 'overview'">
          <th scope="col" class="grow">{{ t('component') }}</th>
          <th scope="col">{{ t('stories') }}</th>
          <th scope="col">{{ t('a11y') }}</th>
          <th scope="col">{{ t('status') }}</th>
          <th scope="col">{{ t('changed') }}</th>
        </tr>
        <tr v-else-if="page === 'unstoried'">
          <th scope="col" class="grow">{{ t('component') }}</th>
          <th scope="col">{{ t('sourceFile') }}</th>
          <th scope="col">{{ t('props') }}</th>
          <th scope="col">
            <VisuallyHidden>{{ t('skeleton') }}</VisuallyHidden>
          </th>
        </tr>
        <tr v-else-if="page === 'coverage'">
          <th scope="col" class="grow">{{ t('component') }}</th>
          <th scope="col">{{ t('unexercised') }}</th>
          <th scope="col">{{ t('usedIn') }}</th>
        </tr>
        <tr v-else>
          <th scope="col" class="grow">{{ t('component') }}</th>
          <th scope="col">{{ t('status') }}</th>
          <th scope="col">{{ t('since') }}</th>
          <th scope="col">{{ t('usedBy') }}</th>
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
                  ? t('notTested')
                  : a11yOf(one) === 0
                    ? '0'
                    : `${plural(a11yOf(one) ?? 0, t('violation'), t('violations'))}`
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
                {{ copied === keyOf(one) ? t('copied') : t('copy') }}
              </button>
            </td>
          </template>
          <template v-else-if="page === 'coverage'">
            <td class="code">{{ one.unexercised?.join(', ') ?? '' }}</td>
            <td class="code" :data-ink="one.usedIn ? undefined : 'error'">
              {{ one.usedIn ? plural(one.usedIn.length, t('file'), t('files')) : t('nowhere') }}
            </td>
          </template>
          <template v-else>
            <td class="code">{{ one.status }}</td>
            <!-- Ce qui a changé depuis, le statut compris. -->
            <td class="code">
              <a
                v-if="one.statusSince"
                class="since"
                :href="hrefOfChanges(one.statusSince)"
                @click.stop="emit('changes', one.statusSince, $event)"
                >{{ dayOf(one.statusSince) }}</a
              >
            </td>
            <td
              class="code"
              :data-ink="
                one.status === 'deprecated' && (one.usedBy?.length ?? 0) > 0 ? 'error' : undefined
              "
            >
              {{
                one.usedBy
                  ? plural(one.usedBy.length, t('component'), t('components'))
                  : t('noComponent')
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

.action {
  white-space: nowrap;
}

.since {
  color: var(--text-current);
  text-decoration: none;
}

.since:hover {
  color: var(--text-current-hover);
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
