<script setup lang="ts">
import type { Overrides, RenderedValues, StoryEntry } from '@crypte/core/protocol'
import { Alert, Button } from '@crypte/ui'
import { computed, onErrorCaptured, ref, watch, type Component } from 'vue'
import { keep, kept } from '../storage'
import PanelSection from './panel-section.vue'

// Le cadre d'un panneau de plugin, section 6.1 des contrats. Local au shell,
// son seul consommateur : les panneaux sont montés dedans, ils ne le dessinent
// pas.

type PanelMessage = { type: string; [key: string]: unknown }

const props = defineProps<{
  name: string
  panel: Component
  entry: StoryEntry | null
  // Le dernier message que la partie preview de ce plugin a envoyé.
  // `null` tant que sa partie preview n'a rien dit, comme `PanelProps` le promet.
  received: PanelMessage | null
  failed: string | null
  values: RenderedValues | null
  // Ce que ce panneau a édité, que le shell tient pour la story affichée.
  overrides: Overrides
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

// Ce qu'un panneau édite, des primitives seulement, section 5.1 : une fonction
// partait jusqu'à `postMessage`, qui levait sans nommer personne, et la preview
// restait vide au rechargement suivant. Mesuré. Refusée ici avec le plugin et
// la prop, et l'édition entière laissée de côté.
function edit(values: unknown) {
  const plain =
    typeof values === 'object' &&
    values !== null &&
    Object.getPrototypeOf(values) === Object.prototype

  if (!plain) {
    console.error(
      `crypte: ${props.name}: its panel edited the story with ${described(values)}, not an object of values, and the edit is dropped`,
    )
    return
  }

  for (const [key, value] of Object.entries(values)) {
    const primitive =
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))

    if (!primitive) {
      console.error(
        `crypte: ${props.name}: its panel edited \`${key}\` with ${described(value)}, and the edit is dropped`,
      )
      return
    }
  }

  emit('overrides', { ...(values as Overrides) })
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

  if (!plain) throw new Error(`\`${key}\` is ${described(raw)}`)

  return value
}

// Une valeur refusée, dite telle qu'un auteur la reconnaît : `a Map`, `a
// function`, `NaN`.
function described(raw: unknown): string {
  if (Array.isArray(raw)) return 'an array'
  if (typeof raw === 'object' && raw !== null) {
    const name = raw.constructor?.name ?? 'object'
    return `${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name}`
  }
  if (typeof raw === 'number' || raw === undefined || raw === null) return String(raw)
  return `a ${typeof raw}`
}

// Ouvert par défaut, retenu par le shell sous le nom du plugin, jamais par le
// plugin.
const KEY = `crypte:panel:${props.name}`
const open = ref(kept(KEY) !== false)

// Le dernier clic sur la story affichée, qui l'emporte sur tout le reste : un
// panneau replié s'ouvre quand même, sa raison gardée en tête, pour que ce qu'il
// offre reste joignable, la relance de `a11y` après un menu ouvert dans
// l'iframe sans rendu. Et le panneau qui change d'avis sur la même story ne
// rouvre ni ne referme ce que l'utilisateur a choisi. Oublié à la story
// suivante. Rouvert si un panneau replié ne doit plus pouvoir s'ouvrir, ce
// qu'aucun ne demande.
const choice = ref<boolean | null>(null)

function toggle() {
  const next = !expanded.value
  choice.value = next

  // Retenu sur un panneau qui a quelque chose à dire seulement : ouvrir un
  // panneau replié ne dit rien du suivant.
  if (inapplicable.value !== null) return

  open.value = next
  keep(KEY, next ? undefined : false)
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

// Ce que le clic bascule, sans l'erreur : sur un panneau qui a levé, chaque
// clic aurait « ouvert », et effacé ce que l'utilisateur avait fermé.
const expanded = computed(() => choice.value ?? (inapplicable.value === null && open.value))
</script>

<template>
  <!-- Sans objet, le panneau perd la bande de son en-tête : il se plie toujours, mais
       rien ne l'y invite. -->
  <PanelSection
    :title="name"
    :open="expanded"
    :data-plugin="name"
    :data-inapplicable="inapplicable !== null || undefined"
    @toggle="toggle"
  >
    <template v-if="inapplicable !== null" #note
      ><span class="inapplicable">{{ inapplicable }}</span></template
    >
    <!-- Tout panneau qui édite l'a, sans rien écrire : le shell tient ses valeurs. -->
    <template v-if="Object.keys(overrides).length > 0" #action>
      <Button variant="ghost" class="reset" @click="emit('overrides', {})">Reset all</Button>
    </template>
    <template v-if="failure !== null" #alert>
      <Alert color="error" class="panel-failed" role="alert">This panel threw: {{ failure }}</Alert>
    </template>
    <template v-else #default>
      <div class="content">
        <component
          :is="panel"
          :entry="entry"
          :received="received"
          :failed="failed"
          :values="values"
          :overrides="overrides"
          @inapplicable="declare"
          @overrides="edit"
          @send="send"
        />
      </div>
    </template>
  </PanelSection>
</template>

<style scoped>
/* 32 px without object, as its inapplicable state: no band, a subtle title. */
.panel[data-inapplicable] :deep(.head) {
  background: none;
}

.panel[data-inapplicable] :deep(.toggle) {
  min-height: 0;
  color: var(--text-subtle);
}

.content {
  padding: var(--space-3);
  font-size: var(--text-sm);
}

.panel-failed {
  margin: var(--space-2) var(--space-3);
}
</style>
