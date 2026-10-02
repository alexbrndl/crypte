<script setup lang="ts">
import type { Overrides, StoryEntry } from '@crypte/core/protocol'
import { Callout } from '@crypte/ui'
import { computed, onErrorCaptured, ref, watch, type Component } from 'vue'

// Le cadre d'un panneau de plugin, section 6.1 des contrats. Local au shell,
// son seul consommateur : les panneaux sont montés dedans, ils ne le dessinent
// pas.

type PanelMessage = { type: string; [key: string]: unknown }

const props = defineProps<{
  name: string
  panel: Component
  entry: StoryEntry | null
  // Le dernier message que la partie preview de ce plugin a envoyé.
  received?: PanelMessage
}>()

// Ce qu'un panneau a édité, que le shell envoie dans `render`, et ce qu'il
// envoie à sa partie preview.
const emit = defineEmits<{ overrides: [values: Overrides]; send: [message: PanelMessage] }>()

// Ce qu'un panneau envoie à sa partie preview, sous son propre nom, section 5.4.
// Un autre préfixe atteindrait un autre plugin, ou personne : refusé, et dit.
function send(message: unknown) {
  const type: unknown = (message as { type?: unknown } | null)?.type
  if (typeof type !== 'string' || !type.startsWith(`${props.name}:`)) {
    console.error(
      `crypte: ${props.name}: its panel sent \`${String(type)}\`, whose type does not start with \`${props.name}:\``,
    )
    return
  }

  // Par un aller-retour JSON, la forme que la section 5.4 promet : un panneau Vue
  // envoie volontiers son état, dont les proxys font lever `postMessage` sans
  // nommer personne. Mesuré. `faithful` refuse ce que JSON perdrait sans lever,
  // une fonction ou une `Map` : retiré en silence, le champ manquerait à
  // l'arrivée sans que rien le dise.
  let copy: PanelMessage
  try {
    copy = JSON.parse(JSON.stringify(message, faithful)) as PanelMessage
  } catch (error) {
    console.error(
      `crypte: ${props.name}: its panel sent \`${type}\`, which does not survive JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
    return
  }
  emit('send', copy)
}

// Ce que JSON rend tel quel : `null`, un booléen, un nombre fini, une chaîne,
// un tableau ou un objet simple. Lu sur la valeur d'origine, `this[key]`, avant
// qu'un `toJSON` ne change une `Date` en chaîne.
function faithful(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this[key]
  const plain =
    raw === null ||
    typeof raw === 'string' ||
    typeof raw === 'boolean' ||
    (typeof raw === 'number' && Number.isFinite(raw)) ||
    Array.isArray(raw) ||
    (typeof raw === 'object' && Object.getPrototypeOf(raw) === Object.prototype)

  if (!plain) {
    const what =
      typeof raw === 'object'
        ? `a ${(raw as object).constructor?.name ?? 'object'}`
        : typeof raw === 'number' || raw === undefined
          ? String(raw)
          : `a ${typeof raw}`
    throw new Error(`\`${key}\` is ${what}`)
  }

  return value
}

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

// Le dernier clic sur la story affichée, qui l'emporte sur tout le reste : un
// panneau replié s'ouvre quand même, sa raison gardée en tête, pour que ce qu'il
// offre reste joignable, la relance de `a11y` après un menu ouvert dans
// l'iframe sans rendu. Et le panneau qui change d'avis sur la même story ne
// rouvre ni ne referme ce que l'utilisateur a choisi. Oublié à la story
// suivante. Rouvert si un panneau replié ne doit plus pouvoir s'ouvrir, ce
// qu'aucun ne demande.
const choice = ref<boolean | null>(null)

function toggle() {
  const next = !shown.value
  choice.value = next

  // Retenu sur un panneau qui a quelque chose à dire seulement : ouvrir un
  // panneau replié ne dit rien du suivant.
  if (inapplicable.value !== null) return

  open.value = next
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
// Un panneau qui ne le redit pas est donc ouvert.
const inapplicable = ref<string | null>(null)

// Une raison replie, `null` rouvre sans attendre la story suivante : l'analyse
// de `a11y` peut trouver une violation sur la story où elle n'en trouvait pas.
// Toute autre valeur est ignorée : un cadre replié sans raison est le panneau
// vide que la décision refuse.
const declare = (reason: unknown) => {
  if (reason === null) inapplicable.value = null
  else if (typeof reason === 'string' && reason !== '') inapplicable.value = reason
}

// Ce qu'un panneau a levé, affiché à sa place : le reste du shell continue.
// Oublié avec l'entrée aussi, et le panneau remonté : il peut ne lever que sur
// certaines stories, ou avant une édition.
const failure = ref<string | null>(null)

watch(
  () => props.entry,
  () => {
    inapplicable.value = null
    choice.value = null
    failure.value = null
  },
)

onErrorCaptured((error) => {
  failure.value = error instanceof Error ? error.message : String(error)
  return false
})

const shown = computed(
  () => failure.value === null && (choice.value ?? (inapplicable.value === null && open.value)),
)
</script>

<template>
  <section class="panel" :data-plugin="name">
    <div class="head">
      <button type="button" :aria-expanded="shown" @click="toggle">
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
        :received="received"
        @inapplicable="declare"
        @overrides="(values: Overrides) => emit('overrides', values)"
        @send="send"
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
