import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { propsOf } from '../src/props'

// Ce qu'un fichier de composant déclare de ses props, et ce que la lecture
// refuse de deviner. Section 3.2 de docs/contracts.md.
const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function read(source: string, exported = 'Badge', extension = 'tsx') {
  const root = mkdtempSync(join(tmpdir(), 'crypte-props-'))
  roots.push(root)

  const file = join(root, `Badge.${extension}`)
  writeFileSync(file, source)

  return propsOf(file, exported).details
}

// Ce qui distingue un composant sans props d'un composant que la lecture n'a pas
// suivi : les deux donnent un `details` vide, seul le second porte `unread`.
// Section 4.2, `propsUnread`.
describe('what reading says when it reads nothing', () => {
  function readAll(source: string, exported = 'Badge') {
    const root = mkdtempSync(join(tmpdir(), 'crypte-props-'))
    roots.push(root)

    const file = join(root, 'Badge.tsx')
    writeFileSync(file, source)

    return propsOf(file, exported)
  }

  it.for([
    [
      'a file that does not parse',
      'export function Badge({ a }: { a: string } { return null }',
      'Badge',
      'its file does not parse',
    ],
    [
      'a named export it cannot find',
      'export class Badge {}',
      'Badge',
      '`Badge` is not declared in a form the reader follows',
    ],
    [
      'a default export it cannot find',
      'export default class {}',
      'default',
      'the default export is not declared in a form the reader follows',
    ],
    [
      'a parameter with no type',
      'export function Badge(props) { return props.a }',
      'Badge',
      'its props type is not one the reader follows',
    ],
    [
      'a type from another file',
      "import type { P } from './p'\nexport function Badge(props: P) { return null }",
      'Badge',
      'its props type is not one the reader follows',
    ],
    [
      'an intersection of types from another file',
      "import type { P, Q } from './p'\nexport function Badge(props: P & Q) { return null }",
      'Badge',
      'its props type is not one the reader follows',
    ],
    [
      'a forwardRef typed from another file',
      "import { forwardRef } from 'react'\nimport type { P } from './p'\nexport const Badge = forwardRef<HTMLElement, P>((props, ref) => null)",
      'Badge',
      'its props type is not one the reader follows',
    ],
    [
      'a rest pattern alone',
      "import type { P } from './p'\nexport function Badge({ ...rest }: P) { return null }",
      'Badge',
      'its props type is not one the reader follows',
    ],
    // Revue de la PR #106 : lue comme « aucune prop », la même que l'intersection
    // écrite en interface.
    [
      'an interface that only extends what it cannot follow',
      "import type { Q } from './q'\ninterface P extends Q {}\nexport function Badge(props: P) { return null }",
      'Badge',
      'its props type is not one the reader follows',
    ],
    [
      'a local generic',
      "type P = { a: string; b: number }\nexport function Badge(props: Omit<P, 'b'>) { return null }",
      'Badge',
      'its props type is not one the reader follows',
    ],
    [
      'a type carried by the variable',
      "import type { FC } from 'react'\ntype P = { a: string }\nexport const Badge: FC<P> = (props) => null",
      'Badge',
      'its props type is not one the reader follows',
    ],
  ])('names %s', ([, source, exported, unread]) => {
    expect(readAll(source!, exported)).toEqual({ details: {}, unread })
  })

  it('names a file it cannot find', () => {
    expect(propsOf(join(tmpdir(), 'jamais-la.tsx'), 'Badge')).toEqual({
      details: {},
      unread: 'its file could not be found',
    })
  })

  // Là, mais illisible : un dossier à la place du fichier.
  it('names a file it cannot read', () => {
    const root = mkdtempSync(join(tmpdir(), 'crypte-props-'))
    roots.push(root)

    expect(propsOf(root, 'Badge')).toEqual({ details: {}, unread: 'its file could not be read' })
  })

  // L'autre côté de la paire : lu, et rien à dire. Ou lu en partie : les noms
  // sont là, leurs types non, et chaque prop le dit par `unknown`.
  it.for([
    ['a component with no parameter', 'export function Badge() { return null }'],
    ['a type literal with no member', 'export function Badge(props: {}) { return null }'],
    [
      'a local interface with no member',
      'interface P {}\nexport function Badge(props: P) { return null }',
    ],
    [
      'a wrapped component with no parameter',
      "import { memo } from 'react'\nexport const Badge = memo(() => null)",
    ],
  ])('says nothing of %s', ([, source]) => {
    expect(readAll(source!)).toEqual({ details: {} })
  })

  // Un membre propre suffit : les props héritées manquent, mais la lecture a lu.
  it('says nothing of an interface with a member of its own beside what it extends', () => {
    expect(
      readAll(
        "import type { Q } from './q'\ninterface P extends Q { a: string }\nexport function Badge(props: P) { return null }",
      ),
    ).toEqual({ details: { a: { type: 'string', required: true } } })
  })

  it('says nothing when a destructuring names the props of a type from another file', () => {
    expect(
      readAll("import type { P } from './p'\nexport function Badge({ a }: P) { return a }"),
    ).toEqual({ details: { a: { type: 'unknown', required: false } } })
  })
})

