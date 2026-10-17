import { STATUSES } from './tree'

// Les filtres de la palette, `is:` et `type:`, mêlés au nom cherché. Deux clés
// différentes se combinent, deux valeurs de la même clé s'additionnent :
// `is:draft is:stable type:story` garde les stories en brouillon ou stables.

export const FILTERS = {
  is: STATUSES,
  type: ['story', 'component', 'token'],
} as const

export type Key = keyof typeof FILTERS

export interface Query {
  is: string[]
  type: string[]
  text: string
}

const KEYS = Object.keys(FILTERS) as Key[]

// Un filtre sans valeur, `is:` tapé à moitié, ne filtre rien encore.
export function readQuery(query: string): Query {
  const read: Query = { is: [], type: [], text: '' }
  const words: string[] = []
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    const [key, ...rest] = word.split(':')
    const value = rest.join(':')
    if (rest.length > 0 && KEYS.includes(key as Key)) {
      if (value !== '') read[key as Key].push(value)
    } else words.push(word)
  }
  read.text = words.join(' ')
  return read
}

// Ce que ⇥ écrit à la place du dernier mot : la clé ou la valeur qu'il commence,
// jusqu'où les candidats s'accordent. `null` quand il n'y a rien à compléter.
export function complete(query: string): string | null {
  const start = query.search(/\S*$/)
  const word = query.slice(start)
  if (word === '') return null
  const [key, ...rest] = word.split(':')
  const done =
    rest.length === 0
      ? common(KEYS.filter((one) => one.startsWith(key!)).map((one) => `${one}:`))
      : KEYS.includes(key as Key)
        ? common(
            FILTERS[key as Key]
              .filter((one) => one.startsWith(rest.join(':')))
              .map((one) => `${key}:${one} `),
          )
        : null
  return done === null || done === word ? null : query.slice(0, start) + done
}

// Le préfixe commun ; un candidat seul est complet, espace final compris.
function common(candidates: string[]): string | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!
  let prefix = candidates[0]!
  for (const one of candidates) while (!one.startsWith(prefix)) prefix = prefix.slice(0, -1)
  return prefix.trimEnd()
}

// Le dernier mot, s'il est une clé en cours de valeur : `type:`, `is:st`. Une
// valeur entière, `is:draft`, filtre déjà, et une espace finale clôt le mot.
export function editing(query: string): { key: Key; partial: string; start: number } | null {
  const start = query.search(/\S*$/)
  const [key, ...rest] = query.slice(start).split(':')
  if (rest.length === 0 || !KEYS.includes(key as Key)) return null
  const partial = rest.join(':')
  const values: readonly string[] = FILTERS[key as Key]
  return values.includes(partial) ? null : { key: key as Key, partial, start }
}

// Les clés que commence le dernier mot, `ty` pour `type:`. Aucune sans mot.
export function keysStarted(query: string): Key[] {
  const word = query.slice(query.search(/\S*$/))
  if (word === '' || word.includes(':')) return []
  return KEYS.filter((key) => key.startsWith(word))
}
