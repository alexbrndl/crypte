<script setup lang="ts">
import { plural } from './plural'
import type {
  Manifest,
  Overrides,
  RenderedValues,
  ShellMessage,
  SkippedFile,
  StoryEntry,
  Theme,
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
import Panels, { type LoadedView } from './panels/panels.vue'
import { landing, unreadable, type Shown } from './navigation/recover'
import { CHANGES, type Changes } from './pages/changes'
import { differencesOf, sinceLabel } from './versions/differences'
import VersionsSidebar, { type Since, type Versions } from './versions/versions-sidebar.vue'
import VersionsView from './versions/versions-view.vue'
import HealthSidebar from './health/health-sidebar.vue'
import HealthView from './health/health-view.vue'
import HealthPanel from './health/health-panel.vue'
import HealthAccessibility from './health/health-accessibility.vue'
import HealthFailures from './health/health-failures.vue'
import { audit, failuresOf, findingsOf, type AuditResult } from './health/audit'
import {
  gaugesOf,
  keyOf,
  PAGES,
  rowsOf,
  scoreOf,
  todoOf,
  type Health,
  type HealthPage,
} from './health/health'
import { promptOf } from './health/prompt'
import { suspectsOf } from './health/suspects'
import { useCopy } from './clipboard'
import CommandPalette, { type Action } from './navigation/command-palette.vue'
import { useRecent } from './navigation/recent'
import ComponentPage from './pages/component-page.vue'
import EmptyGuide from './pages/empty-guide.vue'
import {
  AiContentGenerator01Icon,
  ArrowDown01Icon,
  ContrastIcon,
  Copy01Icon,
  FullScreenIcon,
  PanelRightIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import ActivityBar, { type BuiltIn, type View } from './navigation/activity-bar.vue'
import Icon from './ui/icon.vue'
import ColumnTitle from './ui/column-title.vue'
import EmptyNote from './ui/empty-note.vue'
import ViewCanvas from './ui/view-canvas.vue'
import PanelSection from './panels/panel-section.vue'
import { keep, kept } from './storage'
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
// La seconde preview de la comparaison light et dark, la première passant en light.
const frameDark = useTemplateRef<HTMLIFrameElement>('frameDark')
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

// La vue santé : la page ouverte, et le composant choisi dedans, ou `null`. Comme
// une page composant, elle laisse la preview et les panneaux chargés dessous.
// Ses données sont relues à l'ouverture, à chaque `ready`, qui suit un catalogue
// changé, et au retour sur la fenêtre : un composant sans story est hors du
// catalogue, et rien ne surveille son fichier. `null` avant la première lecture,
// `failed` quand la route ne répond pas, ce qui n'est pas un dossier absent.
const healthAt = ref<{ page: HealthPage; item?: string } | null>(null)

// La vue d'un plugin ouverte, son nom et l'élément choisi, ou `null`. Ses
// composants arrivent avec la liste des plugins : avant, la vue ouverte ne
// dessine rien.
const viewAt = ref<{ plugin: string; item?: string } | null>(null)
const views = shallowRef<LoadedView[]>([])
const shownView = computed(
  () => views.value.find((one) => one.name === viewAt.value?.plugin) ?? null,
)
// Le repli du panneau d'une vue, retenu par plugin sous sa propre clé : celle
// de son panneau des stories est `crypte:panel:<nom>`.
const viewFolds = ref<Record<string, boolean>>({})
const viewPanelKey = () => `crypte:panel:view:${viewAt.value?.plugin}`
const viewPanelOpen = computed(
  () => viewFolds.value[viewAt.value?.plugin ?? ''] ?? kept(viewPanelKey()) !== false,
)
function toggleViewPanel() {
  const next = !viewPanelOpen.value
  viewFolds.value = { ...viewFolds.value, [viewAt.value?.plugin ?? '']: next }
  keep(viewPanelKey(), next ? undefined : false)
}
const HEALTH = '/@crypte/health.json'
const health = ref<Health | 'failed' | null>(null)
async function readHealth() {
  try {
    health.value = (await fetch(HEALTH).then((answer) => answer.json())) as Health
  } catch {
    health.value = 'failed'
  }
}
// Les composants lus, ou `null` sans dossier déclaré, ou `undefined` sans lecture.
const listedHealth = computed(() =>
  health.value === null || health.value === 'failed' ? undefined : health.value.components,
)
const healthItem = computed(
  () => listedHealth.value?.find((one) => keyOf(one) === healthAt.value?.item) ?? null,
)
// Une page que l'adresse nomme et que la vue n'a pas mène à la vue d'ensemble.
const pageOf = (page: string): HealthPage =>
  PAGES.find((one) => one.page === page)?.page ?? 'overview'
const shownCategory = computed(
  () => categories.value.find((one) => one.name === tokensAt.value?.category) ?? null,
)

// Où mène un token par son nom, depuis un autre panneau : la catégorie qui le
// porte, ou rien s'il n'est dans aucune.
const categoryOfToken = (name: string) =>
  categories.value.find((one) =>
    one.groups.some((group) => group.tokens.some((token) => token.name === name)),
  )?.name
const tokenHref = (name: string) => {
  const category = categoryOfToken(name)
  return category ? placeSearch({ mode: 'tokens', category, token: name }) : null
}
function openToken(name: string) {
  const category = categoryOfToken(name)
  if (category) openTokens(category, name)
}

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

// Ce qui est ouvert, sous la clé de sa commande dans la palette, qui le propose
// parmi les récents une fois quitté, et le tait tant qu'on y est. Une catégorie
// de tokens sans token choisi n'y a pas de commande : seule la famille du token
// choisi entre.
const { visits, remember } = useRecent()
const here = computed(() => {
  if (healthAt.value !== null) return null
  if (changesOpen.value) return 'changes'
  if (tokensAt.value !== null) {
    const name = tokensAt.value.token
    return (
      shownCategory.value?.groups.find((group) => group.tokens.some((one) => one.name === name))
        ?.id ?? null
    )
  }
  if (component.value !== null) return `component:${component.value}`
  return current.value
})
watch(here, (_, left) => {
  if (left !== null) remember(left)
})

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
      ? `${plural(counter.value ?? 0, 'difference')} since ${sinceLabel(changes.value.from.ref)}`
      : counted(entries.value.length)
  if (healthAt.value !== null) {
    if (health.value === null) return 'reading the health of the components'
    if (health.value === 'failed') return 'the health of the components could not be read'
    const listed = health.value.components
    if (!listed) return 'no components folder declared'
    if (auditing.value)
      return `auditing the stories, ${auditing.value.done} of ${auditing.value.total} renders`
    if (healthAt.value.page === 'accessibility' && auditResults.value && auditTook.value !== null)
      return `audit of ${auditResults.value.length / 2} stories in ${(auditTook.value / 1000).toFixed(1)} s`
    const covered = listed.filter((one) => one.stories.length > 0).length
    return `${plural(listed.length, 'component')}, ${covered} with a story`
  }
  if (noTokens.value) return 'no tokens found'
  if (tokensAt.value !== null)
    return shownCategory.value
      ? `${plural(shownCategory.value.count, 'token')} ${shownCategory.value.name}, ${theme.value} theme`
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

const counted = (n: number) => plural(n, 'story', 'stories')

// Les chiffres de la barre d'état, mesurés et jamais estimés. Le premier rendu
// court de l'ouverture de la page à la première story rendue : au premier
// chargement après `crypte dev`, il comprend la compilation de Vite.
const weights = shallowRef<{ plugin: string; bytes: number }[]>([])

// L'audit d'accessibilité de la vue santé, dans une preview cachée montée le
// temps de l'audit. Ses résultats durent la session : relancé à la demande, il
// rend chaque story deux fois.
const auditFrame = useTemplateRef<HTMLIFrameElement>('auditFrame')
const auditing = ref<{ done: number; total: number } | null>(null)
const auditResults = shallowRef<AuditResult[] | null>(null)
const auditTook = ref<number | null>(null)
// Pourquoi le dernier audit n'a pas tourné, dit sur sa page : un clic sans suite
// ne dirait rien.
const auditFailed = ref<string | null>(null)
const findings = computed(() => (auditResults.value ? findingsOf(auditResults.value) : null))
const a11yPlugin = computed(() => weights.value.some((one) => one.plugin === 'a11y'))
const selectedFinding = computed(
  () => findings.value?.find((one) => one.key === healthAt.value?.item) ?? null,
)

// Les tokens dont la valeur est une couleur que la violation choisie a mesurée.
const suspects = computed(() =>
  selectedFinding.value ? suspectsOf(selectedFinding.value, categories.value, entries.value) : [],
)

const failures = computed(() => (auditResults.value ? failuresOf(auditResults.value) : null))
const selectedFailure = computed(
  () => failures.value?.find((one) => one.key === healthAt.value?.item) ?? null,
)
// Le nombre de choses à faire, le badge de Santé dans l'activity bar.
const todo = computed(() => todoOf(listedHealth.value ?? null, auditResults.value))
// Le prompt de tout ce qui reste, copié depuis la barre d'outils de Santé ; vide,
// le bouton se désactive. Une liste qui change oublie la copie.
const healthPrompt = computed(() =>
  promptOf(
    {
      failures: failures.value ?? [],
      findings: findings.value ?? [],
      unstoried: rowsOf('unstoried', listedHealth.value ?? []),
    },
    entries.value,
  ),
)
const { copied: promptCopied, copy: copyPrompt } = useCopy()
watch(healthPrompt, () => (promptCopied.value = null))
// Le score qui remplit le cœur de Santé, `null` sans dossier de composants.
const healthScore = computed(() =>
  listedHealth.value ? scoreOf(gaugesOf(listedHealth.value, auditResults.value)) : null,
)

const firstRender = ref<number | null>(null)

// Lancé une fois, en arrière-plan, quand la preview a répondu à son premier rendu,
// qu'il ait abouti ou levé, et que la liste des plugins est lue ou a échoué :
// sans elle, l'audit ne saurait pas s'il doit attendre le plugin a11y. Arrêté si
// le shell est démonté.
const pluginsRead = ref(false)
const previewAnswered = ref(false)
let auditStarted = false
let auditStop: AbortController | null = null
watch(
  () => previewAnswered.value && pluginsRead.value && entries.value.length > 0,
  (ready) => {
    if (!ready || auditStarted) return
    auditStarted = true
    void runAudit()
  },
)
onBeforeUnmount(() => auditStop?.abort())

async function runAudit() {
  if (auditing.value !== null) return
  const ids = entries.value.map((entry) => entry.id)
  auditing.value = { done: 0, total: ids.length * 2 }
  auditFailed.value = null
  auditStop = new AbortController()
  const { signal } = auditStop
  await nextTick()
  const started = performance.now()
  try {
    const results = await audit(auditFrame.value!, ids, {
      a11y: a11yPlugin.value,
      signal,
      progress: (done) => (auditing.value = { done, total: ids.length * 2 }),
    })
    if (signal.aborted) return
    auditResults.value = results
    auditTook.value = performance.now() - started
  } catch (error) {
    auditTook.value = null
    auditFailed.value = error instanceof Error ? error.message : String(error)
  } finally {
    auditing.value = null
  }
}

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
  void readHealth()
}

// Le catalogue lu au moins une fois, pour ne pas dire « aucune story » avant.
const read = ref(false)

// L'adresse d'arrivée, quand elle nomme ce que le catalogue ne porte plus. Dite
// jusqu'à la prochaine navigation.
const stale = ref<string | null>(null)

// Le plein écran : la preview seule, sans navigation ni panneaux.
const full = ref(false)
const storyMode = computed(
  () =>
    component.value === null &&
    tokensAt.value === null &&
    healthAt.value === null &&
    viewAt.value === null &&
    !changesOpen.value,
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

const COMPONENTS_SNIPPET = `export default defineConfig({
  stories: 'stories',
  components: 'src/components',
})`

const TOKENS_SNIPPET = `:root {
  --color-accent: #009488;
  --space-2: 8px;
}`

// La colonne de droite, panneaux ou panneau du token : ouverte dans la grille
// au-dessus de 1180 px, fermée en dessous, où elle s'ouvre par-dessus le canvas.
// Passer le seuil rend l'état de son côté ; le bouton de la barre d'outils la
// bascule à toute largeur.
const wide = window.matchMedia('(min-width: 1180px)')

// Ouverte, l'icône remplit sa colonne de droite : le jeu gratuit d'Hugeicons n'a
// pas de variante pleine, ce tracé s'ajoute aux deux de panel-right.
const PanelRightOpenIcon = [
  ...PanelRightIcon,
  [
    'path',
    {
      d: 'M15 3H13C16.7712 3 18.6569 3 19.8284 4.17157C21 5.34315 21 7.22876 21 11V13C21 16.7712 21 18.6569 19.8284 19.8284C18.6569 21 16.7712 21 13 21H15Z',
      fill: 'currentColor',
      key: 'open',
    },
  ],
] as typeof PanelRightIcon
const panelsOpen = ref(wide.matches)

// Le plein écran part sans panneaux, que la bascule rouvre ; le quitter rend
// l'état d'avant, que le seuil met à jour en attendant.
let beforeFull = panelsOpen.value
const fit = (event: MediaQueryListEvent) => {
  if (fullScreen.value) beforeFull = event.matches
  else panelsOpen.value = event.matches
}
wide.addEventListener('change', fit)
onBeforeUnmount(() => wide.removeEventListener('change', fit))
watch(fullScreen, (now) => {
  if (now) {
    beforeFull = panelsOpen.value
    panelsOpen.value = false
  } else panelsOpen.value = beforeFull
})
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
  for (const one of [frame.value, frameDark.value]) {
    const root = one?.contentDocument?.documentElement
    if (root) root.style.zoom = zoom.value === 1 ? '' : String(zoom.value)
  }
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

// Les valeurs de tokens essayées, par nom, envoyées avec chaque rendu jusqu'à
// leur effacement : rien n'est écrit dans un fichier. Une copie simple : un
// proxy réactif ne passe pas `postMessage`.
const tried = ref<Record<string, string>>({})
const triedTokens = () =>
  Object.keys(tried.value).length > 0 ? { tokens: { ...tried.value } } : {}

function tryToken(name: string, value: string | null) {
  const { [name]: _, ...rest } = tried.value
  tried.value = value ? { ...rest, [name]: value } : rest
  if (current.value !== null) select(current.value)
}

// La story que la preview rend, sans changer de page.
function select(id: string) {
  if (id !== current.value) overrides.value = {}
  current.value = id
  shown = entries.value.find((entry) => entry.id === id) ?? shown
  failure.value = null
  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  if (ready)
    channel?.send({
      type: 'render',
      id,
      overrides: overrides.value,
      theme: mainTheme.value,
      ...triedTokens(),
    })
  renderDark()
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
  healthAt.value = null
  viewAt.value = null
  select(id)
  write(placeSearch({ mode: 'entry', id }), trace)
}

function openTokens(category: string, token?: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  closeChanges()
  component.value = null
  healthAt.value = null
  viewAt.value = null
  tokensAt.value = token === undefined ? { category } : { category, token }
  write(
    placeSearch(
      token === undefined ? { mode: 'tokens', category } : { mode: 'tokens', category, token },
    ),
    trace,
  )
}

function openHealth(page: HealthPage, item?: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  closeChanges()
  component.value = null
  tokensAt.value = null
  viewAt.value = null
  if (healthAt.value === null) void readHealth()
  healthAt.value = item === undefined ? { page } : { page, item }
  write(
    placeSearch(item === undefined ? { mode: 'health', page } : { mode: 'health', page, item }),
    trace,
  )
}

function openView(plugin: string, item?: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  closeChanges()
  component.value = null
  tokensAt.value = null
  healthAt.value = null
  viewAt.value = item === undefined ? { plugin } : { plugin, item }
  write(
    placeSearch(item === undefined ? { mode: 'view', plugin } : { mode: 'view', plugin, item }),
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
  healthAt.value = null
  viewAt.value = null
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
  healthAt.value = null
  viewAt.value = null
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
  viewAt.value !== null
    ? `view:${viewAt.value.plugin}`
    : healthAt.value !== null
      ? 'health'
      : changesOpen.value
        ? 'versions'
        : tokensAt.value !== null
          ? 'tokens'
          : 'stories',
)

// Où mène chaque entrée : la story chargée, la catégorie ouverte ou la première,
// les changements. Sans aucun token, la vue tokens reste atteignable : elle dit
// comment en déclarer.
const firstCategory = () => tokensAt.value?.category ?? categories.value[0]?.name ?? 'color'
const noTokens = computed(
  () => read.value && tokensAt.value !== null && categories.value.length === 0,
)
const hrefs = computed<Record<BuiltIn, string | null>>(() => {
  const tokens = firstCategory()
  return {
    stories:
      current.value === null
        ? window.location.pathname
        : placeSearch({ mode: 'entry', id: current.value }),
    tokens: placeSearch({ mode: 'tokens', category: tokens }),
    health: placeSearch({ mode: 'health', page: healthAt.value?.page ?? 'overview' }),
    versions: placeSearch({ mode: 'changes' }),
  }
})

// Les vues des plugins, sous un séparateur après versions.
const pluginViews = computed(() =>
  views.value.map((one) => ({
    name: one.name,
    label: one.label,
    icon: one.icon,
    href: placeSearch({ mode: 'view', plugin: one.name }),
  })),
)

function go(to: View, event: MouseEvent) {
  follow(event, () => {
    if (to.startsWith('view:')) return openView(to.slice('view:'.length))
    if (to === 'versions') openChanges()
    const tokens = firstCategory()
    if (to === 'tokens') openTokens(tokens)
    if (to === 'health') openHealth(healthAt.value?.page ?? 'overview')
    if (to !== 'stories') return
    if (current.value !== null) show(current.value, 'push')
    else {
      closeChanges()
      tokensAt.value = null
      healthAt.value = null
      viewAt.value = null
      component.value = null
      // Le chemin seul : une adresse vide laisserait la requête en place.
      write(window.location.pathname, 'push')
    }
  })
}

// La preview rechargée : elle redit `ready`, et le shell relit le manifeste.
function reload() {
  frame.value?.contentWindow?.location.reload()
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

// La comparaison light et dark : une seconde preview en dark, à côté de la
// première passée en light. Un réglage de vue comme l'échelle : hors de l'adresse.
// La seconde ne sert qu'à voir : ses messages autres que `ready` sont ignorés,
// la première porte les erreurs, les valeurs et les panneaux.
const compare = ref(false)
const mainTheme = computed<Theme>(() => (compare.value ? 'light' : theme.value))
let dark: { send: (message: ShellMessage) => void; ready: boolean; stop: () => void } | null = null

function renderDark() {
  if (dark?.ready && current.value !== null)
    dark.send({
      type: 'render',
      id: current.value,
      overrides: overrides.value,
      theme: 'dark',
      ...triedTokens(),
    })
}

watch(frameDark, (element) => {
  dark?.stop()
  dark = null
  if (!element) return
  const opened = createShellChannel(element)
  const one = { send: opened.send, ready: false, stop: () => {} }
  one.stop = opened.onMessage((message) => {
    if (message.type !== 'ready') return
    one.ready = true
    applyZoom()
    renderDark()
  })
  dark = one
})
onBeforeUnmount(() => dark?.stop())

// La preview suit le thème du shell : rendue à nouveau, sans remonter (5.2).
watch(mainTheme, () => {
  if (current.value !== null) select(current.value)
})

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
    // Par-dessus le canvas seulement : dans la grille, elle n'a rien à fermer.
    if (!wide.matches) panelsOpen.value = false
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
  if (arrival.mode === 'health') openHealth(pageOf(arrival.page), arrival.item, 'none')
  if (arrival.mode === 'view') openView(arrival.plugin, arrival.item, 'none')
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
  } else if (
    tokensAt.value !== null ||
    changesOpen.value ||
    healthAt.value !== null ||
    viewAt.value !== null
  )
    select(next.id)
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
  if (place.mode === 'health') openHealth(pageOf(place.page), place.item, 'none')
  if (place.mode === 'view') openView(place.plugin, place.item, 'none')
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
  // Lu dès le montage : le badge de Santé compte les composants sans story.
  void readHealth()

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
        // Toujours : le badge de Santé compte les composants sans story.
        void readHealth()
        applyZoom()
        void refresh()
      }
      if (message.type === 'rendered') {
        failure.value = null
        firstRender.value ??= performance.now()
        previewAnswered.value = true
        rendered.value = { id: message.id, values: message.values }
        status.value = `${message.id} rendered`
      }
      // Rattachée à la story affichée : cliquer B pendant que A rend laissait
      // l'erreur de A couvrir B, et masquer la note partielle de B.
      if (message.type === 'error') previewAnswered.value = true
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
        :todo="todo"
        :score="healthScore"
        :hrefs="hrefs"
        :plugins="pluginViews"
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
        <HealthSidebar
          v-else-if="view === 'health'"
          :components="listedHealth ?? null"
          :unread="
            health === null ? 'reading…' : health === 'failed' ? 'could not be read' : undefined
          "
          :audit="auditResults"
          :findings="findings?.length ?? null"
          :failures="failures?.length ?? null"
          :page="healthAt?.page ?? 'overview'"
          :href-of="(page) => placeSearch({ mode: 'health', page })"
          @pick="(page, event) => follow(event, () => openHealth(page))"
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
        <template v-else-if="viewAt">
          <ColumnTitle :title="shownView?.label ?? viewAt.plugin" />
          <component
            :is="shownView.sidebar"
            v-if="shownView?.sidebar"
            :item="viewAt.item ?? null"
            @item="(key: string | null) => openView(viewAt!.plugin, key ?? undefined)"
          />
        </template>
        <StoryTree
          v-else
          :entries="entries"
          :current="changesOpen ? null : current"
          :component="component"
          label="Stories"
          none="No story."
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
          <span class="folder">stories<span class="separator">/</span></span>
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
          <Button class="reload" @click="reload">Reload</Button>
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link' }}
          </Button>
          <span class="divider" aria-hidden="true" />
          <Tooltip :content="panelsOpen ? 'Hide panels' : 'Show panels'">
            <Button
              variant="ghost"
              class="panels-toggle"
              aria-label="Panels"
              aria-controls="panels"
              :aria-expanded="panelsOpen"
              @click="panelsOpen = !panelsOpen"
            >
              <Icon :icon="panelsOpen ? PanelRightOpenIcon : PanelRightIcon" />
              <span
                v-if="!panelsOpen && panelTroubles + pluginErrors.length > 0"
                class="trouble"
                role="img"
                aria-label="a plugin failed"
              />
            </Button>
          </Tooltip>
        </div>
      </div>
      <!-- La vue tokens a la sienne : la vue, la catégorie quand elle ne porte pas le
           nom de la famille, la famille et la clé du token choisi. -->
      <div v-else-if="view === 'tokens' && shownCategory" class="toolbar">
        <nav class="trail" aria-label="Breadcrumb">
          <span class="folder">tokens<span class="separator">/</span></span>
          <template v-if="selectedToken">
            <span v-if="shownCategory.name !== selectedToken.family" class="folder"
              >{{ shownCategory.name }}<span class="separator">/</span></span
            >
            <span class="family">{{ selectedToken.family }}</span
            ><span class="separator">/</span>
            <span aria-current="page">{{ selectedToken.label }}</span>
          </template>
          <span v-else aria-current="page">{{ shownCategory.name }}</span>
        </nav>
        <div class="actions">
          <Button class="reload" @click="reload">Reload</Button>
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link' }}
          </Button>
          <span class="divider" aria-hidden="true" />
          <Tooltip :content="panelsOpen ? 'Hide panels' : 'Show panels'">
            <Button
              variant="ghost"
              class="panels-toggle"
              aria-label="Panels"
              aria-controls="token-panel"
              :aria-expanded="panelsOpen"
              @click="panelsOpen = !panelsOpen"
            >
              <Icon :icon="panelsOpen ? PanelRightOpenIcon : PanelRightIcon" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <!-- La vue santé a la sienne : la vue, la page, et le composant choisi. -->
      <div v-else-if="view === 'health' && healthAt" class="toolbar">
        <nav class="trail" aria-label="Breadcrumb">
          <span class="folder">health<span class="separator">/</span></span>
          <template v-if="healthItem">
            <a
              :href="placeSearch({ mode: 'health', page: healthAt.page })"
              @click="follow($event, () => openHealth(healthAt!.page))"
              >{{ PAGES.find((one) => one.page === healthAt!.page)!.label }}</a
            ><span class="separator">/</span>
            <span aria-current="page">{{ healthItem.name }}</span>
          </template>
          <span v-else aria-current="page">{{
            PAGES.find((one) => one.page === healthAt!.page)!.label
          }}</span>
        </nav>
        <div class="actions">
          <Tooltip
            v-if="healthPrompt"
            content="Paste it to your coding agent: it fixes the render errors, violations and missing stories listed here."
          >
            <Button variant="outline" class="prompt" @click="copyPrompt(healthPrompt, 'prompt')">
              <Icon :icon="AiContentGenerator01Icon" />
              {{ promptCopied === 'prompt' ? 'Fix prompt copied' : 'Copy fix prompt' }}
            </Button>
          </Tooltip>
          <!-- Désactivé, l'infobulle passe par une enveloppe : un bouton désactivé ne
               reçoit pas le pointeur, et « Nothing to fix » ne se lirait jamais. Actif,
               elle reste sur le bouton, qui seul reçoit le focus clavier. -->
          <Tooltip v-else content="Nothing to fix">
            <span class="prompt-hold">
              <Button variant="outline" class="prompt" disabled>
                <Icon :icon="AiContentGenerator01Icon" />
                Copy fix prompt
              </Button>
            </span>
          </Tooltip>
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link' }}
          </Button>
          <span class="divider" aria-hidden="true" />
          <Tooltip :content="panelsOpen ? 'Hide panels' : 'Show panels'">
            <Button
              variant="ghost"
              class="panels-toggle"
              aria-label="Panels"
              aria-controls="health-panel"
              :aria-expanded="panelsOpen"
              @click="panelsOpen = !panelsOpen"
            >
              <Icon :icon="panelsOpen ? PanelRightOpenIcon : PanelRightIcon" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div v-else-if="viewAt" class="toolbar">
        <nav class="trail" aria-label="Breadcrumb">
          <template v-if="viewAt.item">
            <a
              :href="placeSearch({ mode: 'view', plugin: viewAt.plugin })"
              @click="follow($event, () => openView(viewAt!.plugin))"
              >{{ shownView?.label ?? viewAt.plugin }}</a
            ><span class="separator">/</span>
            <span aria-current="page">{{ viewAt.item }}</span>
          </template>
          <span v-else aria-current="page">{{ shownView?.label ?? viewAt.plugin }}</span>
        </nav>
        <div class="actions">
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link' }}
          </Button>
          <template v-if="shownView?.panel">
            <span class="divider" aria-hidden="true" />
            <Tooltip :content="panelsOpen ? 'Hide panels' : 'Show panels'">
              <Button
                variant="ghost"
                class="panels-toggle"
                aria-label="Panels"
                aria-controls="view-panel"
                :aria-expanded="panelsOpen"
                @click="panelsOpen = !panelsOpen"
              >
                <Icon :icon="panelsOpen ? PanelRightOpenIcon : PanelRightIcon" />
              </Button>
            </Tooltip>
          </template>
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
            :tried="tried"
            :href-of="
              (token) => placeSearch({ mode: 'tokens', category: shownCategory!.name, token })
            "
            @select="(token, event) => follow(event, () => openTokens(shownCategory!.name, token))"
          />

          <HealthFailures
            v-if="healthAt?.page === 'failures' && listedHealth"
            :failures="failures"
            :running="auditing"
            :failed="auditFailed"
            :stories="entries"
            :selected="healthAt.item ?? null"
            :href-of="(key) => placeSearch({ mode: 'health', page: 'failures', item: key })"
            @run="runAudit"
            @select="(key, event) => follow(event, () => openHealth('failures', key))"
          />
          <HealthAccessibility
            v-else-if="healthAt?.page === 'accessibility' && listedHealth"
            :plugin="a11yPlugin"
            :audit="auditResults"
            :running="auditing"
            :failed="auditFailed"
            :stories="entries"
            :selected="healthAt.item ?? null"
            :href-of="(key) => placeSearch({ mode: 'health', page: 'accessibility', item: key })"
            @run="runAudit"
            @select="(key, event) => follow(event, () => openHealth('accessibility', key))"
          />
          <HealthView
            v-else-if="healthAt && listedHealth"
            :components="listedHealth"
            :page="healthAt.page"
            :selected="healthAt.item ?? null"
            :findings="findings"
            :failures="failures"
            :stories="entries"
            :href-of="(key) => placeSearch({ mode: 'health', page: healthAt!.page, item: key })"
            :href-of-health="(page, key) => placeSearch({ mode: 'health', page, item: key })"
            :href-of-changes="(before) => placeSearch({ mode: 'changes', before })"
            @select="(key, event) => follow(event, () => openHealth(healthAt!.page, key))"
            @changes="(before, event) => follow(event, () => openChanges('push', { before }))"
            @health="(page, key, event) => follow(event, () => openHealth(page, key))"
          />
          <div v-else-if="healthAt && listedHealth === null" class="empty">
            <EmptyGuide
              title="No components folder"
              :path="null"
              rule="The health view counts the components of the folder declared as components in crypte.config.ts, and the stories that cover them."
              mapping="src/components  >  health / stories"
              :snippet="COMPONENTS_SNIPPET"
              note="Every component a file under it exports counts, at any depth. A wrapper declared as wrap does not."
              outcome="The stories gauge and the health pages appear."
            />
          </div>
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

          <template v-if="viewAt">
            <ViewCanvas v-if="shownView" class="plugin-view" :aria-label="shownView.label">
              <component
                :is="shownView.canvas"
                :item="viewAt.item ?? null"
                @item="(key: string | null) => openView(viewAt!.plugin, key ?? undefined)"
              />
            </ViewCanvas>
            <EmptyNote v-else-if="pluginsRead">
              No plugin draws a view named {{ viewAt.plugin }}.
            </EmptyNote>
          </template>

          <ComponentPage
            v-if="component !== null"
            :stories="componentStories"
            @show="(id) => show(id, 'push')"
          />

          <!-- Masqué et non retiré : la preview et les panneaux gardent leur état
           pendant qu'une page composant ou une famille est ouverte. -->
          <div
            v-show="
              component === null &&
              tokensAt === null &&
              healthAt === null &&
              viewAt === null &&
              !changesOpen &&
              !noStory
            "
            class="canvas"
          >
            <!-- Sur la scène, ce qui agit sur elle : l'échelle, la comparaison light et
                 dark, et le plein écran, qu'on quitte d'ici puisque la barre d'outils
                 part avec lui. -->
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
              <Tooltip content="Compare light and dark">
                <Button
                  class="square"
                  aria-label="Compare light and dark"
                  :aria-pressed="compare"
                  @click="compare = !compare"
                >
                  <Icon :icon="ContrastIcon" />
                </Button>
              </Tooltip>
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
            <div v-show="!failure" class="previews">
              <figure class="preview">
                <iframe
                  ref="frame"
                  src="/preview.html"
                  title="preview"
                  :data-scheme="mainTheme"
                ></iframe>
                <figcaption v-if="compare">light</figcaption>
              </figure>
              <figure v-if="compare" class="preview dark">
                <iframe
                  ref="frameDark"
                  src="/preview.html"
                  title="preview, dark"
                  data-scheme="dark"
                ></iframe>
                <figcaption>dark</figcaption>
              </figure>
            </div>

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
          v-show="storyMode && !noStory && panelsOpen"
          id="panels"
          class="panel-column"
          aria-label="Panels"
        >
          <ColumnTitle title="Panels" />
          <Panels
            :entry="displayed"
            :received="received"
            :failed="failure?.message ?? null"
            :values="rendered && rendered.id === displayed?.id ? rendered.values : null"
            :revision="revision"
            :errors="pluginErrors"
            @overrides="edit"
            @send="sendToPreview"
            @weights="(measured) => ((weights = measured), (pluginsRead = true))"
            @troubles="(troubles) => ((panelTroubles = troubles), (pluginsRead = true))"
            @views="(found) => (views = found)"
          />
        </aside>
        <aside
          v-if="view === 'tokens' && !noTokens && !fullScreen && panelsOpen"
          id="token-panel"
          class="panel-column"
          aria-label="Token panel"
        >
          <ColumnTitle title="Panels" />
          <TokenPanel
            :token="selectedToken"
            :categories="categories"
            :stories="entries"
            :tried="tried"
            :href-of-token="(category, token) => placeSearch({ mode: 'tokens', category, token })"
            :href-of-component="(id) => placeSearch({ mode: 'component', id })"
            @token="(category, token, event) => follow(event, () => openTokens(category, token))"
            @component="(id, event) => follow(event, () => open(id))"
            @try="tryToken"
          />
        </aside>
        <aside
          v-if="viewAt && shownView?.panel && !fullScreen && panelsOpen"
          id="view-panel"
          class="panel-column"
          :aria-label="`${shownView.label} panel`"
        >
          <ColumnTitle title="Panels" />
          <PanelSection :title="shownView.label" :open="viewPanelOpen" @toggle="toggleViewPanel">
            <div class="view-panel-body">
              <component
                :is="shownView.panel"
                :item="viewAt.item ?? null"
                @item="(key: string | null) => openView(viewAt!.plugin, key ?? undefined)"
              />
            </div>
          </PanelSection>
        </aside>
        <aside
          v-if="view === 'health' && listedHealth && !fullScreen && panelsOpen"
          id="health-panel"
          class="panel-column"
          aria-label="Health panel"
        >
          <ColumnTitle title="Panels" />
          <HealthPanel
            :component="healthItem"
            :components="listedHealth ?? []"
            :finding="healthAt?.page === 'accessibility' ? selectedFinding : null"
            :failure="healthAt?.page === 'failures' ? selectedFailure : null"
            :findings="findings ?? []"
            :failures="failures ?? []"
            :stories="entries"
            :href-of-story="(id) => placeSearch({ mode: 'entry', id })"
            :href-of-component="(id) => placeSearch({ mode: 'component', id })"
            :href-of-health="(page, key) => placeSearch({ mode: 'health', page, item: key })"
            :href-of-token="tokenHref"
            :suspects="healthAt?.page === 'accessibility' ? suspects : []"
            @story="(id, event) => follow(event, () => show(id, 'push'))"
            @page="(id, event) => follow(event, () => open(id))"
            @health="(page, key, event) => follow(event, () => openHealth(page, key))"
            @token="(name, event) => follow(event, () => openToken(name))"
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
        <li v-if="Object.keys(tried).length > 0" class="tried">
          {{ plural(Object.keys(tried).length, 'token') }} tried
        </li>
        <li v-if="project">
          <Tooltip content="The shell, gzipped">
            <span tabindex="0">Shell {{ kB(project.shellBytes) }}</span>
          </Tooltip>
        </li>
        <li v-if="weights.length > 0">
          <Tooltip :content="weights.map((one) => `${one.plugin} ${kB(one.bytes)}`).join('\n')">
            <span tabindex="0">
              {{ plural(weights.length, 'plugin') }}
            </span>
          </Tooltip>
        </li>
      </ul>
    </footer>
    <CommandPalette
      v-model:open="palette"
      :entries="listed"
      :actions="actions"
      :recent="visits"
      :here="here"
      @show="(id) => show(id, 'push')"
      @open="(id) => open(id)"
      :views="views"
      @changes="openChanges()"
      @view="(plugin) => openView(plugin)"
    />
    <!-- La preview de l'audit, hors de l'écran mais à une vraie taille : axe juge
         les contrastes sur ce qui est mis en page. -->
    <iframe
      v-if="auditing"
      ref="auditFrame"
      class="audit-frame"
      src="/preview.html"
      title="accessibility audit"
      aria-hidden="true"
      tabindex="-1"
    ></iframe>
  </main>
</template>

<style scoped>
/* L'activity bar, puis la sidebar et l'espace de travail, chacun posé sur le fond
   de la page avec 4 px autour. */
.activity-column {
  box-sizing: border-box;
  min-height: 0;
  padding: var(--space-1) 0 0 var(--space-1);
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

.trail .family {
  color: var(--text-current);
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

/* Le séparateur vertical avant la bascule des panneaux. */
.actions .divider {
  align-self: center;
  width: var(--stroke-hairline);
  height: 16px;
  background: var(--border-base);
}

/* Le bouton icône md de Figma : 28 × 28. */
.actions .panels-toggle {
  position: relative;
  padding: var(--space-1) var(--space-1-5);
}

/* Fermée, la colonne cache l'encadré des plugins en échec : le bouton le marque. */
.panels-toggle .trouble {
  position: absolute;
  top: var(--space-0-5);
  right: var(--space-0-5);
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-full);
  background: var(--error-solid);
}

/* Sous 1180 px, la colonne quitte la grille : le canvas garde sa largeur, et elle
   s'ouvre par-dessus, à droite, sans voile. 1280 tient encore en entier. */
@media (max-width: 1179px) {
  .body > .panel-column {
    position: absolute;
    inset-block: 0;
    right: 0;
    z-index: 1;
    box-shadow: 0 0 24px rgb(0 0 0 / 0.16);
  }
}

/* Au-dessus des previews, dont le cadre positionné capterait le clic. */
.stage-tools {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 1;
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

.stage > .view-canvas {
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

.prompt-hold {
  display: inline-flex;
}

.prompt:disabled {
  pointer-events: none;
}

/* As the body of a plugin panel: padding 12, the text at 14 px. */
.view-panel-body {
  padding: var(--space-3);
  font-size: var(--text-sm);
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
.previews {
  display: flex;
  flex: 1;
  min-height: 0;
}

.preview {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  margin: 0;
}

.preview figcaption {
  position: absolute;
  bottom: var(--space-2);
  left: 50%;
  transform: translateX(-50%);
  padding: var(--space-0-5) var(--space-1-5);
  border-radius: var(--radius-xs);
  background: var(--background-raised);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.audit-frame {
  position: fixed;
  top: 0;
  left: -10000px;
  width: 1024px;
  height: 768px;
}

iframe {
  display: block;
  flex: 1;
  width: 100%;
  min-height: 320px;
  border: 0;
  background-size: 12px 12px;
}

/* Le fond à points du thème que la frame dessine, et son `color-scheme` : différent
   de celui du document de la frame, Chromium peint par-dessus un aplat opaque.
   Les valeurs de `--background-subtle` et `--border-light`, écrites ici :
   `light-dark()` dans une propriété se résout sur la racine du shell, pas sur
   la frame. */
iframe[data-scheme='light'] {
  color-scheme: light;
  background-color: var(--stone-100);
  background-image: radial-gradient(var(--stone-200) 1px, transparent 1px);
}

iframe[data-scheme='dark'] {
  color-scheme: dark;
  background-color: var(--stone-700);
  background-image: radial-gradient(var(--stone-950) 1px, transparent 1px);
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
