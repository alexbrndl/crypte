// Le compte des commandes a été faux deux fois de suite, cinq puis quatre, sur
// des documents destinés à l'extérieur. `cli.ts` fait foi. Voir DCJ-286.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (...parts) => readFileSync(join(racine, ...parts), 'utf8')

const CLI = lire('packages', 'cli', 'src', 'cli.ts')
const GUIDE = lire('docs', 'guide.md')
const LLMS = lire('docs', 'site', 'llms.txt')

// Les étiquettes du `switch` qui ne commencent pas par un tiret. `--version` et
// `-v` sont des drapeaux, pas des commandes, et la ligne d'aide ne les liste pas.
function commandes() {
  const trouvées = [...CLI.matchAll(/^\s*case '([^']+)':/gm)]
    .map((m) => m[1])
    .filter((nom) => !nom.startsWith('-'))

  expect(trouvées, 'aucune commande lue dans cli.ts').not.toEqual([])

  return [...new Set(trouvées)]
}

test('la ligne d’aide liste ce que le switch porte', () => {
  const aide = /commands: ([^`\\]+)`/.exec(CLI)

  expect(aide, 'aucune ligne « commands: … » dans cli.ts').not.toBeNull()
  expect(
    aide[1]
      .split(',')
      .map((one) => one.trim())
      .sort(),
  ).toEqual(commandes().sort())
})

// Une mention ne suffit pas à juger : le guide nomme `crypte check` en disant
// qu'il n'est pas construit, ce qui est vrai. C'est la phrase qui affirme la
// surface qui se tient, pas le fait de citer un nom.
test('le guide dit la surface que le code porte', () => {
  const phrase = /`crypte (\w+)` is the only command today\./.exec(GUIDE)

  expect(phrase, 'le guide ne dit plus quelle est la surface du jour').not.toBeNull()
  expect(commandes()).toEqual([phrase[1]])
})

test('llms.txt sépare ce qui est construit de ce qui est prévu', () => {
  const phrase = /`crypte (\w+)` is the whole surface today\./.exec(LLMS)

  expect(phrase, 'llms.txt ne dit plus quelle est la surface du jour').not.toBeNull()
  expect(commandes()).toEqual([phrase[1]])
})

// Sans ce cas, les trois précédents passeraient à l'identique le jour où le
// `switch` cesse d'être la source : ils liraient une liste vide des deux côtés.
test('cli.ts porte bien la commande qu’on croit', () => {
  expect(commandes()).toEqual(['dev'])
})
