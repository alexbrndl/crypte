// Les cinq budgets du produit, mesurés plutôt qu'annoncés. Le cinquième, le
// compte de clés obligatoires, est un type et vit dans `config.test-d.ts`.
// Voir docs/internal/architecture.md.

import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))

export const RACINE = join(ici, '..')

export const BUDGETS = JSON.parse(readFileSync(join(ici, 'budgets.json'), 'utf8'))

// Ce que chaque budget mesure et dans quelle unité. La cible vient de
// `budgets.json`, le reste d'ici : un seuil se change, un libellé non.
export const MESURES = {
  startMs: { titre: 'Démarrage à froid', unité: 'ms', format: (n) => `${n} ms` },
  installedBytes: { titre: 'Poids installé, `cli` + `react`', unité: 'o', format: mo },
  shellGzipBytes: { titre: 'Bundle du shell, gzip', unité: 'o', format: ko },
  adapterLines: { titre: 'Adaptateur React', unité: 'lignes', format: (n) => `${n} lignes` },
}

// En unités SI, comme les cibles de l'issue les écrit : « moins de 300 Ko »,
// « moins de 15 Mo ». `docs/internal/architecture.md` compte en Kio ailleurs,
// et convertir ici ferait bouger une cible de 2,4 % sans décision.
function mo(n) {
  return `${(n / 1e6).toFixed(1)} Mo`
}

function ko(n) {
  return `${(n / 1e3).toFixed(1)} Ko`
}

// Le shell prébuildé, tel qu'il part chez l'utilisateur : tous les actifs, gzip
// compris, parce que c'est ce que le navigateur télécharge.
//
// Lève plutôt que de rendre zéro. Un dossier absent veut dire que `vp pack`
// n'a pas tourné, et un budget de poids tenu par un bundle inexistant est le
// pire des verdicts : vert, et sur rien.
export function shellGzipBytes(dossier = join(RACINE, 'packages/cli/dist/shell/assets')) {
  const actifs = fichiersDe(dossier).filter((one) => !one.endsWith('.map'))

  if (actifs.length === 0) {
    throw new Error(`aucun actif de shell dans ${dossier} : lancer \`vp run -r pack\` d'abord`)
  }

  return actifs.reduce(
    (total, file) => total + gzipSync(readFileSync(file), { level: 9 }).length,
    0,
  )
}

// L'adaptateur, source seule. La cible porte sur ce qu'un lecteur doit
// comprendre pour écrire le sien, donc les lignes écrites, pas le bundle.
export function adapterLines(dossier = join(RACINE, 'packages/react/src')) {
  const fichiers = fichiersDe(dossier).filter((one) => one.endsWith('.ts') || one.endsWith('.tsx'))

  if (fichiers.length === 0) throw new Error(`aucune source d'adaptateur dans ${dossier}`)

  return fichiers.reduce((total, file) => total + lignesDe(readFileSync(file, 'utf8')), 0)
}

// Un fichier terminé par un saut de ligne n'a pas une ligne de plus : `split`
// en rend une vide à la fin, et la compter gonflait le chiffre de deux sur les
// deux fichiers de l'adaptateur.
function lignesDe(texte) {
  const lignes = texte.split('\n')

  return lignes.at(-1) === '' ? lignes.length - 1 : lignes.length
}

function fichiersDe(dossier) {
  let entrées
  try {
    entrées = readdirSync(dossier, { withFileTypes: true, recursive: true })
  } catch {
    return []
  }

  return entrées.filter((one) => one.isFile()).map((one) => join(one.parentPath, one.name))
}

// Les octets d'un arbre, liens symboliques exclus. `du` compte des blocs de
// disque, donc son chiffre change avec le système de fichiers ; celui-ci non.
export function treeBytes(dossier, fichier = false) {
  if (fichier) return lstatSync(dossier).size

  let total = 0

  for (const entrée of readdirSync(dossier, { withFileTypes: true, recursive: true })) {
    const chemin = join(entrée.parentPath, entrée.name)
    const état = lstatSync(chemin)

    if (état.isFile()) total += état.size
  }

  return total
}

