<script setup lang="ts">
import { plural } from './plural'
import type {
  Manifest,
  Overrides,
  PageEntry,
  RenderedValues,
  ShellMessage,
  SkippedFile,
  StoryEntry,
  Theme,
  TokensEntry,
} from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/shell'
import {
  Alert,
  Button,
  Tooltip,
  ColumnTitle,
  EmptyNote,
  ViewCanvas,
  PanelSection,
} from '@crypte/ui'
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
import type { Changes, Fingerprint } from '@crypte/core/protocol'
import { changesUrl } from './pages/changes'
import { changesOnGitHub, type GitHub } from './versions/github'
import { differencesOf, sinceLabel } from './versions/differences'
import VersionsSidebar, { type Since, type Versions } from './versions/versions-sidebar.vue'
import VersionsView from './versions/versions-view.vue'
import HealthSidebar from './health/health-sidebar.vue'
import HealthView from './health/health-view.vue'
import HealthPanel from './health/health-panel.vue'
import HealthAccessibility from './health/health-accessibility.vue'
import HealthFailures from './health/health-failures.vue'
import { AuditFailure, audit, failuresOf, findingsOf, type AuditResult } from './health/audit'
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
import MarkdownPage from './pages/markdown-page.vue'
import EmptyGuide from './pages/empty-guide.vue'
import {
  AiContentGenerator01Icon,
  ArrowDown01Icon,
  ArrowHorizontalIcon,
  ComputerIcon,
  DragDropIcon,
  Grid2x2Icon,
  LaptopIcon,
  SmartPhone01Icon,
  SquareIcon,
  Tablet01Icon,
  ContrastIcon,
  Copy01Icon,
  FullScreenIcon,
  PanelRightIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import ActivityBar, { type BuiltIn, type View } from './navigation/activity-bar.vue'
import Icon from './ui/icon.vue'
import { keep, kept } from './storage'
import StoryTree from './navigation/story-tree.vue'
import DocsTree from './navigation/docs-tree.vue'
import DocsPanel from './pages/docs-panel.vue'
import CategoryList from './tokens/category-list.vue'
import { categoriesOf } from './tokens/categories'
import TokenPanel from './tokens/token-panel.vue'
import TokensView from './tokens/tokens-view.vue'
import { useTheme } from './theme/theme'
import { componentIdOf } from './navigation/tree'
import { placeSearch, readPlace, sameTab } from './navigation/url'
import { decimal, labelOf, locale, texts } from './i18n'

const t = texts({
  en: {
    noStoryRead: 'no story read',
    oneStoryRead: '1 story read, some are missing',
    storiesRead: '{count} stories read, some are missing',
    difference: 'difference',
    differences: 'differences',
    since: '{count} since {ref}',
    readingHealth: 'reading the health of the components',
    healthFailed: 'the health of the components could not be read',
    noComponentsDeclared: 'no components folder declared',
    auditing: 'auditing the stories, {done} of {total} renders',
    audited: 'audit of {count} stories in {seconds} s',
    component: 'component',
    components: 'components',
    covered: '{components}, {covered} with a story',
    noTokens: 'no tokens found',
    token: 'token',
    tokens: 'tokens',
    tokensLine: '{tokens} {category}, {theme} theme',
    light: 'light',
    dark: 'dark',
    tokensGone: 'the tokens on display are gone',
    componentGone: 'the component on display is gone',
    pageGone: 'the page on display is gone',
    story: 'story',
    stories: 'stories',
    loading: 'loading the catalogue',
    previewReady: 'preview ready, protocol v{version}',
    rendered: '{id} rendered',
    renderError: 'render error',
    lightTheme: 'Light theme',
    darkTheme: 'Dark theme',
    copyLink: 'Copy link',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    leaveFullScreen: 'Leave full screen',
    fullScreen: 'Full screen',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    actualSize: 'Actual size',
    healthReading: 'reading…',
    healthUnread: 'could not be read',
    storiesLabel: 'Stories',
    noStory: 'No story.',
    breadcrumb: 'Breadcrumb',
    trailStories: 'stories',
    trailTokens: 'tokens',
    trailDocs: 'docs',
    trailHealth: 'health',
    reload: 'Reload',
    hidePanels: 'Hide panels',
    showPanels: 'Show panels',
    panels: 'Panels',
    pluginFailed: 'a plugin failed',
    promptTip:
      'Paste it to your coding agent: it fixes the render errors, violations and missing stories listed here.',
    promptCopied: 'Fix prompt copied',
    copyPrompt: 'Copy fix prompt',
    nothingToFix: 'Nothing to fix',
    configUnread: 'could not be read',
    configKept:
      'Crypte keeps serving the configuration it read before. Fix the file and save it again:',
    stale:
      'is not in the catalogue any more: it was probably renamed. Showing the first story instead.',
    noStoryIn: 'No story in {folder}/',
    noStoryFound: 'No story found',
    storyRule:
      'A story file carries the exact name of its component, and the tree follows its path. The folder is the stories of crypte.config.ts.',
    storyNote: 'When every prop is optional, a story named Default is generated.',
    storyNoteReact:
      'When every prop is optional, a story named Default is generated. Name the file .tsx when a children prop needs markup.',
    storyOutcome: 'The file appears and its story renders, without a restart.',
    setAsideTitle: 'What Crypte could not read',
    setAside: ': {title}. {reason}',
    noTokenFound: 'No token found',
    tokensRule:
      'Crypte reads the custom properties of the style sheet declared as css in crypte.config.ts, and groups them by category.',
    tokensNote:
      'A dark theme goes under [data-theme="dark"] or prefers-color-scheme: dark, and light-dark() works too.',
    tokensOutcome: 'The tokens appear, grouped by category.',
    noComponents: 'No components folder',
    componentsRule:
      'The health view counts the components of the folder declared as components in crypte.config.ts, and the stories that cover them.',
    componentsMapping: 'src/components  >  health / stories',
    componentsNote:
      'Every component a file under it exports counts, at any depth. A wrapper declared as wrap does not.',
    componentsOutcome: 'The stories gauge and the health pages appear.',
    noView: 'No plugin draws a view named {plugin}.',
    noDocsIn: 'No docs page in {folder}/',
    noDocs: 'No docs page',
    docsRule:
      'A component gets its docs page from its stories. A markdown file beside its story file adds its guidelines; any other markdown file is a page of its own.',
    docsNote: 'Markdown only: the title is the first # heading, otherwise the file name.',
    docsOutcome: 'The page appears, linked to its stories and its tokens.',
    zoom: 'Zoom, {percent} %',
    zoomStep: 'to step,',
    zoomActual: 'for 100 %',
    compare: 'Compare light and dark',
    width: 'Preview width, {width}',
    fullWidth: 'Full width',
    mobile: 'Mobile (iPhone)',
    tablet: 'Tablet (iPad)',
    laptop: 'Laptop',
    desktop: 'Desktop',
    backdrop: 'Background, {name}',
    dots: 'Dots',
    plain: 'Plain',
    checker: 'Checkerboard',
    notRendered: '{id} could not be rendered',
    preview: 'preview',
    previewDark: 'preview, dark',
    partial: 'Incomplete props table: {detail}.',
    docsPanel: 'Docs panel',
    tokenPanel: 'Token panel',
    viewPanel: '{label} panel',
    healthPanel: 'Health panel',
    firstRenderTip: 'From opening this page to the first story rendered',
    firstRender: 'First render {ms} ms',
    shellTip: 'The shell, gzipped',
    shell: 'Shell {size}',
    plugin: 'plugin',
    plugins: 'plugins',
    auditFrame: 'accessibility audit',
  },
  fr: {
    noStoryRead: 'aucune story lue',
    oneStoryRead: '1 story lue, il en manque',
    storiesRead: '{count} stories lues, il en manque',
    difference: 'écart',
    differences: 'écarts',
    since: '{count} depuis {ref}',
    readingHealth: 'lecture de la santé des composants',
    healthFailed: "la santé des composants n'a pas pu être lue",
    noComponentsDeclared: 'aucun dossier de composants déclaré',
    auditing: 'audit des stories, {done} rendus sur {total}',
    audited: 'audit de {count} stories en {seconds} s',
    component: 'composant',
    components: 'composants',
    covered: '{components}, {covered} avec une story',
    noTokens: 'aucun token trouvé',
    token: 'token',
    tokens: 'tokens',
    tokensLine: '{tokens} {category}, thème {theme}',
    light: 'clair',
    dark: 'sombre',
    tokensGone: 'les tokens affichés ont disparu',
    componentGone: 'le composant affiché a disparu',
    pageGone: 'la page affichée a disparu',
    story: 'story',
    stories: 'stories',
    loading: 'chargement du catalogue',
    previewReady: 'aperçu prêt, protocole v{version}',
    rendered: '{id} rendue',
    renderError: 'erreur de rendu',
    lightTheme: 'Thème clair',
    darkTheme: 'Thème sombre',
    copyLink: 'Copier le lien',
    copied: 'Copié',
    copyFailed: 'Échec de la copie',
    leaveFullScreen: 'Quitter le plein écran',
    fullScreen: 'Plein écran',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    actualSize: 'Taille réelle',
    healthReading: 'lecture…',
    healthUnread: 'illisible',
    storiesLabel: 'Stories',
    noStory: 'Aucune story.',
    breadcrumb: "Fil d'Ariane",
    trailStories: 'stories',
    trailTokens: 'tokens',
    trailDocs: 'docs',
    trailHealth: 'santé',
    reload: 'Recharger',
    hidePanels: 'Masquer les panneaux',
    showPanels: 'Afficher les panneaux',
    panels: 'Panneaux',
    pluginFailed: 'un plugin a échoué',
    promptTip:
      'Collez-le à votre agent de code : il corrige les erreurs de rendu, les violations et les stories manquantes listées ici.',
    promptCopied: 'Prompt de correction copié',
    copyPrompt: 'Copier le prompt de correction',
    nothingToFix: 'Rien à corriger',
    configUnread: "n'a pas pu être lu",
    configKept:
      'Crypte continue de servir la configuration lue avant. Corrigez le fichier et enregistrez-le à nouveau :',
    stale:
      "n'est plus dans le catalogue : un renommage, sans doute. La première story s'affiche à la place.",
    noStoryIn: 'Aucune story dans {folder}/',
    noStoryFound: 'Aucune story trouvée',
    storyRule:
      "Un fichier de stories porte le nom exact de son composant, et l'arbre suit son chemin. Le dossier est le stories de crypte.config.ts.",
    storyNote: 'Quand toutes les props sont optionnelles, une story nommée Default est générée.',
    storyNoteReact:
      'Quand toutes les props sont optionnelles, une story nommée Default est générée. Nommez le fichier .tsx quand une prop children attend du balisage.',
    storyOutcome: "Le fichier apparaît et sa story s'affiche, sans redémarrage.",
    setAsideTitle: "Ce que Crypte n'a pas pu lire",
    setAside: ' : {title}. {reason}',
    noTokenFound: 'Aucun token trouvé',
    tokensRule:
      'Crypte lit les propriétés personnalisées de la feuille de style déclarée comme css dans crypte.config.ts, et les range par catégorie.',
    tokensNote:
      'Un thème sombre se déclare sous [data-theme="dark"] ou prefers-color-scheme: dark, et light-dark() marche aussi.',
    tokensOutcome: 'Les tokens apparaissent, rangés par catégorie.',
    noComponents: 'Aucun dossier de composants',
    componentsRule:
      'La vue santé compte les composants du dossier déclaré comme components dans crypte.config.ts, et les stories qui les couvrent.',
    componentsMapping: 'src/components  >  santé / stories',
    componentsNote:
      'Chaque composant exporté par un fichier de ce dossier compte, à toute profondeur. Un enrobage déclaré comme wrap ne compte pas.',
    componentsOutcome: 'La jauge des stories et les pages de santé apparaissent.',
    noView: 'Aucun plugin ne dessine de vue nommée {plugin}.',
    noDocsIn: 'Aucune page de docs dans {folder}/',
    noDocs: 'Aucune page de docs',
    docsRule:
      'Un composant tient sa page de docs de ses stories. Un fichier markdown à côté de son fichier de stories y ajoute ses consignes ; tout autre fichier markdown est une page à part entière.',
    docsNote: 'Markdown seulement : le titre est le premier titre #, sinon le nom du fichier.',
    docsOutcome: 'La page apparaît, liée à ses stories et à ses tokens.',
    zoom: 'Zoom, {percent} %',
    zoomStep: 'pour changer de niveau,',
    zoomActual: 'pour 100 %',
    compare: 'Comparer clair et sombre',
    width: "Largeur de l'aperçu, {width}",
    fullWidth: 'Pleine largeur',
    mobile: 'Mobile (iPhone)',
    tablet: 'Tablette (iPad)',
    laptop: 'Portable',
    desktop: 'Bureau',
    backdrop: 'Fond, {name}',
    dots: 'Points',
    plain: 'Uni',
    checker: 'Damier',
    notRendered: "{id} n'a pas pu être rendue",
    preview: 'aperçu',
    previewDark: 'aperçu, sombre',
    partial: 'Table des props incomplète : {detail}.',
    docsPanel: 'Panneau des docs',
    tokenPanel: 'Panneau du token',
    viewPanel: 'Panneau {label}',
    healthPanel: 'Panneau de santé',
    firstRenderTip: "De l'ouverture de cette page à la première story rendue",
    firstRender: 'Premier rendu {ms} ms',
    shellTip: 'Le shell, compressé en gzip',
    shell: 'Shell {size}',
    plugin: 'plugin',
    plugins: 'plugins',
    auditFrame: "audit d'accessibilité",
  },
})

// Le shell ne connaît aucun framework : il est construit à l'avance et livré dans
// le CLI, là où la preview est compilée chez l'utilisateur.

// Chaque adresse lue est relative à la page : un build peut être servi sous un chemin.
const MANIFEST = '@crypte/manifest.json'

const frame = useTemplateRef<HTMLIFrameElement>('frame')
// La seconde preview de la comparaison light et dark, la première passant en light.
const frameDark = useTemplateRef<HTMLIFrameElement>('frameDark')
const entries = ref<StoryEntry[]>([])
// Les familles de tokens, que la vue tokens range et qu'une page dessine.
const families = ref<TokensEntry[]>([])
// Les pages markdown. Celle d'un composant se lit sur sa page composant, les
// autres, générales, se rangent dans l'arbre.
const pages = ref<PageEntry[]>([])
const generalPages = computed(() => pages.value.filter((one) => one.storyFile === undefined))
const skipped = ref<SkippedFile[]>([])
const current = ref<string | null>(null)
// Une fonction, lue au rendu : un texte figé ne suivrait pas la langue.
const status = ref<() => string>(() => t('loading'))
// Ce qu'un catalogue illisible laisse dire, quelle que soit la page.
const unread = ref<(() => string) | null>(null)

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
          ? t('noStoryRead')
          : read === 1
            ? t('oneStoryRead')
            : t('storiesRead', { count: read }),
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
const componentPage = computed(() => {
  const file = componentStories.value[0]?.storyFile
  return file === undefined ? undefined : pages.value.find((one) => one.storyFile === file)
})

// La page générale ouverte, ou `null`. Comme la page composant, elle laisse la
// story chargée dessous.
const pageAt = ref<string | null>(null)
// La vue docs ouverte sans rien à y montrer : ni composant ni page.
const docsOpen = ref(false)
const docsEmpty = computed(() => entries.value.length === 0 && generalPages.value.length === 0)
const shownPage = computed(() => generalPages.value.find((one) => one.id === pageAt.value) ?? null)

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
// Son libellé déjà dans la langue du moment, pour chaque endroit qui le montre.
const shownView = computed(() => {
  const found = views.value.find((one) => one.name === viewAt.value?.plugin)
  return found ? { ...found, label: labelOf(found.label) } : null
})
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
const HEALTH = '@crypte/health.json'
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
const listed = computed(() => [...entries.value, ...families.value, ...generalPages.value])

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
  return pageAt.value ?? current.value
})
watch(here, (_, left) => {
  if (left !== null) remember(left)
})

