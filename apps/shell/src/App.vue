<script setup lang="ts">
import type {
  Manifest,
  Overrides,
  ShellMessage,
  SkippedFile,
  StoryEntry,
} from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/shell'
import { Callout } from '@crypte/ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import Panels from './panels.vue'
import { landing, unreadable, type Shown } from './recover'
import StoryTree from './story-tree.vue'
import { placeSearch, readPlace } from './url'

// Le shell ne connaît aucun framework : il est construit à l'avance et livré dans
// le CLI, là où la preview est compilée chez l'utilisateur.

const MANIFEST = '/@crypte/manifest.json'

const frame = useTemplateRef<HTMLIFrameElement>('frame')
const entries = ref<StoryEntry[]>([])
const skipped = ref<SkippedFile[]>([])
const current = ref<string | null>(null)
const status = ref('loading the catalogue')

// L'entrée affichée, pas seulement son identifiant : celui-ci vient du chemin et
// du nom, donc renommer une story le change et la sélection ne se retrouve plus.
// Son fichier et son rang y survivent.
let shown: Shown = null

// Une erreur de rendu s'affiche, elle ne se glisse pas dans une ligne d'état :
// une story qui ne rend rien laisse un cadre vide, et un cadre vide sans
// message ressemble à un outil cassé.
const failure = ref<{ id: string; message: string; stack?: string } | null>(null)

let channel: ReturnType<typeof createShellChannel> | null = null
let ready = false

// Compte les `ready` : les panneaux relisent la liste des plugins à chacun.
const revision = ref(0)

// Compté sur les entrées, pas lu d'un champ : un compte porté par le manifeste
// pourrait contredire `entry.storyFile`. Le message suit le compte, « ignoré »
// étant faux d'un fichier qui a rendu trois stories sur quatre.
const setAside = computed(() =>
  skipped.value.map((one) => {
    const read = entries.value.filter((entry) => entry.storyFile === one.file).length

    return {
      file: one.file,
      reason: one.reason,
      read,
      title:
        read === 0
          ? 'no story read'
          : read === 1
            ? '1 story read, some are missing'
            : `${read} stories read, some are missing`,
    }
  }),
)

// L'entrée affichée, que reçoivent les panneaux des plugins.
const displayed = computed(() => entries.value.find((entry) => entry.id === current.value) ?? null)

// La note de l'entrée affichée, quand sa fiche est partielle. Discrète et non
// bloquante : la story rend, il manque des lignes à sa table de props.
const partial = computed(() => displayed.value?.partial ?? null)

// L'adresse d'arrivée, lue une fois : la story qu'elle nomme est la première
// affichée, si le catalogue la porte.
let arrival = readPlace(window.location.search)

// Ce qu'un panneau a édité, par-dessus les props de la story affichée. Gardé
// tant que la même story reste affichée, y compris quand la preview redit
// `ready` après une édition de fichier : la story repart de ses props quand on
// en change, jamais sous les valeurs qu'on vient de saisir.
//
// `shallowRef` et une copie : `postMessage` refuse un proxy réactif, et un
// panneau peut émettre le sien.
const overrides = shallowRef<Overrides>({})

// L'adresse suit la story affichée, pour qu'un lien collé ailleurs rouvre la
// même. Un clic ajoute une étape à l'historique ; un atterrissage, première
// story ou story retrouvée après un renommage, remplace celle qui est là.
function show(id: string, trace: 'push' | 'replace' | 'none' = 'replace') {
  if (id !== current.value) overrides.value = {}
  current.value = id
  shown = entries.value.find((entry) => entry.id === id) ?? shown
  failure.value = null
  const search = placeSearch({ mode: 'entry', id })
  if (trace !== 'none' && window.location.search !== search)
    window.history[trace === 'push' ? 'pushState' : 'replaceState'](null, '', search)
  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  if (ready) channel?.send({ type: 'render', id, overrides: overrides.value })
}

