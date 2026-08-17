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
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createVitest } from 'vitest/node'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalogue = JSON.parse(readFileSync(join(root, 'test', 'mutations.json'), 'utf8'))

// Les fichiers du dépôt, par git plutôt qu'en parcourant : la liste est déjà
// tenue, et elle ignore ce qui est ignoré.
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const sourceFiles = tracked.filter((one) => /\/src\/.*\.(ts|tsx|vue)$/.test(one))
const testFiles = tracked.filter((one) => /\.test\.(ts|tsx|mjs)$/.test(one))

// Le catalogue entier, ou seulement les garanties dont le fichier a changé. Son
// coût est « nombre de garanties × toute la suite », donc il grandit à chaque
// lot : 7 minutes à 98 garanties, plus de 20 à 131, et le job d'intégration
// continue s'est fait tuer. Une pull request ne touche pourtant que quelques
// fichiers.
//
// `--depuis <ref>` ne garde que les garanties portant sur un fichier du diff.
// Sans argument, tout, ce qui reste le régime de la tâche de nuit et de la main.
function selected() {
  const marque = argv.indexOf('--depuis')
  if (marque === -1) return { mutations: catalogue, depuis: undefined }

  const depuis = argv[marque + 1]
  if (!depuis) throw new Error('`--depuis` attend une référence git')

  const changed = new Set(
    execFileSync('git', ['diff', '--name-only', `${depuis}...HEAD`], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean),
  )

  const touched = withDependents(changed)

  // Trois raisons de vérifier une garantie : son fichier a changé, son gardien a
  // changé, ou un fichier dont son fichier dépend a changé. Les deux premières
  // sont les façons de casser une garantie ; la troisième est la façon de rendre
  // son gardien aveugle sans y toucher.
  return {
    mutations: catalogue.filter(
      (one) => touched.has(one.fichier) || guardiansOf(one).some((file) => changed.has(file)),
    ),
    depuis,
  }
}

// Les fichiers de test qu'une garantie nomme, par `attendu` ou par `dans`. Les
// deux formes comptent : la conversion de `project.test.ts` en fixtures ne
// sélectionnait qu'une garantie sur les neuf que ce fichier garde, les huit
// autres nommant leur gardien dans `dans`.
function guardiansOf(mutation) {
  return [fileOf(mutation.attendu), mutation.dans && fileOf(mutation.dans)].filter(Boolean)
}

// Le fichier de test qu'une garantie nomme, quand elle en nomme un. `attendu`
// est du texte libre : les trois entrées qui citent un code TypeScript n'en
// portent pas.
function fileOf(attendu) {
  const premier = attendu.split(' > ')[0]

  return premier.endsWith('.ts') || premier.endsWith('.mjs')
    ? (testFiles.find((one) => one.endsWith(`/${premier}`)) ?? premier)
    : premier
}

// Les fichiers changés, plus tout ce qui dépend d'eux, directement ou non.
// Calculé et jamais commité : un graphe sur le disque serait un troisième
// artefact à garder frais, et les deux qu'on a déjà ont coûté assez.
function withDependents(changed) {
  const imports = new Map()

  for (const file of sourceFiles) {
    const from = join(root, file)
    const cited = [...readFileSync(from, 'utf8').matchAll(/from\s+'(\.[^']*)'/g)].map(
      (found) => found[1],
    )

    imports.set(
      file,
      cited.flatMap((one) => {
        const base = relative(root, resolve(dirname(from), one))

        return sourceFiles.filter(
          (candidate) => candidate === base || candidate.startsWith(`${base}.`),
        )
      }),
    )
  }

  const reached = new Set(changed)
  let grew = true
  while (grew) {
    grew = false
    for (const [file, cited] of imports) {
      if (reached.has(file)) continue
      if (!cited.some((one) => reached.has(one))) continue

      reached.add(file)
      grew = true
    }
  }

  return reached
}

const { mutations, depuis } = selected()