// Le bloc `catalog:` de `pnpm-workspace.yaml`, où vivent les versions que les
// paquets écrivent `catalog:`. Lu plutôt qu'empaqueté avec `pnpm pack` : le
// binaire pnpm n'est pas garanti sur un runner, et `npm pack` refuse de tourner
// dans ce dépôt, dont `devEngines` exige pnpm.
export function catalogOf(yaml) {
  const lignes = yaml.split('\n')
  const début = lignes.findIndex((one) => one === 'catalog:')

  if (début === -1) throw new Error('aucun bloc `catalog:` dans pnpm-workspace.yaml')

  const trouvé = {}

  for (const ligne of lignes.slice(début + 1)) {
    // La première ligne non indentée ferme le bloc. Une ligne vide ne le ferme
    // pas : le fichier en porte entre ses sections.
    if (ligne.trim() === '') continue
    if (!/^\s/.test(ligne)) break

    const paire = /^\s+'?([^':]+)'?:\s*(\S+)\s*$/.exec(ligne)
    if (paire) trouvé[paire[1]] = paire[2]
  }

  if (Object.keys(trouvé).length === 0) throw new Error('bloc `catalog:` vide, rien à résoudre')

  return trouvé
}

// Ce que les paquets publiés déclarent devoir installer, `catalog:` résolu.
// `workspace:*` est écarté : ce sont nos propres paquets, comptés par leur
// `dist` plutôt que par le registre, qui ne les connaît pas encore.
export function externalDeps(paquets, catalogue) {
  const trouvé = {}

  for (const paquet of paquets) {
    const lu = JSON.parse(readFileSync(join(RACINE, 'packages', paquet, 'package.json'), 'utf8'))

    for (const [nom, portée] of Object.entries(lu.dependencies ?? {})) {
      if (portée.startsWith('workspace:')) continue

      if (portée === 'catalog:') {
        const version = catalogue[nom]
        if (!version) throw new Error(`\`${nom}\` dit \`catalog:\` et le catalogue ne le porte pas`)
        trouvé[nom] = version
        continue
      }

      trouvé[nom] = portée
    }
  }

  if (Object.keys(trouvé).length === 0) throw new Error('aucune dépendance externe lue')

  return trouvé
}

// Nos propres paquets, tels qu'ils partent : `dist` et le manifeste, ce que
// `files` déclare publier.
export function ownBytes(paquets = ['cli', 'react', 'core']) {
  return paquets.reduce((total, paquet) => {
    const dossier = join(RACINE, 'packages', paquet)

    return total + treeBytes(join(dossier, 'dist')) + treeBytes(join(dossier, 'package.json'), true)
  }, 0)
}

// Ce qu'un utilisateur télécharge en installant les deux paquets : les nôtres,
// et la fermeture transitive de ce qu'ils déclarent.
//
// Les pairs sont exclus, `--legacy-peer-deps` : `react` et `react-dom` sont
// fournis par le projet hôte, et les compter reviendrait à facturer deux fois
// ce qui est déjà installé.
export async function installedBytes(travail, sien = travail === undefined) {
  travail ??= mkdtempSync(join(tmpdir(), 'crypte-poids-'))

  const catalogue = catalogOf(readFileSync(join(RACINE, 'pnpm-workspace.yaml'), 'utf8'))

  writeFileSync(
    join(travail, 'package.json'),
    JSON.stringify({
      name: 'budget',
      version: '0.0.0',
      private: true,
      dependencies: externalDeps(['cli', 'react'], catalogue),
    }),
  )

  execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--legacy-peer-deps'], {
    cwd: travail,
    stdio: 'pipe',
  })

  const dépendances = treeBytes(join(travail, 'node_modules'))

  if (dépendances === 0) throw new Error(`rien d'installé dans ${travail}`)

  // Seulement le dossier que cette fonction a créé, et seulement une fois la
  // mesure prise : un échec garde ses pièces, et un dossier confié par
  // l'appelant lui appartient. Trente mégaoctets par lancement, sinon.
  if (sien) rmSync(travail, { recursive: true, force: true })

  return dépendances + ownBytes()
}

// De `crypte dev` à la première story rendue **dans un navigateur**, et non au
// serveur à l'écoute. Vite compile à la demande : le serveur écoute en 240 ms
// sur un projet dont rien n'a été compilé, ce qui est un chronomètre sur un
// traitement qui n'a rien traité. L'écart mesuré entre les deux est de 2,5×.
//
// Trois lancements, la médiane. Un seul chiffre sur une machine partagée est
// une loterie, et une moyenne se laisse tirer par un unique lancement lent.
const LIMITE = 60_000

