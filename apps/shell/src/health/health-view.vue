<script setup lang="ts">
import { CardTable, EmptyNote, SectionHeader, ViewCanvas } from '@crypte/ui'
import { plural } from '../plural'
import { texts } from '../i18n'
import { VisuallyHidden } from 'reka-ui'
import { computed } from 'vue'
import { useCopy } from '../clipboard'
import { dayOf, keyOf, PAGES, rowsOf, type HealthComponent, type HealthPage } from './health'

// Le canvas des pages de la santé que le dashboard ne remplace pas encore : le
// tableau de la page choisie, une ligne par composant. Choisir une ligne remplit
// le panneau de droite.
const props = defineProps<{
  components: HealthComponent[]
  page: HealthPage
  selected: string | null
  hrefOf: (key: string) => string
  // La vue versions depuis le dernier commit avant cette date.
  hrefOfChanges: (before: string) => string
}>()
const emit = defineEmits<{
  select: [key: string, event: MouseEvent]
  changes: [before: string, event: MouseEvent]
}>()

const t = texts({
  en: {
    region: 'Health, {title}',
    unstoried: 'sorted by props',
    statuses: 'deprecated first',
    coverage: 'least exercised first',
    nothing: 'Nothing to list here.',
    component: 'component',
    components: 'components',
    status: 'status',
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
    copied: 'copied',
    copy: 'copy the skeleton',
    noComponent: 'no component',
  },
  fr: {
    region: 'Santé, {title}',
    unstoried: 'par props',
    statuses: "obsolètes d'abord",
    coverage: "les moins exercés d'abord",
    nothing: 'Rien à lister ici.',
    component: 'composant',
    components: 'composants',
    status: 'statut',
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
    copied: 'copié',
    copy: 'copier le squelette',
    noComponent: 'aucun composant',
  },
})

const rows = computed(() => rowsOf(props.page, props.components))
const title = computed(() => PAGES.find((one) => one.page === props.page)!.label)

const noteOf = (page: HealthPage) =>
  page === 'unstoried' || page === 'statuses' || page === 'coverage' ? t(page) : ''

// Le squelette copié, dit sur sa ligne.
const { copied, copy } = useCopy()
</script>

<template>
  <ViewCanvas class="health-view" :aria-label="t('region', { title })">
    <SectionHeader :title="title" :count="rows.length" :note="noteOf(page)" />
    <EmptyNote v-if="rows.length === 0">{{ t('nothing') }}</EmptyNote>
    <CardTable v-else>
      <thead>
        <tr v-if="page === 'unstoried'">
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
          <template v-if="page === 'unstoried'">
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
