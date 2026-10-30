// Le dashboard de la santé, en fonctions pures : sept critères par composant, un
// groupe par gravité, la couverture des tokens, le score, les abréviations de la
// grille et les lignes que le prompt reprend. La vue ne fait que dessiner ce qui
// sort d'ici.

import type { PageEntry, StoryEntry, TokensEntry, TokenValue } from '@crypte/core/protocol'
import { findingsOf, THEMES, type AuditResult, type Finding } from './audit'
import { keyOf, type HealthComponent } from './health'
import { suspectsOf } from './suspects'
import { chainOf, nameOf, type Category } from '../tokens/categories'
import { texts } from '../i18n'
import { plural, singular } from '../plural'

const t = texts({
  en: {
    critical: 'critical',
    serious: 'serious',
    moderate: 'moderate',
    minor: 'minor',
    broken: 'fails to render, {themes}',
    and: '{one} and {other}',
    unstoried: 'no story · {props}, {required}',
    prop: 'prop',
    requiredOne: 'required',
    requiredMany: 'required',
    deprecated: 'deprecated',
    noDoc: 'doc page missing',
    neverOne: '{props} never exercised',
    neverMany: '{props} never exercised',
    nowhere: 'used nowhere',
    draft: 'draft',
  },
  fr: {
    critical: 'critique',
    serious: 'sérieuse',
    moderate: 'modérée',
    minor: 'mineure',
    broken: 'échoue au rendu, {themes}',
    and: '{one} et {other}',
    unstoried: 'sans story · {props}, {required}',
    prop: 'prop',
    requiredOne: 'requise',
    requiredMany: 'requises',
    deprecated: 'deprecated',
    noDoc: 'page de doc manquante',
    neverOne: '{props} jamais exercée',
    neverMany: '{props} jamais exercées',
    nowhere: 'utilisé nulle part',
    draft: 'draft',
  },
})

// L'état d'un critère. `empty` est l'attente ou le sans-objet : la case vide,
// qui n'entre dans aucun compte.
export type State = 'valid' | 'improve' | 'blocking' | 'empty'

export const CRITERIA = ['story', 'render', 'a11y', 'doc', 'status', 'props', 'usages'] as const
export type Criterion = (typeof CRITERIA)[number]

// Une case de la liste, et le texte qu'elle porte : `4/5` pour les props, le
// nombre de fichiers pour les usages.
export interface Cell {
  state: State
  text?: string
}

export type Criteria = Record<Criterion, Cell>

export type Group = 'blocking' | 'improve' | 'ready'

// Ce que les critères lisent hors du composant.
export interface Context {
  stories: StoryEntry[]
  pages: PageEntry[]
  // `null` tant que l'audit n'a pas tourné : rendu et a11y restent vides.
  audit: AuditResult[] | null
}

const ownStories = (component: HealthComponent, stories: StoryEntry[]) =>
  stories.filter((one) => component.stories.includes(one.id))

const resultsOf = (component: HealthComponent, audit: AuditResult[]) =>
  audit.filter((one) => component.stories.includes(one.id))

function renderOf(component: HealthComponent, audit: AuditResult[] | null): State {
  if (component.stories.length === 0 || audit === null) return 'empty'
  const results = resultsOf(component, audit)
  if (results.some((one) => 'broken' in one)) return 'blocking'
  // Chaque story dessinée dans chaque thème. Muette, ou absente d'un audit
  // interrompu, elle n'est pas jugée : la case reste vide.
  const drawn = component.stories.every((id) =>
    THEMES.every((theme) =>
      results.some((one) => one.id === id && one.theme === theme && !('silent' in one)),
    ),
  )
  return drawn ? 'valid' : 'empty'
}

function a11yOf(component: HealthComponent, audit: AuditResult[] | null): State {
  if (component.stories.length === 0 || audit === null) return 'empty'
  const judged = resultsOf(component, audit).filter((one) => 'violations' in one)
  const violations = judged.flatMap((one) => ('violations' in one ? one.violations : []))
  if (violations.some((one) => one.impact === 'critical')) return 'blocking'
  if (violations.length > 0) return 'improve'
  // Sans le plugin, l'audit ne rend que des `drawn` : rien n'est jugé, la case
  // reste vide, comme pour une story qui ne rend pas.
  const all = component.stories.every((id) =>
    THEMES.every((theme) => judged.some((one) => one.id === id && one.theme === theme)),
  )
  return all ? 'valid' : 'empty'
}

