<script setup lang="ts">
import type { Overrides, PluginView, RenderedValues, StoryEntry } from '@crypte/core/protocol'
import { Alert } from '@crypte/ui'
import { onMounted, shallowRef, watch, type Component } from 'vue'
import PanelFrame from './panel-frame.vue'
import { texts } from '../i18n'

// Ce que les plugins apportent au shell, section 6.1 des contrats : chaque module
// est importé tel que le CLI le sert, et son export par défaut est monté dans
// un cadre, dans l'ordre de `plugins`. Le nom d'un plugin est unique : le CLI
// refuse les surfaces d'un second plugin du même nom.

type PanelMessage = { type: string; [key: string]: unknown }

const t = texts({
  en: {
    list: 'the list of plugins',
    notLoaded: 'could not load:',
    refused: 'Refused in',
    colon: ':',
    preview: 'in the preview:',
  },
  fr: {
    list: 'la liste des plugins',
    notLoaded: "n'a pas pu charger :",
    refused: 'Refusé dans',
    colon: ' :',
    preview: "dans l'aperçu :",
  },
})

// La vue d'un plugin, section 6.1 : son libellé et son icône, que le CLI a
// vérifiés, et les composants que son module exporte en `view`.
export interface LoadedView extends PluginView {
  name: string
  canvas: Component
  sidebar?: Component
  panel?: Component
}

const props = defineProps<{
  entry: StoryEntry | null
  // Le dernier message de la partie preview de chaque plugin, sous son nom.
  received: Record<string, PanelMessage>
  // Ce que la preview a dit d'un plugin qui a échoué chez elle.
  errors: { plugin: string; message: string }[]
  // Pourquoi la story affichée n'a pas pu être rendue, ou `null`.
  failed: string | null
  // Ce que la story affichée a rendu, ou `null` avant son rendu.
  values: RenderedValues | null
  // Change à chaque `ready` de la preview : la liste est alors relue, puisqu'une
  // édition de la configuration relance le serveur et recharge la preview. Lue
  // au montage seulement, un plugin retiré gardait son panneau. Mesuré.
  revision: number
}>()

const emit = defineEmits<{
  overrides: [values: Overrides]
  send: [message: PanelMessage]
  // Ce que chaque plugin coûte au navigateur, mesuré par le CLI, pour la barre d'état.
  weights: [weights: { plugin: string; bytes: number }[]]
  // Le nombre de plugins en échec ou refusés, que le bouton des panneaux marque
  // quand la colonne est fermée.
  troubles: [troubles: number]
  // Les vues des plugins, dans l'ordre de `plugins`, pour l'activity bar.
  views: [views: LoadedView[]]
}>()

const PLUGINS = '@crypte/plugins.json'

const panels = shallowRef<{ name: string; panel: Component }[]>([])
const failures = shallowRef<{ name: string; message: string }[]>([])
// Ce que le CLI a écarté d'un plugin, avec sa raison : une surface qui ne mène
// nulle part, une clé inconnue, une contribution refusée. Un nom vide est la
// liste elle-même, nommée au rendu dans la langue du moment.
const refused = shallowRef<{ plugin: string; reason: string }[]>([])

const isComponent = (value: unknown) =>
  (typeof value === 'object' && value !== null) || typeof value === 'function'

const said = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Ce que chaque panneau a édité, sous le nom de son plugin : le rendu les fusionne
// dans l'ordre de `plugins`, le dernier gagnant sur une prop éditée par deux.
// Remplacer à chaque émission effaçait l'édition de l'autre panneau. Mesuré.
// Oublié avec la story, comme le shell oublie les valeurs, et avec le plugin.
// Rendu à chaque panneau en `overrides` : c'est d'ici qu'il les lit, et que
// l'en-tête les efface.
const edited = shallowRef<Record<string, Overrides>>({})

// Par `hasOwn` : un plugin nommé `toString` lirait sinon la fonction du prototype.
const heldFor = (name: string) =>
  Object.hasOwn(edited.value, name) ? (edited.value[name] ?? {}) : {}

const merge = () =>
  emit('overrides', Object.assign({}, ...panels.value.map((one) => heldFor(one.name))))

function edit(name: string, values: Overrides) {
  edited.value = { ...edited.value, [name]: values }
  merge()
}

watch(
  () => props.entry?.id,
  () => (edited.value = {}),
)

// La dernière lecture lancée : une plus ancienne qui finirait après elle
// rendrait une liste périmée.
let reading = 0

