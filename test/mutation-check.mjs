// Casse chaque garantie du protocole et vérifie que la suite de tests s'en aperçoit.
//
// Un test qui passe pour la mauvaise raison est le défaut le plus fréquent de ce
// dépôt : sept fois sur les neuf revues du lot 2, plus quatre garanties tenues
// mais gardées par rien. Le seul remède qui ait fonctionné est de casser ce que
// le test surveille et de le voir rougir. Ce script en fait un contrôle.
//
// Chaque entrée de mutations.json vient d'un constat de revue réel : ce qui a été
// trouvé une fois ne peut plus revenir sans être vu.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mutations = JSON.parse(readFileSync(join(root, 'test', 'mutations.json'), 'utf8'))

// Un catalogue vide annonçait « 0 garanties, toutes gardées », qui se lit comme
// un succès. Rien à vérifier n'est un état à signaler, pas à approuver.
if (mutations.length === 0) {
  console.error('Catalogue vide : ce contrôle n’aurait rien à vérifier.')
  process.exit(1)
}

// Un arbre sale rendrait la restauration ambiguë, et une interruption laisserait
// des sources mutées sans que git puisse dire lesquelles.
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
if (dirty.trim()) {
  console.error('Arbre de travail non propre. Commite ou remise avant de lancer ce contrôle.')
  process.exit(1)
}

// Rend le succès et la sortie. Un lancement impossible n'est pas un échec de
// vérification : le confondre avec un test rouge ferait passer toute mutation
// pour vue.
function run(command, args) {
  try {
    const stdout = execFileSync(command, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' })
    return { ok: true, output: stdout }
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`commande introuvable : ${command}`)
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const vp = process.env.VP_BIN ?? 'vp'

// `\e[2m > \e[22m` n'est pas ` > `. Voir architecture.md. Construite depuis un
// code, une séquence d'échappement en littéral étant refusée par le lint.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g')

function plain(output) {
  return output.replace(ANSI, '')
}

// Ce qui a rougi, en trois lignes : les échecs nommés, sinon la fin de la sortie.
function sample(output) {
  const lines = plain(output).trim().split('\n')
  const named = lines.filter((line) => /\bFAIL\b|error:|✕|×/.test(line)).slice(0, 3)

  return (named.length > 0 ? named : lines.slice(-3)).join('\n    ')
}

// Contrôle positif, avant tout le reste. Sans lui, un binaire introuvable rend
// « échec » à chaque appel, donc toute mutation paraît vue, et le script annonce
// que tout est gardé sans avoir rien lancé. Mesuré : c'était le cas.
console.log('contrôle positif : la suite passe-t-elle sur le code intact ?')
if (!run(vp, ['run', '-r', 'pack']).ok || !run(vp, ['test']).ok || !run(vp, ['check']).ok) {
  console.error(`\nLa suite échoue déjà sans mutation. Corrige-la, ou vérifie \`${vp}\`.`)
  process.exit(1)
}

const failures = []

// La restauration tient dans le `finally` de chaque tour, et nulle part ailleurs.
// Un gestionnaire de signal ne servirait à rien ici : la boucle est synchrone, le
// gestionnaire ne s'exécuterait donc jamais, et l'enregistrer suffirait à
// désactiver l'interruption par défaut, rendant le script impossible à arrêter.
// Une interruption au clavier laisse une source mutée : `git status` la montre.
for (const mutation of mutations) {
  const path = join(root, mutation.fichier)
  const original = readFileSync(path, 'utf8')

  const occurrences = original.split(mutation.avant).length - 1
  if (occurrences !== 1) {
    const cause = occurrences === 0 ? "n'existe plus" : `apparaît ${occurrences} fois`
    failures.push(`${mutation.garantie} : le motif ${cause} dans ${mutation.fichier}`)
    continue
  }

  // Le remplacement passe par une fonction : la forme chaîne interpréterait
  // `$&` et `$1` dans le texte, qui y écriraient ce que personne n'a écrit.
  writeFileSync(
    path,
    original.replace(mutation.avant, () => mutation.apres),
  )

  try {
    // La construction précède les tests, comme en intégration continue : le test
    // d'isolation lit les artefacts.
    // Une construction en échec laisserait les tests lire les artefacts
    // précédents, et le verdict accuserait une garantie pourtant gardée.
    const built = run(vp, ['run', '-r', 'pack'])
    const tests = built.ok ? run(vp, ['test']) : { ok: false, output: built.output }
    const check = run(vp, ['check'])
    const noticed = !tests.ok || !check.ok

    // Qu'une vérification rougisse ne suffit pas : ce doit être celle qui porte
    // la garantie. Sans ce contrôle, une mutation vue par un test sans rapport
    // laisserait croire que la garantie tient, alors que son gardien est muet.
    const byTheRightOne = plain(`${tests.output}${check.output}`).includes(mutation.attendu)

    const verdict = !built.ok ? 'CASSÉ' : !noticed ? 'MANQUÉ' : byTheRightOne ? 'vu   ' : 'AILLEURS'
    console.log(`${verdict}  ${mutation.garantie}`)

    // Une construction cassée ne dit rien de la garantie : c'est la mutation qui
    // est mal écrite. Le dire, plutôt que d'accuser un gardien muet.
    if (!built.ok)
      failures.push(`${mutation.garantie} : la mutation casse la construction, corrige-la`)
    else if (!noticed)
      failures.push(`${mutation.garantie} (${mutation.trouvee}) n'est gardée par rien`)
    else if (!byTheRightOne)
      failures.push(
        // Sans l'extrait, ce verdict dit ce qui manque, jamais ce qui a rougi.
        `${mutation.garantie} : vue par autre chose que « ${mutation.attendu} », son gardien est muet\n` +
          `    à la place : ${sample(`${tests.output}${check.output}`)}`,
      )
  } finally {
    writeFileSync(path, original)
    // `dist` reste issu de la source mutée, et git ne le voit pas puisqu'il est
    // ignoré. Reconstruire ici plutôt qu'après la boucle : une exception ou une
    // interruption laisserait sinon des bundles qui ne suivent aucune source.
    run(vp, ['run', '-r', 'pack'])
  }
}

// `dist` est ignoré par git, donc le contrôle ci-dessous ne verrait pas des
// artefacts restés construits depuis une source mutée. La reconstruction vaut
// aussi pour la sortie par exception, d'où le `finally` autour de la boucle.
if (!run(vp, ['run', '-r', 'pack']).ok) {
  console.error('\nLa reconstruction finale a échoué : `dist` ne correspond plus aux sources.')
  process.exit(1)
}

// Ce script écrit dans les sources. Qu'il les restaure toutes est sa condition
// d'emploi, et personne d'autre ne la vérifie : en intégration continue il passe
// après le `git diff`, donc un fichier laissé muté ne serait vu de personne.
const left = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
if (left.trim()) {
  console.error(`\nDes sources sont restées modifiées :\n${left}`)
  process.exit(1)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} garantie(s) sans garde :`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`\n${mutations.length} garanties, toutes gardées.`)
