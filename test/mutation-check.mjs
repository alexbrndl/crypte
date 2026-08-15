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
import { argv } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mutations = JSON.parse(readFileSync(join(root, 'test', 'mutations.json'), 'utf8'))

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

// La source mutée du moment. Le `finally` de la boucle restaure sur une
// exception, jamais sur un signal : un contrôle tué par un délai laissait donc
// un fichier muté dans l'arbre, prêt à être commité. Mesuré.
let inFlight

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (inFlight) writeFileSync(inFlight.path, inFlight.original)
    console.error(`\nInterrompu par ${signal}. La source mutée a été restaurée.`)
    process.exit(1)
  })
}

// `\e[2m > \e[22m` n'est pas ` > `. Voir docs/internal/architecture.md. Construite depuis un
// code, une séquence d'échappement en littéral étant refusée par le lint.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g')

function plain(output) {
  return output.replace(ANSI, '')
}

// Le fichier que `attendu` nomme, quand il en nomme un : une garantie sur cinq
// désigne un titre de cas, un code d'erreur TypeScript ou une fixture, et rien
// n'y permet de cibler un fichier. Voir docs/internal/architecture.md.
export const NAMES_A_FILE = /^([\w.-]+\.test\.(?:tsx?|mjs)) > /

// Un filtre qui ne correspond à rien fait sortir vitest en échec, ce qui se lit
// comme une mutation vue. Le reconnaître pour retomber sur la voie lente.
export const NO_FILE = 'No test files found'

// `dans` quand la garantie le porte, sinon le premier segment de `attendu`. Le
// champ existe pour les cas dont `attendu` cite un titre sans son fichier : la
// sortie de vitest écrit `fichier > describe > cas`, donc préfixer `attendu`
// casserait la comparaison au lieu de la cibler.
export function targetOf(mutation) {
  return mutation.dans ?? NAMES_A_FILE.exec(String(mutation.attendu))?.[1]
}

// La voie rapide conclut, ou pas. Sortie ici plutôt qu'en ligne dans la boucle :
// c'est la seule décision du dépôt capable de rendre « vu » sans preuve venue du
// gardien nommé, donc elle mérite ses propres cas.
//
// Trois conditions, et chacune a coûté quelque chose. Le fichier doit avoir
// rougi. Le message d'un filtre sans correspondance ne doit pas être pris pour
// ce rouge. Et le cas attendu doit apparaître, sinon c'est un autre cas du même
// fichier qui a rougi, ce que la voie lente doit diagnostiquer.
export function concludes(quick, attendu) {
  if (quick === undefined || quick.ok) return false

  const output = plain(quick.output)

  return !output.includes(NO_FILE) && output.includes(attendu)
}

// Ce qui a rougi, en trois lignes : les échecs nommés, sinon la fin de la sortie.
function sample(output) {
  const lines = plain(output).trim().split('\n')
  const named = lines.filter((line) => /\bFAIL\b|error:|✕|×/.test(line)).slice(0, 3)

  return (named.length > 0 ? named : lines.slice(-3)).join('\n    ')
}

