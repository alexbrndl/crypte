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
import { Alert } from '@crypte/ui'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import Panels from './panels/panels.vue'
import { landing, unreadable, type Shown } from './navigation/recover'
import { CHANGES, type Changes } from './pages/changes'
import ChangesPage from './pages/changes-page.vue'
import CommandPalette, { type Action } from './navigation/command-palette.vue'
import ComponentPage from './pages/component-page.vue'
import Icon from './ui/icon.vue'
import Logo from './ui/logo.vue'
import StoryTree from './navigation/story-tree.vue'
import TokensPage from './pages/tokens-page.vue'
import { useTheme } from './theme/theme'
import { componentIdOf } from './navigation/tree'
import { placeSearch, readPlace, sameTab } from './navigation/url'

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
// dessous rend comme ailleurs, mais ni son rendu ni sa perte n'y ont leur
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

// Le point de la barre d'état dit la même chose que la ligne : rouge sur un catalogue
// illisible, et sur une erreur de rendu dans le seul mode story.
const trouble = computed(() => unread.value !== null || (storyMode.value && failure.value !== null))

// Ce qu'un panneau a édité, par-dessus les props de la story affichée. Gardé
// tant que la même story reste affichée, y compris quand la preview redit
// `ready` après une édition de fichier : la story repart de ses props quand on
// en change, jamais sous les valeurs qu'on vient de saisir.
//
// `shallowRef` et une copie : `postMessage` refuse un proxy réactif, et un
// panneau peut émettre le sien.
const overrides = shallowRef<Overrides>({})

const counted = (n: number) => (n === 1 ? '1 story' : `${n} stories`)

// Les chiffres de la barre d'état, mesurés et jamais estimés. Le premier rendu
// court de l'ouverture de la page à la première story rendue : au premier
// chargement après `crypte dev`, il comprend la compilation de Vite.
const weights = shallowRef<{ plugin: string; bytes: number }[]>([])
const firstRender = ref<number | null>(null)
const kB = (bytes: number) => `${(bytes / 1e3).toFixed(1)} kB`

// Ce que le CLI dit du projet : la racine de stories qu'il déclare, et pourquoi
// la dernière relecture de la configuration a échoué, le serveur gardant la
// précédente. Relu comme les changements.
const PROJECT = '/@crypte/project.json'
const project = ref<{
  stories: string
  config: string | null
  shellBytes: number
  version: string
} | null>(null)
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
const fullScreen = computed(() => full.value && storyMode.value)

// Quitté, pas seulement masqué, quand la story affichée disparaît : la barre part
// avec son bouton de sortie, et le plein écran revenait au clic suivant.
watch(displayed, (now) => {
  if (now === null) full.value = false
})

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

// La palette s'ouvre par ⌘K sous macOS, Ctrl+K ailleurs : Ctrl+K efface la fin
// de la ligne dans un champ sous macOS.
const palette = ref(false)
const mac = /Mac|iPhone|iPad/.test(navigator.userAgent)
const paletteKeys = mac ? '⌘K' : 'Ctrl K'

// Celles de la barre d'outils et la recherche, quand elles s'appliquent, avec leur
// raccourci : la palette est l'endroit où ils se lisent.
const { theme, toggle: toggleTheme } = useTheme()

const actions = computed<Action[]>(() => [
  { label: theme.value === 'dark' ? 'Light theme' : 'Dark theme', keys: 'T', run: toggleTheme },
  ...(storyMode.value && displayed.value !== null
    ? [
        { label: 'Copy link', run: () => void copyLink() },
        {
          label: full.value ? 'Leave full screen' : 'Full screen',
          keys: 'F',
          run: () => (full.value = !full.value),
        },
      ]
    : []),
])

