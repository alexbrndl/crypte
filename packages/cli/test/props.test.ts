import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detailsOf } from '../src/props'

// Ce qu'un fichier de composant déclare de ses props, et ce que la lecture
// refuse de deviner. Section 3.2 de docs/contracts.md.

const here = dirname(fileURLToPath(import.meta.url))
const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function read(source: string, exported = 'Badge', extension = 'tsx') {
  const root = mkdtempSync(join(tmpdir(), 'crypte-props-'))
  roots.push(root)

  const file = join(root, `Badge.${extension}`)
  writeFileSync(file, source)

  return detailsOf(file, exported)
}

describe('ce que la lecture ne rend pas', () => {
  it('rend un objet vide sur un fichier absent', () => {
    expect(detailsOf(join(tmpdir(), 'jamais-la.tsx'), 'Badge')).toEqual({})
  })

  it('rend un objet vide sur un fichier qui ne se lit pas', () => {
    expect(read('export function Badge({ a }: { a: string } { return null }')).toEqual({})
  })

  it('rend un objet vide quand l’export nommé n’est pas là', () => {
    expect(read('export function Autre({ a }: { a: string }) { return null }')).toEqual({})
  })

  it('rend un objet vide sur un composant sans paramètre', () => {
    expect(read('export function Badge() { return null }')).toEqual({})
  })

  // Le paramètre n'est pas déstructuré et son type n'est pas dans le fichier :
  // rien n'est lisible, et inventer serait pire.
  it('rend un objet vide sur un paramètre nommé de type inconnu', () => {
    expect(read("export function Badge(props: ComponentProps<'span'>) { return null }")).toEqual({})
  })
})

describe('les formes qui déclarent un composant', () => {
  const type = '{ a: string }'

  it('lit une fonction exportée', () => {
    expect(read(`export function Badge({ a }: ${type}) { return null }`)).toHaveProperty('a')
  })

  it('lit une flèche assignée à une constante', () => {
    expect(read(`export const Badge = ({ a }: ${type}) => null`)).toHaveProperty('a')
  })

  it('lit un export par défaut', () => {
    expect(
      read(`export default function Badge({ a }: ${type}) { return null }`, 'default'),
    ).toHaveProperty('a')
  })
})

describe('les sources du type', () => {
  it('lit un type littéral en ligne', () => {
    expect(read('export function Badge({ a }: { a: string }) { return null }')).toEqual({
      a: { type: 'string', required: true },
    })
  })

  it('lit une interface nommée du même fichier', () => {
    const source = `interface P { a: string }
export function Badge({ a }: P) { return null }`

    expect(read(source)).toEqual({ a: { type: 'string', required: true } })
  })

  it('lit un alias de type du même fichier', () => {
    const source = `type P = { a: number }
export function Badge({ a }: P) { return null }`

    expect(read(source)).toEqual({ a: { type: 'number', required: true } })
  })

  // Suivre un import est le travail d'un résolveur, et cette lecture tourne
  // avant qu'aucun serveur existe.
  it('retombe sur le motif quand le type nommé vient d’ailleurs', () => {
    const source = `import type { P } from './ailleurs'
export function Badge({ a, b }: P) { return null }`

    expect(read(source)).toEqual({
      a: { type: 'unknown', required: false },
      b: { type: 'unknown', required: false },
    })
  })
})

// Le croisement qui porte le deuxième critère de fin : un type que personne ne
// peut résoudre, et un motif qui nomme ce que le fichier écrit vraiment.
describe('le pass-through DOM', () => {
  it('ne rend que les noms écrits, jamais ce que le type contient', () => {
    const source = `export function Badge({ className, ...rest }: ComponentProps<'span'>) {
  return null
}`

    expect(read(source)).toEqual({ className: { type: 'unknown', required: false } })
  })

  it('ne rend rien du tout quand le motif n’est qu’un rest', () => {
    expect(
      read("export function Badge({ ...rest }: ComponentProps<'span'>) { return null }"),
    ).toEqual({})
  })
})