describe('what reading does not return', () => {
  it('returns an empty object for a missing file', () => {
    expect(propsOf(join(tmpdir(), 'jamais-la.tsx'), 'Badge').details).toEqual({})
  })

  it('returns an empty object for an unreadable file', () => {
    expect(read('export function Badge({ a }: { a: string } { return null }')).toEqual({})
  })

  it('returns an empty object when the named export is absent', () => {
    expect(read('export function Autre({ a }: { a: string }) { return null }')).toEqual({})
  })
})

describe('forms that declare a component', () => {
  const type = '{ a: string }'

  it('reads a default export', () => {
    expect(
      read(`export default function Badge({ a }: ${type}) { return null }`, 'default'),
    ).toHaveProperty('a')
  })
})

describe('type sources', () => {
  it('reads a type alias from the same file', () => {
    const source = `type P = { a: number }
export function Badge({ a }: P) { return null }`

    expect(read(source)).toEqual({ a: { type: 'number', required: true } })
  })
})

// Le croisement qui porte le deuxième critère de fin : un type que personne ne
// peut résoudre, et un motif qui nomme ce que le fichier écrit vraiment.
describe('DOM pass-through', () => {
  it('returns only the written names, never what the type contains', () => {
    const source = `export function Badge({ className, ...rest }: ComponentProps<'span'>) {
  return null
}`

    expect(read(source)).toEqual({ className: { type: 'unknown', required: false } })
  })
})

describe('kinds read from an annotation', () => {
  const kindOf = (annotation: string) => {
    const source = `interface P { a?: ${annotation} }
export function Badge({ a }: P) { return null }`

    return read(source).a
  }

  it('reads the three primitives', () => {
    expect(kindOf('string')?.type).toBe('string')
    expect(kindOf('number')?.type).toBe('number')
    expect(kindOf('boolean')?.type).toBe('boolean')
  })

  it('reads a union of literals as an enum, with its options', () => {
    expect(kindOf("'neutral' | 'warning'")).toEqual({
      type: 'enum',
      required: false,
      options: ['neutral', 'warning'],
    })
  })

  // `string | undefined` n'est pas un ensemble fermé à proposer.
  it('does not return an enum from a union that is not only literals', () => {
    expect(kindOf("'a' | string")?.type).toBe('unknown')
    expect(kindOf("'a' | string")?.options).toBeUndefined()
  })

  it('reads a function, an array and an object', () => {
    expect(kindOf('(id: string) => void')?.type).toBe('function')
    expect(kindOf('string[]')?.type).toBe('array')
    expect(kindOf('Array<number>')?.type).toBe('array')
    expect(kindOf('{ b: string }')?.type).toBe('object')
  })

  it('reads a node, qualified or not', () => {
    expect(kindOf('ReactNode')?.type).toBe('node')
    expect(kindOf('React.ReactNode')?.type).toBe('node')
  })

  // Le repli, et c'est le chemin qui compte : une forme que la lecture ne
  // connaît pas rend `unknown` plutôt que rien, donc la prop reste documentée.
  // Ces trois-là sont aussi hors périmètre.
  it('falls back to unknown on a form it does not know', () => {
    expect(kindOf('A & B')?.type).toBe('unknown')
    expect(kindOf('[string, number]')?.type).toBe('unknown')
    expect(kindOf('typeof valeur')?.type).toBe('unknown')
  })

  // Une référence qu'on ne résout pas pourrait être n'importe quoi : `object`
  // affirmerait plus que le fichier ne dit.
  it('falls back to unknown on a reference it does not resolve', () => {
    expect(kindOf('Plan')?.type).toBe('unknown')
  })
})

