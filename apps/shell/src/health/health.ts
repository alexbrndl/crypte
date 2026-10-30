// La vue santé : les composants du dossier déclaré, ce qu'il leur manque, et le
// score qui en sort. Les données viennent de `/@crypte/health.json`, la forme de
// `packages/cli/src/catalogue/health.ts`, que le shell ne peut pas importer.

import type { StoryEntry } from '@crypte/core/protocol'
import { cleanOf, drawnOf, failuresOf, findingsOf, type AuditResult } from './audit'
import { locale, texts } from '../i18n'

const t = texts({
  en: {
    overview: 'overview',
    unstoried: 'without story',
    failures: 'render errors',
    accessibility: 'accessibility',
    statuses: 'statuses',
    coverage: 'coverage',
    stories: 'stories',
    render: 'render',
    a11y: 'a11y',
  },
  fr: {
    overview: "vue d'ensemble",
    unstoried: 'sans story',
    failures: 'erreurs de rendu',
    accessibility: 'accessibilité',
    statuses: 'statuts',
    coverage: 'couverture',
    stories: 'stories',
    render: 'rendu',
    a11y: 'a11y',
  },
})

// Une story nommée « Composant / Story » ; une story absent du catalogue garde
// son identifiant.
export function storyName(stories: StoryEntry[], id: string): string {
  const story = stories.find((one) => one.id === id)
  return story ? `${story.path.at(-1)} / ${story.name}` : id
}

export interface HealthComponent {
  name: string
  file: string
  export: string
  stories: string[]
  props: number
  // Celles qu'une story doit donner : sans aucune, `Default` suffit.
  required: number
  status?: 'draft' | 'stable' | 'deprecated'
  changed?: string
  statusSince?: string
  skeleton?: { file: string; source: string }
  // Les composants du dossier qui l'importent, par leur clé : où un composant
  // déprécié sert encore.
  usedBy?: string[]
  // Les props qu'aucune de ses stories ne donne.
  unexercised?: string[]
  // Les fichiers de l'application qui l'importent, hors dossier et stories.
  usedIn?: string[]
  // Les propriétés personnalisées que son fichier lit, story ou pas.
  tokens?: string[]
}

export interface Health {
  components: HealthComponent[] | null
}

export type HealthPage =
  | 'overview'
  | 'unstoried'
  | 'failures'
  | 'accessibility'
  | 'statuses'
  | 'coverage'

// `label` lu à chaque accès, dans la langue du moment.
export const PAGES: { page: HealthPage; readonly label: string }[] = (
  ['overview', 'unstoried', 'failures', 'accessibility', 'statuses', 'coverage'] as const
).map((page) => ({
  page,
  get label() {
    return t(page)
  },
}))

// La clé d'un composant dans l'adresse : son fichier et son export, deux
// composants du même nom dans deux fichiers restant distincts.
export const keyOf = (one: HealthComponent) => `${one.file}:${one.export}`

export interface Gauge {
  label: string
  done: number
  total: number
}

// Une jauge par ce qui se mesure : les stories, puis, l'audit passé, le rendu et
// l'a11y quand le plugin a jugé. La doc s'ajoute avec ses données. Le score est
// leur moyenne, sans pondération.
export function gaugesOf(
  components: HealthComponent[],
  audit: AuditResult[] | null = null,
): Gauge[] {
  const stories = {
    label: t('stories'),
    done: components.filter((one) => one.stories.length > 0).length,
    total: components.length,
  }
  if (audit === null) return [stories]
  const { drawn, audited } = drawnOf(audit)
  const render = { label: t('render'), done: drawn, total: audited }
  const { clean, audited: judged } = cleanOf(audit)
  return judged === 0
    ? [stories, render]
    : [stories, render, { label: t('a11y'), done: clean, total: judged }]
}

export function scoreOf(gauges: Gauge[]): number {
  const measured = gauges.filter((one) => one.total > 0)
  if (measured.length === 0) return 0
  const mean = measured.reduce((sum, one) => sum + one.done / one.total, 0) / measured.length
  return Math.round(mean * 100)
}

// Ce qu'il reste à faire sur un composant : pas de story, ou un statut déprécié
// qu'un autre composant importe encore.
export const problemsOf = (one: HealthComponent) =>
  (one.stories.length === 0 ? 1 : 0) +
  (one.status === 'deprecated' && (one.usedBy?.length ?? 0) > 0 ? 1 : 0)

// Les composants de chaque page, dans l'ordre que la maquette annonce.
export function rowsOf(page: HealthPage, components: HealthComponent[]): HealthComponent[] {
  const byName = (one: HealthComponent, other: HealthComponent) =>
    one.name.localeCompare(other.name, 'en')
  if (page === 'unstoried')
    return components
      .filter((one) => one.stories.length === 0)
      .sort((one, other) => other.props - one.props || byName(one, other))
  if (page === 'accessibility' || page === 'failures') return []
  // Ce qu'une story n'exerce pas, puis ce que l'application n'importe pas : les
  // props manquantes d'abord, les plus nombreuses en tête.
  if (page === 'coverage')
    return components
      .filter((one) => (one.unexercised?.length ?? 0) > 0 || one.usedIn === undefined)
      .sort(
        (one, other) =>
          (other.unexercised?.length ?? 0) - (one.unexercised?.length ?? 0) ||
          (one.usedIn?.length ?? 0) - (other.usedIn?.length ?? 0) ||
          byName(one, other),
      )
  if (page === 'statuses') {
    const rank = { deprecated: 0, draft: 1 } as const
    return components
      .filter((one) => one.status === 'deprecated' || one.status === 'draft')
      .sort(
        (one, other) =>
          rank[one.status as keyof typeof rank] - rank[other.status as keyof typeof rank] ||
          (other.usedBy?.length ?? 0) - (one.usedBy?.length ?? 0) ||
          byName(one, other),
      )
  }
  return [...components].sort(
    (one, other) => problemsOf(other) - problemsOf(one) || byName(one, other),
  )
}

// Ce qu'il reste à faire, le badge de l'activity bar : les composants sans story,
// les stories qui ne rendent pas, et les violations trouvées.
export function todoOf(components: HealthComponent[] | null, audit: AuditResult[] | null): number {
  const unstoried = components?.filter((one) => one.stories.length === 0).length ?? 0
  if (audit === null) return unstoried
  return unstoried + failuresOf(audit).length + findingsOf(audit).length
}

// Un jour court, `14 Oct` ou `14 oct.`, pour les dates d'un tableau.
export const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
