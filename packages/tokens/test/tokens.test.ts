import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NodeContext, TokensEntry } from '@crypte/core/protocol'
import { afterAll, describe, expect, it } from 'vitest'
import tokens, { type TokensOptions } from '../src/index'

// Ce que le plugin lit d'une feuille de style, et ce qu'il refuse de deviner.

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

// Un projet jetable portant une feuille de style, et le hook appelé dessus.
function read(css: string | undefined, options?: TokensOptions): TokensEntry[] {
  const root = mkdtempSync(join(tmpdir(), 'crypte-tokens-'))
  roots.push(root)

  if (css !== undefined) writeFileSync(join(root, 'styles.css'), css)

  const ctx: NodeContext = { root, ...(css === undefined ? {} : { css: 'styles.css' }) }
  const entries = tokens(options).node?.entries?.(ctx)

  return (entries ?? []) as TokensEntry[]
}

const family = (entries: TokensEntry[], name: string) =>
  entries.find((one) => one.name === name)?.tokens

describe('ce que le plugin ne produit pas', () => {
  // La contrainte dure de l'issue : il entre dans le préréglage par défaut,
  // donc il tourne chez des gens qui ne l'ont pas demandé.
  // Une feuille bien remplie **sur le disque**, et un contexte qui ne la déclare
  // pas. Sans le fichier, ce cas passerait aussi sur un plugin qui devine un
  // chemin, et c'est ce qu'il existe pour interdire : mesuré, la version d'avant
  // restait verte en faisant deviner `styles.css`.
  it('ne devine aucun chemin quand le projet ne déclare pas de feuille', () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-tokens-'))
    roots.push(root)
    writeFileSync(join(root, 'styles.css'), ':root { --color-bg: #fff }')
    writeFileSync(join(root, 'src.css'), ':root { --color-bg: #fff }')

    expect(tokens().node?.entries?.({ root })).toEqual([])
  })

  it('ne produit rien quand la feuille déclarée n’existe pas', () => {
    expect(read(undefined, { files: ['absente.css'] })).toEqual([])
  })

  it('ne produit rien d’une feuille sans variable', () => {
    expect(read(':root { color: red }\n.a { padding: 0 }')).toEqual([])
  })

  // Une classe ou un attribut que personne n'a déclaré comme thème serait une
  // devinette, et un mauvais thème est pire qu'un thème manquant.
  it('ne lit pas un sélecteur qui n’est pas un thème', () => {
    expect(read('.dark { --color-bg: #000 }')).toEqual([])
  })

  it('ne lit pas une variable commentée', () => {
    expect(read(':root { /* --color-bg: #000; */ }')).toEqual([])
  })
})

describe('ce que le plugin lit', () => {
  it('groupe par premier segment, et garde un nom sans segment', () => {
    const entries = read(':root { --color-brand: #4fe0a0; --radius: 4px }')

    // La section 4.3 joint le chemin au nom par `--`, pas par `/`.
    expect(entries.map((one) => one.id)).toEqual(['tokens--color', 'tokens--radius'])
    expect(entries.map((one) => one.path)).toEqual([['Tokens'], ['Tokens']])
    expect(Object.keys(family(entries, 'color') ?? {})).toEqual(['brand'])
    expect(Object.keys(family(entries, 'radius') ?? {})).toEqual(['radius'])
  })

  it('range une variable de :root dans le thème par défaut', () => {
    const entries = read(':root { --color-bg: #fff }')

    expect(family(entries, 'color')?.bg?.themes).toEqual({ default: { value: '#fff' } })
  })

  it('lit un thème nommé par data-theme', () => {
    const entries = read(`:root { --color-bg: #fff }\n[data-theme='dark'] { --color-bg: #000 }`)

    expect(family(entries, 'color')?.bg?.themes).toEqual({
      default: { value: '#fff' },
      dark: { value: '#000' },
    })
  })

  // Le cas qui rend `themes` non trivial, et celui qu'une lecture naïve casse :
  // sans extraction à accolades équilibrées, le `:root` intérieur écrasait le
  // thème par défaut au lieu d'en ouvrir un second.
  it('lit prefers-color-scheme sans écraser le thème par défaut', () => {
    const entries = read(
      ':root { --color-bg: #fff }\n@media (prefers-color-scheme: dark) {\n  :root { --color-bg: #000 }\n}\n',
    )

    expect(family(entries, 'color')?.bg?.themes).toEqual({
      default: { value: '#fff' },
      dark: { value: '#000' },
    })
  })

  it('applique les options plutôt que la feuille déclarée', () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-tokens-'))
    roots.push(root)
    writeFileSync(join(root, 'declaree.css'), ':root { --a-one: 1px }')
    writeFileSync(join(root, 'choisie.css'), ':root { --b-two: 2px }')

    const entries = tokens({ files: ['choisie.css'] }).node?.entries?.({
      root,
      css: 'declaree.css',
    })

    expect(entries?.map((one) => one.name)).toEqual(['b'])
  })
})

