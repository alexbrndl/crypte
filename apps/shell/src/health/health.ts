// La vue santé : les composants du dossier déclaré, ce qu'il leur manque, et le
// score qui en sort. Les données viennent de `/@crypte/health.json`, la forme de
// `packages/cli/src/catalogue/health.ts`, que le shell ne peut pas importer.

import { cleanOf, type AuditResult } from './audit'

export interface HealthComponent {
  name: string
  file: string
  export: string
  stories: string[]
  props: number
  status?: 'draft' | 'stable' | 'deprecated'
  changed?: string
  statusSince?: string
  skeleton?: { file: string; source: string }
}

export interface Health {
  components: HealthComponent[] | null
}

export type HealthPage = 'overview' | 'unstoried' | 'accessibility' | 'statuses'

export const PAGES: { page: HealthPage; label: string }[] = [
  { page: 'overview', label: 'overview' },
  { page: 'unstoried', label: 'without story' },
  { page: 'accessibility', label: 'accessibility' },
  { page: 'statuses', label: 'statuses' },
]

// La clé d'un composant dans l'adresse : son fichier et son export, deux
// composants du même nom dans deux fichiers restant distincts.
export const keyOf = (one: HealthComponent) => `${one.file}:${one.export}`

export interface Gauge {
  label: string
  done: number
  total: number
}

// Une jauge par ce qui se mesure : les stories, et l'a11y une fois l'audit
// passé. La doc s'ajoute avec ses données. Le score est leur moyenne, sans
// pondération.
export function gaugesOf(
  components: HealthComponent[],
  audit: AuditResult[] | null = null,
): Gauge[] {
  const stories = {
    label: 'stories',
    done: components.filter((one) => one.stories.length > 0).length,
    total: components.length,
  }
  if (audit === null) return [stories]
  const { clean, audited } = cleanOf(audit)
  return [stories, { label: 'a11y', done: clean, total: audited }]
}

export function scoreOf(gauges: Gauge[]): number {
  const measured = gauges.filter((one) => one.total > 0)
  if (measured.length === 0) return 0
  const mean = measured.reduce((sum, one) => sum + one.done / one.total, 0) / measured.length
  return Math.round(mean * 100)
}

// Ce qu'il reste à faire sur un composant : pas de story, ou un statut déprécié
// qu'une story utilise encore.
export const problemsOf = (one: HealthComponent) =>
  (one.stories.length === 0 ? 1 : 0) +
  (one.status === 'deprecated' && one.stories.length > 0 ? 1 : 0)

// Les composants de chaque page, dans l'ordre que la maquette annonce.
export function rowsOf(page: HealthPage, components: HealthComponent[]): HealthComponent[] {
  const byName = (one: HealthComponent, other: HealthComponent) =>
    one.name.localeCompare(other.name, 'en')
  if (page === 'unstoried')
    return components
      .filter((one) => one.stories.length === 0)
      .sort((one, other) => other.props - one.props || byName(one, other))
  if (page === 'accessibility') return []
  if (page === 'statuses') {
    const rank = { deprecated: 0, draft: 1 } as const
    return components
      .filter((one) => one.status === 'deprecated' || one.status === 'draft')
      .sort(
        (one, other) =>
          rank[one.status as keyof typeof rank] - rank[other.status as keyof typeof rank] ||
          other.stories.length - one.stories.length ||
          byName(one, other),
      )
  }
  return [...components].sort(
    (one, other) => problemsOf(other) - problemsOf(one) || byName(one, other),
  )
}

// Un jour court, `14 Oct`, pour les dates d'un tableau.
export const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
