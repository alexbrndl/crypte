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

// Une lecture vide lève déjà dans `commandes()`. Ce que ce cas attrape en plus
// est une lecture **fausse mais non vide** : le jour où le `switch` cesse d'être
// la source, les trois précédents compareraient deux fois la même erreur.
test('cli.ts porte bien la commande qu’on croit', () => {
  expect(commandes()).toEqual(['dev'])
})

// Le prévu ne se lit dans aucun code, donc rien ne peut dire s'il est juste. Ce
// qui se tient est que `llms.txt` en donne la même liste à ses deux endroits :
// avant, les deux disaient `init, dev, build, check` et coïncidaient par hasard.
test('llms.txt donne la même liste de commandes prévues à ses deux endroits', () => {
  const noms = (texte) => [...texte.matchAll(/`(\w+)`/g)].map((m) => m[1]).sort()

  const phrase = /^Crypte is driven by a CLI\..*?today\.(.*)$/m.exec(LLMS)
  const lien = /^- \[Commands\]\([^)]+\): (.*)$/m.exec(LLMS)

  expect(phrase, 'la phrase de surface a changé de forme').not.toBeNull()
  expect(lien, 'la ligne « Commands » a changé de forme').not.toBeNull()

  // Le lien nomme la commande du jour avant les prévues, la phrase non.
  const prévues = noms(lien[1]).filter((one) => !commandes().includes(one))

  expect(noms(phrase[1])).toEqual(prévues)
  expect(prévues, 'aucune commande prévue lue').not.toEqual([])
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