describe('JSDoc', () => {
  // Sans le contrôle du blanc entre les deux, le second membre héritait de la
  // description du premier. Mesuré en écrivant ce module.
  it('does not give the neighbour a description that is not its own', () => {
    const source = `interface P {
  /** Ce que le badge annonce. */
  label: string
  tone?: string
}
export function Badge({ label, tone }: P) { return null }`
    const details = read(source)

    expect(details.label?.description).toBe('Ce que le badge annonce.')
    expect(details.tone).toEqual({ type: 'string', required: false })
  })

  it('folds a multi-line comment', () => {
    const source = `interface P {
  /**
   * Neutre par défaut,
   * \`warning\` pour attirer l'œil.
   */
  tone?: string
}
export function Badge({ tone }: P) { return null }`

    expect(read(source).tone?.description).toBe("Neutre par défaut, `warning` pour attirer l'œil.")
  })

  it('does not return an empty description', () => {
    const source = `interface P {
  /** */
  a?: string
}
export function Badge({ a }: P) { return null }`

    expect('description' in (read(source).a ?? {})).toBe(false)
  })
})

// Les axes que la première version de ces cas n'a pas croisés : la forme de la
// clé d'un membre, et la forme du commentaire qui le précède. Cinq bloquants
// sont sortis de là. Revue de la PR #54.
describe('key shape', () => {
  it('reads a string key, which is a name like any other', () => {
    const source = `interface P { 'aria-label': string; 'data-id'?: number }
export function Badge(p: P) { return null }`

    expect(read(source)).toEqual({
      'aria-label': { type: 'string', required: true },
      'data-id': { type: 'number', required: false },
    })
  })

  // §4.2 le nomme : « neither is a key computed at runtime ».
  it('refuses a computed key rather than returning the variable name', () => {
    const source = `const k = 'tone'
export function Badge({ [k]: v, label }: Ailleurs) { return null }`

    expect(read(source)).toEqual({ label: { type: 'unknown', required: false } })
  })

  // Légale en TypeScript, absurde pour une prop, et surtout : sans le contrôle
  // du type de la valeur, elle passait par `String()` comme n'importe quoi.
  it('refuses a numeric key and an empty key', () => {
    const source = `interface P { 0: string; '': number; ok?: string }
export function Badge(p: P) { return null }`

    expect(Object.keys(read(source))).toEqual(['ok'])
  })

  it('reads a literal key in the pattern too', () => {
    const source = "export function Badge({ 'aria-label': l }: Ailleurs) { return null }"

    expect(read(source)).toEqual({ 'aria-label': { type: 'unknown', required: false } })
  })
})

describe('comment shape', () => {
  // Un bloc qui n'est pas du JSDoc devenait une description publiée.
  it('does not take a lint directive for a description', () => {
    const source = `interface P {
  /* eslint-disable-next-line */
  a?: string
}
export function Badge({ a }: P) { return null }`

    expect('description' in (read(source).a ?? {})).toBe(false)
  })
})

