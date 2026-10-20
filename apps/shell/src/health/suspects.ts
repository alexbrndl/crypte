import type { StoryEntry, Theme } from '@crypte/core/protocol'
import { valueIn, type Category, type Token } from '../tokens/categories'
import type { Finding } from './audit'

// Les tokens probablement en cause d'un défaut de contraste : ceux dont la
// valeur dans un thème de la violation est une couleur qu'axe a mesurée dans ce
// thème-là.
// Rapprochés par la valeur seule, deux tokens de même valeur le sont tous les
// deux : d'où « probable ». Les plus lus d'abord, avec le nombre de composants
// qui les lisent.
export interface Suspect {
  category: string
  token: Token
  readers: number
}

export function suspectsOf(
  finding: Finding,
  categories: Category[],
  stories: StoryEntry[],
): Suspect[] {
  const measured = (theme: Theme) => new Set((finding.colors[theme] ?? []).map(colorOf))
  if (finding.themes.every((theme) => measured(theme).size === 0)) return []
  const readers = (name: string) =>
    new Set(
      stories
        .filter((one) => one.component.tokens?.includes(name))
        .map((one) => one.component.file),
    ).size
  return categories
    .flatMap((category) =>
      category.groups.flatMap((group) =>
        group.tokens
          .filter((token) =>
            finding.themes.some((theme) => {
              const value = valueIn(token.value, theme)
              return value !== undefined && measured(theme).has(colorOf(value))
            }),
          )
          .map((token) => ({ category: category.name, token, readers: readers(token.name) })),
      ),
    )
    .sort(
      (one, other) =>
        other.readers - one.readers || one.token.name.localeCompare(other.token.name, 'en'),
    )
}

// Une couleur sous une forme comparable : un hexadécimal en minuscules, sur six
// chiffres, opaque sans canal alpha, et `rgb()` converti ; le reste tel quel.
export function colorOf(value: string): string {
  const text = value.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  const opaque = /^(#[0-9a-f]{6})ff$/.exec(text)
  if (opaque) return opaque[1]!
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*1(?:\.0+)?\s*)?\)$/.exec(text)
  if (rgb)
    return `#${rgb
      .slice(1, 4)
      .map((one) => Number(one).toString(16).padStart(2, '0'))
      .join('')}`
  return text
}