describe('les natures lues d’une annotation', () => {
  const kindOf = (annotation: string) => {
    const source = `interface P { a?: ${annotation} }
export function Badge({ a }: P) { return null }`

    return read(source).a
  }

  it('lit les trois primitives', () => {
    expect(kindOf('string')?.type).toBe('string')
    expect(kindOf('number')?.type).toBe('number')
    expect(kindOf('boolean')?.type).toBe('boolean')
  })

  it('lit une union de littéraux comme un enum, avec ses options', () => {
    expect(kindOf("'neutral' | 'warning'")).toEqual({
      type: 'enum',
      required: false,
      options: ['neutral', 'warning'],
    })
  })

  // `string | undefined` n'est pas un ensemble fermé à proposer.
  it('ne rend pas un enum d’une union qui n’est pas que des littéraux', () => {
    expect(kindOf("'a' | string")?.type).toBe('unknown')
    expect(kindOf("'a' | string")?.options).toBeUndefined()
  })

  it('lit une fonction, un tableau et un objet', () => {
    expect(kindOf('(id: string) => void')?.type).toBe('function')
    expect(kindOf('string[]')?.type).toBe('array')
    expect(kindOf('Array<number>')?.type).toBe('array')
    expect(kindOf('{ b: string }')?.type).toBe('object')
  })

  it('lit un nœud, qualifié ou non', () => {
    expect(kindOf('ReactNode')?.type).toBe('node')
    expect(kindOf('React.ReactNode')?.type).toBe('node')
  })

  // Le repli, et c'est le chemin qui compte : une forme que la lecture ne
  // connaît pas rend `unknown` plutôt que rien, donc la prop reste documentée.
  // Ces trois-là sont aussi ce que `docs/internal/suivi.md` consigne
  // comme hors périmètre.
  it('retombe sur unknown sur une forme qu’il ne connaît pas', () => {
    expect(kindOf('A & B')?.type).toBe('unknown')
    expect(kindOf('[string, number]')?.type).toBe('unknown')
    expect(kindOf('typeof valeur')?.type).toBe('unknown')
  })

  // Une référence qu'on ne résout pas pourrait être n'importe quoi : `object`
  // affirmerait plus que le fichier ne dit.
  it('retombe sur unknown sur une référence qu’il ne résout pas', () => {
    expect(kindOf('Plan')?.type).toBe('unknown')
  })
})

describe('ce qui rend une prop facultative', () => {
  it('lit le point d’interrogation', () => {
    const source = `interface P { a: string; b?: string }
export function Badge({ a, b }: P) { return null }`
    const details = read(source)

    expect(details.a?.required).toBe(true)
    expect(details.b?.required).toBe(false)
  })

  // Une valeur par défaut rend la prop facultative pour l'appelant, même
  // déclarée requise par le type.
  it('lit une valeur par défaut du motif, et la rend facultative', () => {
    const source = `interface P { tone: string }
export function Badge({ tone = 'neutral' }: P) { return null }`

    expect(read(source)).toEqual({
      tone: { type: 'string', required: false, default: 'neutral' },
    })
  })

  // Deux choses, et elles ne vont pas ensemble. La prop **a** un défaut, donc
  // elle n'est pas requise. Mais §4.5 dit que le CLI garantit ce qu'il écrit, et
  // une valeur calculée ne survit pas au JSON, donc le champ `default` n'est pas
  // écrit. La première version rendait `required: true`, ce qui était faux, et
  // aucun test ne le voyait : trouvé par une sonde de mutation.
  it('rend facultative une prop dont le défaut ne s’écrit pas', () => {
    const source = `interface P { tone: string }
export function Badge({ tone = compute() }: P) { return null }`

    expect(read(source).tone).toEqual({ type: 'string', required: false })
  })
})