export function criteriaOf(component: HealthComponent, context: Context): Criteria {
  const own = ownStories(component, context.stories)
  const storied = component.stories.length > 0
  const files = new Set(own.map((one) => one.storyFile))
  // Un spread cache ce qu'il donne (4.2) : la couverture des props est inconnue.
  const spread = own.some((one) => one.partial !== undefined)
  const missing = component.unexercised?.length ?? 0

  return {
    story: { state: storied ? 'valid' : 'improve' },
    render: { state: renderOf(component, context.audit) },
    a11y: { state: a11yOf(component, context.audit) },
    doc: {
      state: !storied
        ? 'empty'
        : context.pages.some((page) => page.storyFile !== undefined && files.has(page.storyFile))
          ? 'valid'
          : 'improve',
    },
    status: {
      state:
        component.status === 'stable'
          ? 'valid'
          : component.status === 'deprecated'
            ? 'improve'
            : 'empty',
    },
    props:
      !storied || spread
        ? { state: 'empty' }
        : {
            state: missing > 0 ? 'improve' : 'valid',
            ...(component.props > 0
              ? { text: `${component.props - missing}/${component.props}` }
              : {}),
          },
    usages: {
      state: (component.usedIn?.length ?? 0) > 0 ? 'valid' : 'improve',
      text: String(component.usedIn?.length ?? 0),
    },
  }
}

// Bloquant au premier critère bloquant ; prêt quand les sept sont validés ; à
// améliorer sinon, y compris quand il ne reste que des cases vides.
export function groupOf(criteria: Criteria): Group {
  const states = CRITERIA.map((one) => criteria[one].state)
  if (states.includes('blocking')) return 'blocking'
  return states.every((one) => one === 'valid') ? 'ready' : 'improve'
}

// Ce qu'une phrase « en cause » lit de plus que le composant.
export interface Causes extends Context {
  components: HealthComponent[]
  categories: Category[]
}

const RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 }

// La violation la plus grave, avec le token le plus probable d'un défaut de
// contraste.
function findingText(finding: Finding, causes: Causes): string {
  const [suspect] = suspectsOf(finding, causes.categories, causes.stories)
  const rule = `${finding.violation.rule} ${t(finding.violation.impact)}`
  return suspect ? `${rule} · --${suspect.token.name}` : rule
}

const themesText = (themes: string[]) => {
  const [one, other] = THEMES.filter((theme) => themes.includes(theme))
  return other ? t('and', { one: one!, other }) : (one ?? '')
}

// Les causes du groupe le plus grave d'abord, puis le reste dans l'ordre des
// critères, puis le statut `draft`, qui laisse sa case vide mais se dit.
export function causesOf(component: HealthComponent, criteria: Criteria, causes: Causes): string[] {
  const audit = causes.audit ?? []
  const findings = findingsOf(resultsOf(component, audit)).sort(
    (one, other) => RANK[one.violation.impact] - RANK[other.violation.impact],
  )
  const brokenThemes = resultsOf(component, audit)
    .filter((one) => 'broken' in one)
    .map((one) => one.theme)
  const worst = findings[0]

  const blocking = [
    ...(criteria.render.state === 'blocking'
      ? [t('broken', { themes: themesText(brokenThemes) })]
      : []),
    ...(criteria.a11y.state === 'blocking' && worst ? [findingText(worst, causes)] : []),
  ]

  const names = (keys: string[]) =>
    keys.map((key) => causes.components.find((one) => keyOf(one) === key)?.name ?? key).join(', ')
  const unexercised = component.unexercised ?? []

  const improve = [
    ...(criteria.story.state === 'improve'
      ? [
          t('unstoried', {
            props: plural(component.props, t('prop')),
            required: `${component.required} ${singular(component.required) ? t('requiredOne') : t('requiredMany')}`,
          }),
        ]
      : []),
    ...(criteria.a11y.state === 'improve' && worst ? [findingText(worst, causes)] : []),
    ...(criteria.doc.state === 'improve' ? [t('noDoc')] : []),
    ...(criteria.status.state === 'improve'
      ? [
          (component.usedBy?.length ?? 0) > 0
            ? `${t('deprecated')} · ${names(component.usedBy!)}`
            : t('deprecated'),
        ]
      : []),
    ...(criteria.props.state === 'improve'
      ? [
          singular(unexercised.length)
            ? t('neverOne', { props: unexercised.join(', ') })
            : t('neverMany', { props: unexercised.join(', ') }),
        ]
      : []),
    ...(criteria.usages.state === 'improve' ? [t('nowhere')] : []),
  ]

  return [...blocking, ...improve, ...(component.status === 'draft' ? [t('draft')] : [])]
}

export const phraseOf = (component: HealthComponent, criteria: Criteria, causes: Causes) =>
  causesOf(component, criteria, causes).join(' · ')

// L'en-tête d'une colonne : les validés sur les composants dont la case n'est
// pas vide.
export interface Column {
  valid: number
  total: number
}

