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

describe('what the plugin does not produce', () => {
  // La contrainte dure de l'issue : il entre dans le préréglage par défaut,
  // donc il tourne chez des gens qui ne l'ont pas demandé.
  // Une feuille bien remplie **sur le disque**, et un contexte qui ne la déclare
  // pas. Sans le fichier, ce cas passerait aussi sur un plugin qui devine un
  // chemin, et c'est ce qu'il existe pour interdire : mesuré, la version d'avant
  // restait verte en faisant deviner `styles.css`.
  it('guesses no path when the project declares no stylesheet', () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-tokens-'))
    roots.push(root)
    writeFileSync(join(root, 'styles.css'), ':root { --color-bg: #fff }')
    writeFileSync(join(root, 'src.css'), ':root { --color-bg: #fff }')

    expect(tokens().node?.entries?.({ root })).toEqual([])
  })

  it('produces nothing when the declared stylesheet does not exist', () => {
    expect(read(undefined, { files: ['absente.css'] })).toEqual([])
  })

  it('produces nothing from a stylesheet without variables', () => {
    expect(read(':root { color: red }\n.a { padding: 0 }')).toEqual([])
  })

  // Une classe ou un attribut que personne n'a déclaré comme thème serait une
  // devinette, et un mauvais thème est pire qu'un thème manquant.
  it('does not read a selector that is not a theme', () => {
    expect(read('.dark { --color-bg: #000 }')).toEqual([])
  })

  it('does not read a commented-out variable', () => {
    expect(read(':root { /* --color-bg: #000; */ }')).toEqual([])
  })
})

