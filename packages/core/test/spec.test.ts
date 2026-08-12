import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// L'écart entre la spécification et le code, qui a produit douze constats de
// revue sur le lot 2. Voir architecture.md.

const here = dirname(fileURLToPath(import.meta.url))
const protocol = join(here, '..', 'src', 'protocol')
const spec = readFileSync(join(here, '..', '..', '..', 'docs', 'spec-contrats.md'), 'utf8')

const JOURNAL = '## 8. Journal des versions'
const [normative = '', journal = ''] = spec.split(JOURNAL)

// Les noms retirés, lus dans la colonne « Avant » des tableaux du journal. Le
// journal est déjà la mémoire des renommages : il devient ici leur contrôle.
//
// Le nom doit occuper la cellule à lui seul, et commencer par une majuscule :
// sinon les lignes qui décrivent un changement en toutes lettres sont prises
// pour des renommages, et `| \`ready\` annonce …` interdit le mot `ready`.
const RENAMED = /^\|\s*`([A-Z]\w*)`\s*\|/gm

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
  })

  // Douze constats de revue venaient de là : un nom renommé qui survit dans la
  // partie qui fait foi, et qu'on réimplémente depuis elle.
  it('ne garde aucun nom retiré dans la partie normative', () => {
    const retired = [...journal.matchAll(RENAMED)]
      .map((match) => match[1] as string)
      .filter((name) => !declared.includes(name) && !NOT_OURS.has(name))

    expect(retired.length, 'aucun renommage lu dans le journal').toBeGreaterThan(0)

    // Cherché comme mot entier, et non entre accents graves : les noms périmés
    // ont surtout traîné dans les blocs de code, où ils n'en portent pas.
    for (const name of retired) {
      expect(
        normative,
        `${name} a été retiré mais figure encore dans la spécification`,
      ).not.toMatch(new RegExp(`\\b${name}\\b`))
    }
  })

  // L'écart dans l'autre sens : un type public que la spécification ignore.
  it('décrit tout ce que le protocole expose', () => {
    for (const name of declared) {
      expect(spec, `${name} est exporté mais absent de la spécification`).toContain(name)
    }
  })
})