// Inactifs pendant une saisie, et sous ⌘ ou Ctrl, qui sont ceux du navigateur. Une
// frappe dans la preview n'arrive pas jusqu'ici : l'iframe la garde.
function shortcut(event: KeyboardEvent) {
  // Même pendant une saisie, comme toute palette.
  if (event.key.toLowerCase() === 'k' && (mac ? event.metaKey : event.ctrlKey) && !event.altKey) {
    event.preventDefault()
    palette.value = !palette.value
    return
  }
  // La palette répond seule à ses touches : Échap la ferme sans quitter le plein
  // écran dessous.
  if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
  if (event.key === 'Escape') {
    full.value = false
    return
  }
  if (event.metaKey) return
  if (event.ctrlKey) return
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]'))
    return
  // Alt+F ouvre le menu Fichier sous Windows : `f` et `/` se tapent sans modification.
  const plain = !event.altKey && !event.ctrlKey
  // La palette est la recherche : `/` l'ouvre, comme le champ de la colonne.
  if (event.key === '/' && plain) {
    event.preventDefault()
    palette.value = true
    return
  }
  if (event.key === 't' && plain) {
    toggleTheme()
    return
  }
  if (!storyMode.value) return
  // Comme le bouton, qui n'existe qu'avec une story : sans elle, aucune barre ne
  // permettrait d'en sortir.
  if (event.key === 'f' && plain && displayed.value !== null) full.value = !full.value
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
        firstRender.value ??= performance.now()
        status.value = `${message.id} rendered`
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
    <nav v-show="!fullScreen" class="column">
      <div class="card">
        <header class="brand">
          <div class="identity">
            <h1><Logo /></h1>
            <span v-if="project" class="version">{{ project.version }}</span>
          </div>
          <!-- La géométrie d'un champ, la conduite d'un bouton : y taper n'écrit
               rien, il ouvre la palette, qui cherche partout. -->
          <button
            type="button"
            class="commands"
            :aria-keyshortcuts="mac ? 'Meta+K /' : 'Control+K /'"
            @click="palette = true"
          >
            <Icon name="search-01" />
            <span>Search or run</span>
            <kbd>{{ paletteKeys }}</kbd>
          </button>
        </header>
        <StoryTree
          :entries="listed"
          :current="changesOpen ? null : (family ?? current)"
          :component="component"
          @show="(id) => show(id, 'push')"
          @open="(id) => open(id)"
        />
      </div>
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

    <div class="workspace">
      <div v-if="storyMode && displayed" class="toolbar">
        <!-- Le dossier n'est pas une destination, le composant en est une : seul il
               porte l'accent. Le séparateur suit le segment qui le précède. -->
        <nav class="trail" aria-label="Breadcrumb">
          <span v-for="(segment, at) of displayed.path.slice(0, -1)" :key="at" class="folder"
            >{{ segment }}<span class="separator">/</span></span
          >
          <a
            :href="placeSearch({ mode: 'component', id: componentIdOf(displayed.path) })"
            @click="follow($event, () => open(componentIdOf(displayed!.path)))"
            >{{ displayed.path.at(-1) }}</a
          ><span class="separator">/</span>
          <span aria-current="page">{{ displayed.name }}</span>
        </nav>
        <div class="actions">
          <button type="button" class="copy" @click="copyLink">
            <Icon name="copy-01" />
            {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link' }}
          </button>
          <button
            type="button"
            title="Full screen (F, Escape to leave)"
            aria-keyshortcuts="f"
            :aria-pressed="full"
            @click="full = !full"
          >
            {{ full ? 'Leave full screen' : 'Full screen' }} <kbd>F</kbd>
          </button>
        </div>
      </div>

      <div class="body">
        <div class="stage">
          <!-- Dit sur toutes les pages : ce qui est servi n'est plus ce que le fichier
           déclare, et rien d'autre ne le montrerait. -->
          <Alert v-if="project?.config" color="warning" class="config" role="alert">
            <h2><code>crypte.config.ts</code> could not be read</h2>
            <p>
              Crypte keeps serving the configuration it read before. Fix the file and save it again:
              {{ project.config }}
            </p>
          </Alert>

          <Alert v-if="stale && entries.length > 0" color="warning" class="stale" role="status">
            <code>{{ stale }}</code> is not in the catalogue any more: it was probably renamed.
            Showing the first story instead.
          </Alert>

          <!-- Pas quand un fichier a été écarté : l'encadré d'en dessous le nomme, et
           le dossier n'est alors pas en cause. -->
          <Alert
            v-if="read && listed.length === 0 && skipped.length === 0"
            color="warning"
            class="empty"
            role="status"
          >
            <h2 v-if="project">
              No story found in <code>{{ project.stories }}/</code>
            </h2>
            <h2 v-else>No story found</h2>
            <p>
              Check that <code>stories</code> in <code>crypte.config.ts</code> names the folder of
              your story files, and that each one exports <code>defineStories(…)</code> by default.
            </p>
          </Alert>

          <!-- Au-dessus de la preview et jamais bloquant : une story écartée est
           absente de l'arbre, donc rien d'autre ne la nomme. -->
          <Alert v-if="setAside.length > 0" color="warning" class="set-aside" role="status">
            <h2>What Crypte could not read</h2>
            <ul>
              <li v-for="one of setAside" :key="one.file">
                <code>{{ one.file }}</code
                >: {{ one.title }}. {{ one.reason }}
              </li>
            </ul>
          </Alert>

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
          <div v-show="component === null && family === null && !changesOpen" class="canvas">
            <!-- L'erreur couvre la preview plutôt que de l'accompagner : ce qui reste
           affiché dessous appartient à la story d'avant, et le laisser voir
           ferait croire que celle-ci a rendu. -->
            <Alert v-if="failure" color="error" class="failure" role="alert">
              <h2>{{ failure.id }} could not be rendered</h2>
              <p>{{ failure.message }}</p>
              <pre v-if="failure.stack">{{ failure.stack }}</pre>
            </Alert>
            <iframe v-show="!failure" ref="frame" src="/preview.html" title="preview"></iframe>

            <!-- Sous la preview, pas dessus : la story rend, et l'avertissement ne dit
           que ce qui manque à sa fiche. Le ton dit ce que l'outil ne sait pas
           lire, jamais que le fichier est mal écrit. -->
            <p v-if="partial && !failure" class="partial">Incomplete props table: {{ partial }}.</p>
          </div>
        </div>
        <!-- Un élément autour : la racine de Panels est un fragment, où v-show ne
             s'applique pas. Masqués et non retirés sous une page : ils gardent leur
             état. -->
        <aside v-show="!fullScreen && storyMode" class="panel-column" aria-label="Panels">
          <h2 class="column-title">Panels</h2>
          <Panels
            :entry="displayed"
            :received="received"
            :failed="failure?.message ?? null"
            :revision="revision"
            :errors="pluginErrors"
            @overrides="edit"
            @send="sendToPreview"
            @weights="(measured) => (weights = measured)"
          />
        </aside>
      </div>
    </div>
    <footer class="status-bar">
      <span class="dot" :data-failed="trouble || undefined" aria-hidden="true" />
      <p>{{ line }}</p>
      <span
        v-if="firstRender !== null"
        class="render"
        title="From opening this page to the first story rendered"
      >
        First render {{ Math.round(firstRender) }} ms
      </span>
      <ul class="figures">
        <li v-if="project" title="The shell, gzipped">Shell {{ kB(project.shellBytes) }}</li>
        <li
          v-if="weights.length > 0"
          :title="weights.map((one) => `${one.plugin} ${kB(one.bytes)}`).join('\n') || undefined"
        >
          {{ weights.length }} {{ weights.length === 1 ? 'plugin' : 'plugins' }}
        </li>
      </ul>
    </footer>
    <CommandPalette
      v-model:open="palette"
      :entries="listed"
      :actions="actions"
      @show="(id) => show(id, 'push')"
      @open="(id) => open(id)"
      @changes="openChanges()"
    />
  </main>
</template>

<style scoped>
/* Le pied reste en bas, l'arbre défile. */
.column {
  box-sizing: border-box;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-1) var(--space-1) 0;
  border-radius: var(--radius-lg);
  background: var(--background-sunken);
}

