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
  // Ces trois-là sont aussi ce que `suivi.md` consigne comme hors périmètre.
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