export function columnsOf(all: Criteria[]): Record<Criterion, Column> {
  return Object.fromEntries(
    CRITERIA.map((one) => {
      const counted = all.filter((criteria) => criteria[one].state !== 'empty')
      return [
        one,
        {
          valid: counted.filter((criteria) => criteria[one].state === 'valid').length,
          total: counted.length,
        },
      ]
    }),
  ) as Record<Criterion, Column>
}

// La moyenne non pondérée des sept colonnes et de la couverture des tokens, un
// ratio sans dénominateur laissé de côté. Arrondie à l'entier.
export function scoreOf(columns: Record<Criterion, Column>, tokens: Column): number {
  const ratios = [...CRITERIA.map((one) => columns[one]), tokens]
    .filter((one) => one.total > 0)
    .map((one) => one.valid / one.total)
  if (ratios.length === 0) return 0
  return Math.round((ratios.reduce((sum, one) => sum + one, 0) / ratios.length) * 100)
}

export type TokenState = 'used' | 'orphan' | 'broken'

export interface TokenHealth {
  // Unique, `famille/clé`, comme `Token.key` de la vue tokens.
  key: string
  // Ce qu'un `var(--…)` écrit, sans les tirets.
  name: string
  family: string
  state: TokenState
  // Un défaut de contraste le désigne : sa case passe en avertissement, il reste
  // compté comme utilisé.
  suspect: boolean
  // Les composants qui le lisent, directement ou par la chaîne d'un token lu.
  readers: string[]
  // Le nom qu'un alias cassé vise sans le trouver.
  target?: string
}

export interface TokenCoverage {
  families: { id: string; name: string; tokens: TokenHealth[] }[]
  used: number
  orphans: number
  broken: number
  total: number
  // Les tokens de chaque composant, par sa clé : ceux qu'il lit et qui existent,
  // et ce que leurs chaînes atteignent.
  reads: Map<string, Set<string>>
}

// Un alias cassé : une chaîne qui n'arrive pas à une valeur, la valeur restant un
// `var(` dans un thème au moins. Une cible absente et un cycle le donnent. Une
// valeur composite, `var(--a, 1ms) var(--b, ease)`, n'a pas de chaîne : elle
// n'est pas un alias, et ne l'est pas davantage cassé.
function brokenTarget(value: TokenValue): string | undefined {
  for (const held of Object.values(value.themes))
    if ((held.alias?.length ?? 0) > 0 && held.value.trimStart().startsWith('var('))
      return held.alias!.at(-1)
  return undefined
}

export function tokenHealthOf(
  families: readonly TokensEntry[],
  components: HealthComponent[],
  suspects: ReadonlySet<string> = new Set(),
): TokenCoverage {
  const all = families.flatMap((entry) =>
    Object.entries(entry.tokens).map(([key, value]) => ({
      key: `${entry.id}/${key}`,
      name: nameOf(entry.name, key),
      family: entry.id,
      value,
    })),
  )
  const names = new Set(all.map((one) => one.name))
  const chains = new Map<string, Set<string>>()
  for (const one of all)
    chains.set(one.name, new Set([...(chains.get(one.name) ?? []), ...chainOf(one.value)]))

  // Seulement ce qui existe dans les familles : une variable d'une bibliothèque
  // ou d'une autre feuille n'est pas un token du projet. Arbitré le 30 oct. 2026.
  const reads = new Map<string, Set<string>>()
  for (const component of components) {
    const direct = component.tokens ?? []
    const reached = direct.flatMap((name) => [...(chains.get(name) ?? [])])
    reads.set(keyOf(component), new Set([...direct, ...reached].filter((name) => names.has(name))))
  }

  const health = all.map((one): TokenHealth => {
    const readers = components
      .filter((component) => reads.get(keyOf(component))!.has(one.name))
      .map(keyOf)
    const target = brokenTarget(one.value)
    return {
      key: one.key,
      name: one.name,
      family: one.family,
      // Un alias cassé ne compte pas comme utilisé : utilisés, orphelins et
      // cassés font le total. Arbitré le 30 oct. 2026.
      state: target !== undefined ? 'broken' : readers.length > 0 ? 'used' : 'orphan',
      suspect: suspects.has(one.key),
      readers,
      ...(target !== undefined ? { target } : {}),
    }
  })

  return {
    families: families.map((entry) => ({
      id: entry.id,
      name: entry.name,
      tokens: health.filter((one) => one.family === entry.id),
    })),
    used: health.filter((one) => one.state === 'used').length,
    orphans: health.filter((one) => one.state === 'orphan').length,
    broken: health.filter((one) => one.state === 'broken').length,
    total: health.length,
    reads,
  }
}

// Les tokens qu'un défaut de contraste désigne, par leur clé.
export function suspectKeysOf(
  audit: AuditResult[] | null,
  categories: Category[],
  stories: StoryEntry[],
): Set<string> {
  if (audit === null) return new Set()
  return new Set(
    findingsOf(audit).flatMap((finding) =>
      suspectsOf(finding, categories, stories).map((one) => one.token.key),
    ),
  )
}