describe('la chaîne de résolution', () => {
  it('rend le littéral et le nom traversé', () => {
    const entries = read(':root { --color-brand: #4fe0a0; --color-button: var(--color-brand) }')

    expect(family(entries, 'color')?.button?.themes.default).toEqual({
      value: '#4fe0a0',
      alias: ['color-brand'],
    })
  })

  it('traverse plusieurs sauts, du token vers le littéral', () => {
    const entries = read(':root { --a-one: #fff; --a-two: var(--a-one); --a-three: var(--a-two) }')

    expect(family(entries, 'a')?.three?.themes.default).toEqual({
      value: '#fff',
      alias: ['a-two', 'a-one'],
    })
  })

  // `value` est toujours posé : un swatch rend depuis lui seul, donc une chaîne
  // qui ne mène nulle part garde son propre texte.
  it('garde le texte quand la chaîne ne mène nulle part', () => {
    const entries = read(':root { --a-one: var(--jamais-declaree) }')

    expect(family(entries, 'a')?.one?.themes.default).toEqual({
      value: 'var(--jamais-declaree)',
      alias: ['jamais-declaree'],
    })
  })

  it('s’arrête sur un cycle plutôt que de boucler', () => {
    const entries = read(':root { --a-one: var(--a-two); --a-two: var(--a-one) }')

    expect(family(entries, 'a')?.one?.themes.default?.alias).toEqual(['a-two', 'a-one'])
  })

  it('n’ajoute pas d’alias à un littéral', () => {
    const entries = read(':root { --a-one: #fff }')

    expect('alias' in (family(entries, 'a')?.one?.themes.default ?? {})).toBe(false)
  })
})

describe('la nature d’un token', () => {
  const kindOf = (value: string) => family(read(`:root { --a-one: ${value} }`), 'a')?.one?.type

  it('lit les couleurs', () => {
    expect(kindOf('#4fe0a0')).toBe('color')
    expect(kindOf('rgb(1 2 3)')).toBe('color')
    expect(kindOf('oklch(0.7 0.1 150)')).toBe('color')
  })

  it('lit les dimensions et les nombres', () => {
    expect(kindOf('4px')).toBe('dimension')
    expect(kindOf('1.5rem')).toBe('dimension')
    expect(kindOf('-2%')).toBe('dimension')
    expect(kindOf('1.5')).toBe('number')
  })

  // `fontFamily` et `fontWeight` demandent la propriété sur laquelle la variable
  // est employée, qu'elle ne porte pas. Ils retombent sur `unknown`.
  it('retombe sur unknown plutôt que de deviner', () => {
    expect(kindOf('system-ui, sans-serif')).toBe('unknown')
    expect(kindOf('cubic-bezier(0.2, 0, 0, 1)')).toBe('unknown')
  })

  // Le thème par défaut est consulté en premier, mais un `unknown` de sa part ne
  // ferme pas la question : la nature décrit le token, pas la valeur d'un thème.
  it('laisse un autre thème nommer la nature que le défaut n’a pas nommée', () => {
    const entries = read(':root { --a-one: var(--absente) }\n[data-theme="dark"] { --a-one: #000 }')

    expect(family(entries, 'a')?.one?.type).toBe('color')
  })

  // L'ordre des thèmes ne suit pas celui du fichier : sans l'ordre imposé, un
  // thème sombre venu d'un `@media` était parcouru en premier, et `themes` se
  // sérialisait `dark` avant `default`. Mesuré.
  it('range le thème par défaut en premier, quel que soit l’ordre du fichier', () => {
    const media = read(
      ':root { --a-one: #fff }\n@media (prefers-color-scheme: dark) { :root { --a-one: #000 } }',
    )

    expect(Object.keys(family(media, 'a')?.one?.themes ?? {})).toEqual(['default', 'dark'])
  })
})

