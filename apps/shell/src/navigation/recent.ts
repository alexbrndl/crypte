import { ref } from 'vue'

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
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(kept) ? kept.filter(isVisit).slice(0, KEPT) : []
  } catch {
    return []
  }
}

export function useRecent() {
  const visits = ref<Visit[]>(read())

  function remember(key: string) {
    visits.value = [
      { key, at: Date.now() },
      ...visits.value.filter((one) => one.key !== key),
    ].slice(0, KEPT)
    try {
      localStorage.setItem(KEY, JSON.stringify(visits.value))
    } catch {
      // Stockage refusé : les récents durent le temps de la session.
    }
  }

  return { visits, remember }
}

export function ago(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`
  if (days < 30) return days < 14 ? 'last week' : `${Math.floor(days / 7)} weeks ago`
  const months = Math.floor(days / 30)
  return months === 1 ? 'last month' : `${months} months ago`
}