.card {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  /* A real border, not the inset shadow of the components: the backgrounds of
     its children would cover it. */
  border: var(--stroke-hairline) solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--background-raised);
  overflow: hidden;
}

.brand {
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-base);
}

.identity {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2-5) var(--space-3);
}

.identity h1 {
  display: flex;
  margin: 0;
  color: var(--text-primary);
  line-height: 0;
}

.version {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-variant-numeric: tabular-nums;
}

.commands {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  box-sizing: border-box;
  width: calc(100% - 2 * var(--space-3));
  margin: var(--space-1-5) var(--space-3) var(--space-3);
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  border-radius: var(--radius-sm);
  background: var(--background-raised);
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-align: left;
  cursor: pointer;
}

.commands:hover {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-strong);
}

.commands:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
}

.commands span {
  flex: 1;
}

.commands kbd {
  padding: var(--space-0-5) var(--space-1);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  border-radius: var(--radius-xs);
  background: var(--background-raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* La fenêtre entière : la colonne, l'espace de travail, et la barre d'état en bas
   sur toute la largeur. Chaque zone défile seule. */
main {
  display: grid;
  grid-template-columns: 264px 1fr;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100vh;
  font-family: var(--font-sans);
}

main.full {
  grid-template-columns: 1fr;
}

/* Une carte, comme la colonne. A real border: the backgrounds of its children
   would cover an inset one. */
.workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  margin: var(--space-1) var(--space-1) 0;
  overflow: hidden;
  border: var(--stroke-hairline) solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--background-raised);
}