// Le contrôle entier. Dans une fonction gardée, comme `changeset-check.mjs` et
// `post-review.mjs` : sans ça, importer ce module pour en tester une fonction
// lancerait les quatre-vingt-dix mutations.
function main() {
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

  // Contrôle positif, avant tout le reste. Sans lui, un binaire introuvable rend
  // « échec » à chaque appel, donc toute mutation paraît vue, et le script annonce
  // que tout est gardé sans avoir rien lancé. Mesuré : c'était le cas.
  console.log('contrôle positif : la suite passe-t-elle sur le code intact ?')
  // Avec la sortie de celui qui a échoué, et son nom : sans ça le message dit
  // qu'une des trois commandes est rouge sans dire laquelle, et le seul moyen de
  // savoir est de relancer les trois à la main.
  for (const args of [['run', '-r', 'pack'], ['test'], ['check']]) {
    const result = run(vp, args)
    if (result.ok) continue

    console.error(`\nLa suite échoue déjà sans mutation. Corrige-la, ou vérifie \`${vp}\`.`)
    console.error(`\`${vp} ${args.join(' ')}\` :`)
    console.error(plain(result.output).split('\n').slice(-40).join('\n'))
    process.exit(1)
  }

  // La voie rapide ajoute une précondition que la suite entière ne couvre pas :
  // chaque fichier ciblé doit passer **seul**. Un fichier devenu dépendant de
  // l'ordre rougirait sans mutation, son cas attendu apparaîtrait dans sa sortie,
  // et toutes les garanties qui le nomment seraient conclues « vu » sur un
  // gardien muet. C'est la panne même pour laquelle ce contrôle positif existe.
  //
  // Une quinzaine de démarrages de vitest, contre les soixante secondes de
  // plancher déjà assumées.
  const targets = [...new Set(mutations.map(targetOf).filter(Boolean))]

  for (const target of targets) {
    const alone = run(vp, ['test', target])

    if (!alone.ok) {
      console.error(
        `\n${target} ne passe pas seul, alors que la voie rapide le lance seul.\n` +
          `    ${sample(alone.output)}`,
      )
      process.exit(1)
    }
  }

  console.log(`contrôle positif : ${targets.length} cibles passent seules`)

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
    inFlight = { path, original }
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

      // Voie rapide : le seul fichier que la garantie nomme. Mesuré, il coûte
      // 748 ms là où la suite entière en coûte 2264, et la quasi-totalité des
      // mutations s'arrête ici. `vp check` n'a pas à tourner dans ce cas : si le
      // cas attendu rougit, la garantie est tenue, quoi qu'en dise le lint.
      const target = targetOf(mutation)
      const quick = built.ok && target ? run(vp, ['test', target]) : undefined
      const quickConcluded = concludes(quick, mutation.attendu)

      // Voie lente : seulement quand la voie rapide n'a pas conclu. C'est là que se
      // décide « vue ailleurs », et ce diagnostic vaut son prix : il a attrapé une
      // mutation vue par la colorisation de vitest, et une autre vue par le
      // formateur parce qu'elle laissait une indentation fausse.
      const tests = quickConcluded
        ? quick
        : built.ok
          ? run(vp, ['test'])
          : { ok: false, output: built.output }
      const check = quickConcluded ? { ok: false, output: '' } : run(vp, ['check'])
      const noticed = !tests.ok || !check.ok

      // Qu'une vérification rougisse ne suffit pas : ce doit être celle qui porte
      // la garantie. Sans ce contrôle, une mutation vue par un test sans rapport
      // laisserait croire que la garantie tient, alors que son gardien est muet.
      const byTheRightOne =
        quickConcluded || plain(`${tests.output}${check.output}`).includes(mutation.attendu)

      const verdict = !built.ok
        ? 'CASSÉ'
        : !noticed
          ? 'MANQUÉ'
          : byTheRightOne
            ? 'vu   '
            : 'AILLEURS'
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
      inFlight = undefined
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

  // La suite écrit aussi des fichiers commités, l'empreinte de la fixture. Écrite
  // depuis une source mutée elle diverge, et le contrôle ci-dessous la verrait
  // comme une source non restaurée. Un dernier passage sur les sources intactes la
  // remet à sa valeur, ce qui vaut mieux que de retirer ces fichiers du contrôle :
  // celui-ci reste ainsi le seul juge de ce que le script a laissé derrière lui.
  const restored = run(vp, ['test'])

  // Ce script écrit dans les sources. Qu'il les restaure toutes est sa condition
  // d'emploi, et personne d'autre ne la vérifie : en intégration continue il passe
  // après le `git diff`, donc un fichier laissé muté ne serait vu de personne.
  // Le contrôle d'arbre d'abord, même si la suite ci-dessus a échoué : un fichier
  // laissé derrière est la cause la plus probable de cet échec, et le taire pour
  // annoncer « la suite échoue » désignerait le symptôme.
  const left = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  if (left.trim()) {
    console.error(`\nDes sources sont restées modifiées :\n${left}`)
    process.exit(1)
  }

  if (!restored.ok) {
    // Avec sa sortie : sans elle, le message dit qu'il y a un problème et laisse
    // relancer la suite à la main pour savoir lequel, ce qui coûte le temps du
    // contrôle entier quand l'échec ne se reproduit pas.
    console.error('\nLa suite échoue sur les sources restaurées, arbre propre par ailleurs.')
    console.error(plain(restored.output).split('\n').slice(-40).join('\n'))
    process.exit(1)
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} garantie(s) sans garde :`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }

  console.log(`\n${mutations.length} garanties, toutes gardées.`)
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) main()
