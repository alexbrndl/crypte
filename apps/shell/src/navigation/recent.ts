import { ref } from 'vue'
import { texts } from '../i18n'
import { keep, kept } from '../storage'

// Les derniers endroits ouverts, que la palette propose quand rien n'est tapé :
// une story, une page composant, une famille de tokens ou la vue versions, sous la
// clé de leur commande. Retenus par le shell, comme l'arbre replié.

export interface Visit {
  key: string
  at: number
}

const KEY = 'crypte:palette:recent'
const KEPT = 5

const isVisit = (one: unknown): one is Visit =>
  typeof one === 'object' &&
  one !== null &&
  typeof (one as Visit).key === 'string' &&
  typeof (one as Visit).at === 'number'

const read = (): Visit[] => {
  const stored = kept(KEY)
  return Array.isArray(stored) ? stored.filter(isVisit).slice(0, KEPT) : []
}

export function useRecent() {
  const visits = ref<Visit[]>(read())

  function remember(key: string) {
    visits.value = [
      { key, at: Date.now() },
      ...visits.value.filter((one) => one.key !== key),
    ].slice(0, KEPT)
    keep(KEY, visits.value)
  }

  return { visits, remember }
}

const t = texts({
  en: {
    now: 'just now',
    minutes: '{count} min ago',
    hours: '{count} h ago',
    yesterday: 'yesterday',
    days: '{count} days ago',
    lastWeek: 'last week',
    weeks: '{count} weeks ago',
    lastMonth: 'last month',
    months: '{count} months ago',
  },
  fr: {
    now: "à l'instant",
    minutes: 'il y a {count} min',
    hours: 'il y a {count} h',
    yesterday: 'hier',
    days: 'il y a {count} jours',
    lastWeek: 'la semaine dernière',
    weeks: 'il y a {count} semaines',
    lastMonth: 'le mois dernier',
    months: 'il y a {count} mois',
  },
})

export function ago(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return t('now')
  if (minutes < 60) return t('minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hours', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return days === 1 ? t('yesterday') : t('days', { count: days })
  if (days < 30) return days < 14 ? t('lastWeek') : t('weeks', { count: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  return months === 1 ? t('lastMonth') : t('months', { count: months })
}