// Ce que §4.5 exige, sur des valeurs qui sont bien des `Literal` pour oxc mais
// que `JSON.stringify` refuse ou déforme.
describe('a default or option that JSON cannot represent', () => {
  // Le plus grave du lot : `writeCatalogue` levait, `dev.ts` avalait, et **ni le
  // manifeste ni l'empreinte** n'étaient écrits pour le projet entier.
  it('does not return a bigint default, and keeps the prop optional', () => {
    const source = `interface P { n: number }
export function Badge({ n = 1n }: P) { return null }`

    expect(read(source).n).toEqual({ type: 'number', required: false })
  })

  it('does not return a regular expression default', () => {
    const source = `interface P { r: string }
export function Badge({ r = /x/g }: P) { return null }`

    expect(read(source).r).toEqual({ type: 'string', required: false })
  })

  it('reads a negative default, which is not a simple literal', () => {
    const source = `interface P { n: number }
export function Badge({ n = -1 }: P) { return null }`

    expect(read(source).n).toEqual({ type: 'number', required: false, default: -1 })
  })

  // `-1` est un `UnaryExpression` sous son `TSLiteralType`, donc lire `value`
  // rendait `undefined`, que JSON écrit `null` : une option que le type ne
  // contient pas, offerte comme les deux autres.
  it('reads a union that carries a signed literal', () => {
    const source = `interface P { level?: -1 | 0 | 1 }
export function Badge({ level }: P) { return null }`

    expect(read(source).level).toEqual({ type: 'enum', required: false, options: [-1, 0, 1] })
  })

  it('drops the enum rather than one of its values', () => {
    const source = `interface P { r?: 'a' | 1n }
export function Badge({ r }: P) { return null }`

    expect(read(source).r).toEqual({ type: 'unknown', required: false })
  })
})

describe('a default export that names a declaration', () => {
  // La forme courante : la déclaration est plus haut, l'export la nomme.
  it('follows the name once', () => {
    const source = `const Badge = ({ a }: { a: string }) => null
export default Badge`

    expect(read(source, 'default')).toEqual({ a: { type: 'string', required: true } })
  })

  // `export default memo(Badge)` est un appel : suivi jusqu'au nom qu'il enveloppe.
  it('follows a wrapper around the name', () => {
    const source = `const Badge = ({ a }: { a: string }) => null
export default memo(Badge)`

    expect(read(source, 'default')).toEqual({ a: { type: 'string', required: true } })
  })

  // Un appel qui n'est pas une enveloppe connue ne dit rien de ce qu'il rend.
  it('does not follow any other call', () => {
    const source = `const Badge = ({ a }: { a: string }) => null
export default withTheme(Badge)`

    expect(read(source, 'default')).toEqual({})
  })
})