// Le croisement que la première version de ces cas n'a pas fait : chaque forme de
// valeur, littéral / alias / repli, contre chaque forme de thème. Le bloquant de
// la revue de #52 vivait dans une de ces cases.
describe('une valeur croisée avec un thème', () => {
  // Sans repli du thème sur le défaut, ce token n'avait aucune valeur sombre, et
  // la pastille n'avait rien à dessiner en sombre.
  it('suit un alias jusqu’à ce que le thème a redéfini', () => {
    const entries = read(
      ':root { --color-base: #e5e7eb; --color-bg: var(--color-base) }\n@media (prefers-color-scheme: dark) { :root { --color-base: #374151 } }',
    )

    expect(family(entries, 'color')?.bg?.themes).toEqual({
      default: { value: '#e5e7eb', alias: ['color-base'] },
      dark: { value: '#374151', alias: ['color-base'] },
    })
  })

  // Un lecteur prend `themes[courant]` et doit y trouver quelque chose, donc un
  // token que le thème ne redéfinit pas y porte quand même sa valeur.
  it('donne à chaque token chaque thème, même sans redéfinition', () => {
    const entries = read(
      ':root { --a-one: 4px; --a-two: #fff }\n[data-theme="dark"] { --a-two: #000 }',
    )

    expect(family(entries, 'a')?.one?.themes).toEqual({
      default: { value: '4px' },
      dark: { value: '4px' },
    })
  })

  it('ne donne qu’un thème quand la feuille n’en déclare qu’un', () => {
    expect(Object.keys(family(read(':root { --a-one: 4px }'), 'a')?.one?.themes ?? {})).toEqual([
      'default',
    ])
  })

  it('lit un token qu’un thème seul déclare', () => {
    const entries = read(':root { --a-one: 4px }\n[data-theme="dark"] { --a-two: 8px }')

    expect(family(entries, 'a')?.two?.themes).toEqual({ dark: { value: '8px' } })
  })
})

describe('les formes que la revue a mesurées', () => {
  it('emploie le repli d’un var() quand rien ne déclare sa cible', () => {
    expect(family(read(':root { --a-one: var(--jamais, 4px) }'), 'a')?.one?.themes.default).toEqual(
      {
        value: '4px',
        alias: ['jamais'],
      },
    )
  })

  it('préfère la cible déclarée au repli', () => {
    const entries = read(':root { --a-base: #fff; --a-one: var(--a-base, #000) }')

    expect(family(entries, 'a')?.one?.themes.default?.value).toBe('#fff')
  })

  // Le CLI résout ce champ par `resolve`, donc un `css` absolu marche chez lui.
  // Le plugin joignait, et lisait `<root>/<root>/…` sans que rien ne le dise.
  it('lit une feuille déclarée par un chemin absolu', () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-tokens-'))
    roots.push(root)
    writeFileSync(join(root, 'styles.css'), ':root { --a-one: #fff }')

    const entries = tokens().node?.entries?.({ root, css: join(root, 'styles.css') })

    expect(entries?.map((one) => one.name)).toEqual(['a'])
  })

  // Un bloc jamais refermé court jusqu'à la fin, ce qu'un navigateur en fait.
  // Le laisser dans le reste remettait son `:root` dans le thème par défaut et
  // l'écrasait, c'est-à-dire la panne même que `liftDark` empêche.
  it('traite un @media sombre jamais refermé comme allant jusqu’à la fin', () => {
    const entries = read(
      ':root { --a-one: #fff }\n@media (prefers-color-scheme: dark) { :root { --a-one: #000 }',
    )

    expect(family(entries, 'a')?.one?.themes).toEqual({
      default: { value: '#fff' },
      dark: { value: '#000' },
    })
  })
})
