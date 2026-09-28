<script setup lang="ts">
import type { Overrides, StoryEntry } from '@crypte/core/protocol'
import { Callout } from '@crypte/ui'
import { computed, onErrorCaptured, ref, watch, type Component } from 'vue'

// Le cadre d'un panneau de plugin, section 6.1 des contrats. Local au shell,
// son seul consommateur : les panneaux sont montés dedans, ils ne le dessinent
// pas.

const props = defineProps<{
  name: string
  panel: Component
  entry: StoryEntry | null
}>()

// Les valeurs qu'un panneau a éditées, remontées telles quelles au shell, qui
// les envoie dans `render`.
const emit = defineEmits<{ overrides: [values: Overrides] }>()

// Ouvert par défaut, retenu par le shell sous le nom du plugin, jamais par le
// plugin. `localStorage` peut lever, en navigation privée par exemple : le
// cadre reste alors ouvert, sans rien retenir.
const KEY = `crypte:panel:${props.name}`

const read = () => {
  try {
    return localStorage.getItem(KEY) !== 'closed'
  } catch {
    return true
  }
}

const open = ref(read())

function toggle() {
  open.value = !open.value
  try {
    if (open.value) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'closed')
  } catch {
    // Rien à retenir : le cadre suit le clic, jusqu'au prochain chargement.
  }
}

// Sans objet, story par story, jamais déclaré une fois : le panneau le dit avec
// sa raison, et le cadre l'oublie à chaque nouvelle entrée : une autre story, ou
// la même relue après une édition, dont la raison peut être devenue fausse.
// Un panneau qui ne le redit pas est donc ouvert. Rouvert si un panneau doit
// se rouvrir sans nouvelle entrée, « relancer l'analyse » de `a11y` : un `null`
// alors.
const inapplicable = ref<string | null>(null)

// Une raison ou rien : un cadre replié sans raison est le panneau vide que la
// décision refuse.
const declare = (reason: unknown) => {
  if (typeof reason === 'string' && reason !== '') inapplicable.value = reason
}

// Ce qu'un panneau a levé, affiché à sa place : le reste du shell continue.
// Oublié avec l'entrée aussi, et le panneau remonté : il peut ne lever que sur
// certaines stories, ou avant une édition.
const failure = ref<string | null>(null)

watch(
  () => props.entry,
  () => {
    inapplicable.value = null
    failure.value = null
  },
)

onErrorCaptured((error) => {
  failure.value = error instanceof Error ? error.message : String(error)
  return false
})

const shown = computed(() => open.value && inapplicable.value === null && failure.value === null)
</script>

<template>
  <section class="panel" :data-plugin="name">
    <div class="head">
      <button
        type="button"
        :aria-expanded="shown"
        :disabled="inapplicable !== null"
        @click="toggle"
      >
        {{ name }}
      </button>
      <span v-if="inapplicable !== null" class="inapplicable">{{ inapplicable }}</span>
    </div>
    <Callout v-if="failure !== null" tone="danger" class="panel-failed" role="alert">
      Ce panneau a levé : {{ failure }}
    </Callout>
    <div v-else v-show="shown" class="body">
      <component
        :is="panel"
        :entry="entry"
        @inapplicable="declare"
        @overrides="(values: Overrides) => emit('overrides', values)"
      />
    </div>
  </section>
</template>

<style scoped>
.panel {
  border-top: 1px solid #e5e7eb;
  padding: 8px 0;
}

.head {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.head button {
  border: 0;
  background: none;
  padding: 0;
  font-weight: 600;
  cursor: pointer;
}

.head button:disabled {
  cursor: default;
  color: inherit;
}

.inapplicable {
  color: #6b7280;
  font-size: 13px;
}

.body {
  padding-top: 8px;
}

.panel-failed {
  --callout-font-size: 13px;
  margin-top: 8px;
}
</style>
