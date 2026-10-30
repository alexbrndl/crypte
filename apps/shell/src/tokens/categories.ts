import type { TokensEntry, TokenValue } from '@crypte/core/protocol'

// Les catégories de la vue tokens, calculées ici, par le seul qui les dessine : le
// plugin rend des familles, le premier segment du nom, et `text` y mêle couleurs
// et tailles. Rouvert si un second lecteur a besoin des mêmes catégories : elles
// iraient alors dans `TokensEntry.path`, que le plugin remplit.

export interface Token {
  // Le nom de la propriété sans ses tirets, ce qu'un `var(--…)` écrit quand la
  // famille vient de @crypte/tokens. Deux familles d'un autre producteur peuvent
  // le partager : `key`, lui, est unique.
  name: string
  key: string
  // La clé dans sa famille, ce que la maquette écrit sous un nuancier : la
  // famille est dans l'en-tête du groupe.
  label: string
  family: string
  value: TokenValue
}

export interface Group {
  // L'identifiant de la famille, seul unique (§4.3) : deux familles peuvent porter
  // le même `name`.
  id: string
  family: string
  tokens: Token[]
}

export interface Category {
  name: string
  groups: Group[]
  count: number
}

// Les familles que la typographie rassemble, sur les noms des variables Figma, dans
// l'ordre de sa page : taille, interligne, graisse, approche, famille.
const TYPOGRAPHY = ['text', 'leading', 'weight', 'tracking', 'font']

// L'ordre de la sidebar Figma, puis la palette, puis le reste par nom.
const ORDER = ['color', 'space', 'radius', 'typography', 'stroke', 'size', 'palette']

// `--radius` donne la famille et la clé `radius` : un nom sans tiret.
export const nameOf = (family: string, key: string) =>
  family === key ? family : `${family}-${key}`

// Les noms que les chaînes d'un token parcourent, dans tous ses thèmes : ce qu'il
// atteint, et ce par quoi il passe pour un token qui pointe vers un autre.
export const chainOf = (value: TokenValue) => [
  ...new Set(Object.values(value.themes).flatMap((held) => held.alias ?? [])),
]

const aliased = (value: TokenValue) => Object.values(value.themes).some((one) => one.alias)

function categoryOf(family: string, value: TokenValue, semantic: boolean): string {
  if (value.type === 'color') return semantic ? 'color' : 'palette'
  return TYPOGRAPHY.includes(family) ? 'typography' : family
}

export function categoriesOf(families: readonly TokensEntry[]): Category[] {
  const found = new Map<string, Map<string, { family: string; tokens: Token[] }>>()

  for (const entry of families) {
    const colors = Object.values(entry.tokens).filter((value) => value.type === 'color')
    // Une famille de couleurs dont aucun token ne pointe ailleurs est une palette,
    // comme `stone` ou `base` ; un seul alias en fait une famille sémantique.
    const semantic = colors.some(aliased)

    for (const [key, value] of Object.entries(entry.tokens)) {
      const category = categoryOf(entry.name, value, semantic)
      const groups = found.get(category) ?? new Map<string, { family: string; tokens: Token[] }>()
      const group = groups.get(entry.id) ?? { family: entry.name, tokens: [] }
      group.tokens.push({
        name: nameOf(entry.name, key),
        key: `${entry.id}/${key}`,
        label: key,
        family: entry.name,
        value,
      })
      groups.set(entry.id, group)
      found.set(category, groups)
    }
  }

  const rank = (name: string) => {
    const at = ORDER.indexOf(name)
    return at === -1 ? ORDER.length : at
  }

  return [...found]
    .map(([name, groups]) => ({
      name,
      groups: [...groups]
        .map(([id, group]) => ({ id, family: group.family, tokens: scaled(group.tokens) }))
        .sort((one, other) => typeRank(one.family) - typeRank(other.family)),
      count: [...groups.values()].reduce((sum, group) => sum + group.tokens.length, 0),
    }))
    .sort((one, other) => rank(one.name) - rank(other.name) || one.name.localeCompare(other.name))
}

const typeRank = (family: string) => {
  const at = TYPOGRAPHY.indexOf(family)
  return at === -1 ? 0 : at
}

// Une échelle se lit dans l'ordre de ses valeurs, pas de ses noms : le plugin
// trie par nom, et `space-0-25` venait après `space-32`. Seulement quand chaque
// valeur est un nombre dans une même unité, sinon l'ordre des noms reste.
function scaled(tokens: Token[]): Token[] {
  const read = tokens.map((token) => {
    const held = token.value.themes['default'] ?? Object.values(token.value.themes)[0]
    return /^(-?\d*\.?\d+)([a-z%]*)$/.exec(held?.value ?? '')
  })
  const units = new Set(read.map((one) => (one && one[1] !== '0' ? one[2] : 'any')))
  units.delete('any')
  if (read.some((one) => one === null) || units.size > 1) return tokens

  return tokens
    .map((token, at) => ({ token, at: Number(read[at]![1]) }))
    .sort((one, other) => one.at - other.at)
    .map((one) => one.token)
}

// Un hexadécimal en capitales, comme les variables Figma l'écrivent ; le reste tel quel.
export const shown = (value: string) =>
  /^#[0-9a-f]{3,8}$/i.test(value) ? value.toUpperCase() : value

// La valeur d'un token dans le thème affiché : la sienne, sinon celle de `default`,
// qui vaut pour tous. Rien quand la source ne dit rien de ce thème (§4.2) : une
// valeur prise à un autre thème serait inventée.
export function valueIn(value: TokenValue, theme: string): string | undefined {
  return (value.themes[theme] ?? value.themes['default'])?.value
}
