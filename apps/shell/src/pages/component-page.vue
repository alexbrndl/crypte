<script setup lang="ts">
import MarkdownBody from './markdown-body.vue'
import NoneValue from '../ui/none-value.vue'
import PlainTable from '../ui/plain-table.vue'
import type { PageEntry, StoryEntry } from '@crypte/core/protocol'
import { computed } from 'vue'
import { placeSearch, sameTab } from '../navigation/url'

// La page d'un composant : ce que son fichier de stories déclare une fois pour
// toutes ses stories, sa page markdown s'il en a une, et la liste de ses stories.
// Aucune zone de plugin : le contrat figé ne donne à un panneau que la story
// affichée (§6.1).
const props = defineProps<{ stories: StoryEntry[]; page?: PageEntry }>()
const emit = defineEmits<{ show: [id: string] }>()

// `meta` se déclare par fichier de stories : la première story parle pour toutes.
const first = computed(() => props.stories[0])
const meta = computed(() => first.value?.meta ?? {})

// Un lien seulement en http ou https : `javascript:` s'exécuterait au clic, et
// `meta` vient d'un dépôt qu'un build statique publie. Le reste s'affiche en texte.
const figma = computed(() =>
  /^https?:\/\//i.test(meta.value.figma ?? '') ? meta.value.figma : null,
)

// Un lien, pour qu'un clic du milieu ouvre la story dans un autre onglet.
function follow(event: MouseEvent, id: string) {
  if (!sameTab(event)) return
  event.preventDefault()
  emit('show', id)
}
</script>

<template>
  <section v-if="first" class="component-page" :aria-label="first.path.at(-1)">
    <h2>{{ first.path.at(-1) }}</h2>
    <p v-if="meta.description" class="description">{{ meta.description }}</p>

    <dl>
      <template v-if="meta.status">
        <dt>Status</dt>
        <dd>{{ meta.status }}</dd>
      </template>
      <template v-if="meta.owner">
        <dt>Owner</dt>
        <dd>{{ meta.owner }}</dd>
      </template>
      <template v-if="meta.figma">
        <dt>Figma</dt>
        <dd>
          <a v-if="figma" :href="figma" target="_blank" rel="noreferrer">{{ figma }}</a>
          <code v-else>{{ meta.figma }}</code>
        </dd>
      </template>
      <dt>Component</dt>
      <dd>
        <code>{{ first.component.file }}</code>
      </dd>
      <dt>Stories</dt>
      <dd>
        <code>{{ first.storyFile }}</code>
      </dd>
      <template v-if="page">
        <dt>Page</dt>
        <dd>
          <code>{{ page.file }}</code>
        </dd>
      </template>
    </dl>

    <template v-if="page">
      <!-- Pas un titre : le corps descend ses `##` en `h3`, qui seraient ses sœurs. -->
      <p v-if="page.name !== first.path.at(-1)" class="page-title">{{ page.name }}</p>
      <MarkdownBody class="page" :body="page.body" />
    </template>

    <PlainTable>
      <thead>
        <tr>
          <th scope="col">Story</th>
          <th scope="col">Props it sets</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="story of stories" :key="story.id">
          <td>
            <a
              :href="placeSearch({ mode: 'entry', id: story.id })"
              @click="follow($event, story.id)"
            >
              {{ story.name }}
            </a>
          </td>
          <td>
            <code v-for="prop of story.props" :key="prop" class="prop">{{ prop }}</code>
            <NoneValue v-if="story.props.length === 0" />
          </td>
        </tr>
      </tbody>
    </PlainTable>
  </section>
</template>

<style scoped>
.component-page {
  min-height: 70vh;
}

h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-3xl);
  letter-spacing: var(--tracking-tight);
}

a {
  color: var(--text-current);
  text-decoration: none;
}

a:hover {
  color: var(--text-current-hover);
}

code {
  font-size: var(--text-xs);
}

.description {
  margin: 0 0 var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: var(--leading-base);
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-4);
  margin: 0 0 var(--space-6);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

dt {
  color: var(--text-muted);
}

dd {
  margin: 0;
}

.page-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-xl);
}

.page {
  margin-bottom: var(--space-6);
}

.prop {
  color: var(--text-muted);
}

.prop + .prop {
  margin-left: var(--space-1-5);
}
</style>