// Les codes de couleur, construits plutôt qu'écrits : un caractère de contrôle
// dans un littéral fait rougir `no-control-regex`, et le dépôt n'en veut pas un
// de plus.
//
// Sans ce nettoyage, la sortie de Vite sur un runner écrit `localhost:` puis un
// code de mise en gras avant le port, donc `\d` ne trouve rien et l'adresse
// n'est jamais reconnue. Mesuré : le job attendait soixante secondes une ligne
// arrivée en 392 ms. En local il n'y a pas de couleur, et rien ne se voyait.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export function sansCouleur(texte) {
  return texte.replace(ANSI, '')
}

export const ADRESSE = /(http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+)/

export async function startMs(projet = join(RACINE, 'apps/demo'), lancements = 3) {
  const { chromium } = await import('playwright')
  const { spawn } = await import('node:child_process')
  const binaire = join(RACINE, 'packages/cli/dist/index.mjs')

  const navigateur = await chromium.launch()
  const pris = []

  try {
    for (let i = 0; i < lancements; i += 1) {
      // À froid : le cache d'optimisation de Vite est ce que le premier
      // démarrage d'un utilisateur ne trouve pas.
      rmSync(join(projet, 'node_modules/.crypte'), { recursive: true, force: true })

      const page = await navigateur.newPage()
      // Ce que le serveur et la page ont dit. Sans ces trois collectes, un
      // rendu qui n'arrive pas ne laisse qu'un délai dépassé, et la cause est
      // à chercher sur une machine qu'on n'a pas.
      const dits = []
      const début = performance.now()
      // Écrit au fil de l'eau sur l'erreur standard, en plus d'être gardé : un
      // message rendu seulement à la fin ne dit rien d'un serveur qui se tait,
      // et c'est précisément ce qu'un runner a fait pendant soixante secondes.
      // La sortie standard reste le tableau, elle seule part au résumé du run.
      const dire = (quoi) => {
        const ligne = `[${Math.round(performance.now() - début)} ms] ${quoi}`
        dits.push(ligne)
        process.stderr.write(`${ligne}\n`)
      }

      page.on('console', (m) => {
        if (m.type() === 'error') dire(`console: ${m.text()}`)
      })
      page.on('pageerror', (e) => dire(`page: ${e.message}`))

      dire(`lancement ${i + 1}/${lancements} : ${process.execPath} ${binaire} dev ${projet}`)
      if (!existsSync(binaire))
        throw new Error(`${binaire} n'existe pas : lancer \`vp run -r pack\``)

      const enfant = spawn(process.execPath, [binaire, 'dev', projet], { stdio: 'pipe' })

      enfant.stdout.on('data', (d) => dire(`dev: ${sansCouleur(String(d)).trim()}`))
      enfant.stderr.on('data', (d) => dire(`dev!: ${sansCouleur(String(d)).trim()}`))
      enfant.on('error', (e) => dire(`dev, échec de lancement : ${e.message}`))
      // Un battement pendant l'attente : un journal muet ne distingue pas un
      // processus qui travaille d'un processus bloqué.
      const battement = setInterval(() => dire(`toujours en attente, pid ${enfant.pid}`), 10_000)

      try {
        // Bornée elle aussi : un serveur qui n'annonce jamais son adresse, et
        // qui ne sort pas non plus, laissait cette attente tourner jusqu'à
        // l'expiration du job.
        const origine = await new Promise((ok, non) => {
          const minuteur = setTimeout(
            () =>
              non(new Error(`aucune adresse annoncée en ${LIMITE / 1000} s :\n${dits.join('\n')}`)),
            LIMITE,
          )
          const rendre = (valeur) => {
            clearTimeout(minuteur)
            ok(valeur)
          }

          enfant.stdout.on('data', (d) => {
            const trouvé = ADRESSE.exec(sansCouleur(String(d)))
            if (trouvé) rendre(trouvé[1])
          })
          enfant.on('exit', (code) => {
            clearTimeout(minuteur)
            non(new Error(`crypte dev est sorti en ${code} :\n${dits.join('\n')}`))
          })
        })

        await page.goto(origine)
        const rendu = page.frameLocator('iframe[title="preview"]').locator('#root')
        await rendu.waitFor({ state: 'attached', timeout: LIMITE }).catch((cause) => {
          throw new Error(`aucun cadre de preview :\n${dits.join('\n')}`, { cause })
        })
        // Le texte, pas seulement le nœud : le cadre existe avant que React y
        // ait rendu quoi que ce soit, et s'arrêter là mesurerait le montage de
        // l'iframe.
        //
        // Bornée. Une story qui ne rend rien laisserait sinon cette boucle
        // tourner jusqu'à l'expiration du job, quinze minutes sans un mot, là
        // où lever dit ce qui s'est passé en une ligne.
        const limite = performance.now() + LIMITE
        for (;;) {
          if (await rendu.textContent()) break
          if (performance.now() > limite) {
            throw new Error(`aucune story rendue en ${LIMITE / 1000} s :\n${dits.join('\n')}`)
          }
          await new Promise((r) => setTimeout(r, 10))
        }

        pris.push(performance.now() - début)
      } finally {
        clearInterval(battement)
        enfant.kill('SIGTERM')
        await page.close()
      }
    }
  } finally {
    await navigateur.close()
  }

  return médiane(pris)
}

