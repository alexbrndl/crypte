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

// Contrôle positif, avant tout le reste. Sans lui, un binaire introuvable rend
// « échec » à chaque appel, donc toute mutation paraît vue, et le script annonce
// que tout est gardé sans avoir rien lancé. Mesuré : c'était le cas.
console.log('contrôle positif : la suite passe-t-elle sur le code intact ?')
if (!run(vp, ['run', '-r', 'pack']).ok || !run(vp, ['test']).ok || !run(vp, ['check']).ok) {
  console.error(`\nLa suite échoue déjà sans mutation. Corrige-la, ou vérifie \`${vp}\`.`)
  process.exit(1)
}

const failures = []

// Le `finally` d'une boucle ne joue pas sur un signal : sans ce filet, une
// interruption au clavier laisse une source mutée dans l'arbre de travail.
let restore = null
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (restore) restore()
    process.exit(130)
  })
}

for (const mutation of mutations) {
  const path = join(root, mutation.fichier)
  const original = readFileSync(path, 'utf8')
  restore = () => writeFileSync(path, original)

  if (!original.includes(mutation.avant)) {
    failures.push(`${mutation.garantie} : le motif n'existe plus dans ${mutation.fichier}`)
    continue
  }

  writeFileSync(path, original.replace(mutation.avant, mutation.apres))

  try {
    // La construction précède les tests, comme en intégration continue : le test
    // d'isolation lit les artefacts.
    run(vp, ['run', '-r', 'pack'])
    const tests = run(vp, ['test'])
    const check = run(vp, ['check'])
    const noticed = !tests.ok || !check.ok

    // Qu'une vérification rougisse ne suffit pas : ce doit être celle qui porte
    // la garantie. Sans ce contrôle, une mutation vue par un test sans rapport
    // laisserait croire que la garantie tient, alors que son gardien est muet.
    const byTheRightOne = `${tests.output}${check.output}`.includes(mutation.attendu)

    const verdict = !noticed ? 'MANQUÉ' : byTheRightOne ? 'vu   ' : 'AILLEURS'
    console.log(`${verdict}  ${mutation.garantie}`)

    if (!noticed) failures.push(`${mutation.garantie} (${mutation.trouvee}) n'est gardée par rien`)
    else if (!byTheRightOne)
      failures.push(
        `${mutation.garantie} : vue par autre chose que « ${mutation.attendu} », son gardien est muet`,
      )
  } finally {
    writeFileSync(path, original)
    restore = null
  }
}

run(vp, ['run', '-r', 'pack'])

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
