import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// L'écart entre la spécification et le code, qui a produit douze constats de
// revue sur le lot 2. Voir docs/internal/architecture.md.

const here = dirname(fileURLToPath(import.meta.url))
const protocol = join(here, '..', 'src', 'protocol')
const spec = readFileSync(join(here, '..', '..', '..', 'docs', 'spec-contrats.md'), 'utf8')

const JOURNAL = '## 8. Journal des versions'
const [normative = '', journal = ''] = spec.split(JOURNAL)

// Les portions de code de la partie normative, blocs et fragments. C'est de là
// qu'on réimplémente, donc la seule matière où un nom mort fait des dégâts. Le
// chercher dans la prose ferait échouer sur des mots comme « plugin », que le
// journal cite comme message disparu et que le document emploie partout ailleurs.
const CODE = /```[\s\S]*?```|`[^`\n]+`/g
const normativeCode = (normative.match(CODE) ?? []).join('\n')

// Ce que le protocole a retiré, et le motif qui le débusque. Tenu à la main : le
// journal contient des tableaux de natures diverses, et le lire automatiquement
// ramassait `crypte`, `ready` et `plugin`, qui sont bien vivants. Une liste juste
// vaut mieux qu'une déduction fausse, et le dernier cas la garde d'être périmée.
const RETIRED: [string, RegExp][] = [
  ['ArgType', /\bArgType\b/],
  ['ControlOverride', /\bControlOverride\b/],
  ['PropDetailsInput', /\bPropDetailsInput\b/],
  ['EntryMeta', /\bEntryMeta\b/],
  ['argTypes', /\bargTypes\b/],
  ['manifestVersion', /\bmanifestVersion\b/],
  ["le message 'plugin'", /type:\s*'plugin'/],
]

// Ce que la spécification décrit sans que le noyau le déclare : un plugin le
// fournit, ou c'est une évolution annoncée. Toute autre absence est un écart.
const NOT_OURS = new Set(['ControlSpec', 'PropsOf', 'StoryModule'])

function declaredNames(): string[] {
  return readdirSync(protocol)
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .flatMap((file) => {
      const source = readFileSync(join(protocol, file), 'utf8')
      return [...source.matchAll(/^export (?:interface|type|const|function) (\w+)/gm)].map(
        (match) => match[1] as string,
      )
    })
}

describe('la spécification et le code', () => {
  const declared = declaredNames()

  it('lit bien les deux', () => {
    expect(journal, 'section 8 introuvable').not.toBe('')
    expect(declared.length).toBeGreaterThan(10)
    expect(normativeCode.length).toBeGreaterThan(1000)
  })

  // Douze constats de revue venaient de là : un nom renommé qui survit dans la
  // partie qui fait foi, et qu'on réimplémente depuis elle.
  it('ne garde aucun nom retiré dans le code de la spécification', () => {
    for (const [name, pattern] of RETIRED) {
      expect(
        normativeCode,
        `${name} a été retiré mais figure encore dans le code de la spécification`,
      ).not.toMatch(pattern)
    }
  })

  // L'écart dans l'autre sens : un type public que la spécification ignore.
  // Sur la partie normative seule, sinon une mention dans le journal suffirait
  // à faire passer un type que le document qui fait foi ne décrit nulle part.
  // Comme mot entier, sinon `Manifest` est satisfait par `ManifestEntry`, et les
  // trois types centraux du protocole n'étaient surveillés par rien.
  it('décrit tout ce que le protocole expose', () => {
    for (const name of declared) {
      expect(normative, `${name} est exporté mais absent de la partie normative`).toMatch(
        new RegExp(`\\b${name}\\b`),
      )
    }
  })

  // Deux listes tenues à la main, donc deux façons de se périmer en silence :
  // une exception qui dispense un type existant, un nom « retiré » qui est revenu.
  it('ne garde aucune liste devenue fausse', () => {
    for (const name of NOT_OURS) {
      expect(declared, `${name} est déclaré par le noyau, retire-le des exceptions`).not.toContain(
        name,
      )
    }

    for (const [name] of RETIRED) {
      expect(declared, `${name} est de nouveau déclaré, retire-le des noms retirés`).not.toContain(
        name,
      )

      if (name.startsWith('le message')) continue
      expect(journal, `${name} n'est expliqué par aucune entrée du journal`).toContain(name)
    }
  })
})