export function médiane(valeurs) {
  const triées = [...valeurs].sort((a, b) => a - b)

  return Math.round(triées[(triées.length - 1) >> 1])
}

// Un budget est tenu à égalité : la cible se lit « moins de 1,5 s », et une
// mesure pile à la cible ne l'a pas dépassée.
export function verdicts(mesures, budgets = BUDGETS) {
  return Object.entries(budgets).map(([clé, budget]) => ({
    clé,
    mesure: mesures[clé],
    budget,
    tenu: mesures[clé] !== undefined && mesures[clé] <= budget,
  }))
}

export const MARKER = '<!-- crypte-budgets -->'

export function table(rendus) {
  const lignes = rendus.map((one) => {
    const { format } = MESURES[one.clé]
    const marge =
      one.mesure === undefined ? '' : `${Math.round((1 - one.mesure / one.budget) * 100)} %`

    return `| ${MESURES[one.clé].titre} | ${one.mesure === undefined ? '—' : format(one.mesure)} | ${format(one.budget)} | ${marge} | ${one.tenu ? '✅' : '❌'} |`
  })

  return [
    MARKER,
    '## Budgets',
    '',
    '| Budget | Mesuré | Cible | Marge | |',
    '| -- | --: | --: | --: | -- |',
    ...lignes,
    '',
    '- <sub>**Démarrage à froid** : de `crypte dev` à la première story rendue dans un navigateur, cache d’optimisation vidé, médiane de trois lancements.</sub>',
    '- <sub>**Poids installé** : les deux paquets et leur fermeture transitive, dépendances de développement et pairs exclus. Voir la note du seuil dans `docs/internal/architecture.md`.</sub>',
    '- <sub>**Configuration obligatoire**, le cinquième budget, est un type et non un chiffre : `packages/cli/test/config.test-d.ts` tient que `CrypteConfig` en exige exactement deux, `stories` et `adapter`.</sub>',
  ].join('\n')
}

export async function main() {
  const mesures = {
    shellGzipBytes: shellGzipBytes(),
    adapterLines: adapterLines(),
    installedBytes: await installedBytes(),
    startMs: await startMs(),
  }

  // Une mesure prise et non budgétée serait perdue en silence : `verdicts`
  // parcourt les budgets, pas les mesures.
  const orphelines = Object.keys(mesures).filter((one) => !(one in BUDGETS))

  if (orphelines.length > 0) {
    throw new Error(`mesuré sans budget : ${orphelines.join(', ')}`)
  }

  const rendus = verdicts(mesures)

  console.log(table(rendus))

  // Le tableau part au résumé du run, donc il ne paraît pas dans le journal du
  // job. Un récapitulatif d'une ligne par mesure y reste, sans quoi il faut
  // ouvrir le résumé pour savoir ce qui a été mesuré, et un lancement passé
  // ne laisse aucune trace chiffrée à comparer au suivant.
  for (const un of rendus) {
    const { titre, format } = MESURES[un.clé]
    process.stderr.write(
      `${titre} : ${un.mesure === undefined ? 'non mesuré' : format(un.mesure)} (cible ${format(un.budget)}, ${un.mesure} bruts)\n`,
    )
  }

  const dépassés = rendus.filter((one) => !one.tenu)

  if (dépassés.length === 0) return 0

  for (const one of dépassés) {
    console.error(
      `::error::${MESURES[one.clé].titre} : ${MESURES[one.clé].format(one.mesure)} pour une cible de ${MESURES[one.clé].format(one.budget)}.`,
    )
  }

  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main())