// Le cas rouge est-il celui que la garantie nomme ?
//
// `attendu` est du texte libre par construction : une vingtaine d'entrées ne
// citent qu'un fragment de titre, avec un champ `dans` pour le fichier. La
// comparaison reste donc une inclusion, mais **dans un nom de cas** et non dans
// la sortie du terminal : un rouge venu d'ailleurs, une colorisation ou un
// préfixe de projet ne peuvent plus la satisfaire.
function nomme(mutation, cas) {
  if (!cas.rouge) return false
  if (mutation.dans && !cas.nom.startsWith(`${mutation.dans} > `)) return false

  // Le titre du cas, ou son message d'échec : trois entrées citent ce que
  // l'assertion écrit et non le nom du cas. Le message vient de l'objet
  // d'erreur, pas de la sortie du terminal.
  return cas.nom.includes(mutation.attendu) || cas.erreurs.includes(mutation.attendu)
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

// Une seule instance de vitest pour tout le contrôle, et des résultats en objets.
//
// Avant, chaque garantie lançait `vp test` en sous-processus et le verdict se
// décidait sur une **sous-chaîne** de la sortie. Trois entrées ont été déclarées
// « vues ailleurs » par la colorisation, vertes en local et rouges en CI : le
// séparateur `>` que vitest colorise ne se comparait plus au texte du catalogue.
// Ici, `fullName` se compare par égalité.
async function runner() {
  // Les cas de la dernière exécution.
  //
  // Vidé avant, et l'exécution est attendue jusqu'à sa fin : sans cette attente,
  // des rappels de l'exécution précédente atterrissaient après le vidage, et deux
  // cas d'autres fichiers apparaissaient comme rouges. Le symptôme était un faux
  // « gardien muet ». Mesuré.
  //
  // `onTestRunEnd` ne convient pas : il ne se déclenche pas à chaque exécution
  // ciblée, donc rien n'était collecté et tout paraissait « MANQUÉ ». Mesuré
  // aussi.
  let derniers = []

  const vitest = await createVitest('test', {
    root,
    watch: false,
    passWithNoTests: true,
    reporters: [
      {
        onTestCaseResult(cas) {
          derniers.push({
            nom: `${basename(cas.module.relativeModuleId)} > ${cas.fullName}`,
            rouge: cas.result().state === 'failed',
            erreurs: (cas.result().errors ?? []).map((une) => une.message ?? '').join('\n'),
          })
        },
      },
    ],
  })

  const specs = await vitest.globTestSpecifications()

  // Les cas navigateur sont hors du repli : ils montent un serveur et Chromium,
  // donc ils dominent son coût. Une garantie qui les nomme les lance quand même
  // par la voie rapide.
  const rapides = specs.filter((one) => !one.moduleId.endsWith('screen.test.ts'))

  return {
    close: () => vitest.close(),
    invalidate: (path) => vitest.invalidateFile(path),

    // Les cas d'un fichier nommé, ou tous ceux hors navigateur.
    async lance(fichier) {
      const choisis = fichier
        ? specs.filter((one) => one.moduleId.endsWith(`/${fichier}`))
        : rapides

      if (choisis.length === 0) return undefined

      derniers = []
      await vitest.runTestSpecifications(choisis)
      await vitest.waitForTestRunEnd()

      return derniers
    },
  }
}

// La voie lente, sans les cas navigateur. Ils démarrent un serveur et Chromium,
// donc ils dominent le temps d'un repli, et un repli arrive pour chaque garantie
// que la voie rapide ne tranche pas. Mesuré : le contrôle a dépassé les vingt
// minutes du job d'intégration continue et s'est fait tuer.
//
// Rien n'est perdu du diagnostic : une garantie dont le gardien est un cas
// navigateur le nomme, donc la voie rapide le lance directement. Ce que le repli
// cesse de voir, c'est « vue par un cas navigateur alors qu'elle en nomme un
// autre », qui serait de toute façon un gardien muet.
const SLOW = ['test', '--exclude', '**/screen.test.ts']

// La source mutée du moment, écrite sur le disque avant de muter. Le `finally`
// de la boucle restaure sur une exception, et un gestionnaire de signal ne
// suffit pas : `execFileSync` bloque la boucle d'événements pendant presque tout
// le contrôle, donc le signal n'est jamais servi. Mesuré, un fichier muté est
// resté dans l'arbre après un `pkill`.
//
// Ce journal survit à n'importe quelle mort, y compris `SIGKILL` : la prochaine
// exécution restaure et le dit.
const INFLIGHT = join(root, 'test', '.mutation-inflight.json')

function recoverInFlight() {
  if (!existsSync(INFLIGHT)) return

  let read
  try {
    read = JSON.parse(readFileSync(INFLIGHT, 'utf8'))
  } catch {
    // Tué au milieu de l'écriture du journal : la source n'a alors pas encore
    // été mutée, puisque le journal est écrit avant. Le dire et repartir vaut
    // mieux qu'une trace brute sur un fichier que personne ne connaît.
    rmSync(INFLIGHT)
    console.log(
      "Journal du contrôle précédent illisible, ignoré : la source n'avait pas été mutée.",
    )
    return
  }

  // Seulement si le fichier porte encore la mutation. Le journal est ignoré par
  // Git, donc rien ne signale sa présence : restaurer sans regarder écrasait ce
  // que l'auteur avait écrit depuis, éventuellement des jours plus tard. C'est
  // la panne que `CLAUDE.md` décrit sous « Annuler une modification de test ».
  // Un journal d'une version antérieure n'a pas de texte muté. Le comparer
  // rendrait toujours faux, donc le script dirait « rien n'a été touché » sur
  // une source restée mutée, et supprimerait ce qui permettait de la restaurer.
  if (read.mutated !== undefined && readFileSync(read.path, 'utf8') !== read.mutated) {
    rmSync(INFLIGHT)
    console.log(
      `Journal du contrôle précédent périmé : ${relative(root, read.path)} a changé depuis, rien n'a été touché.`,
    )
    return
  }

  writeFileSync(read.path, read.original)
  rmSync(INFLIGHT)
  console.log(`Contrôle précédent interrompu : ${relative(root, read.path)} a été restauré.`)
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
async function main() {
  // Un catalogue vide annonçait « 0 garanties, toutes gardées », qui se lit comme
  // un succès. Rien à vérifier n'est un état à signaler, pas à approuver.
  if (catalogue.length === 0) {
    console.error('Catalogue vide : ce contrôle n’aurait rien à vérifier.')
    process.exit(1)
  }

  // Une sélection vide est en revanche un résultat : ce diff ne touche aucun
  // fichier qui porte une garantie.
  if (mutations.length === 0) {
    console.log(`Aucune garantie ne porte sur un fichier changé depuis ${depuis}.`)
    return
  }

  if (depuis) {
    console.log(`${mutations.length} garantie(s) sur ${catalogue.length}, limitées au diff.`)
  }

  // Avant le contrôle d'arbre propre : une source laissée mutée par une exécution
  // tuée est exactement ce qui salit l'arbre, et refuser de partir sans la
  // restaurer demanderait à l'utilisateur de deviner ce que le script a fait.
  recoverInFlight()

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

  // Monté une fois, fermé à la fin : c'est ce qui remplace les cent trente
  // démarrages de vitest en sous-processus.
  const lanceur = await runner()

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
    const muted = original.replace(mutation.avant, () => mutation.apres)

    writeFileSync(INFLIGHT, JSON.stringify({ path, original, mutated: muted }))
    writeFileSync(path, muted)

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

      lanceur.invalidate(path)

      // Voie rapide : le seul fichier que la garantie nomme. La quasi-totalité
      // des mutations s'arrête ici. `vp check` n'a pas à tourner dans ce cas : si
      // le cas attendu rougit, la garantie est tenue, quoi qu'en dise le lint.
      const quick = built.ok && target ? await lanceur.lance(target) : undefined
      const quickConcluded = quick?.some((un) => nomme(mutation, un)) ?? false

      // Voie lente : seulement quand la voie rapide n'a pas conclu. C'est là que se
      // décide « vue ailleurs », et ce diagnostic vaut son prix : il a attrapé une
      // mutation vue par la colorisation de vitest, et une autre vue par le
      // formateur parce qu'elle laissait une indentation fausse.
      const tests = quickConcluded ? quick : built.ok ? await lanceur.lance() : []
      const rouges = tests ?? []

      // `vp check` reste un sous-processus : une vingtaine de garanties attendent
      // un code d'erreur du compilateur, que l'API des tests ne voit pas.
      const check = quickConcluded ? { ok: true, output: '' } : run(vp, ['check'])
      const noticed = rouges.some((un) => un.rouge) || !check.ok

      // Qu'une vérification rougisse ne suffit pas : ce doit être celle qui porte
      // la garantie. Sans ce contrôle, une mutation vue par un test sans rapport
      // laisserait croire que la garantie tient, alors que son gardien est muet.
      const byTheRightOne =
        quickConcluded ||
        rouges.some((un) => nomme(mutation, un)) ||
        plain(check.output).includes(mutation.attendu)

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
            `    à la place : ${rouges
              .filter((un) => un.rouge)
              .map((un) => un.nom)
              .slice(0, 3)
              .join(' | ')}${check.ok ? '' : ` | ${sample(check.output)}`}`,
        )
    } finally {
      writeFileSync(path, original)
      rmSync(INFLIGHT, { force: true })
      // `dist` reste issu de la source mutée, et git ne le voit pas puisqu'il est
      // ignoré. Reconstruire ici plutôt qu'après la boucle : une exception ou une
      // interruption laisserait sinon des bundles qui ne suivent aucune source.
      run(vp, ['run', '-r', 'pack'])
    }
  }

  // `dist` est ignoré par git, donc le contrôle ci-dessous ne verrait pas des
  // artefacts restés construits depuis une source mutée. La reconstruction vaut
  // aussi pour la sortie par exception, d'où le `finally` autour de la boucle.
  await lanceur.close()

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

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((cause) => {
    console.error(cause)
    process.exit(1)
  })
}
