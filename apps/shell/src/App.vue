<script setup lang="ts">
import type {
  Manifest,
  Overrides,
  RenderedValues,
  ShellMessage,
  SkippedFile,
  StoryEntry,
  TokensEntry,
} from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/shell'
import { Alert, Button, Tooltip } from '@crypte/ui'
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
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
import { differencesOf, sinceLabel } from './versions/differences'
import VersionsSidebar, { type Since, type Versions } from './versions/versions-sidebar.vue'
import VersionsView from './versions/versions-view.vue'
import CommandPalette, { type Action } from './navigation/command-palette.vue'
import ComponentPage from './pages/component-page.vue'
import EmptyGuide from './pages/empty-guide.vue'
import { ArrowDown01Icon, Copy01Icon, FullScreenIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import ActivityBar, { type View } from './navigation/activity-bar.vue'
import Icon from './ui/icon.vue'
import StoryTree from './navigation/story-tree.vue'
import CategoryList from './tokens/category-list.vue'
import { categoriesOf } from './tokens/categories'
import TokenPanel from './tokens/token-panel.vue'
import TokensView from './tokens/tokens-view.vue'
import { useTheme } from './theme/theme'
import { componentIdOf } from './navigation/tree'
import { placeSearch, readPlace, sameTab } from './navigation/url'

// Le shell ne connaît aucun framework : il est construit à l'avance et livré dans
// le CLI, là où la preview est compilée chez l'utilisateur.

const MANIFEST = '/@crypte/manifest.json'

const frame = useTemplateRef<HTMLIFrameElement>('frame')
const entries = ref<StoryEntry[]>([])
// Les familles de tokens, que la vue tokens range et qu'une page dessine.
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

// La catégorie de tokens ouverte, et le token choisi dedans, ou `null`. Comme une
// page composant, elle laisse la preview et les panneaux chargés dessous.
const tokensAt = ref<{ category: string; token?: string } | null>(null)
const categories = computed(() => categoriesOf(families.value))
const shownCategory = computed(
  () => categories.value.find((one) => one.name === tokensAt.value?.category) ?? null,
)

// Le token choisi dans la catégorie affichée, que son panneau décrit.
const selectedToken = computed(() => {
  const name = tokensAt.value?.token
  return (
    shownCategory.value?.groups.flatMap((group) => group.tokens).find((one) => one.name === name) ??
    null
  )
})

// La catégorie où commence une famille, que `?id=` nomme encore (§4.3) et que la
// palette propose : son premier token y mène.
const categoryOf = (id: string) => {
  const entry = families.value.find((one) => one.id === id)
  return entry === undefined
    ? undefined
    : categories.value.find((one) => one.groups.some((group) => group.id === entry.id))?.name
}

// Ce que la palette cherche, dans l'ordre du manifeste : les familles y suivent les
// stories, les contributions des plugins passant après elles (§6.3).
const listed = computed(() => [...entries.value, ...families.value])

// La vue versions : ouverte ou non, son point de départ et l'écart choisi, et ce
// que le CLI en dit, relu avec le catalogue. Comme une page, elle laisse la
// preview chargée dessous.
const changesOpen = ref(false)
const changesAt = ref<Since & { change?: string }>({})
const changes = ref<Changes | null>(null)
let reading = 0

const sinceQuery = () => {
  const query = new URLSearchParams()
  if (changesAt.value.from) query.set('from', changesAt.value.from)
  if (changesAt.value.before) query.set('before', changesAt.value.before)
  const text = query.toString()
  return text === '' ? '' : `?${text}`
}

async function readChanges() {
  const run = (reading += 1)
  let read: Changes
  try {
    read = (await fetch(`${CHANGES}${sinceQuery()}`).then((answer) => answer.json())) as Changes
  } catch (error) {
    read = {
      reason: `its route could not be read: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  // Le dernier relu gagne : deux `ready` rapprochés ne se répondent pas dans l'ordre.
  if (run === reading) changes.value = read
}

// Les points de départ que le CLI propose, relus à l'ouverture de la vue.
const VERSIONS = '/@crypte/versions.json'
const versions = ref<Versions | null>(null)
async function readVersions() {
  try {
    versions.value = (await fetch(VERSIONS).then((answer) => answer.json())) as Versions
  } catch {
    // Moins de points proposés : le dernier commit, les périodes et la saisie restent.
  }
}

// Les écarts, une ligne chacun, et celui que l'adresse choisit.
const differences = computed(() =>
  changes.value !== null && 'changes' in changes.value
    ? differencesOf(
        changes.value.changes,
        changes.value.tokens ?? [],
        entries.value,
        families.value,
      )
    : { tokens: [], stories: [] },
)
const difference = computed(
  () =>
    [...differences.value.tokens, ...differences.value.stories].find(
      (one) => one.key === changesAt.value.change,
    ) ?? null,
)

// Le compteur de la vue versions : rien quand les changements ne se lisent pas.
const counter = computed(() =>
  changes.value !== null && 'changes' in changes.value
    ? differences.value.tokens.length + differences.value.stories.length
    : null,
)

// La ligne d'état parle de ce qui est affiché. Sous une page, la story chargée
// dessous rend comme ailleurs, mais ni son rendu ni sa perte n'y ont leur
// place. Une page dont l'entrée a disparu reste ouverte et le dit, comme une
// story perdue : l'entrée revenue, la page revient avec elle.
const line = computed(() => {
  if (unread.value !== null) return unread.value
  if (changesOpen.value)
    return changes.value !== null && 'from' in changes.value
      ? `${counter.value} ${counter.value === 1 ? 'difference' : 'differences'} since ${sinceLabel(changes.value.from.ref)}`
      : counted(entries.value.length)
  if (noTokens.value) return 'no tokens found'
  if (tokensAt.value !== null)
    return shownCategory.value
      ? `${shownCategory.value.count} ${shownCategory.value.count === 1 ? 'token' : 'tokens'} ${shownCategory.value.name}`
      : 'the tokens on display are gone'
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

// Ce que la dernière story rendue a reçu, sous son identifiant : les panneaux ne
// le lisent que pour la story affichée, une autre ayant pu répondre entre-temps.
const rendered = shallowRef<{ id: string; values: RenderedValues } | null>(null)
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
  () => component.value === null && tokensAt.value === null && !changesOpen.value,
)
const fullScreen = computed(() => full.value && storyMode.value)

// La vue stories sans story : un guide à la place du canvas. Pas quand un fichier
// a été écarté, que son encadré nomme : le dossier n'est alors pas en cause.
const noStory = computed(
  () =>
    read.value &&
    view.value === 'stories' &&
    entries.value.length === 0 &&
    skipped.value.length === 0,
)
// L'exemple suit la racine déclarée : `src/stories` remonte d'un dossier de plus
// que `stories`, et un import écrit pour l'une ne résout pas depuis l'autre.
const storiesRoot = computed(() => (project.value?.stories ?? 'stories').replace(/^\.\/|\/$/g, ''))
const snippet = computed(
  () => `import { defineStories } from '@crypte/react'
import { Badge } from '${'../'.repeat(storiesRoot.value.split('/').length + 1)}src/components/ui/Badge'

export default defineStories(Badge)`,
)

const TOKENS_SNIPPET = `:root {
  --color-accent: #009488;
  --space-2: 8px;
}`

// Sous 1180 px, la colonne des panneaux sort de la grille et s'ouvre par-dessus
// le canvas, depuis un bouton de la barre d'outils qui en dit le nombre.
const panelsOpen = ref(false)
const panelCount = ref(0)
// Les plugins en échec ou refusés : repliée, la colonne cache leur encadré, et le
// bouton le dit à sa place.
const panelTroubles = ref(0)

// Un réglage de vue, pas un lieu qu'on partage : hors de l'adresse.
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const zoom = ref(1)
const zoomMenu = ref(false)

// Non modal, le menu laisse passer Tab : fermé à ce moment, sinon le focus filait
// dans l'iframe de la preview et le menu restait ouvert par-dessus. Revue de #156.
// Ouvert, le menu se pose sur le niveau courant plutôt que sur le premier : un
// lecteur d'écran annonce ce qui est choisi. Après le focus que Reka pose
// lui-même sur le premier article.
function focusLevel() {
  setTimeout(() =>
    document.querySelector<HTMLElement>('.shell-menu [aria-checked="true"]')?.focus(),
  )
}

function zoomBy(step: number) {
  const at = ZOOMS.indexOf(zoom.value) + step
  zoom.value = ZOOMS[Math.min(Math.max(at, 0), ZOOMS.length - 1)]!
}

// Sur la racine du document de la preview, de même origine : le cadre garde sa
// taille et la story se met en page à l'échelle. Reposé à chaque `ready`, une
// page rechargée repartant à 1.
function applyZoom() {
  const root = frame.value?.contentDocument?.documentElement
  if (root) root.style.zoom = zoom.value === 1 ? '' : String(zoom.value)
}
watch(zoom, applyZoom)

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
// Une famille ouvre sa catégorie, sous l'adresse de la vue tokens.
function show(id: string, trace: Trace = 'replace') {
  const category = categoryOf(id)
  if (category !== undefined) return openTokens(category, undefined, trace)
  if (trace === 'push') stale.value = null
  closeChanges()
  component.value = null
  tokensAt.value = null
  select(id)
  write(placeSearch({ mode: 'entry', id }), trace)
}

function openTokens(category: string, token?: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  closeChanges()
  component.value = null
  tokensAt.value = token === undefined ? { category } : { category, token }
  write(
    placeSearch(
      token === undefined ? { mode: 'tokens', category } : { mode: 'tokens', category, token },
    ),
    trace,
  )
}

// Sous la page, la preview charge une story du composant, si elle n'en montre
// pas déjà une : c'est elle qui retrouve le composant après un renommage, par son
// fichier et son rang.
function open(id: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  closeChanges()
  component.value = id
  tokensAt.value = null
  const stories = ofComponent(id, entries.value)
  if (stories[0] && !stories.some((entry) => entry.id === current.value)) select(stories[0].id)
  write(placeSearch({ mode: 'component', id }), trace)
}

// Relus à l'ouverture et au retour sur la fenêtre : un commit ne touche aucun
// fichier que Vite surveille, donc aucun `ready` ne les aurait relus.
function openChanges(trace: Trace = 'push', at: Since & { change?: string } = {}) {
  if (trace === 'push') stale.value = null
  full.value = false
  changesAt.value = at
  void readChanges()
  void readVersions()
  changesOpen.value = true
  component.value = null
  tokensAt.value = null
  write(placeSearch({ mode: 'changes', ...at }), trace)
}

// Quittée, la vue oublie son point de départ : l'entrée de l'activity bar mène au
// dernier commit, et son compteur comptait encore depuis le point d'avant.
function closeChanges() {
  if (!changesOpen.value) return
  changesOpen.value = false
  const moved = changesAt.value.from !== undefined || changesAt.value.before !== undefined
  changesAt.value = {}
  if (moved) void readChanges()
}

// Un écart choisi : la même comparaison, sans la relire.
function selectChange(key: string) {
  changesAt.value = { ...changesAt.value, change: key }
  write(placeSearch({ mode: 'changes', ...changesAt.value }), 'push')
}

// La vue de l'activity bar, déduite de ce qui est affiché : une page composant est
// de la vue stories, une famille de la vue tokens, les changements de la vue versions.
const view = computed<View>(() =>
  changesOpen.value ? 'versions' : tokensAt.value !== null ? 'tokens' : 'stories',
)

// Où mène chaque entrée : la story chargée, la catégorie ouverte ou la première,
// les changements. Sans aucun token, la vue tokens reste atteignable : elle dit
// comment en déclarer.
const firstCategory = () => tokensAt.value?.category ?? categories.value[0]?.name ?? 'color'
const noTokens = computed(
  () => read.value && tokensAt.value !== null && categories.value.length === 0,
)
const hrefs = computed<Record<View, string | null>>(() => {
  const tokens = firstCategory()
  return {
    stories:
      current.value === null
        ? window.location.pathname
        : placeSearch({ mode: 'entry', id: current.value }),
    tokens: placeSearch({ mode: 'tokens', category: tokens }),
    versions: placeSearch({ mode: 'changes' }),
  }
})

function go(to: View, event: MouseEvent) {
  follow(event, () => {
    if (to === 'versions') openChanges()
    const tokens = firstCategory()
    if (to === 'tokens') openTokens(tokens)
    if (to !== 'stories') return
    if (current.value !== null) show(current.value, 'push')
    else {
      closeChanges()
      tokensAt.value = null
      component.value = null
      // Le chemin seul : une adresse vide laisserait la requête en place.
      write(window.location.pathname, 'push')
    }
  })
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
const paletteShortcuts = mac ? 'Meta+K /' : 'Control+K /'

// Celles de la barre d'outils et la recherche, quand elles s'appliquent, avec leur
// raccourci : la palette est l'endroit où ils se lisent.
const { theme, toggle: toggleTheme } = useTheme()

const themeLabel = computed(() => (theme.value === 'dark' ? 'Light theme' : 'Dark theme'))

const actions = computed<Action[]>(() => [
  { label: themeLabel.value, keys: 'T', run: toggleTheme },
  ...(storyMode.value && displayed.value !== null
    ? [
        { label: 'Copy link', run: () => void copyLink() },
        {
          label: full.value ? 'Leave full screen' : 'Full screen',
          keys: 'F',
          run: () => (full.value = !full.value),
        },
        { label: 'Zoom in', keys: '+', run: () => zoomBy(1) },
        { label: 'Zoom out', keys: '-', run: () => zoomBy(-1) },
        { label: 'Actual size', keys: '0', run: () => (zoom.value = 1) },
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
  // La palette et le menu de zoom répondent seuls à leurs touches : Échap les
  // ferme sans quitter le plein écran dessous. Le menu laisse passer les touches
  // du zoom, que son pied annonce ; le reste, f compris, lui revient.
  if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
  if (event.target instanceof Element && event.target.closest('[role="menu"]')) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === '+' || event.key === '=') zoomBy(1)
    if (event.key === '-') zoomBy(-1)
    if (event.key === '0') zoom.value = 1
    return
  }
  if (event.key === 'Escape') {
    full.value = false
    panelsOpen.value = false
    return
  }
  if (event.metaKey) return
  if (event.ctrlKey) return
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]'))
    return
  // Alt+F ouvre le menu Fichier sous Windows : `f` et `/` se tapent sans modification.
  const plain = !event.altKey
  // La palette est la recherche : `/` l'ouvre, comme le bouton de l'activity bar.
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
  if (displayed.value === null || !plain) return
  if (event.key === 'f') full.value = !full.value
  if (event.key === '+' || event.key === '=') zoomBy(1)
  if (event.key === '-') zoomBy(-1)
  if (event.key === '0') zoom.value = 1
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
    const category = categoryOf(id)
    if (category !== undefined) tokensAt.value = { category }
  }
  if (arrival.mode === 'tokens')
    tokensAt.value =
      arrival.token === undefined
        ? { category: arrival.category }
        : { category: arrival.category, token: arrival.token }
  if (arrival.mode === 'component') {
    const [first] = ofComponent(arrival.id, stories)
    if (first) [opening, shown] = [arrival.id, first]
  }
  if (arrival.mode === 'changes') {
    const { mode: _, ...at } = arrival
    if (!changesOpen.value) openChanges('none', at)
  }
  if (arrival.mode === 'entry' && !shown && tokensAt.value === null) stale.value = arrival.id
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
  } else if (tokensAt.value !== null || changesOpen.value) select(next.id)
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
  if (place.mode === 'tokens') openTokens(place.category, place.token, 'none')
  if (place.mode === 'changes') {
    const { mode: _, ...at } = place
    openChanges('none', at)
  }
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
        applyZoom()
        void refresh()
      }
      if (message.type === 'rendered') {
        failure.value = null
        firstRender.value ??= performance.now()
        rendered.value = { id: message.id, values: message.values }
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
    <div v-show="!fullScreen" class="activity-column">
      <ActivityBar
        :current="view"
        :hrefs="hrefs"
        :counter="counter"
        :search-keys="paletteKeys"
        :search-shortcuts="paletteShortcuts"
        :theme-label="themeLabel"
        @go="go"
        @search="palette = true"
        @theme="toggleTheme"
      />
    </div>
    <div v-show="!fullScreen" class="nav-column">
      <div class="sidebar">
        <CategoryList
          v-if="view === 'tokens'"
          :categories="categories"
          :current="tokensAt?.category ?? null"
          :href-of="(category) => placeSearch({ mode: 'tokens', category })"
          @pick="(category, event) => follow(event, () => openTokens(category))"
        />
        <VersionsSidebar
          v-else-if="view === 'versions'"
          :since="changesAt"
          :versions="versions"
          :tokens="differences.tokens"
          :stories="differences.stories"
          :selected="changesAt.change ?? null"
          :href-of="(key) => placeSearch({ mode: 'changes', ...changesAt, change: key })"
          @since="(since) => openChanges('push', since)"
          @select="(key, event) => follow(event, () => selectChange(key))"
        />
        <StoryTree
          v-else
          :entries="entries"
          :current="changesOpen ? null : current"
          :component="component"
          label="Stories"
          none="no story"
          @show="(id) => show(id, 'push')"
          @open="(id) => open(id)"
        />
      </div>
    </div>

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
          <Button
            class="panels-toggle"
            aria-controls="panels"
            :aria-expanded="panelsOpen"
            @click="panelsOpen = !panelsOpen"
          >
            Panels
            <span v-if="panelCount > 0" class="count">{{ panelCount }}</span>
            <span
              v-if="panelTroubles + pluginErrors.length > 0"
              class="trouble"
              role="img"
              aria-label="a plugin failed"
            />
          </Button>
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link' }}
          </Button>
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

          <div v-if="noStory" class="empty">
            <EmptyGuide
              :title="project ? `No story in ${project.stories}/` : 'No story found'"
              :path="project ? `${project.stories}/` : null"
              rule="A story file carries the exact name of its component, and the tree follows its path. The folder is the stories of crypte.config.ts."
              :mapping="`src/components/ui/Badge.tsx  >  ${storiesRoot}/ui/Badge.ts`"
              :snippet="snippet"
              note="When every prop is optional, a story named Default is generated. Name the file .tsx when a children prop needs markup."
              outcome="The file appears and its story renders, without a restart."
            />
          </div>

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

          <div v-if="noTokens" class="empty">
            <EmptyGuide
              title="No token found"
              :path="null"
              rule="Crypte reads the custom properties of the style sheet declared as css in crypte.config.ts, and groups them by category."
              mapping="src/styles.css  >  tokens / color, space…"
              :snippet="TOKENS_SNIPPET"
              note='A dark theme goes under [data-theme="dark"] or prefers-color-scheme: dark, and light-dark() works too.'
              outcome="The tokens appear, grouped by category."
            />
          </div>
          <TokensView
            v-else-if="shownCategory"
            :category="shownCategory"
            :theme="theme"
            :selected="tokensAt?.token ?? null"
            :href-of="
              (token) => placeSearch({ mode: 'tokens', category: shownCategory!.name, token })
            "
            @select="(token, event) => follow(event, () => openTokens(shownCategory!.name, token))"
          />

          <VersionsView
            v-if="changesOpen"
            :changes="changes"
            :difference="difference"
            :count="counter ?? 0"
            :stories="entries"
            :href-of-story="(id) => placeSearch({ mode: 'entry', id })"
            :href-of-component="(id) => placeSearch({ mode: 'component', id })"
            @story="(id, event) => follow(event, () => show(id, 'push'))"
            @component="(id, event) => follow(event, () => open(id))"
          />

          <ComponentPage
            v-if="component !== null"
            :stories="componentStories"
            @show="(id) => show(id, 'push')"
          />

          <!-- Masqué et non retiré : la preview et les panneaux gardent leur état
           pendant qu'une page composant ou une famille est ouverte. -->
          <div
            v-show="component === null && tokensAt === null && !changesOpen && !noStory"
            class="canvas"
          >
            <!-- Sur la scène, ce qui agit sur elle : l'échelle et le plein écran,
                 qu'on quitte d'ici puisque la barre d'outils part avec lui. -->
            <div v-if="displayed" class="stage-tools">
              <!-- Non modal, et téléporté dans les outils de la scène : modal, Reka
                   masquait tout le shell aux lecteurs d'écran, et dans le corps de la page
                   le menu était hors de tout repère. Mesuré par le cas axe. -->
              <DropdownMenuRoot
                v-model:open="zoomMenu"
                :modal="false"
                @update:open="(open) => open && focusLevel()"
              >
                <!-- Pas de tooltip : le menu rend le focus à son bouton, en focus visible,
                     et le tooltip revenait après chaque choix. Ses touches sont dites au
                     pied du menu. -->
                <DropdownMenuTrigger as-child>
                  <Button class="level" :aria-label="`Zoom, ${Math.round(zoom * 100)} %`">
                    {{ Math.round(zoom * 100) }} %
                    <Icon :icon="ArrowDown01Icon" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal to=".stage-tools">
                  <DropdownMenuContent
                    class="shell-menu"
                    align="end"
                    :side-offset="4"
                    aria-describedby="zoom-keys"
                    @keydown.tab="zoomMenu = false"
                  >
                    <DropdownMenuRadioGroup
                      :model-value="String(zoom)"
                      @update:model-value="(level) => (zoom = Number(level))"
                    >
                      <DropdownMenuRadioItem
                        v-for="level of ZOOMS"
                        :key="level"
                        :value="String(level)"
                        class="shell-menu-item"
                      >
                        {{ level * 100 }} %
                        <DropdownMenuItemIndicator class="shell-menu-check">
                          <Icon :icon="Tick02Icon" />
                        </DropdownMenuItemIndicator>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator class="shell-menu-separator" />
                    <!-- Hors de l'arbre ARIA, où un paragraphe n'est pas un enfant valide
                         d'un menu : il le décrit par son id. -->
                    <p id="zoom-keys" class="shell-menu-hint" aria-hidden="true">
                      <kbd>+</kbd> <kbd>-</kbd> to step, <kbd>0</kbd> for 100 %
                    </p>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <Tooltip :content="full ? 'Leave full screen' : 'Full screen'" keys="F">
                <Button
                  class="square"
                  :aria-label="full ? 'Leave full screen' : 'Full screen'"
                  aria-keyshortcuts="f"
                  :aria-pressed="full"
                  @click="full = !full"
                >
                  <Icon :icon="FullScreenIcon" />
                </Button>
              </Tooltip>
            </div>
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
        <aside
          v-show="!fullScreen && storyMode && !noStory"
          id="panels"
          class="panel-column"
          :data-open="panelsOpen || undefined"
          aria-label="Panels"
        >
          <h2 class="column-title">Panels</h2>
          <Panels
            :entry="displayed"
            :received="received"
            :failed="failure?.message ?? null"
            :values="rendered && rendered.id === displayed?.id ? rendered.values : null"
            :revision="revision"
            :errors="pluginErrors"
            @overrides="edit"
            @send="sendToPreview"
            @weights="(measured) => (weights = measured)"
            @count="(count, troubles) => ((panelCount = count), (panelTroubles = troubles))"
          />
        </aside>
        <!-- Toujours en place, même sous 1180 px : le canvas d'une catégorie se lit à
             côté de son panneau, et aucune barre d'outils n'y porterait le bouton. -->
        <aside
          v-if="view === 'tokens' && !noTokens && !fullScreen"
          class="panel-column"
          aria-label="Token panel"
        >
          <h2 class="column-title">Panels</h2>
          <TokenPanel
            :token="selectedToken"
            :categories="categories"
            :stories="entries"
            :href-of-token="(category, token) => placeSearch({ mode: 'tokens', category, token })"
            :href-of-component="(id) => placeSearch({ mode: 'component', id })"
            @token="(category, token, event) => follow(event, () => openTokens(category, token))"
            @component="(id, event) => follow(event, () => open(id))"
          />
        </aside>
      </div>
    </div>
    <footer class="status-bar">
      <span class="dot" :data-failed="trouble || undefined" aria-hidden="true" />
      <p>{{ line }}</p>
      <!-- Focusables, pour que le clavier lise leur tooltip comme la souris. -->
      <Tooltip
        v-if="firstRender !== null"
        content="From opening this page to the first story rendered"
      >
        <span class="render" tabindex="0">First render {{ Math.round(firstRender) }} ms</span>
      </Tooltip>
      <span v-if="project" class="version">Crypte {{ project.version }}</span>
      <ul class="figures">
        <li v-if="project">
          <Tooltip content="The shell, gzipped">
            <span tabindex="0">Shell {{ kB(project.shellBytes) }}</span>
          </Tooltip>
        </li>
        <li v-if="weights.length > 0">
          <Tooltip :content="weights.map((one) => `${one.plugin} ${kB(one.bytes)}`).join('\n')">
            <span tabindex="0">
              {{ weights.length }} {{ weights.length === 1 ? 'plugin' : 'plugins' }}
            </span>
          </Tooltip>
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
/* L'activity bar, puis la sidebar et l'espace de travail, chacun posé sur le fond
   de la page avec 4 px autour. */
.activity-column {
  box-sizing: border-box;
  min-height: 0;
  padding: var(--space-1) 0 var(--space-1) var(--space-1);
}

.nav-column {
  box-sizing: border-box;
  display: flex;
  min-height: 0;
  padding: var(--space-1) var(--space-1) 0;
}

.sidebar {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  /* A real border, not the inset shadow of the components: the backgrounds of
     its children would cover it. */
  border: var(--stroke-hairline) solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--background-raised);
  overflow: hidden;
}

/* La fenêtre entière : l'activity bar, la sidebar, l'espace de travail, et la barre
   d'état en bas sur toute la largeur. Chaque zone défile seule. */
main {
  display: grid;
  grid-template-columns: 56px 267px 1fr;
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

.body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Le bouton des panneaux n'existe que sous le seuil où ils sortent de la grille. */
.actions .panels-toggle {
  display: none;
}

.actions .panels-toggle[aria-expanded='true'] {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--accent-base);
  background: var(--background-current);
  color: var(--text-current);
}

.panels-toggle .trouble {
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-full);
  background: var(--error-solid);
}

.panels-toggle .count {
  padding: 0 var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--accent-base);
  color: var(--text-inverse);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* Sous 1180 px, la colonne quitte la grille : le canvas garde sa largeur, et elle
   s'ouvre par-dessus, à droite, sans voile. 1280 tient encore en entier. */
@media (max-width: 1179px) {
  .actions .panels-toggle {
    display: inline-flex;
  }

  #panels {
    position: absolute;
    inset-block: 0;
    right: 0;
    z-index: 1;
    display: none;
    box-shadow: 0 0 24px rgb(0 0 0 / 0.16);
  }

  #panels[data-open] {
    display: block;
  }
}

.stage-tools {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: flex;
  gap: var(--space-1);
}

.stage-tools .level {
  min-width: 72px;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}

/* Le bouton icône md de Figma : 28 × 28. */
.stage-tools .square {
  padding: var(--space-1) var(--space-1-5);
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

.stage > .tokens-view {
  margin: 0;
}

.canvas {
  position: relative;
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
.stale {
  margin-bottom: var(--space-3);
}

/* Le guide au centre de la scène, à la place du canvas. */
.empty {
  display: flex;
  flex: 1;
  padding: var(--space-6) var(--space-3);
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
  background: var(--background-subtle);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.status-bar p {
  margin: 0;
}

.status-bar [tabindex]:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-hairline);
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

<!-- Not scoped: the zoom menu is teleported out of this template, into the stage
     tools, through components whose root the scope attribute does not reach, so a
     scoped rule never matched it. Measured in Chromium. -->
<style>
.shell-menu {
  z-index: 10;
  min-width: 120px;
  padding: var(--space-1);
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--stone-950) 14%, transparent);
  background: var(--background-raised);
  font-family: var(--font-sans);
}

.shell-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  cursor: pointer;
  outline: none;
}

.shell-menu-item[data-highlighted] {
  background: var(--background-current);
  color: var(--text-current);
}

.shell-menu-separator {
  height: var(--stroke-hairline);
  margin: var(--space-1) 0;
  background: var(--border-light);
}

.shell-menu-hint {
  margin: 0;
  padding: var(--space-1) var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* The keycap of the Figma file. */
.shell-menu-hint kbd {
  padding: var(--space-0-5) var(--space-1);
  border-radius: var(--radius-xs);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-subtle);
  font-family: var(--font-mono);
}

.shell-menu-check {
  display: flex;
}
</style>