function edit(values: Overrides) {
  overrides.value = { ...values }
  if (current.value !== null) show(current.value)
}

// Un message entre les deux moitiés d'un plugin : un `type` préfixé, le reste
// est à lui.
type PanelMessage = { type: string; [key: string]: unknown }

// Ce que la partie preview de chaque plugin a envoyé en dernier, rangé sous son
// nom, le préfixe du `type`, section 5.4. Et ce que la preview a dit d'un
// plugin qui a échoué. Les deux repartent de rien à chaque `ready` : une preview
// rechargée redit ce qui échoue encore.
const received = shallowRef<Record<string, PanelMessage>>({})
const pluginErrors = shallowRef<{ plugin: string; message: string }[]>([])

// Ce qu'un panneau envoie à sa partie preview, déjà vérifié par son cadre.
// Rien ne part avant `ready`, comme `render` : une iframe qui n'écoute pas encore
// perdrait le message. Dit dans la console plutôt que perdu sans trace.
function sendToPreview(message: PanelMessage) {
  if (!ready) {
    console.error(`crypte: \`${message.type}\` was sent before the preview was ready, and dropped`)
    return
  }
  channel?.send(message as unknown as ShellMessage)
}

// Relu à chaque `ready`, et pas seulement au montage : ce message est aussi ce
// que dit une preview rechargée parce que le catalogue a changé. Aucun message
// de plus n'a donc été ajouté au protocole.
async function refresh() {
  // Un catalogue illisible fige l'arbre sur son état d'avant : sans cette
  // ligne, rien ne dirait pourquoi il a cessé de suivre.
  let manifest: Manifest
  try {
    manifest = (await fetch(MANIFEST).then((answer) => answer.json())) as Manifest
  } catch (error) {
    status.value = unreadable(error)
    return
  }

  const before = entries.value

  // Les stories seules : le manifeste porte d'autres natures d'entrée, et cet
  // écran n'en montre qu'une. Ce qu'il ne sait pas afficher, il l'ignore.
  const stories = manifest.entries.filter((entry): entry is StoryEntry => entry.type === 'story')

  entries.value = stories
  skipped.value = manifest.skipped ?? []
  status.value = `${stories.length} stories`

  // Lue au premier catalogue, puis oubliée : ensuite, c'est la story affichée
  // qui fait l'adresse.
  if (arrival.mode === 'entry') {
    const id = arrival.id
    shown = stories.find((entry) => entry.id === id) ?? shown
  }
  arrival = { mode: 'home' }

  const next = landing(shown, before, stories)
  shown = next.shown
  if (next.status) status.value = next.status

  // L'erreur part avec la story : un fichier supprimé fait d'abord échouer son
  // rechargement à chaud, et l'alerte restait par-dessus « la story affichée a
  // disparu ».
  if (next.id === null) {
    current.value = null
    failure.value = null
    return
  }

  show(next.id)
}

// Précédent et suivant du navigateur : l'adresse a changé sans le shell, qui la
// suit sans ajouter d'étape.
function travel() {
  const place = readPlace(window.location.search)
  if (place.mode === 'entry' && entries.value.some((entry) => entry.id === place.id))
    show(place.id, 'none')
}

onBeforeUnmount(() => window.removeEventListener('popstate', travel))