// Les mots d'un nom : ses majuscules, et ce qui précède la première.
const words = (name: string) => name.match(/^[a-z0-9]+|[A-Z][a-z0-9]*/g) ?? [name]

// Les candidats d'un nom, dans l'ordre : 3+1, 2+2, 1+3 lettres de ses deux
// premiers mots ; un mot seul n'a que ses quatre premières lettres.
function candidatesOf(name: string): string[] {
  const [first = name, second] = words(name)
  if (second === undefined) return [first.slice(0, 4)]
  return [
    first.slice(0, 3) + second.slice(0, 1),
    first.slice(0, 2) + second.slice(0, 2),
    first.slice(0, 1) + second.slice(0, 3),
  ]
}

// Quatre lettres au plus, la case faisant 40 px. Chaque nom prend son premier
// candidat ; tant qu'il reste des doublons, chacun de leurs membres passe au
// suivant. Un doublon qui n'a plus de candidat reste : l'infobulle départage.
export function abbreviationsOf(names: string[]): string[] {
  const candidates = names.map(candidatesOf)
  const at = names.map(() => 0)
  for (;;) {
    const shown = candidates.map((list, index) => list[at[index]!]!)
    const seen = new Map<string, number[]>()
    shown.forEach((one, index) => seen.set(one, [...(seen.get(one) ?? []), index]))
    let moved = false
    for (const indexes of seen.values()) {
      if (indexes.length < 2) continue
      for (const index of indexes)
        if (at[index]! < candidates[index]!.length - 1) {
          at[index]! += 1
          moved = true
        }
    }
    if (!moved) return shown
  }
}

// La clé d'une ligne de la liste, ce que l'adresse et le prompt reprennent.
export const tokenRow = (name: string) => `token:${name}`
export const ORPHANS = 'group:orphans'
export const READY = 'group:ready'

// Un composant classé : ses critères, son groupe et sa phrase.
export interface ComponentRow {
  component: HealthComponent
  key: string
  criteria: Criteria
  group: Group
  phrase: string
}

export interface Dashboard {
  rows: ComponentRow[]
  coverage: TokenCoverage
  columns: Record<Criterion, Column>
  score: number
  // Composants bloquants et alias cassés.
  blocking: number
  // Les lignes qui se cochent : à améliorer et bloquants, alias cassés, et une
  // pour tous les orphelins. Leur nombre est le badge de la barre d'activité.
  checkable: string[]
}

const ORDER: Record<Group, number> = { blocking: 0, improve: 1, ready: 2 }

export function dashboardOf(
  components: HealthComponent[],
  families: readonly TokensEntry[],
  causes: Causes,
): Dashboard {
  const rows = components
    .map((component): ComponentRow => {
      const criteria = criteriaOf(component, causes)
      return {
        component,
        key: keyOf(component),
        criteria,
        group: groupOf(criteria),
        phrase: phraseOf(component, criteria, causes),
      }
    })
    .sort(
      (one, other) =>
        ORDER[one.group] - ORDER[other.group] ||
        one.component.name.localeCompare(other.component.name, 'en'),
    )
  const coverage = tokenHealthOf(
    families,
    components,
    suspectKeysOf(causes.audit, causes.categories, causes.stories),
  )
  const columns = columnsOf(rows.map((one) => one.criteria))
  const broken = coverage.families.flatMap((family) =>
    family.tokens.filter((one) => one.state === 'broken'),
  )
  return {
    rows,
    coverage,
    columns,
    score: scoreOf(columns, { valid: coverage.used, total: coverage.total }),
    blocking: rows.filter((one) => one.group === 'blocking').length + broken.length,
    checkable: [
      ...rows.filter((one) => one.group !== 'ready').map((one) => one.key),
      ...broken.map((one) => tokenRow(one.name)),
      ...(coverage.orphans > 0 ? [ORPHANS] : []),
    ],
  }
}

// Cochées par défaut : les bloquants seulement, composants et alias cassés.
export function defaultSelection(dashboard: Dashboard): Set<string> {
  return new Set([
    ...dashboard.rows.filter((one) => one.group === 'blocking').map((one) => one.key),
    ...dashboard.coverage.families.flatMap((family) =>
      family.tokens.filter((one) => one.state === 'broken').map((one) => tokenRow(one.name)),
    ),
  ])
}

// La sélection gardée d'une relecture à l'autre : seules partent les lignes qui
// n'existent plus.
export function keptSelection(previous: ReadonlySet<string>, dashboard: Dashboard): Set<string> {
  const present = new Set(dashboard.checkable)
  return new Set([...previous].filter((key) => present.has(key)))
}
