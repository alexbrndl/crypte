<script setup lang="ts">
import type {
  Manifest,
  Overrides,
  ShellMessage,
  SkippedFile,
  StoryEntry,
  TokensEntry,
} from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/shell'
import { Callout } from '@crypte/ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import Panels from './panels.vue'
import { landing, unreadable, type Shown } from './recover'
import { CHANGES, type Changes } from './changes'
import ChangesPage from './changes-page.vue'
import ComponentPage from './component-page.vue'
import StoryTree from './story-tree.vue'
import TokensPage from './tokens-page.vue'
import { componentIdOf } from './tree'
import { placeSearch, readPlace, sameTab } from './url'

// Le shell ne connaît aucun framework : il est construit à l'avance et livré dans
// le CLI, là où la preview est compilée chez l'utilisateur.

const MANIFEST = '/@crypte/manifest.json'

const frame = useTemplateRef<HTMLIFrameElement>('frame')
const entries = ref<StoryEntry[]>([])
// Les familles de tokens, que l'arbre range avec les stories et qu'une page dessine.
const families = ref<TokensEntry[]>([])
const skipped = ref<SkippedFile[]>([])
const current = ref<string | null>(null)
const status = ref('loading the catalogue')
// Ce qu'un catalogue illisible laisse dire, quelle que soit la page.
const unread = ref<string | null>(null)

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

// L'adresse d'arrivée, lue une fois : la story ou le composant qu'elle nomme est
// le premier affiché, si le catalogue le porte.
let arrival = readPlace(window.location.search)

// La page composant ouverte, par l'identifiant de son composant, ou `null` en mode
// story. La story `current` reste chargée dessous, panneaux compris : y revenir
// ne recharge rien.
const component = ref<string | null>(null)
const ofComponent = (id: string, stories: readonly StoryEntry[]) =>
  stories.filter((entry) => componentIdOf(entry.path) === id)
const componentStories = computed(() =>
  component.value === null ? [] : ofComponent(component.value, entries.value),
)

// La famille de tokens ouverte, par son identifiant, ou `null`. Comme une page
// composant, elle laisse la preview et les panneaux chargés dessous.
const family = ref<string | null>(null)
const shownFamily = computed(() => families.value.find((one) => one.id === family.value) ?? null)

// Ce que l'arbre range, dans l'ordre du manifeste : les familles y suivent les
// stories, les contributions des plugins passant après elles (§6.3).
const listed = computed(() => [...entries.value, ...families.value])

// Le mode changements : ouvert ou non, et ce que le CLI en dit, relu avec le
// catalogue. Comme une page, il laisse la preview chargée dessous.
const changesOpen = ref(false)
const changes = ref<Changes | null>(null)
let reading = 0