onMounted(() => {
  window.addEventListener('popstate', travel)

  if (frame.value) {
    channel = createShellChannel(frame.value)
    channel.onMessage((message) => {
      if (message.type === 'ready') {
        received.value = {}
        pluginErrors.value = []
        ready = true
        revision.value += 1
        // La page qui vient de dire `ready` n'écoute plus une fois quittée : un
        // message envoyé pendant son rechargement était perdu sans trace, `ready`
        // restant vrai. Suivie à chaque `ready`, donc chaque page chargée.
        frame.value?.contentWindow?.addEventListener(
          'pagehide',
          () => {
            ready = false
          },
          { once: true },
        )
        status.value = `preview ready, protocol v${message.protocolVersion}`
        void refresh()
      }
      if (message.type === 'rendered') {
        failure.value = null
        status.value = `${message.id} rendered in ${message.durationMs.toFixed(1)} ms`
      }
      // Rattachée à la story affichée : cliquer B pendant que A rend laissait
      // l'erreur de A couvrir B, et masquer la note partielle de B.
      if (message.type === 'error' && message.id === current.value) {
        failure.value = { id: message.id, message: message.message, stack: message.stack }
        status.value = 'render error'
      }
      // Une fois chacune : un hook qui lève lève à chaque rendu, et chaque
      // valeur saisie dans `controls` en ajoutait une ligne identique.
      if (
        message.type === 'plugin-error' &&
        !pluginErrors.value.some(
          (one) => one.plugin === message.plugin && one.message === message.message,
        )
      ) {
        pluginErrors.value = [
          ...pluginErrors.value,
          { plugin: message.plugin, message: message.message },
        ]
      }
      const type: unknown = message.type
      if (typeof type === 'string' && type.includes(':')) {
        const plugin = type.slice(0, type.indexOf(':'))
        received.value = { ...received.value, [plugin]: message as unknown as PanelMessage }
      }
    })
  }

  void refresh()
})
</script>

<template>
  <main>
    <nav>
      <h1>Crypte</h1>
      <StoryTree :entries="entries" :current="current" @show="(id) => show(id, 'push')" />
    </nav>

    <div>
      <!-- Au-dessus de la preview et jamais bloquant : une story écartée est
           absente de l'arbre, donc rien d'autre ne la nomme. -->
      <Callout v-if="setAside.length > 0" tone="warning" class="set-aside" role="status">
        <h2>What Crypte could not read</h2>
        <ul>
          <li v-for="one of setAside" :key="one.file">
            <code>{{ one.file }}</code
            >: {{ one.title }}. {{ one.reason }}
          </li>
        </ul>
      </Callout>

      <!-- L'erreur couvre la preview plutôt que de l'accompagner : ce qui reste
           affiché dessous appartient à la story d'avant, et le laisser voir
           ferait croire que celle-ci a rendu. -->
      <Callout v-if="failure" tone="danger" class="failure" role="alert">
        <h2>{{ failure.id }} could not be rendered</h2>
        <p>{{ failure.message }}</p>
        <pre v-if="failure.stack">{{ failure.stack }}</pre>
      </Callout>
      <iframe v-show="!failure" ref="frame" src="/preview.html" title="preview"></iframe>

      <!-- Sous la preview, pas dessus : la story rend, et l'avertissement ne dit
           que ce qui manque à sa fiche. Le ton dit ce que l'outil ne sait pas
           lire, jamais que le fichier est mal écrit. -->
      <p v-if="partial && !failure" class="partial">Incomplete props table: {{ partial }}.</p>
      <Panels
        :entry="displayed"
        :received="received"
        :failed="failure?.message ?? null"
        :revision="revision"
        :errors="pluginErrors"
        @overrides="edit"
        @send="sendToPreview"
      />
      <p>{{ status }}</p>
    </div>
  </main>
</template>

<style scoped>
main {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  font-family: system-ui, sans-serif;
}

iframe {
  width: 100%;
  height: 70vh;
  border: 1px solid #e5e7eb;
}

.failure {
  --callout-padding: 12px 16px;
  min-height: 70vh;
}

.set-aside {
  --callout-font-size: 13px;
  margin-bottom: 12px;
}

.set-aside h2 {
  font-size: 13px;
  margin: 0 0 4px;
}

.set-aside ul {
  margin: 0;
  padding-left: 18px;
}

.partial {
  color: #92400e;
  font-size: 13px;
}

.failure pre {
  white-space: pre-wrap;
  font-size: 12px;
  color: #7f1d1d;
}
</style>
