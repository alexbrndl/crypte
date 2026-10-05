<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { computed } from 'vue'
import { placeSearch, sameTab } from './url'

// La page d'un composant : ce que son fichier de stories déclare une fois pour
// toutes ses stories, et la liste de celles-ci. Aucune zone de plugin : le
// contrat figé ne donne à un panneau que la story affichée (§6.1).
const props = defineProps<{ stories: StoryEntry[] }>()
const emit = defineEmits<{ show: [id: string] }>()

// `meta` se déclare par fichier de stories : la première story parle pour toutes.
const first = computed(() => props.stories[0])
const meta = computed(() => first.value?.meta ?? {})

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
          <a :href="meta.figma" target="_blank" rel="noreferrer">{{ meta.figma }}</a>
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
    </dl>

    <table>
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
            <span v-if="story.props.length === 0" class="none">none</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.component-page {
  min-height: 70vh;
}

h2 {
  margin: 0 0 8px;
}

.description {
  margin: 0 0 12px;
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0 0 16px;
  font-size: 13px;
}

dt {
  color: #6b7280;
}

dd {
  margin: 0;
}

table {
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  text-align: left;
  padding: 6px 16px 6px 0;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: baseline;
}

.prop + .prop {
  margin-left: 6px;
}

.none {
  color: #6b7280;
}
</style>