async function readChanges() {
  const run = (reading += 1)
  let read: Changes
  try {
    read = (await fetch(CHANGES).then((answer) => answer.json())) as Changes
  } catch (error) {
    read = {
      reason: `its route could not be read: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  // Le dernier relu gagne : deux `ready` rapprochés ne se répondent pas dans l'ordre.
  if (run === reading) changes.value = read
}

// Le compteur du pied de la navigation : rien quand les changements ne se lisent pas.
const counter = computed(() =>
  changes.value !== null && 'changes' in changes.value ? changes.value.changes.length : null,
)

// La ligne d'état parle de ce qui est affiché. Sous une page, la story chargée
// dessous rend comme ailleurs, mais ni sa durée de rendu ni sa perte n'y ont leur
// place. Une page dont l'entrée a disparu reste ouverte et le dit, comme une
// story perdue : l'entrée revenue, la page revient avec elle.
const line = computed(() => {
  if (unread.value !== null) return unread.value
  if (changesOpen.value) return counted(entries.value.length)
  if (family.value !== null)
    return shownFamily.value ? counted(entries.value.length) : 'the tokens on display are gone'
  if (component.value !== null)
    return componentStories.value.length > 0
      ? counted(entries.value.length)
      : 'the component on display is gone'
  return status.value
})

// Ce qu'un panneau a édité, par-dessus les props de la story affichée. Gardé
// tant que la même story reste affichée, y compris quand la preview redit
// `ready` après une édition de fichier : la story repart de ses props quand on
// en change, jamais sous les valeurs qu'on vient de saisir.
//
// `shallowRef` et une copie : `postMessage` refuse un proxy réactif, et un
// panneau peut émettre le sien.
const overrides = shallowRef<Overrides>({})

const counted = (n: number) => (n === 1 ? '1 story' : `${n} stories`)

// Ce que le CLI dit du projet : la racine de stories qu'il déclare, et pourquoi
// la dernière relecture de la configuration a échoué, le serveur gardant la
// précédente. Relu comme les changements.
const PROJECT = '/@crypte/project.json'
const project = ref<{ stories: string; config: string | null } | null>(null)
let asking = 0

async function readProject() {
  const run = (asking += 1)
  let read: typeof project.value = null
  try {
    read = (await fetch(PROJECT).then((answer) => answer.json())) as typeof project.value
  } catch {
    // Rien à dire du projet plutôt qu'un encadré faux.
  }
  if (run === asking) project.value = read
}

// Relu au retour sur la fenêtre : une sauvegarde de la configuration ou un commit
// ne produisent pas toujours de `ready`.
function reread() {
  void readChanges()
  void readProject()
}

// Le catalogue lu au moins une fois, pour ne pas dire « aucune story » avant.
const read = ref(false)

// L'adresse d'arrivée, quand elle nomme ce que le catalogue ne porte plus. Dite
// jusqu'à la prochaine navigation.
const stale = ref<string | null>(null)

// Le plein écran : la preview seule, sans navigation ni panneaux.
const full = ref(false)
const storyMode = computed(
  () => component.value === null && family.value === null && !changesOpen.value,
)
// Une story affichée aussi : sans elle, la barre et son bouton de sortie partent.
const fullScreen = computed(() => full.value && storyMode.value && displayed.value !== null)

type Trace = 'push' | 'replace' | 'none'

// L'adresse suit ce qui est affiché, pour qu'un lien collé ailleurs rouvre la
// même chose. Un clic ajoute une étape à l'historique ; un atterrissage, première
// story ou story retrouvée après un renommage, remplace celle qui est là.
function write(search: string, trace: Trace) {
  if (trace !== 'none' && window.location.search !== search)
    window.history[trace === 'push' ? 'pushState' : 'replaceState'](null, '', search)
}

// La story que la preview rend, sans changer de page.
function select(id: string) {
  if (id !== current.value) overrides.value = {}
  current.value = id
  shown = entries.value.find((entry) => entry.id === id) ?? shown
  failure.value = null
  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  if (ready) channel?.send({ type: 'render', id, overrides: overrides.value })
}

// Une story ou une famille de tokens : `?id=` les nomme toutes les deux (§4.3).
function show(id: string, trace: Trace = 'replace') {
  if (trace === 'push') stale.value = null
  changesOpen.value = false
  component.value = null
  family.value = families.value.some((one) => one.id === id) ? id : null
  if (family.value !== null) full.value = false
  if (family.value === null) select(id)
  write(placeSearch({ mode: 'entry', id }), trace)
}

// Sous la page, la preview charge une story du composant, si elle n'en montre
// pas déjà une : c'est elle qui retrouve le composant après un renommage, par son
// fichier et son rang.
function open(id: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  changesOpen.value = false
  component.value = id
  family.value = null
  const stories = ofComponent(id, entries.value)
  if (stories[0] && !stories.some((entry) => entry.id === current.value)) select(stories[0].id)
  write(placeSearch({ mode: 'component', id }), trace)
}

// Relus à l'ouverture et au retour sur la fenêtre : un commit ne touche aucun
// fichier que Vite surveille, donc aucun `ready` ne les aurait relus.
function openChanges(trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  void readChanges()
  changesOpen.value = true
  component.value = null
  family.value = null
  write(placeSearch({ mode: 'changes' }), trace)
}

// Les stories sœurs de la story affichée, celles du même composant.
const siblings = computed(() =>
  displayed.value === null ? [] : ofComponent(componentIdOf(displayed.value.path), entries.value),
)
const at = computed(() => siblings.value.findIndex((entry) => entry.id === current.value))

// Sans boucler : la dernière n'a pas de suivante.
function step(delta: number) {
  const target = siblings.value[at.value + delta]
  if (target) show(target.id, 'push')
}

const copied = ref<'yes' | 'failed' | null>(null)
let clearing: ReturnType<typeof setTimeout> | undefined

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = 'yes'
  } catch {
    copied.value = 'failed'
  }
  clearTimeout(clearing)
  clearing = setTimeout(() => (copied.value = null), 1500)
}

const tree = useTemplateRef<{ focusSearch: () => void }>('tree')

// Inactifs pendant une saisie, et sous ⌘ ou Ctrl, qui sont ceux du navigateur. `[`
// et `]` se décident sur le caractère : l'AZERTY et le QWERTZ les tapent avec ⌥
// sous macOS, avec AltGr, qui arrive comme Ctrl et Alt, sous Windows. Une frappe
// dans la preview n'arrive pas jusqu'ici : l'iframe la garde.
function shortcut(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    full.value = false
    return
  }
  if (event.metaKey) return
  if (event.ctrlKey && !event.getModifierState('AltGraph')) return
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]'))
    return
  // Alt+F ouvre le menu Fichier sous Windows : `f` et `/` se tapent sans modification.
  const plain = !event.altKey && !event.ctrlKey
  if (event.key === '/' && plain) {
    event.preventDefault()
    tree.value?.focusSearch()
    return
  }
  if (!storyMode.value) return
  if (event.key === 'f' && plain) full.value = !full.value
  if (event.key === '[') step(-1)
  if (event.key === ']') step(1)
}

function follow(event: MouseEvent, go: () => void) {
  if (!sameTab(event)) return
  event.preventDefault()
  go()
}

function edit(values: Overrides) {
  overrides.value = { ...values }
  if (current.value !== null) select(current.value)
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
    unread.value = unreadable(error)
    return
  }

  const before = entries.value

  // Les stories et les familles de tokens : `page` est réservée (§4.2), et ce que
  // le shell ne sait pas dessiner, il l'ignore.
  const stories = manifest.entries.filter((entry): entry is StoryEntry => entry.type === 'story')

  unread.value = null
  read.value = true
  reread()
  entries.value = stories
  families.value = manifest.entries.filter((entry): entry is TokensEntry => entry.type === 'tokens')
  skipped.value = manifest.skipped ?? []
  status.value = counted(stories.length)

  // Lue au premier catalogue, puis oubliée : ensuite, c'est ce qui est affiché
  // qui fait l'adresse. Sous une page composant, la preview charge sa première
  // story.
  let opening: string | null = null
  if (arrival.mode === 'entry') {
    const id = arrival.id
    shown = stories.find((entry) => entry.id === id) ?? shown
    if (families.value.some((one) => one.id === id)) family.value = id
  }
  if (arrival.mode === 'component') {
    const [first] = ofComponent(arrival.id, stories)
    if (first) [opening, shown] = [arrival.id, first]
  }
  if (arrival.mode === 'changes') changesOpen.value = true
  if (arrival.mode === 'entry' && !shown && family.value === null) stale.value = arrival.id
  if (arrival.mode === 'component' && opening === null) stale.value = arrival.id
  arrival = { mode: 'home' }

  const next = landing(shown, before, stories)
  shown = next.shown
  if (next.status) status.value = next.status

  // L'erreur part avec la story : un fichier supprimé fait d'abord échouer son
  // rechargement à chaud, et l'alerte restait par-dessus « la story affichée a
  // disparu ».
  if (next.id === null) {
    // Deux fichiers de stories peuvent porter le même titre : celui de la story
    // chargée sous la page parti, l'autre porte encore le composant.
    const [rest] = component.value === null ? [] : ofComponent(component.value, stories)
    if (rest) {
      select(rest.id)
      return
    }
    current.value = null
    failure.value = null
    return
  }

  if (opening !== null) {
    select(next.id)
    open(opening, 'replace')
  } else if (component.value !== null) {
    // La story dessous est du composant de la page : retrouvée sous un autre
    // chemin, elle y emmène la page.
    select(next.id)
    const id = next.id
    const followed = componentIdOf(stories.find((entry) => entry.id === id)?.path ?? [])
    if (followed !== component.value) open(followed, 'replace')
  } else if (family.value !== null || changesOpen.value) select(next.id)
  else show(next.id)
}

// Précédent et suivant du navigateur : l'adresse a changé sans le shell, qui la
// suit sans ajouter d'étape.
function travel() {
  const place = readPlace(window.location.search)
  if (place.mode === 'entry' && listed.value.some((entry) => entry.id === place.id))
    show(place.id, 'none')
  if (place.mode === 'component' && ofComponent(place.id, entries.value).length > 0)
    open(place.id, 'none')
  if (place.mode === 'changes') openChanges('none')
}

onBeforeUnmount(() => {
  window.removeEventListener('popstate', travel)
  window.removeEventListener('focus', reread)
  window.removeEventListener('keydown', shortcut)
})

onMounted(() => {
  window.addEventListener('popstate', travel)
  window.addEventListener('focus', reread)
  window.addEventListener('keydown', shortcut)

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
  <main :class="{ full: fullScreen }">
    <nav v-show="!fullScreen">
      <h1>Crypte</h1>
      <StoryTree
        ref="tree"
        :entries="listed"
        :current="changesOpen ? null : (family ?? current)"
        :component="component"
        @show="(id) => show(id, 'push')"
        @open="(id) => open(id)"
      />
      <!-- Une destination, pas une action : sa place est dans la navigation, au pied,
           et non parmi les boutons qui agissent sur l'entrée affichée. -->
      <a
        class="changes-entry"
        :href="placeSearch({ mode: 'changes' })"
        :aria-current="changesOpen ? 'page' : undefined"
        @click="follow($event, () => openChanges())"
      >
        Changes
        <span v-if="counter !== null" class="counter">{{ counter }}</span>
      </a>
    </nav>

    <div>
      <!-- Dit sur toutes les pages : ce qui est servi n'est plus ce que le fichier
           déclare, et rien d'autre ne le montrerait. -->
      <Callout v-if="project?.config" tone="warning" class="config" role="alert">
        <h2><code>crypte.config.ts</code> could not be read</h2>
        <p>
          Crypte keeps serving the configuration it read before. Fix the file and save it again:
          {{ project.config }}
        </p>
      </Callout>

      <Callout v-if="stale && entries.length > 0" tone="warning" class="stale" role="status">
        <code>{{ stale }}</code> is not in the catalogue any more: it was probably renamed. Showing
        the first story instead.
      </Callout>

      <!-- Pas quand un fichier a été écarté : l'encadré d'en dessous le nomme, et
           le dossier n'est alors pas en cause. -->
      <Callout
        v-if="read && listed.length === 0 && skipped.length === 0"
        tone="warning"
        class="empty"
        role="status"
      >
        <h2 v-if="project">
          No story found in <code>{{ project.stories }}/</code>
        </h2>
        <h2 v-else>No story found</h2>
        <p>
          Check that <code>stories</code> in <code>crypte.config.ts</code> names the folder of your
          story files, and that each one exports <code>defineStories(…)</code> by default.
        </p>
      </Callout>

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

      <TokensPage v-if="shownFamily" :family="shownFamily" />

      <ChangesPage
        v-if="changesOpen"
        :changes="changes"
        :stories="entries"
        @show="(id) => show(id, 'push')"
        @open="(id) => open(id)"
      />

      <ComponentPage
        v-if="component !== null"
        :stories="componentStories"
        @show="(id) => show(id, 'push')"
      />

      <!-- Masqué et non retiré : la preview et les panneaux gardent leur état
           pendant qu'une page composant ou une famille est ouverte. -->
      <div v-show="component === null && family === null && !changesOpen">
        <div v-if="displayed" class="toolbar">
          <nav class="trail" aria-label="Breadcrumb">
            <span v-for="(segment, at) of displayed.path.slice(0, -1)" :key="at"
              >{{ segment }} /
            </span>
            <a
              :href="placeSearch({ mode: 'component', id: componentIdOf(displayed.path) })"
              @click="follow($event, () => open(componentIdOf(displayed!.path)))"
              >{{ displayed.path.at(-1) }}</a
            >
            / <span aria-current="page">{{ displayed.name }}</span>
          </nav>
          <div class="actions">
            <button type="button" class="copy" @click="copyLink">
              {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link' }}
            </button>
            <button
              type="button"
              title="Previous story ([)"
              aria-keyshortcuts="["
              :disabled="at <= 0"
              @click="step(-1)"
            >
              Previous
            </button>
            <button
              type="button"
              title="Next story (])"
              aria-keyshortcuts="]"
              :disabled="at >= siblings.length - 1"
              @click="step(1)"
            >
              Next
            </button>
            <button
              type="button"
              title="Full screen (F, Escape to leave)"
              aria-keyshortcuts="f"
              :aria-pressed="full"
              @click="full = !full"
            >
              {{ full ? 'Leave full screen' : 'Full screen' }}
            </button>
          </div>
        </div>

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
        <!-- Un élément autour : la racine de Panels est un fragment, où v-show ne
             s'applique pas, et les panneaux restaient visibles en plein écran. -->
        <div v-show="!fullScreen">
          <Panels
            :entry="displayed"
            :received="received"
            :failed="failure?.message ?? null"
            :revision="revision"
            :errors="pluginErrors"
            @overrides="edit"
            @send="sendToPreview"
          />
        </div>
      </div>
      <p>{{ line }}</p>
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

main.full {
  grid-template-columns: 1fr;
}

main.full iframe {
  height: 85vh;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}

.actions {
  display: flex;
  gap: 4px;
}

.config,
.stale,
.empty {
  --callout-font-size: 13px;
  margin-bottom: 12px;
}

.trail {
  font-size: 13px;
}

.changes-entry {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  padding: 8px 8px 0;
  border-top: 1px solid #e5e7eb;
  color: inherit;
  text-decoration: none;
}

.changes-entry[aria-current='page'] {
  font-weight: 600;
}

.counter {
  color: #6b7280;
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