async function load() {
  const run = (reading += 1)

  let listed: {
    panels: { name: string; shell: string; view?: PluginView }[]
    refused: { plugin: string; reason: string }[]
    weights: { plugin: string; bytes: number }[]
  }
  try {
    listed = (await fetch(PLUGINS).then((answer) => answer.json())) as typeof listed
  } catch (error) {
    if (run !== reading) return
    failures.value = [{ name: '', message: said(error) }]
    emit('troubles', 1)
    return
  }

  // Chacun pour soi : un module qui ne charge pas ne coûte pas les autres, et son
  // nom s'affiche plutôt que son panneau manque sans rien dire.
  const loaded = await Promise.allSettled(
    listed.panels.map(
      (one) =>
        // Contre la page et non contre ce module, qui vit sous `assets/` : un build
        // nomme ses modules par une adresse relative.
        import(/* @vite-ignore */ new URL(one.shell, document.baseURI).href) as Promise<{
          default?: unknown
          view?: unknown
        }>,
    ),
  )

  if (run !== reading) return

  // Un module déjà importé revient tel quel, même composant : son panneau garde
  // son état. Seul un panneau qui a changé est monté de nouveau.
  const found: typeof panels.value = []
  const failed: typeof failures.value = []
  const views: LoadedView[] = []

  loaded.forEach((result, at) => {
    const { name, view } = listed.panels[at]!
    if (result.status === 'rejected') {
      failed.push({ name, message: said(result.reason) })
      return
    }
    const panel = result.value.default

    // Une vue lit l'export `view` : son canvas est requis, sa sidebar et son
    // panneau ne le sont pas. Un plugin qui n'a qu'une vue n'exporte pas de
    // panneau des stories.
    if (view) {
      const parts = (result.value.view ?? {}) as Record<string, unknown>
      const bad = (['canvas', 'sidebar', 'panel'] as const).find(
        (part) => (part === 'canvas' || parts[part] !== undefined) && !isComponent(parts[part]),
      )
      if (bad) failed.push({ name, message: `its \`view.${bad}\` export is not a component` })
      else
        views.push({
          name,
          ...view,
          canvas: parts['canvas'] as Component,
          ...(parts['sidebar'] ? { sidebar: parts['sidebar'] as Component } : {}),
          ...(parts['panel'] ? { panel: parts['panel'] as Component } : {}),
        })
      if (panel === undefined) return
    }

    // Un module qui n'a qu'une vue, refusée par le CLI : le refus est déjà dit,
    // et il n'a jamais voulu de panneau des stories.
    if (panel === undefined && result.value.view !== undefined) return

    // Un objet ou une fonction, ce que Vue monte. Autre chose, `42` par exemple,
    // ne rendait rien et ne disait rien. Mesuré.
    if (!isComponent(panel)) failed.push({ name, message: 'its default export is not a component' })
    else found.push({ name, panel: panel as Component })
  })

  refused.value = listed.refused
  emit('weights', listed.weights)
  panels.value = found
  failures.value = failed
  emit('troubles', failed.length + listed.refused.length)
  emit('views', views)

  // Un plugin qui n'est plus listé emporte ses valeurs : gardées, elles
  // restaient dans le rendu sans panneau pour les montrer, et revenaient quand on
  // le remettait. Audit à froid du projet 1.3.
  //
  // Un plugin encore listé dont le module change garde les siennes : tant qu'il
  // échoue, la fusion suivante les écarte, et elles reviennent quand il charge de
  // nouveau. Laissé de côté par DCJ-334 : l'URL d'un module ne change qu'avec le
  // nom de son fichier. Rouvert si un usage renomme le module d'un plugin.
  const kept = Object.fromEntries(
    Object.entries(edited.value).filter(([name]) => listed.panels.some((one) => one.name === name)),
  )
  if (Object.keys(kept).length < Object.keys(edited.value).length) {
    edited.value = kept
    merge()
  }
}

onMounted(load)
watch(() => props.revision, load)
</script>

<template>
  <Alert
    v-if="failures.length > 0 || refused.length > 0 || errors.length > 0"
    color="error"
    class="failed"
    role="alert"
  >
    <p v-for="one of failures" :key="one.name">
      <code>{{ one.name || t('list') }}</code> {{ t('notLoaded') }} {{ one.message }}
    </p>
    <p v-for="(one, at) of refused" :key="`refused-${at}`">
      {{ t('refused') }} <code>{{ one.plugin }}</code
      >{{ t('colon') }} {{ one.reason }}
    </p>
    <p v-for="(one, at) of errors" :key="`preview-${at}`">
      <code>{{ one.plugin }}</code> {{ t('preview') }} {{ one.message }}
    </p>
  </Alert>
  <PanelFrame
    v-for="one of panels"
    :key="one.name"
    :name="one.name"
    :panel="one.panel"
    :entry="entry"
    :received="Object.hasOwn(received, one.name) ? (received[one.name] ?? null) : null"
    :failed="failed"
    :values="values"
    :overrides="heldFor(one.name)"
    @overrides="(values: Overrides) => edit(one.name, values)"
    @send="(message: PanelMessage) => emit('send', message)"
  />
</template>

<style scoped>
.failed {
  --alert-font-size: 13px;
  margin-top: 12px;
}

.failed p {
  margin: 0;
}
</style>
