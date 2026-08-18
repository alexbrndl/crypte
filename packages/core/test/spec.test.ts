import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { declaredIn } from './exported-names'

// L'écart entre la spécification et le code, qui a produit douze constats de
// revue sur le lot 2. Voir docs/internal/architecture.md.

const here = dirname(fileURLToPath(import.meta.url))
const protocol = join(here, '..', 'src', 'protocol')
const docs = join(here, '..', '..', '..', 'docs')
const spec = readFileSync(join(docs, 'contracts.md'), 'utf8')

// L'historique d'avant la v1.0 vit à part, en français : il porte le raisonnement
// de huit versions, que le document public résume en un tableau.
const history = readFileSync(join(docs, 'internal', 'spec-journal.md'), 'utf8')

const LOG = '## 9. Version log'
const [normative = '', log = ''] = spec.split(LOG)
const journal = `${log}\n${history}`

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

// Les blocs de code de la partie normative, séparés : un champ doit se trouver
// dans le même bloc que son interface, pas n'importe où dans le document.
const BLOCKS = /```[\s\S]*?```/g
const normativeBlocks = normative.match(BLOCKS) ?? []

// Le corps d'une interface dans un bloc de documentation, ou rien si le bloc ne
// la déclare pas. `[^}]*` s'arrête à la première accolade fermante : un champ
// écrit après un objet inline serait annoncé absent, ce qui se voit.
function bodyOf(block: string, name: string): string | undefined {
  return block.match(new RegExp(`interface\\s+${name}\\b[^{]*\\{([^}]*)\\}`))?.[1]
}

// Une interface exportée et ses champs, `send(ctx): void` compris.
function declaredInterfaces(): { name: string; fields: string[] }[] {
  return readdirSync(protocol)
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .flatMap((file) => {
      const source = readFileSync(join(protocol, file), 'utf8')
      return [...source.matchAll(/^export interface (\w+)[^{]*\{([^}]*)\}/gm)].map((match) => ({
        name: match[1] as string,
        fields: [...(match[2] ?? '').matchAll(/^\s{2}(\w+)\??[:(]/gm)].map((f) => f[1] as string),
      }))
    })
}

// Les formes lues sont celles du contrôle des réexports, par le même code : ce
// motif n'en lisait que quatre sur onze, donc un type déclaré puis exporté seul
// échappait au contrôle et la partie normative pouvait l'ignorer en silence.
function declaredNames(): string[] {
  return readdirSync(protocol)
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .flatMap((file) => declaredIn(readFileSync(join(protocol, file), 'utf8')))
}

describe('la spécification et le code', () => {
  const declared = declaredNames()

  it('lit bien les deux', () => {
    expect(log, 'section 9 introuvable').not.toBe('')
    expect(declared.length).toBeGreaterThan(10)
    expect(normativeCode.length).toBeGreaterThan(1000)

    // Une extraction muette rendrait le contrôle des champs vacant : il
    // parcourrait une liste vide en annonçant que tout est décrit.
    const withFields = declaredInterfaces().filter((one) => one.fields.length > 0)
    expect(withFields.length, 'aucune interface à champs trouvée').toBeGreaterThan(5)
    expect(normativeBlocks.length).toBeGreaterThan(10)
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

  // Citer un nom ne coûte rien : un type mentionné en passant satisfaisait le
  // contrôle précédent. Un champ absent du bloc qui décrit son interface est en
  // revanche un contrat que personne ne peut réimplémenter depuis le document.
  it('décrit chaque champ dans le bloc de son interface', () => {
    for (const { name, fields } of declaredInterfaces()) {
      if (fields.length === 0) continue

      // Sur la déclaration, pas sur une mention : plusieurs interfaces partagent
      // un bloc, et un simple `component: ComponentRef` suffisait sinon à faire
      // passer une interface que le document ne déclare plus.
      const bodies = normativeBlocks
        .map((block) => bodyOf(block, name))
        .filter((body) => body !== undefined)
      expect(bodies, `aucun bloc de code ne déclare ${name}`).not.toEqual([])

      // Dans le corps de l'interface, pas dans le bloc : `name` et `type` sont
      // portés par trois interfaces d'un même bloc en section 4.2, et cinq
      // champs sur vingt-quatre pouvaient disparaître sans rien faire rougir.
      const missing = fields.filter(
        (field) => !bodies.some((body) => new RegExp(`\\b${field}\\b`).test(body)),
      )
      expect(missing, `${name} : ces champs ne sont décrits nulle part`).toEqual([])
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