// `memo`, `forwardRef` et `Object.assign` rendaient une table vide : seul le
// premier paramètre d'une fonction déclarée était lu. DCJ-318.
describe('a component inside a wrapper', () => {
  const attendu = { a: { type: 'string', required: true } }

  it.each([
    ['memo', 'export const Badge = memo(({ a }: { a: string }) => null)'],
    ['forwardRef', 'export const Badge = forwardRef(({ a }: { a: string }, ref) => null)'],
    [
      'memo around forwardRef',
      'export const Badge = memo(forwardRef(({ a }: { a: string }, ref) => null))',
    ],
    [
      'React.memo',
      'export const Badge = React.memo(function Badge({ a }: { a: string }) { return null })',
    ],
    [
      'a wrapped name',
      'const Inner = ({ a }: { a: string }) => null\nexport const Badge = memo(Inner)',
    ],
    [
      'Object.assign',
      'const Root = ({ a }: { a: string }) => null\nconst List = () => null\nexport const Badge = Object.assign(Root, { List })',
    ],
  ])('reads %s', (_, source) => {
    expect(read(source)).toEqual(attendu)
  })

  // Le type en générique quand le paramètre n'en porte pas, forme courante de
  // `forwardRef`. Celui du paramètre gagne quand il y en a un.
  it('reads the props type forwardRef takes as its second type argument', () => {
    const source = `type Props = { a: string }
export const Badge = forwardRef<HTMLInputElement, Props>((props, ref) => null)`

    expect(read(source)).toEqual(attendu)
  })

  it.each([
    ['an arrow', 'export default ({ a }: { a: string }) => null'],
    [
      'memo around a typed forwardRef',
      'type Props = { a: string }\nexport default memo(forwardRef<HTMLInputElement, Props>((props, ref) => null))',
    ],
  ])('reads %s behind export default', (_, source) => {
    expect(read(source, 'default')).toEqual(attendu)
  })

  it('prefers the parameter type to the type argument', () => {
    const source = `type Props = { a: string }
export const Badge = forwardRef<HTMLInputElement, { b: number }>((props: Props, ref) => null)`

    expect(read(source)).toEqual(attendu)
  })

  it.each([
    ['another call', 'export const Badge = styled(({ a }: { a: string }) => null)'],
    [
      'assign on another object',
      'const Root = ({ a }: { a: string }) => null\nexport const Badge = Lodash.assign(Root, {})',
    ],
    ['a wrapper with no argument', 'export const Badge = memo()'],
    [
      'names that follow each other',
      'const A = memo(B)\nconst B = memo(A)\nexport const Badge = A',
    ],
  ])('reads nothing from %s', (_, source) => {
    expect(read(source)).toEqual({})
  })
})

describe('a member written as a method', () => {
  // Lu comme une propriété il était absent, donc le motif le rattrapait en
  // facultatif et `unknown` alors que le type le déclare requis : la fusion
  // échangeait une omission contre un drapeau faux. Revue de la PR #54.
  it('keeps its kind and its required flag', () => {
    const source = `interface P { onClick(): void; tone?: string }
export function Badge({ onClick, tone }: P) { return null }`

    expect(read(source)).toEqual({
      onClick: { type: 'function', required: true },
      tone: { type: 'string', required: false },
    })
  })

  // Le critère est d'être écrit à la main, et `className` n'en est que le cas
  // le plus courant : §3.4 le dit ainsi depuis ce tour.
  it('catches any name the pattern writes, not only className', () => {
    const source = `interface P extends React.ComponentProps<'span'> {
  onClick(): void
  tone?: string
}
export function Badge({ className, onClick, id, tone, ...rest }: P) { return null }`

    expect(read(source)).toEqual({
      onClick: { type: 'function', required: true },
      tone: { type: 'string', required: false },
      className: { type: 'unknown', required: false },
      id: { type: 'unknown', required: false },
    })
  })

  // Une signature d'index ne nomme rien, donc elle n'est pas un membre : la prop
  // qu'elle couvre passe par le motif, ce qui est juste puisque la signature ne
  // dit rien de ce nom-là.
  it('does not take an index signature for a member', () => {
    const source = `interface P { [key: string]: unknown; tone?: string }
export function Badge({ tone, autre }: P) { return null }`

    expect(read(source)).toEqual({
      tone: { type: 'string', required: false },
      autre: { type: 'unknown', required: false },
    })
  })
})

// Un accesseur est aussi un `TSMethodSignature`, donc le marquer sur le type du
// nœud faisait sortir `get tone(): string` en `function`. Et son type ne vit pas
// où celui d'une propriété vit : mesuré, `typeAnnotation` est `undefined` pour
// les trois formes. Revue de la PR #54.
describe('an accessor', () => {
  it('is the property it represents, with its return type', () => {
    const source = `interface P { get tone(): string }
export function Badge({ tone }: P) { return null }`

    expect(read(source)).toEqual({ tone: { type: 'string', required: true } })
  })

  it('takes its parameter type when it writes', () => {
    const source = `interface P { set level(x: number) }
export function Badge({ level }: P) { return null }`

    expect(read(source)).toEqual({ level: { type: 'number', required: true } })
  })
})