describe('le JSDoc', () => {
  it('rattache un commentaire au membre qu’il précède', () => {
    const source = `interface P {
  /** Ce que le badge annonce. */
  label: string
}
export function Badge({ label }: P) { return null }`

    expect(read(source).label?.description).toBe('Ce que le badge annonce.')
  })

  // Sans le contrôle du blanc entre les deux, le second membre héritait de la
  // description du premier. Mesuré en écrivant ce module.
  it('ne donne pas au voisin la description qui n’est pas la sienne', () => {
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

  it('replie un commentaire sur plusieurs lignes', () => {
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

  it('ne rend pas de description vide', () => {
    const source = `interface P {
  /** */
  a?: string
}
export function Badge({ a }: P) { return null }`

    expect('description' in (read(source).a ?? {})).toBe(false)
  })
})

// La règle de dégradation de l'issue : un fichier sans types donne des props
// documentées en `unknown`, et rien n'empêche la story de rendre.
describe('un composant sans types', () => {
  it('rend les noms du motif en unknown', () => {
    expect(read('export const Badge = ({ a, b }) => null', 'Badge', 'jsx')).toEqual({
      a: { type: 'unknown', required: false },
      b: { type: 'unknown', required: false },
    })
  })
})

// Le premier critère de fin de l'issue, sur le projet témoin plutôt que sur une
// source jetable : un composant typé avec du JSDoc rend un `details` complet.
describe('la démonstration, de bout en bout', () => {
  it('rend les details du Badge du projet témoin', async () => {
    const { buildCatalogue } = await import('../src/manifest')
    const { loadProject } = await import('../src/project')
    const demo = join(here, '..', '..', '..', 'apps', 'demo')

    const { manifest } = buildCatalogue(await loadProject(demo))
    const badge = manifest.entries.find((entry) => entry.id === 'badge--par-defaut')

    // Les cinq champs de `ResolvedPropDetails`, lus sans exécuter le composant.
    // Le deuxième critère : un type que la lecture syntaxique ne peut pas ouvrir,
    // et seul ce que le fichier écrit à la main qui remonte.
    const tag = manifest.entries.find((entry) => entry.id === 'tag--nue')

    expect(tag?.type === 'story' && tag.details).toEqual({
      className: { type: 'unknown', required: false },
    })

    expect(badge?.type === 'story' && badge.details).toEqual({
      label: {
        type: 'string',
        required: true,
        description: 'Ce que le badge annonce.',
      },
      tone: {
        type: 'enum',
        required: false,
        options: ['neutral', 'warning'],
        default: 'neutral',
        description: "Neutre par défaut, `warning` pour attirer l'œil.",
      },
    })
  })
})

// Les axes que la première version de ces cas n'a pas croisés : la forme de la
// clé d'un membre, et la forme du commentaire qui le précède. Cinq bloquants
// sont sortis de là. Revue de la PR #54.
describe('la forme d’une clé', () => {
  it('lit une clé écrite en chaîne, qui est un nom comme un autre', () => {
    const source = `interface P { 'aria-label': string; 'data-id'?: number }
export function Badge(p: P) { return null }`

    expect(read(source)).toEqual({
      'aria-label': { type: 'string', required: true },
      'data-id': { type: 'number', required: false },
    })
  })

  // Sans nom lisible, les deux clés se rabattaient sur `'undefined'` et la
  // seconde effaçait la première. Mesuré.
  it('ne rabat pas deux clés littérales sur le même nom', () => {
    const source = `interface P { 'a-b': string; 'c-d': number }
export function Badge(p: P) { return null }`

    expect(Object.keys(read(source))).toEqual(['a-b', 'c-d'])
  })

  // §4.2 le nomme : « neither is a key computed at runtime ».
  it('refuse une clé calculée plutôt que de rendre le nom de la variable', () => {
    const source = `const k = 'tone'
export function Badge({ [k]: v, label }: Ailleurs) { return null }`

    expect(read(source)).toEqual({ label: { type: 'unknown', required: false } })
  })

  // Légale en TypeScript, absurde pour une prop, et surtout : sans le contrôle
  // du type de la valeur, elle passait par `String()` comme n'importe quoi.
  it('refuse une clé numérique et une clé vide', () => {
    const source = `interface P { 0: string; '': number; ok?: string }
export function Badge(p: P) { return null }`

    expect(Object.keys(read(source))).toEqual(['ok'])
  })

  it('lit une clé littérale du motif aussi', () => {
    const source = "export function Badge({ 'aria-label': l }: Ailleurs) { return null }"

    expect(read(source)).toEqual({ 'aria-label': { type: 'unknown', required: false } })
  })
})

describe('la forme du commentaire', () => {
  // Le `//` de fin de ligne du membre précédent passait le contrôle du blanc et
  // devenait la description du suivant. C'est le cas que le premier contrôle
  // croyait fermer, et il ne le fermait pas.
  it('ne prend pas un commentaire de ligne pour du JSDoc', () => {
    const source = `interface P {
  a?: string // le libellé
  b?: string
}
export function Badge({ a, b }: P) { return null }`
    const details = read(source)

    expect('description' in (details.a ?? {})).toBe(false)
    expect('description' in (details.b ?? {})).toBe(false)
  })

  // Un bloc qui n'est pas du JSDoc devenait une description publiée.
  it('ne prend pas une directive de lint pour une description', () => {
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
describe('un défaut ou une option que JSON ne rend pas', () => {
  // Le plus grave du lot : `writeCatalogue` levait, `dev.ts` avalait, et **ni le
  // manifeste ni l'empreinte** n'étaient écrits pour le projet entier.
  it('ne rend pas un défaut bigint, et garde la prop facultative', () => {
    const source = `interface P { n: number }
export function Badge({ n = 1n }: P) { return null }`

    expect(read(source).n).toEqual({ type: 'number', required: false })
  })

  it('ne rend pas un défaut expression régulière', () => {
    const source = `interface P { r: string }
export function Badge({ r = /x/g }: P) { return null }`

    expect(read(source).r).toEqual({ type: 'string', required: false })
  })

  it('lit un défaut négatif, qui n’est pas un littéral simple', () => {
    const source = `interface P { n: number }
export function Badge({ n = -1 }: P) { return null }`

    expect(read(source).n).toEqual({ type: 'number', required: false, default: -1 })
  })

  // `-1` est un `UnaryExpression` sous son `TSLiteralType`, donc lire `value`
  // rendait `undefined`, que JSON écrit `null` : une option que le type ne
  // contient pas, offerte comme les deux autres.
  it('lit une union qui porte un littéral signé', () => {
    const source = `interface P { level?: -1 | 0 | 1 }
export function Badge({ level }: P) { return null }`

    expect(read(source).level).toEqual({ type: 'enum', required: false, options: [-1, 0, 1] })
  })

  it('laisse tomber l’enum plutôt qu’une de ses valeurs', () => {
    const source = `interface P { r?: 'a' | 1n }
export function Badge({ r }: P) { return null }`

    expect(read(source).r).toEqual({ type: 'unknown', required: false })
  })
})

describe('un export par défaut qui nomme une déclaration', () => {
  // La forme courante : la déclaration est plus haut, l'export la nomme.
  it('suit le nom une fois', () => {
    const source = `const Badge = ({ a }: { a: string }) => null
export default Badge`

    expect(read(source, 'default')).toEqual({ a: { type: 'string', required: true } })
  })

  // `export default memo(Badge)` est un appel, pas un nom : consigné, pas suivi.
  it('ne suit pas un appel', () => {
    const source = `const Badge = ({ a }: { a: string }) => null
export default memo(Badge)`

    expect(read(source, 'default')).toEqual({})
  })
})

// Le croisement que le tour précédent n'a pas fait : un type nommé **résoluble**
// qui porte une clause `extends` qu'on ne résout pas, plus un motif qui écrit à
// la main une prop héritée. C'est la forme shadcn que §3.4 nomme, et le
// `className` écrit était perdu. Revue de la PR #54.
describe('une interface qui hérite de ce qu’on ne résout pas', () => {
  it('garde ses membres et les noms que le motif écrit en plus', () => {
    const source = `interface P extends React.ComponentProps<'span'> { tone?: string }
export function Badge({ className, tone, ...rest }: P) { return null }`

    expect(read(source)).toEqual({
      tone: { type: 'string', required: false },
      className: { type: 'unknown', required: false },
    })
  })

  // Le membre du type gagne : il porte une annotation, le motif n'en a pas.
  it('ne laisse pas le motif écraser ce que le type déclare', () => {
    const source = `interface P { tone: string }
export function Badge({ tone }: P) { return null }`

    expect(read(source).tone).toEqual({ type: 'string', required: true })
  })
})

describe('un membre écrit en forme de méthode', () => {
  // Lu comme une propriété il était absent, donc le motif le rattrapait en
  // facultatif et `unknown` alors que le type le déclare requis : la fusion
  // échangeait une omission contre un drapeau faux. Revue de la PR #54.
  it('garde sa nature et son caractère requis', () => {
    const source = `interface P { onClick(): void; tone?: string }
export function Badge({ onClick, tone }: P) { return null }`

    expect(read(source)).toEqual({
      onClick: { type: 'function', required: true },
      tone: { type: 'string', required: false },
    })
  })

  // Le critère est d'être écrit à la main, et `className` n'en est que le cas
  // le plus courant : §3.4 le dit ainsi depuis ce tour.
  it('rattrape tout nom que le motif écrit, pas seulement className', () => {
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
  it('ne prend pas une signature d’index pour un membre', () => {
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
describe('un accesseur', () => {
  it('est la propriété qu’il représente, avec le type de son retour', () => {
    const source = `interface P { get tone(): string }
export function Badge({ tone }: P) { return null }`

    expect(read(source)).toEqual({ tone: { type: 'string', required: true } })
  })

  it('prend le type de son paramètre quand il écrit', () => {
    const source = `interface P { set level(x: number) }
export function Badge({ level }: P) { return null }`

    expect(read(source)).toEqual({ level: { type: 'number', required: true } })
  })

  it('reste une fonction quand c’est une méthode', () => {
    const source = `interface P { onClick(): void }
export function Badge({ onClick }: P) { return null }`

    expect(read(source)).toEqual({ onClick: { type: 'function', required: true } })
  })
})
