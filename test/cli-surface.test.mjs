// Le compte des commandes a été faux deux fois de suite, cinq puis quatre, sur
// du guide, destiné à l'extérieur. `cli.ts` fait foi.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (...parts) => readFileSync(join(racine, ...parts), 'utf8')

const CLI = lire('packages', 'cli', 'src', 'cli.ts')
const GUIDE = lire('docs', 'guide.md')

// Les étiquettes du `switch` qui ne commencent pas par un tiret. `--version` et
// `-v` sont des drapeaux, pas des commandes, et la ligne d'aide ne les liste pas.
function commandes() {
  const trouvées = [...CLI.matchAll(/^\s*case '([^']+)':/gm)]
    .map((m) => m[1])
    .filter((nom) => !nom.startsWith('-'))

  expect(trouvées, 'aucune commande lue dans cli.ts').not.toEqual([])

  return [...new Set(trouvées)]
}

// Bornée à sa ligne : sans `\n`, le motif attrapait le paramètre `commands:` de
// `run` et avalait le `switch` jusqu'au premier accent grave. Mesuré.
test('la ligne d’aide liste ce que le switch porte', () => {
  const aide = /commands: ([^`\\\n]+)`/.exec(CLI)

  expect(aide, 'aucune ligne « commands: … » dans cli.ts').not.toBeNull()
  expect(
    aide[1]
      .split(',')
      .map((one) => one.trim())
      .sort(),
  ).toEqual(commandes().sort())
})

// Les noms d'une phrase, le préfixe `crypte ` retiré. Aucune des deux phrases
// ne porte de compte écrit : c'est le compte qui a été faux deux fois.
function nommées(phrase) {
  return [...phrase.matchAll(/`(?:crypte )?(\w+)`/g)].map((m) => m[1])
}

const trié = (noms) => [...noms].sort((a, b) => a.localeCompare(b))

// Une mention ne suffit pas à juger : les deux documents nomment aussi les
// commandes prévues, ce qui est vrai. C'est la phrase qui affirme la surface
// qui se tient, pas le fait de citer un nom.
test('le guide dit la surface que le code porte', () => {
  const phrase = /^The commands today are (.*?)\. The help line/m.exec(GUIDE)

  expect(phrase, 'le guide ne dit plus quelle est la surface du jour').not.toBeNull()
  expect(trié(nommées(phrase[1]))).toEqual(trié(commandes()))
})

// Une lecture vide lève déjà dans `commandes()`. Ce que ce cas attrape en plus
// est une lecture **fausse mais non vide** : le jour où le `switch` cesse d'être
// la source, les trois précédents compareraient deux fois la même erreur.
test('cli.ts porte bien les commandes qu’on croit', () => {
  expect(commandes()).toEqual(['dev', 'check', 'init'])
})

// La sortie citée par le guide est copiée à la main. Sans ce cas, une bosse de
// `PROTOCOL_VERSION` laisse le guide citer une ligne que le programme ne produit
// plus, et le guide promet pourtant que chacun de ses exemples est exécuté.
test('le guide cite la ligne d’aide que le CLI produit', () => {
  const version = /export const PROTOCOL_VERSION = (\d+)/.exec(
    lire('packages', 'core', 'src', 'protocol', 'channel.ts'),
  )

  expect(version, 'PROTOCOL_VERSION introuvable').not.toBeNull()

  // Reconstruite plutôt que réécrite ici : le gabarit et son littéral de
  // commandes viennent de `cli.ts`, la version du protocole de `channel.ts`. Ce
  // littéral rejoint le `switch` par le premier cas, pas par celui-ci.
  const gabarit = /log\(`(crypte — protocol v\$\{PROTOCOL_VERSION\}, commands: [^`]+)`\)/.exec(CLI)

  expect(gabarit, 'la ligne d’aide a changé de forme').not.toBeNull()

  const attendue = gabarit[1].replace('${PROTOCOL_VERSION}', version[1])

  expect(GUIDE).toContain(attendue)
})