main.full .workspace {
  margin: 0;
  border: 0;
  border-radius: 0;
}

/* Au-dessus du canvas et des panneaux : elle traite de ce qui est affiché. */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  box-sizing: border-box;
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  background: var(--background-raised);
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-base);
}

.trail {
  display: flex;
  flex: 1;
  gap: var(--space-2);
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  white-space: nowrap;
}

.trail .folder {
  display: flex;
  gap: var(--space-2);
  color: var(--text-muted);
}

.trail a {
  color: var(--text-current);
  text-decoration: none;
}

.trail a:hover {
  color: var(--text-current-hover);
}

.trail .separator {
  color: var(--text-subtle);
}

.actions {
  display: flex;
  gap: var(--space-2);
}

/* Le bouton du fichier Figma : contour neutre, ou plein inversé pour l'action
   principale, copier le lien. */
.actions button {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  border-radius: var(--radius-sm);
  background: var(--background-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  cursor: pointer;
}

.actions button:hover:not(:disabled) {
  background: var(--background-hover);
}

.actions button:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-hairline);
}

.actions button:disabled {
  color: var(--text-subtle);
  cursor: default;
}

.actions .copy {
  box-shadow: none;
  background: var(--background-inverse);
  color: var(--text-inverse);
}

.actions .copy:hover:not(:disabled) {
  background: var(--background-inverse-hover);
}

.actions kbd {
  padding: var(--space-0-5) var(--space-1);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  border-radius: var(--radius-xs);
  background: var(--background-raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* La preview occupe toute la scène, sans cadre ; les pages et les encadrés gardent
   leur marge. */
.stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
}

.stage > :not(.canvas) {
  margin: var(--space-3);
}

.canvas {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.panel-column {
  width: 340px;
  flex: none;
  overflow-y: auto;
  /* A real border, not the inset shadow of the components: the backgrounds of
     its children would cover it. */
  border-left: var(--stroke-hairline) solid var(--border-base);
  background: var(--background-raised);
}

.column-title {
  margin: 0;
  padding: var(--space-1-5) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.config,
.stale,
.empty {
  margin-bottom: var(--space-3);
}

.changes-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: var(--space-2);
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  border-radius: var(--radius-sm);
  background: var(--background-raised);
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-decoration: none;
}

.changes-entry[aria-current='page'] {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--accent-base);
  background: var(--background-current);
  color: var(--text-current);
}

.counter {
  padding: var(--space-0-5) var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--accent-base);
  color: var(--text-inverse);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* Le canvas : la story sur une trame de points, comme dans les maquettes. */
iframe {
  display: block;
  flex: 1;
  width: 100%;
  min-height: 320px;
  border: 0;
  background-color: var(--background-subtle);
  background-image: radial-gradient(var(--border-light) 1px, transparent 1px);
  background-size: 12px 12px;
}

.failure {
  min-height: 60vh;
  margin: var(--space-3);
}

.set-aside {
  margin-bottom: var(--space-3);
}

.set-aside ul {
  margin: 0;
  padding-left: var(--space-4);
}

.partial {
  margin: var(--space-2) var(--space-3);
  color: var(--warning-text);
  font-size: var(--text-xs);
}

.failure pre {
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--error-text);
}

/* L'état du canal, ce qui vient d'être fait, et les poids. */
.status-bar {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--space-2);
  align-items: center;
  height: 28px;
  padding: 0 var(--space-3);
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-base);
  /* Not the subtle background of the Figma component: muted text falls under
     4.5:1 on it. */
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.status-bar p {
  margin: 0;
}

.dot {
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-full);
  background: var(--success-solid);
}

.dot[data-failed] {
  background: var(--error-solid);
}

.figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