async function readChanges() {
  const run = (reading += 1)
  const since = changesAt.value
  let read: Changes
  try {
    const point = since.from ?? since.before
    if (point !== undefined) await projectRead
    const built = Boolean(project.value?.built)
    const answer = await fetch(changesUrl(since, built))
    const github = project.value?.github
    // Un point que le build n'a pas calculé se lit sur GitHub, quand le dépôt y est.
    read =
      !built || answer.ok
        ? ((await answer.json()) as Changes)
        : github
          ? await changesOnGitHub(
              github,
              since,
              (await fetch(FINGERPRINT).then((one) => one.json())) as Fingerprint,
            )
          : {
              reason: `this build holds no comparison from ${point}, and names no GitHub repository to read it from`,
            }
  } catch (error) {
    read = {
      reason: `its route could not be read: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  // Le dernier relu gagne : deux `ready` rapprochés ne se répondent pas dans l'ordre.
  if (run === reading) changes.value = read
}

// L'empreinte du build, que seul `crypte build` écrit.
const FINGERPRINT = '@crypte/fingerprint.json'

// Les points de départ que le CLI propose, relus à l'ouverture de la vue.
const VERSIONS = '@crypte/versions.json'
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
  if (unread.value !== null) return unread.value()
  if (changesOpen.value)
    return changes.value !== null && 'from' in changes.value
      ? t('since', {
          count: plural(counter.value ?? 0, t('difference'), t('differences')),
          ref: sinceLabel(changes.value.from.ref),
        })
      : counted(entries.value.length)
  if (healthAt.value !== null) {
    if (health.value === null) return t('readingHealth')
    if (health.value === 'failed') return t('healthFailed')
    const listed = health.value.components
    if (!listed) return t('noComponentsDeclared')
    if (auditing.value)
      return t('auditing', { done: auditing.value.done, total: auditing.value.total })
    if (healthAt.value.page === 'accessibility' && auditResults.value && auditTook.value !== null)
      return t('audited', {
        count: auditResults.value.length / 2,
        seconds: decimal(auditTook.value / 1000),
      })
    const covered = listed.filter((one) => one.stories.length > 0).length
    return t('covered', {
      components: plural(listed.length, t('component'), t('components')),
      covered,
    })
  }
  if (noTokens.value) return t('noTokens')
  if (tokensAt.value !== null)
    return shownCategory.value
      ? t('tokensLine', {
          tokens: plural(shownCategory.value.count, t('token'), t('tokens')),
          category: shownCategory.value.name,
          theme: t(theme.value),
        })
      : t('tokensGone')
  if (component.value !== null)
    return componentStories.value.length > 0 ? counted(entries.value.length) : t('componentGone')
  if (pageAt.value !== null) return shownPage.value ? counted(entries.value.length) : t('pageGone')
  return status.value()
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

const counted = (n: number) => plural(n, t('story'), t('stories'))

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
const auditFailed = ref<(() => string) | null>(null)
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
    const said = error instanceof Error ? error.message : String(error)
    auditFailed.value = error instanceof AuditFailure ? error.text : () => said
  } finally {
    auditing.value = null
  }
}

// Ce que la dernière story rendue a reçu, sous son identifiant : les panneaux ne
// le lisent que pour la story affichée, une autre ayant pu répondre entre-temps.
const rendered = shallowRef<{ id: string; values: RenderedValues } | null>(null)

const renderMessage = (id: string, theme: Theme) => ({
  type: 'render' as const,
  id,
  overrides: overrides.value,
  theme,
})
const kB = (bytes: number) => `${decimal(bytes / 1e3)} kB`

// Ce que le CLI dit du projet : la racine de stories qu'il déclare, et pourquoi
// la dernière relecture de la configuration a échoué, le serveur gardant la
// précédente. Relu comme les changements.
const PROJECT = '@crypte/project.json'
const project = ref<{
  stories: string
  // Le paquet de l'adaptateur, `@crypte/vue` pour un projet Vue.
  adapter?: string | null
  config: string | null
  shellBytes: number
  version: string
  // Quand `crypte build` a écrit ce que le shell lit, `null` sous `crypte dev`.
  built?: string | null
  // Le dépôt GitHub d'un build, `null` sous `crypte dev` ou hors de GitHub.
  github?: GitHub | null
} | null>(null)
let asking = 0
// La dernière lecture, qu'attend celle des changements depuis un point : sur un
// build, ils se lisent ailleurs.
let projectRead: Promise<void> = Promise.resolve()

function readProject() {
  projectRead = fetchProject()
  return projectRead
}

async function fetchProject() {
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
    pageAt.value === null &&
    !docsOpen.value &&
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
// Pour Vue, un `.vue` importé par défaut, son extension comprise.
const vueProject = computed(() => project.value?.adapter === '@crypte/vue')
const snippet = computed(() => {
  const up = '../'.repeat(storiesRoot.value.split('/').length + 1)
  return vueProject.value
    ? `import { defineStories } from '@crypte/vue'
import Badge from '${up}src/components/ui/Badge.vue'

export default defineStories(Badge)`
    : `import { defineStories } from '@crypte/react'
import { Badge } from '${up}src/components/ui/Badge'

export default defineStories(Badge)`
})

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

// La largeur de la preview, pour les media queries d'une story : nommée par
// l'appareil qu'elle imite. Un réglage de vue comme le zoom, hors de l'adresse.
const WIDTHS = {
  375: { device: 'mobile', icon: SmartPhone01Icon },
  768: { device: 'tablet', icon: Tablet01Icon },
  1024: { device: 'laptop', icon: LaptopIcon },
  1440: { device: 'desktop', icon: ComputerIcon },
} as const
type Width = keyof typeof WIDTHS
const width = ref<Width | null>(null)
const widthMenu = ref(false)
const widthLabel = computed(() => (width.value === null ? t('fullWidth') : `${width.value} px`))
const widthIcon = computed(() =>
  width.value === null ? ArrowHorizontalIcon : WIDTHS[width.value].icon,
)

// Le motif derrière la story, dans la couleur du thème de chaque cadre. Le damier
// montre ce qui est transparent. Un réglage de vue, hors de l'adresse.
const BACKDROPS = { dots: DragDropIcon, plain: SquareIcon, checker: Grid2x2Icon } as const
type Backdrop = keyof typeof BACKDROPS
const backdrop = ref<Backdrop>('dots')
const backdropMenu = ref(false)

// Ce qui dépasse de la scène, de chaque côté : un dégradé sur le bord le dit, la
// barre de défilement étant masquée par défaut sur macOS.
const previews = useTemplateRef<HTMLElement>('previews')
const overflow = ref({ start: false, end: false })
function measureOverflow() {
  const box = previews.value
  if (!box) return
  overflow.value = {
    start: box.scrollLeft > 0,
    end: box.scrollLeft + box.clientWidth < box.scrollWidth - 1,
  }
}
// La scène change de taille sans que la largeur bouge : la fenêtre, les
// panneaux, le plein écran. Absent de jsdom.
const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureOverflow)
watch(previews, (box, before) => {
  if (before) resized?.unobserve(before)
  if (box) resized?.observe(box)
})
onBeforeUnmount(() => resized?.disconnect())

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

// La story que la preview rend, sans changer de page.
function select(id: string) {
  if (id !== current.value) overrides.value = {}
  current.value = id
  shown = entries.value.find((entry) => entry.id === id) ?? shown
  failure.value = null
  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  if (ready) channel?.send(renderMessage(id, mainTheme.value))
  renderDark()
}

// Une story, une famille de tokens ou une page : `?id=` les nomme toutes (§4.3).
// Une famille ouvre sa catégorie, sous l'adresse de la vue tokens.
function show(id: string, trace: Trace = 'replace') {
  const category = categoryOf(id)
  if (category !== undefined) return openTokens(category, undefined, trace)
  if (generalPages.value.some((one) => one.id === id)) return openPage(id, trace)
  if (trace === 'push') stale.value = null
  closeChanges()
  component.value = null
  pageAt.value = null
  docsOpen.value = false
  tokensAt.value = null
  healthAt.value = null
  viewAt.value = null
  select(id)
  write(placeSearch({ mode: 'entry', id }), trace)
}

function openPage(id: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  closeChanges()
  component.value = null
  tokensAt.value = null
  healthAt.value = null
  viewAt.value = null
  pageAt.value = id
  docsOpen.value = false
  write(placeSearch({ mode: 'entry', id }), trace)
}

function openTokens(category: string, token?: string, trace: Trace = 'push') {
  if (trace === 'push') stale.value = null
  full.value = false
  closeChanges()
  component.value = null
  pageAt.value = null
  docsOpen.value = false
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
  pageAt.value = null
  docsOpen.value = false
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
  pageAt.value = null
  docsOpen.value = false
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
  pageAt.value = null
  docsOpen.value = false
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
  pageAt.value = null
  docsOpen.value = false
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
          : component.value !== null || pageAt.value !== null || docsOpen.value
            ? 'docs'
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
    docs: docsHref(),
    health: placeSearch({ mode: 'health', page: healthAt.value?.page ?? 'overview' }),
    versions: placeSearch({ mode: 'changes' }),
  }
})

// La vue docs mène à ce qui y est ouvert, sinon au premier composant, sinon à la
// première page. Sans l'un ni l'autre, elle n'a pas d'adresse : son guide le dit.
const firstDoc = (): { component: string } | { page: string } | null => {
  const [story] = entries.value
  if (story) return { component: componentIdOf(story.path) }
  const [page] = generalPages.value
  return page ? { page: page.id } : null
}
function docsHref() {
  if (component.value !== null) return placeSearch({ mode: 'component', id: component.value })
  if (pageAt.value !== null) return placeSearch({ mode: 'entry', id: pageAt.value })
  const first = firstDoc()
  if (first === null) return window.location.pathname
  return 'component' in first
    ? placeSearch({ mode: 'component', id: first.component })
    : placeSearch({ mode: 'entry', id: first.page })
}
function openDocs() {
  if (component.value !== null || pageAt.value !== null) return
  const first = firstDoc()
  if (first === null) {
    closeChanges()
    tokensAt.value = null
    healthAt.value = null
    viewAt.value = null
    docsOpen.value = true
    write(window.location.pathname, 'push')
  } else if ('component' in first) open(first.component)
  else openPage(first.page)
}

// Le fil d'Ariane de la vue docs : un composant sous les dossiers de ses stories,
// une page sous les siens.
const docsTrail = computed(() => {
  const [first] = componentStories.value
  if (component.value !== null && first)
    return { folders: first.path.slice(0, -1), name: first.path.at(-1) ?? '' }
  return shownPage.value ? { folders: shownPage.value.path, name: shownPage.value.name } : null
})

// Une page citée mène à la page Docs de son composant, ou à elle-même.
const componentOfPage = (id: string) => {
  const file = pages.value.find((one) => one.id === id)?.storyFile
  const story = file === undefined ? undefined : entries.value.find((one) => one.storyFile === file)
  return story ? componentIdOf(story.path) : null
}
function docsPageHref(id: string) {
  const owner = componentOfPage(id)
  return owner === null
    ? placeSearch({ mode: 'entry', id })
    : placeSearch({ mode: 'component', id: owner })
}
function openDocsPage(id: string) {
  const owner = componentOfPage(id)
  if (owner === null) openPage(id)
  else open(owner)
}

const DOCS_SNIPPET = '# Badge\n\nA short label for a status. It is never clickable.\n'

// Les vues des plugins, sous un séparateur après versions.
const pluginViews = computed(() =>
  views.value.map((one) => ({
    name: one.name,
    label: labelOf(one.label),
    icon: one.icon,
    href: placeSearch({ mode: 'view', plugin: one.name }),
  })),
)

function go(to: View, event: MouseEvent) {
  follow(event, () => {
    if (to.startsWith('view:')) return openView(to.slice('view:'.length))
    if (to === 'docs') return openDocs()
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
      pageAt.value = null
      docsOpen.value = false
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
watch([width, compare], () => nextTick(measureOverflow))
const mainTheme = computed<Theme>(() => (compare.value ? 'light' : theme.value))
let dark: { send: (message: ShellMessage) => void; ready: boolean; stop: () => void } | null = null

function renderDark() {
  if (dark?.ready && current.value !== null) dark.send(renderMessage(current.value, 'dark'))
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

const themeLabel = computed(() => (theme.value === 'dark' ? t('lightTheme') : t('darkTheme')))

const actions = computed<Action[]>(() => [
  { id: 'theme', label: themeLabel.value, keys: 'T', run: toggleTheme },
  ...(storyMode.value && displayed.value !== null
    ? [
        { id: 'copy-link', label: t('copyLink'), run: () => void copyLink() },
        {
          id: 'full-screen',
          label: full.value ? t('leaveFullScreen') : t('fullScreen'),
          keys: 'F',
          run: () => (full.value = !full.value),
        },
        { id: 'zoom-in', label: t('zoomIn'), keys: '+', run: () => zoomBy(1) },
        { id: 'zoom-out', label: t('zoomOut'), keys: '-', run: () => zoomBy(-1) },
        { id: 'actual-size', label: t('actualSize'), keys: '0', run: () => (zoom.value = 1) },
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
  // ferme sans quitter le plein écran dessous. Le menu de zoom laisse passer ses
  // touches, que son pied annonce, celui de largeur aucune ; le reste, f compris,
  // leur revient.
  if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
  const menu = event.target instanceof Element ? event.target.closest('[role="menu"]') : null
  if (menu) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (menu.getAttribute('aria-describedby') !== 'zoom-keys') return
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

  // Ce que le shell ne sait pas dessiner, il l'ignore.
  const stories = manifest.entries.filter((entry): entry is StoryEntry => entry.type === 'story')

  unread.value = null
  read.value = true
  reread()
  entries.value = stories
  families.value = manifest.entries.filter((entry): entry is TokensEntry => entry.type === 'tokens')
  pages.value = manifest.entries.filter((entry): entry is PageEntry => entry.type === 'page')
  skipped.value = manifest.skipped ?? []
  status.value = () => counted(stories.length)

  // Lue au premier catalogue, puis oubliée : ensuite, c'est ce qui est affiché
  // qui fait l'adresse. Sous une page composant, la preview charge sa première
  // story.
  let opening: string | null = null
  if (arrival.mode === 'entry') {
    const id = arrival.id
    shown = stories.find((entry) => entry.id === id) ?? shown
    const category = categoryOf(id)
    if (category !== undefined) tokensAt.value = { category }
    if (generalPages.value.some((one) => one.id === id)) pageAt.value = id
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
  if (arrival.mode === 'entry' && !shown && tokensAt.value === null && pageAt.value === null)
    stale.value = arrival.id
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
    pageAt.value !== null ||
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
        const version = message.protocolVersion
        status.value = () => t('previewReady', { version })
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
        const id = message.id
        status.value = () => t('rendered', { id })
      }
      // Rattachée à la story affichée : cliquer B pendant que A rend laissait
      // l'erreur de A couvrir B, et masquer la note partielle de B.
      if (message.type === 'error') previewAnswered.value = true
      if (message.type === 'error' && message.id === current.value) {
        failure.value = { id: message.id, message: message.message, stack: message.stack }
        status.value = () => t('renderError')
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
            health === null
              ? t('healthReading')
              : health === 'failed'
                ? t('healthUnread')
                : undefined
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
          :built="project?.built ?? null"
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
            :locale="locale"
            @item="(key: string | null) => openView(viewAt!.plugin, key ?? undefined)"
          />
        </template>
        <DocsTree
          v-else-if="view === 'docs'"
          :stories="entries"
          :pages="generalPages"
          :component="component"
          :page="pageAt"
          @open="(id) => open(id)"
          @show="(id) => openPage(id)"
        />
        <StoryTree
          v-else
          :entries="entries"
          :current="changesOpen ? null : current"
          :label="t('storiesLabel')"
          :none="t('noStory')"
          @show="(id) => show(id, 'push')"
          @open="(id) => open(id)"
        />
      </div>
    </div>

    <div class="workspace">
      <div v-if="storyMode && displayed" class="toolbar">
        <!-- Le dossier n'est pas une destination, le composant en est une : seul il
               porte l'accent. Le séparateur suit le segment qui le précède. -->
        <nav class="trail" :aria-label="t('breadcrumb')">
          <span class="folder">{{ t('trailStories') }}<span class="separator">/</span></span>
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
          <Button class="reload" @click="reload">{{ t('reload') }}</Button>
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{
              copied === 'yes' ? t('copied') : copied === 'failed' ? t('copyFailed') : t('copyLink')
            }}
          </Button>
          <span class="divider" aria-hidden="true" />
          <Tooltip :content="panelsOpen ? t('hidePanels') : t('showPanels')">
            <Button
              variant="ghost"
              class="panels-toggle"
              :aria-label="t('panels')"
              aria-controls="panels"
              :aria-expanded="panelsOpen"
              @click="panelsOpen = !panelsOpen"
            >
              <Icon :icon="panelsOpen ? PanelRightOpenIcon : PanelRightIcon" />
              <span
                v-if="!panelsOpen && panelTroubles + pluginErrors.length > 0"
                class="trouble"
                role="img"
                :aria-label="t('pluginFailed')"
              />
            </Button>
          </Tooltip>
        </div>
      </div>
      <!-- La vue tokens a la sienne : la vue, la catégorie quand elle ne porte pas le
           nom de la famille, la famille et la clé du token choisi. -->
      <div v-else-if="view === 'tokens' && shownCategory" class="toolbar">
        <nav class="trail" :aria-label="t('breadcrumb')">
          <span class="folder">{{ t('trailTokens') }}<span class="separator">/</span></span>
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
          <Button class="reload" @click="reload">{{ t('reload') }}</Button>
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{
              copied === 'yes' ? t('copied') : copied === 'failed' ? t('copyFailed') : t('copyLink')
            }}
          </Button>
          <span class="divider" aria-hidden="true" />
          <Tooltip :content="panelsOpen ? t('hidePanels') : t('showPanels')">
            <Button
              variant="ghost"
              class="panels-toggle"
              :aria-label="t('panels')"
              aria-controls="token-panel"
              :aria-expanded="panelsOpen"
              @click="panelsOpen = !panelsOpen"
            >
              <Icon :icon="panelsOpen ? PanelRightOpenIcon : PanelRightIcon" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <!-- La vue docs a la sienne : la vue, les dossiers, et ce qui est ouvert. -->
      <div v-else-if="view === 'docs' && docsTrail" class="toolbar">
        <nav class="trail" :aria-label="t('breadcrumb')">
          <span class="folder">{{ t('trailDocs') }}<span class="separator">/</span></span>
          <span v-for="(segment, at) of docsTrail.folders" :key="at" class="folder"
            >{{ segment }}<span class="separator">/</span></span
          >
          <span aria-current="page">{{ docsTrail.name }}</span>
        </nav>
        <div class="actions">
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{
              copied === 'yes' ? t('copied') : copied === 'failed' ? t('copyFailed') : t('copyLink')
            }}
          </Button>
          <span class="divider" aria-hidden="true" />
          <Tooltip :content="panelsOpen ? t('hidePanels') : t('showPanels')">
            <Button
              variant="ghost"
              class="panels-toggle"
              :aria-label="t('panels')"
              aria-controls="docs-panel"
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
        <nav class="trail" :aria-label="t('breadcrumb')">
          <span class="folder">{{ t('trailHealth') }}<span class="separator">/</span></span>
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
          <Tooltip v-if="healthPrompt" :content="t('promptTip')">
            <Button variant="outline" class="prompt" @click="copyPrompt(healthPrompt, 'prompt')">
              <Icon :icon="AiContentGenerator01Icon" />
              {{ promptCopied === 'prompt' ? t('promptCopied') : t('copyPrompt') }}
            </Button>
          </Tooltip>
          <!-- Désactivé, l'infobulle passe par une enveloppe : un bouton désactivé ne
               reçoit pas le pointeur, et « Nothing to fix » ne se lirait jamais. Actif,
               elle reste sur le bouton, qui seul reçoit le focus clavier. -->
          <Tooltip v-else :content="t('nothingToFix')">
            <span class="prompt-hold">
              <Button variant="outline" class="prompt" disabled>
                <Icon :icon="AiContentGenerator01Icon" />
                {{ t('copyPrompt') }}
              </Button>
            </span>
          </Tooltip>
          <Button variant="secondary" class="copy" @click="copyLink">
            <Icon :icon="Copy01Icon" />
            {{
              copied === 'yes' ? t('copied') : copied === 'failed' ? t('copyFailed') : t('copyLink')
            }}
          </Button>
          <span class="divider" aria-hidden="true" />
          <Tooltip :content="panelsOpen ? t('hidePanels') : t('showPanels')">
            <Button
              variant="ghost"
              class="panels-toggle"
              :aria-label="t('panels')"
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
        <nav class="trail" :aria-label="t('breadcrumb')">
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
            {{
              copied === 'yes' ? t('copied') : copied === 'failed' ? t('copyFailed') : t('copyLink')
            }}
          </Button>
          <template v-if="shownView?.panel">
            <span class="divider" aria-hidden="true" />
            <Tooltip :content="panelsOpen ? t('hidePanels') : t('showPanels')">
              <Button
                variant="ghost"
                class="panels-toggle"
                :aria-label="t('panels')"
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
            <h2><code>crypte.config.ts</code> {{ t('configUnread') }}</h2>
            <p>
              {{ t('configKept') }}
              {{ project.config }}
            </p>
          </Alert>

          <Alert v-if="stale && entries.length > 0" color="warning" class="stale" role="status">
            <code>{{ stale }}</code> {{ t('stale') }}
          </Alert>

          <div v-if="noStory" class="empty">
            <EmptyGuide
              :title="project ? t('noStoryIn', { folder: project.stories }) : t('noStoryFound')"
              :path="project ? `${project.stories}/` : null"
              :rule="t('storyRule')"
              :mapping="`src/components/ui/Badge.${vueProject ? 'vue' : 'tsx'}  >  ${storiesRoot}/ui/Badge.ts`"
              :snippet="snippet"
              :note="vueProject ? t('storyNote') : t('storyNoteReact')"
              :outcome="t('storyOutcome')"
            />
          </div>

          <!-- Au-dessus de la preview et jamais bloquant : une story écartée est
           absente de l'arbre, donc rien d'autre ne la nomme. -->
          <Alert v-if="setAside.length > 0" color="warning" class="set-aside" role="status">
            <h2>{{ t('setAsideTitle') }}</h2>
            <ul>
              <li v-for="one of setAside" :key="one.file">
                <code>{{ one.file }}</code
                >{{ t('setAside', { title: one.title, reason: one.reason }) }}
              </li>
            </ul>
          </Alert>

          <div v-if="noTokens" class="empty">
            <EmptyGuide
              :title="t('noTokenFound')"
              :path="null"
              :rule="t('tokensRule')"
              mapping="src/styles.css  >  tokens / color, space…"
              :snippet="TOKENS_SNIPPET"
              :note="t('tokensNote')"
              :outcome="t('tokensOutcome')"
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

          <HealthFailures
            v-if="healthAt?.page === 'failures' && listedHealth"
            :failures="failures"
            :running="auditing"
            :failed="auditFailed?.() ?? null"
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
            :failed="auditFailed?.() ?? null"
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
              :title="t('noComponents')"
              :path="null"
              :rule="t('componentsRule')"
              :mapping="t('componentsMapping')"
              :snippet="COMPONENTS_SNIPPET"
              :note="t('componentsNote')"
              :outcome="t('componentsOutcome')"
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
                :locale="locale"
                @item="(key: string | null) => openView(viewAt!.plugin, key ?? undefined)"
              />
            </ViewCanvas>
            <EmptyNote v-else-if="pluginsRead">
              {{ t('noView', { plugin: viewAt.plugin }) }}
            </EmptyNote>
          </template>

          <!-- La carte de la maquette, sur le fond à points de la scène. -->
          <div v-if="component !== null || shownPage" class="docs-canvas">
            <ComponentPage
              v-if="component !== null"
              class="doc-page"
              :stories="componentStories"
              :page="componentPage"
              :categories="categories"
              :theme="theme"
              :href-of-token="tokenHref"
              @show="(id) => show(id, 'push')"
              @token="openToken"
            />
            <MarkdownPage v-else-if="shownPage" class="doc-page" :page="shownPage" />
          </div>
          <div v-if="docsOpen && docsEmpty" class="empty">
            <EmptyGuide
              :title="project ? t('noDocsIn', { folder: project.stories }) : t('noDocs')"
              :path="project ? `${project.stories}/` : null"
              :rule="t('docsRule')"
              :mapping="`${storiesRoot}/ui/Badge.${vueProject ? 'ts' : 'tsx'}  >  ${storiesRoot}/ui/Badge.md`"
              :snippet="DOCS_SNIPPET"
              :note="t('docsNote')"
              :outcome="t('docsOutcome')"
            />
          </div>

          <!-- Masqué et non retiré : la preview et les panneaux gardent leur état
           pendant qu'une page composant ou une famille est ouverte. -->
          <div
            v-show="
              component === null &&
              pageAt === null &&
              !docsOpen &&
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
                  <Button
                    class="level"
                    :aria-label="t('zoom', { percent: Math.round(zoom * 100) })"
                  >
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
                      <kbd>+</kbd> <kbd>-</kbd> {{ t('zoomStep') }} <kbd>0</kbd>
                      {{ t('zoomActual') }}
                    </p>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <DropdownMenuRoot
                v-model:open="widthMenu"
                :modal="false"
                @update:open="(open) => open && focusLevel()"
              >
                <DropdownMenuTrigger as-child>
                  <Button class="width" :aria-label="t('width', { width: widthLabel })">
                    <Icon :icon="widthIcon" />
                    {{ widthLabel }}
                    <Icon :icon="ArrowDown01Icon" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal to=".stage-tools">
                  <DropdownMenuContent
                    class="shell-menu"
                    align="end"
                    :side-offset="4"
                    @keydown.tab="widthMenu = false"
                  >
                    <DropdownMenuRadioGroup
                      :model-value="String(width)"
                      @update:model-value="
                        (chosen) => (width = chosen === 'null' ? null : (Number(chosen) as Width))
                      "
                    >
                      <DropdownMenuRadioItem value="null" class="shell-menu-item">
                        <span class="shell-menu-label"
                          ><Icon :icon="ArrowHorizontalIcon" />{{ t('fullWidth') }}</span
                        >
                        <DropdownMenuItemIndicator class="shell-menu-check">
                          <Icon :icon="Tick02Icon" />
                        </DropdownMenuItemIndicator>
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        v-for="({ device, icon }, size) of WIDTHS"
                        :key="size"
                        :value="String(size)"
                        class="shell-menu-item"
                      >
                        <span class="shell-menu-label"
                          ><Icon :icon="icon" />{{ size }} px
                          <span class="shell-menu-detail">{{ t(device) }}</span></span
                        >
                        <DropdownMenuItemIndicator class="shell-menu-check">
                          <Icon :icon="Tick02Icon" />
                        </DropdownMenuItemIndicator>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <DropdownMenuRoot
                v-model:open="backdropMenu"
                :modal="false"
                @update:open="(open) => open && focusLevel()"
              >
                <DropdownMenuTrigger as-child>
                  <Button
                    class="square backdrop"
                    :aria-label="t('backdrop', { name: t(backdrop) })"
                  >
                    <Icon :icon="BACKDROPS[backdrop]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal to=".stage-tools">
                  <DropdownMenuContent
                    class="shell-menu"
                    align="end"
                    :side-offset="4"
                    @keydown.tab="backdropMenu = false"
                  >
                    <DropdownMenuRadioGroup
                      :model-value="backdrop"
                      @update:model-value="(chosen) => (backdrop = chosen as Backdrop)"
                    >
                      <DropdownMenuRadioItem
                        v-for="(icon, name) of BACKDROPS"
                        :key="name"
                        :value="name"
                        class="shell-menu-item"
                      >
                        <span class="shell-menu-label"><Icon :icon="icon" />{{ t(name) }}</span>
                        <DropdownMenuItemIndicator class="shell-menu-check">
                          <Icon :icon="Tick02Icon" />
                        </DropdownMenuItemIndicator>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <Tooltip :content="t('compare')">
                <Button
                  class="square"
                  :aria-label="t('compare')"
                  :aria-pressed="compare"
                  @click="compare = !compare"
                >
                  <Icon :icon="ContrastIcon" />
                </Button>
              </Tooltip>
              <Tooltip :content="full ? t('leaveFullScreen') : t('fullScreen')" keys="F">
                <Button
                  class="square"
                  :aria-label="full ? t('leaveFullScreen') : t('fullScreen')"
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
              <h2>{{ t('notRendered', { id: failure.id }) }}</h2>
              <p>{{ failure.message }}</p>
              <pre v-if="failure.stack">{{ failure.stack }}</pre>
            </Alert>
            <div v-show="!failure" class="scroller">
              <div ref="previews" class="previews" @scroll="measureOverflow">
                <figure
                  class="preview"
                  :class="{ sized: width !== null }"
                  :style="width === null ? undefined : { width: `${width}px` }"
                >
                  <iframe
                    ref="frame"
                    src="preview.html"
                    :title="t('preview')"
                    :data-scheme="mainTheme"
                    :data-backdrop="backdrop"
                  ></iframe>
                  <figcaption v-if="compare">{{ t('light') }}</figcaption>
                </figure>
                <figure
                  v-if="compare"
                  class="preview dark"
                  :class="{ sized: width !== null }"
                  :style="width === null ? undefined : { width: `${width}px` }"
                >
                  <iframe
                    ref="frameDark"
                    src="preview.html"
                    :title="t('previewDark')"
                    data-scheme="dark"
                    :data-backdrop="backdrop"
                  ></iframe>
                  <figcaption>{{ t('dark') }}</figcaption>
                </figure>
              </div>
              <span v-if="overflow.start" class="fade start" aria-hidden="true" />
              <span v-if="overflow.end" class="fade end" aria-hidden="true" />
            </div>

            <!-- Sous la preview, pas dessus : la story rend, et l'avertissement ne dit
           que ce qui manque à sa fiche. Le ton dit ce que l'outil ne sait pas
           lire, jamais que le fichier est mal écrit. -->
            <p v-if="partial && !failure" class="partial">
              {{ t('partial', { detail: partial }) }}
            </p>
          </div>
        </div>
        <!-- Un élément autour : la racine de Panels est un fragment, où v-show ne
             s'applique pas. Masqués et non retirés sous une page : ils gardent leur
             état. -->
        <aside
          v-show="storyMode && !noStory && panelsOpen"
          id="panels"
          class="panel-column"
          :aria-label="t('panels')"
        >
          <ColumnTitle :title="t('panels')" />
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
          v-if="view === 'docs' && (component !== null || shownPage) && !fullScreen && panelsOpen"
          id="docs-panel"
          class="panel-column"
          :aria-label="t('docsPanel')"
        >
          <ColumnTitle :title="t('panels')" />
          <DocsPanel
            :own="componentStories"
            :page="component !== null ? (componentPage ?? null) : shownPage"
            :stories="entries"
            :pages="pages"
            :href-of-story="(id) => placeSearch({ mode: 'entry', id })"
            :href-of-component="(id) => placeSearch({ mode: 'component', id })"
            :href-of-page="docsPageHref"
            :href-of-token="tokenHref"
            @story="(id, event) => follow(event, () => show(id, 'push'))"
            @component="(id, event) => follow(event, () => open(id))"
            @page="(id, event) => follow(event, () => openDocsPage(id))"
            @token="(name, event) => follow(event, () => openToken(name))"
          />
        </aside>
        <aside
          v-if="view === 'tokens' && !noTokens && !fullScreen && panelsOpen"
          id="token-panel"
          class="panel-column"
          :aria-label="t('tokenPanel')"
        >
          <ColumnTitle :title="t('panels')" />
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
        <aside
          v-if="viewAt && shownView?.panel && !fullScreen && panelsOpen"
          id="view-panel"
          class="panel-column"
          :aria-label="t('viewPanel', { label: shownView.label })"
        >
          <ColumnTitle :title="t('panels')" />
          <PanelSection :title="shownView.label" :open="viewPanelOpen" @toggle="toggleViewPanel">
            <div class="view-panel-body">
              <component
                :is="shownView.panel"
                :item="viewAt.item ?? null"
                :locale="locale"
                @item="(key: string | null) => openView(viewAt!.plugin, key ?? undefined)"
              />
            </div>
          </PanelSection>
        </aside>
        <aside
          v-if="view === 'health' && listedHealth && !fullScreen && panelsOpen"
          id="health-panel"
          class="panel-column"
          :aria-label="t('healthPanel')"
        >
          <ColumnTitle :title="t('panels')" />
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
      <Tooltip v-if="firstRender !== null" :content="t('firstRenderTip')">
        <span class="render" tabindex="0">{{
          t('firstRender', { ms: Math.round(firstRender) })
        }}</span>
      </Tooltip>
      <span v-if="project" class="version">Crypte {{ project.version }}</span>
      <ul class="figures">
        <li v-if="project">
          <Tooltip :content="t('shellTip')">
            <span tabindex="0">{{ t('shell', { size: kB(project.shellBytes) }) }}</span>
          </Tooltip>
        </li>
        <li v-if="weights.length > 0">
          <Tooltip :content="weights.map((one) => `${one.plugin} ${kB(one.bytes)}`).join('\n')">
            <span tabindex="0">
              {{ plural(weights.length, t('plugin'), t('plugins')) }}
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
      :views="views.map((one) => ({ name: one.name, label: labelOf(one.label) }))"
      @changes="openChanges()"
      @view="(plugin) => openView(plugin)"
    />
    <!-- La preview de l'audit, hors de l'écran mais à une vraie taille : axe juge
         les contrastes sur ce qui est mis en page. -->
    <iframe
      v-if="auditing"
      ref="auditFrame"
      class="audit-frame"
      src="preview.html"
      :title="t('auditFrame')"
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

.stage-tools .width {
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

.stage > .view-canvas,
.stage > .docs-canvas {
  margin: 0;
}

.docs-canvas {
  flex: 1;
  padding: var(--space-8) var(--space-6);
  background-color: var(--background-subtle);
  background-image: radial-gradient(var(--border-light) 1px, transparent 1px);
  background-size: 12px 12px;
}

.doc-page {
  box-sizing: border-box;
  max-width: 640px;
  min-height: 0;
  margin: 0 auto;
  padding: var(--space-9) var(--space-10);
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-lg);
  background: var(--background-raised);
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

/* En colonne, pour que les panneaux sans objet se collent au bas : voir panels.vue. */
#panels {
  display: flex;
  flex-direction: column;
}

#panels > :deep(*) {
  flex: none;
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
.scroller {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.previews {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.fade {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--space-8);
  pointer-events: none;
}

.fade.start {
  left: 0;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--text-primary) 20%, transparent),
    transparent
  );
}

.fade.end {
  right: 0;
  background: linear-gradient(
    to left,
    color-mix(in srgb, var(--text-primary) 20%, transparent),
    transparent
  );
}

/* At a set width, centred; wider than the stage, it scrolls rather than shrinks:
   the auto margins never push it past the left edge, where centring would. */
.preview.sized {
  flex: none;
  margin-inline: auto;
}

/* The edge of the screen it imitates. */
.preview.sized iframe {
  box-shadow: 0 0 0 var(--stroke-hairline) var(--border-base);
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

iframe[data-backdrop='plain'] {
  background-image: none;
}

iframe[data-backdrop='checker'] {
  background-size: 16px 16px;
}

iframe[data-backdrop='checker'][data-scheme='light'] {
  background-image: conic-gradient(
    var(--stone-200) 25%,
    transparent 0 50%,
    var(--stone-200) 0 75%,
    transparent 0
  );
}

iframe[data-backdrop='checker'][data-scheme='dark'] {
  background-image: conic-gradient(
    var(--stone-800) 25%,
    transparent 0 50%,
    var(--stone-800) 0 75%,
    transparent 0
  );
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

.shell-menu-label {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
}

.shell-menu-detail {
  margin-left: var(--space-1);
  color: var(--text-muted);
}
</style>