describe('what the plugin reads', () => {
  it('groups by first segment, and keeps a name without a segment', () => {
    const entries = read(':root { --color-brand: #4fe0a0; --radius: 4px }')

    // La section 4.3 joint le chemin au nom par `--`, pas par `/`.
    expect(entries.map((one) => one.id)).toEqual(['tokens--color', 'tokens--radius'])
    expect(entries.map((one) => one.path)).toEqual([['Tokens'], ['Tokens']])
    expect(Object.keys(family(entries, 'color') ?? {})).toEqual(['brand'])
    expect(Object.keys(family(entries, 'radius') ?? {})).toEqual(['radius'])
  })

  it('files a :root variable under the default theme', () => {
    const entries = read(':root { --color-bg: #fff }')

    expect(family(entries, 'color')?.bg?.themes).toEqual({ default: { value: '#fff' } })
  })

  it('reads a theme named by data-theme', () => {
    const entries = read(`:root { --color-bg: #fff }\n[data-theme='dark'] { --color-bg: #000 }`)

    expect(family(entries, 'color')?.bg?.themes).toEqual({
      default: { value: '#fff' },
      dark: { value: '#000' },
    })
  })

  it('applies the options rather than the declared stylesheet', () => {
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

describe('the resolution chain', () => {
  it('stops on a cycle rather than looping', () => {
    const entries = read(':root { --a-one: var(--a-two); --a-two: var(--a-one) }')

    expect(family(entries, 'a')?.one?.themes.default?.alias).toEqual(['a-two', 'a-one'])
  })
})

describe('the kind of a token', () => {
  const kindOf = (value: string) => family(read(`:root { --a-one: ${value} }`), 'a')?.one?.type

  it('reads colors', () => {
    expect(kindOf('#4fe0a0')).toBe('color')
    expect(kindOf('rgb(1 2 3)')).toBe('color')
    expect(kindOf('oklch(0.7 0.1 150)')).toBe('color')
  })

  it('reads dimensions and numbers', () => {
    expect(kindOf('4px')).toBe('dimension')
    expect(kindOf('1.5rem')).toBe('dimension')
    expect(kindOf('-2%')).toBe('dimension')
    expect(kindOf('1.5')).toBe('number')
  })

  // `fontFamily` et `fontWeight` demandent la propriété sur laquelle la variable
  // est employée, qu'elle ne porte pas. Ils retombent sur `unknown`.
  it('falls back to unknown rather than guessing', () => {
    expect(kindOf('system-ui, sans-serif')).toBe('unknown')
    expect(kindOf('cubic-bezier(0.2, 0, 0, 1)')).toBe('unknown')
  })

  // Le thème par défaut est consulté en premier, mais un `unknown` de sa part ne
  // ferme pas la question : la nature décrit le token, pas la valeur d'un thème.
  it('lets another theme name the kind the default did not name', () => {
    const entries = read(':root { --a-one: var(--absente) }\n[data-theme="dark"] { --a-one: #000 }')

    expect(family(entries, 'a')?.one?.type).toBe('color')
  })

  // L'ordre des thèmes ne suit pas celui du fichier : sans l'ordre imposé, un
  // thème sombre venu d'un `@media` était parcouru en premier, et `themes` se
  // sérialisait `dark` avant `default`. Mesuré.
  it('puts the default theme first, whatever the file order', () => {
    const media = read(
      ':root { --a-one: #fff }\n@media (prefers-color-scheme: dark) { :root { --a-one: #000 } }',
    )

    expect(Object.keys(family(media, 'a')?.one?.themes ?? {})).toEqual(['default', 'dark'])
  })
})

// Le croisement que la première version de ces cas n'a pas fait : chaque forme de
// valeur, littéral / alias / repli, contre chaque forme de thème. Le bloquant de
// la revue de #52 vivait dans une de ces cases.
describe('a value crossed with a theme', () => {
  // Sans repli du thème sur le défaut, ce token n'avait aucune valeur sombre, et
  // la pastille n'avait rien à dessiner en sombre.
  it('follows an alias down to what the theme redefined', () => {
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
  it('gives every token every theme, even without a redefinition', () => {
    const entries = read(
      ':root { --a-one: 4px; --a-two: #fff }\n[data-theme="dark"] { --a-two: #000 }',
    )

    expect(family(entries, 'a')?.one?.themes).toEqual({
      default: { value: '4px' },
      dark: { value: '4px' },
    })
  })

  it('reads a token only one theme declares', () => {
    const entries = read(':root { --a-one: 4px }\n[data-theme="dark"] { --a-two: 8px }')

    expect(family(entries, 'a')?.two?.themes).toEqual({ dark: { value: '8px' } })
  })
})

describe('the shapes the review measured', () => {
  it('prefers the declared target over the fallback', () => {
    const entries = read(':root { --a-base: #fff; --a-one: var(--a-base, #000) }')

    expect(family(entries, 'a')?.one?.themes.default?.value).toBe('#fff')
  })

  // Le CLI résout ce champ par `resolve`, donc un `css` absolu marche chez lui.
  // Le plugin joignait, et lisait `<root>/<root>/…` sans que rien ne le dise.
  it('reads a stylesheet declared by an absolute path', () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-tokens-'))
    roots.push(root)
    writeFileSync(join(root, 'styles.css'), ':root { --a-one: #fff }')

    const entries = tokens().node?.entries?.({ root, css: join(root, 'styles.css') })

    expect(entries?.map((one) => one.name)).toEqual(['a'])
  })

  // Un bloc jamais refermé court jusqu'à la fin, ce qu'un navigateur en fait.
  // Le laisser dans le reste remettait son `:root` dans le thème par défaut et
  // l'écrasait, c'est-à-dire la panne même que `liftDark` empêche.
  it('treats an unclosed dark @media as running to the end', () => {
    const entries = read(
      ':root { --a-one: #fff }\n@media (prefers-color-scheme: dark) { :root { --a-one: #000 }',
    )

    expect(family(entries, 'a')?.one?.themes).toEqual({
      default: { value: '#fff' },
      dark: { value: '#000' },
    })
  })
})

// Un `var()` n'est un alias que s'il **est** toute la valeur. Traiter le premier
// d'une expression comme tel a fait disparaître le reste, en silence, et c'était
// une régression du tour de correction précédent. Revue de la PR #52.
describe('a var() that is not the whole value', () => {
  it('keeps a composite value whole, without an alias', () => {
    const entries = read(
      ':root { --dur-fast: 200ms; --transition-base: var(--dur-fast, 150ms) var(--ease-out, ease) }',
    )
    const base = family(entries, 'transition')?.base?.themes.default

    expect(base?.value).toBe('var(--dur-fast, 150ms) var(--ease-out, ease)')
    expect('alias' in (base ?? {})).toBe(false)
  })

  // Sans contrôle du nom, `var(4px)` faisait chercher un token appelé `px`,
  // le préfixe étant retiré sans vérifier qu'il était là. Mesuré.
  it('does not take a var() whose inside is not a name for an alias', () => {
    const entries = read(':root { --a-one: var(4px); --a-two: var() }')

    expect(family(entries, 'a')?.one?.themes.default).toEqual({ value: 'var(4px)' })
    expect(family(entries, 'a')?.two?.themes.default).toEqual({ value: 'var()' })
  })

  it('does not take an unclosed var() for an alias', () => {
    const entries = read(':root { --a-one: var(--a, calc(1px) }')

    expect(family(entries, 'a')?.one?.themes.default).toEqual({ value: 'var(--a, calc(1px)' })
  })

  // Un repli vide n'est pas un repli : pris pour tel, il écrivait `value: ''`.
  it('keeps the text when the fallback is empty', () => {
    const entries = read(':root { --a-one: var(--absente,) }')

    expect(family(entries, 'a')?.one?.themes.default).toEqual({
      value: 'var(--absente,)',
      alias: ['absente'],
    })
  })

  it('follows a fallback that is itself a var()', () => {
    const entries = read(':root { --a-base: 8px; --a-one: var(--absente, var(--a-base)) }')

    expect(family(entries, 'a')?.one?.themes.default).toEqual({
      value: '8px',
      alias: ['absente', 'a-base'],
    })
  })
})