// La forme shadcn : les options d'un variant sont les clés de l'objet passé à
// `cva(…)`, lisibles tant que cet appel est dans le fichier.
describe('CVA variants', () => {
  const variants = `const badgeVariants = cva('base', {
  variants: {
    tone: { neutral: 'a', 'on-dark': 'b' },
    size: { sm: 'c', lg: 'd' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
})`

  it('reads the options of each variant in the shadcn form', () => {
    const source = `${variants}
export function Badge({ className, tone = 'on-dark', ...props }: ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) { return null }`

    expect(read(source)).toEqual({
      tone: { type: 'enum', options: ['neutral', 'on-dark'], required: false, default: 'on-dark' },
      size: { type: 'enum', options: ['sm', 'lg'], required: false, default: 'sm' },
      asChild: { type: 'boolean', required: false },
      className: { type: 'unknown', required: false },
    })
  })

  it('also reads them in an interface that extends VariantProps', () => {
    const source = `${variants}
interface P extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> { label: string }
export function Badge({ label }: P) { return null }`

    expect(Object.keys(read(source))).toEqual(['tone', 'size', 'label'])
  })

  it('reads them behind an alias, and does not loop on a self-referencing alias', () => {
    const source = `${variants}
type P = ComponentProps<'span'> & VariantProps<typeof badgeVariants>
type Q = Q & { loop?: string }
export function Badge({ tone }: P) { return null }
export function Loop({ loop }: Q) { return null }`

    expect(Object.keys(read(source))).toEqual(['tone', 'size'])
    expect(read(source, 'Loop')).toEqual({ loop: { type: 'string', required: false } })
  })

  it('does not return the CVA default when the pattern writes an unreadable one', () => {
    const source = `${variants}
export function Badge({ tone = pick() }: VariantProps<typeof badgeVariants>) { return null }`

    expect(read(source)['tone']).toEqual({
      type: 'enum',
      options: ['neutral', 'on-dark'],
      required: false,
    })
  })

  it('returns unknown for a call the file does not declare', () => {
    const imported = `import { badgeVariants } from './variants'
export function Badge({ tone }: VariantProps<typeof badgeVariants>) { return null }`
    const other = `const badgeVariants = tv('base', { variants: { tone: { a: '' } } })
export function Badge({ tone }: VariantProps<typeof badgeVariants>) { return null }`

    for (const source of [imported, other])
      expect(read(source)).toEqual({ tone: { type: 'unknown', required: false } })
  })

  it('returns unknown for a boolean or non-literal variant, or one with a numeric or computed key', () => {
    const source = `export const badgeVariants = cva('base', {
  variants: { tone: { true: 'a', false: 'b' }, size: { [SM]: 'c' }, gap: { 1: 'd' }, wide: WIDE },
})
export function Badge(props: VariantProps<typeof badgeVariants>) { return null }`

    expect(read(source)).toEqual({
      tone: { type: 'unknown', required: false },
      size: { type: 'unknown', required: false },
      gap: { type: 'unknown', required: false },
      wide: { type: 'unknown', required: false },
    })
  })
})

describe('a type alias from the same file', () => {
  it('reads as what it names, and an imported alias stays unknown', () => {
    const source = `import type { Imported } from './types'
type Rank = 1 | 2 | 3
type Label = string
type Loop = Loop
export function Badge(props: {
  inline: 1 | 2 | 3
  rank: Rank
  label: Label
  imported: Imported
  qualified: Types.Rank
  loop: Loop
}) { return null }`

    expect(read(source)).toEqual({
      inline: { type: 'enum', options: [1, 2, 3], required: true },
      rank: { type: 'enum', options: [1, 2, 3], required: true },
      label: { type: 'string', required: true },
      imported: { type: 'unknown', required: true },
      qualified: { type: 'unknown', required: true },
      loop: { type: 'unknown', required: true },
    })
  })
})
