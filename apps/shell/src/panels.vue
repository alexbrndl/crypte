<script setup lang="ts">
import type { Overrides, StoryEntry } from '@crypte/core/protocol'
import { Callout } from '@crypte/ui'
import { onMounted, shallowRef, watch, type Component } from 'vue'
import PanelFrame from './panel-frame.vue'

// Ce que les plugins apportent au shell, section 6.1 des contrats : chaque module
// est importé tel que le CLI le sert, et son export par défaut est monté dans
// un cadre, dans l'ordre de `plugins`. Le nom d'un plugin est unique : le CLI
// refuse les surfaces d'un second plugin du même nom.

type PanelMessage = { type: string; [key: string]: unknown }

const props = defineProps<{
  entry: StoryEntry | null
  // Le dernier message de la partie preview de chaque plugin, sous son nom.
  received: Record<string, PanelMessage>
  // Ce que la preview a dit d'un plugin qui a échoué chez elle.
  errors: { plugin: string; message: string }[]
  // Pourquoi la story affichée n'a pas pu être rendue, ou `null`.
  failed: string | null
  // Change à chaque `ready` de la preview : la liste est alors relue, puisqu'une
  // édition de la configuration relance le serveur et recharge la preview. Lue
  // au montage seulement, un plugin retiré gardait son panneau. Mesuré.
  revision: number
}>()

const emit = defineEmits<{ overrides: [values: Overrides]; send: [message: PanelMessage] }>()

const PLUGINS = '/@crypte/plugins.json'

const panels = shallowRef<{ name: string; panel: Component }[]>([])
const failures = shallowRef<{ name: string; message: string }[]>([])
// Ce que le CLI a écarté d'un plugin, avec sa raison : une surface qui ne mène
// nulle part, une clé inconnue, une contribution refusée.
const refused = shallowRef<{ plugin: string; reason: string }[]>([])

const said = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Ce que chaque panneau a édité, sous le nom de son plugin : le rendu les fusionne
// dans l'ordre de `plugins`, le dernier gagnant sur une prop éditée par deux.
// Remplacer à chaque émission effaçait l'édition de l'autre panneau. Mesuré.
// Oublié avec la story, comme le shell oublie les valeurs.
const edited = new Map<string, Overrides>()

function edit(name: string, values: Overrides) {
  edited.set(name, values)
  emit('overrides', Object.assign({}, ...panels.value.map((one) => edited.get(one.name) ?? {})))
}

watch(
  () => props.entry?.id,
  () => edited.clear(),
)

// La dernière lecture lancée : une plus ancienne qui finirait après elle
// rendrait une liste périmée.
let reading = 0

async function load() {
  const run = (reading += 1)

  let listed: {
    panels: { name: string; shell: string }[]
    refused: { plugin: string; reason: string }[]
  }
  try {
    listed = (await fetch(PLUGINS).then((answer) => answer.json())) as typeof listed
  } catch (error) {
    if (run === reading) failures.value = [{ name: 'la liste des plugins', message: said(error) }]
    return
  }

  // Chacun pour soi : un module qui ne charge pas ne coûte pas les autres, et son
  // nom s'affiche plutôt que son panneau manque sans rien dire.
  const loaded = await Promise.allSettled(
    listed.panels.map(
      (one) => import(/* @vite-ignore */ one.shell) as Promise<{ default?: unknown }>,
    ),
  )

  if (run !== reading) return

  // Un module déjà importé revient tel quel, même composant : son panneau garde
  // son état. Seul un panneau qui a changé est monté de nouveau.
  const found: typeof panels.value = []
  const failed: typeof failures.value = []

  loaded.forEach((result, at) => {
    const name = listed.panels[at]!.name
    const panel = result.status === 'fulfilled' ? result.value.default : undefined

    // Un objet ou une fonction, ce que Vue monte. Autre chose, `42` par exemple,
    // ne rendait rien et ne disait rien. Mesuré.
    if (result.status === 'rejected') failed.push({ name, message: said(result.reason) })
    else if ((typeof panel !== 'object' || panel === null) && typeof panel !== 'function')
      failed.push({ name, message: "le module n'exporte pas de composant par défaut" })
    else found.push({ name, panel: panel as Component })
  })

  refused.value = listed.refused
  panels.value = found
  failures.value = failed
}

onMounted(load)
watch(() => props.revision, load)
</script>

<template>
  <Callout
    v-if="failures.length > 0 || refused.length > 0 || errors.length > 0"
    tone="danger"
    class="failed"
    role="alert"
  >
    <p v-for="one of failures" :key="one.name">
      <code>{{ one.name }}</code> n'a pas pu se charger : {{ one.message }}
    </p>
    <p v-for="(one, at) of refused" :key="`refused-${at}`">
      Refusé chez <code>{{ one.plugin }}</code> : {{ one.reason }}
    </p>
    <p v-for="(one, at) of errors" :key="`preview-${at}`">
      <code>{{ one.plugin }}</code> dans la preview : {{ one.message }}
    </p>
  </Callout>
  <PanelFrame
    v-for="one of panels"
    :key="one.name"
    :name="one.name"
    :panel="one.panel"
    :entry="entry"
    :received="Object.hasOwn(received, one.name) ? (received[one.name] ?? null) : null"
    :failed="failed"
    @overrides="(values: Overrides) => edit(one.name, values)"
    @send="(message: PanelMessage) => emit('send', message)"
  />
</template>

<style scoped>
.failed {
  --callout-font-size: 13px;
  margin-top: 12px;
}

.failed p {
  margin: 0;
}
</style>
