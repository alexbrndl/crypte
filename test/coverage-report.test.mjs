import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, test as base } from 'vitest'
import {
  MARKER,
  METRICS,
  badge,
  bar,
  byFolder,
  byTotal,
  compose,
  drifted,
  existing,
  failing,
  folderOf,
  options,
  publish,
  rowTotal,
} from './coverage-report.mjs'

// Ce que le commentaire de pull request dit, et ce qu'il remplace. Le script
// écrit sur une pull request : sans ces cas, sa seule épreuve serait une pousse.
// Voir docs/internal/architecture.md.

// Les seuils réels du dépôt, lus et jamais recopiés. Les cas qui traversent le
// badge ou le script les franchissent pour de vrai : un chiffre écrit à la main
// ici rend rouges, le jour où un lot monte un plancher, des cas que personne n'a
// touchés. Mesuré, trois d'un coup.
const SEUILS_DU_DÉPÔT = JSON.parse(
  readFileSync(join(process.cwd(), 'test', 'coverage-thresholds.json'), 'utf8'),
)

// Chaque mesure un point au-dessus de son propre seuil : au-dessus de la porte,
// sous le cliquet, quels que soient les seuils du jour. Borné à cent, qu'un
// seuil de cent ferait sinon dépasser sur un résumé impossible.
const JUSTE_AU_DESSUS = Object.fromEntries(
  Object.entries(SEUILS_DU_DÉPÔT).map(([nom, seuil]) => [nom, Math.min(100, seuil + 1)]),
)

const metrique = (pct, covered = 1, total = 1) => ({ pct, covered, total, skipped: 0 })

const fichier = (pct) => ({
  lines: metrique(pct, 99, 100),
  branches: metrique(pct, 99, 100),
  functions: metrique(pct, 99, 100),
  statements: metrique(pct, 99, 100),
})

// `par` surcharge une métrique. Les branches en ont besoin dès qu'un cas passe
// par `main()` : leur seuil est le plus bas des quatre, donc un résumé uniforme
// les met loin au-dessus et le cliquet réclame de monter le seuil, ce qui est
// juste sur un vrai dépôt et faux sur une fixture.
const resume = (pct = 99, par = {}) => {
  const de = (nom) => par[nom] ?? pct

  return {
    '/dépôt/packages/cli/src/dev.ts': fichier(pct),
    '/dépôt/packages/core/src/protocol/id.ts': fichier(pct),
    '/dépôt/apps/shell/src/recover.ts': fichier(pct),
    total: {
      statements: metrique(de('statements'), 726, 746),
      branches: metrique(de('branches'), 455, 512),
      functions: metrique(de('functions'), 149, 150),
      lines: metrique(de('lines'), 615, 623),
    },
  }
}

// Un résumé qui tient les quatre seuils, quels qu'ils soient. `resume(99)` les
// tenait par coïncidence, et rougissait dès qu'un plancher passait au-dessus.
const tenu = () => resume(JUSTE_AU_DESSUS.lines, JUSTE_AU_DESSUS)

describe('la barre de progression', () => {
  it('est vide à zéro et pleine à cent', () => {
    expect(bar(0)).toBe('░░░░░░░░░░')
    expect(bar(100)).toBe('██████████')
  })

  // Une barre pleine à 97 % ferait croire qu'il ne reste rien à couvrir.
  it('n’est jamais pleine en dessous de cent', () => {
    expect(bar(97.31)).toBe('█████████░')
    expect(bar(99.99)).toBe('█████████░')
  })
})

describe('le corps du commentaire', () => {
  // Le marqueur est ce qui permet de retrouver le commentaire pour le remplacer.
  it('commence par le marqueur, seul sur sa première ligne', () => {
    expect(compose(resume(), undefined, undefined).split('\n')[0]).toBe(MARKER)
  })

  it('compte les tests quand le rapport est là', () => {
    const body = compose(resume(), {
      numTotalTests: 404,
      numFailedTests: 0,
      testResults: Array(31),
    })

    expect(body).toContain('**404 tests passent**, dans 31 fichiers.')
  })

  it('dit les échecs plutôt que le total', () => {
    const body = compose(resume(), {
      numTotalTests: 404,
      numFailedTests: 2,
      testResults: Array(31),
    })

    expect(body).toContain('**2 tests échouent** sur 404')
  })

  it('accorde le verbe sur un seul échec', () => {
    const body = compose(resume(), {
      numTotalTests: 404,
      numFailedTests: 1,
      testResults: Array(31),
    })

    expect(body).toContain('**1 test échoue** sur 404')
  })

  // Un commentaire qui dit « 2 échouent » envoie lire les journaux, ce que ce
  // commentaire existe pour éviter.
  it('nomme les cas qui rougissent, trois au plus', () => {
    const rouge = (fullName) => ({ status: 'failed', fullName })
    const body = compose(resume(), {
      numTotalTests: 404,
      numFailedTests: 4,
      testResults: [
        { assertionResults: [rouge('un'), rouge('deux'), { status: 'passed', fullName: 'vert' }] },
        { assertionResults: [rouge('trois'), rouge('quatre')] },
      ],
    })

    expect(body).toContain('- `un`')
    expect(body).toContain('- `trois`')
    expect(body).not.toContain('- `quatre`')
    // La puce, pas le mot : « vert » est une sous-chaîne de « couvert », dans
    // l'en-tête du tableau. Le cas a rougi pour ça.
    expect(body).not.toContain('- `vert`')
  })

  // Lever laissait le commentaire d'avant en place : un lancement rouge
  // affichait alors les chiffres verts du précédent, ce qui est pire que pas de
  // commentaire. Mesuré sur la PR #34.
  it('dit la couverture non mesurée plutôt que de lever', () => {
    const body = compose(undefined, { numTotalTests: 422, numFailedTests: 1, testResults: [{}] })

    expect(body.split('\n')[0]).toBe(MARKER)
    expect(body).toContain('Couverture non mesurée')
    expect(body).toContain('**1 test échoue** sur 422')
  })

  // Sans rapport, ne rien prétendre : annoncer zéro test se lirait comme une
  // suite vide, et une suite vide passe toujours.
  it('ne prétend rien quand le rapport des tests manque', () => {
    expect(compose(resume(), undefined)).toContain('Résultat des tests indisponible.')
  })

  it('marque d’une croix la métrique sous son seuil', () => {
    const body = compose(resume(50))

    expect(body).toContain('❌')
    expect(body).not.toContain('✅')
  })

  it('marque d’une coche la métrique au-dessus de son seuil', () => {
    expect(compose(tenu())).not.toContain('❌')
  })

  it('abrège la révision mesurée', () => {
    expect(compose(resume(), undefined, 'abcdef1234567')).toContain('`abcdef1`')
  })

  // Un résumé présent mais sans total est traité comme une absence : ce qui
  // compte est de ne jamais afficher un tableau vide, qui se lirait comme une
  // couverture nulle.
  it('traite un résumé sans total comme une absence de mesure', () => {
    expect(compose({}, undefined)).toContain('Couverture non mesurée')
  })
})

describe('la publication', () => {
  // La doublure rend ce que rendrait `gh`, et retient les corps écrits pour que
  // la relecture de vérification les retrouve.
  const faux = (comments) => {
    const calls = []
    let etat = [...comments]

    return {
      calls,
      get etat() {
        return etat
      },
      run: (args) => {
        calls.push(args.join(' '))
        if (args[0] === 'repo') return 'alexbrndl/crypte'

        const corps = args.find((one) => one.startsWith('body='))?.slice('body='.length)

        if (args.includes('DELETE')) {
          const id = Number(args[1].split('/').at(-1))
          etat = etat.filter((one) => one.id !== id)
        }

        if (args.includes('POST')) etat = [...etat, { id: 99, body: corps }]

        return JSON.stringify(etat)
      },
    }
  }

  it('poste quand aucun commentaire ne porte le marqueur', () => {
    const gh = faux([{ id: 1, body: 'un commentaire humain' }])

    expect(publish(`${MARKER}\ncorps`, '34', gh.run)).toBe('posté')
    expect(gh.calls.some((one) => one.includes('issues/34/comments --method POST'))).toBe(true)
    expect(gh.calls.some((one) => one.includes('DELETE'))).toBe(false)
  })

  // Remplacé sur place, le tableau restait à sa position d'origine dans la
  // conversation, donc loin du dernier commit. On le veut en bas.
  it('retire l’ancien tableau avant de poster le nouveau', () => {
    const gh = faux([{ id: 7, body: `${MARKER}\nun vieux tableau` }])

    expect(publish(`${MARKER}\ncorps`, '34', gh.run)).toBe('remplacé')
    expect(gh.calls.some((one) => one.includes('issues/comments/7 --method DELETE'))).toBe(true)
    expect(gh.etat.filter((one) => one.body.startsWith(MARKER))).toHaveLength(1)
  })

  // Deux anciens arrivent si une publication a échoué entre le POST et la
  // vérification : les deux partent, pas seulement le premier.
  it('retire tous les anciens tableaux', () => {
    const gh = faux([
      { id: 7, body: `${MARKER}\nun` },
      { id: 8, body: `${MARKER}\ndeux` },
      { id: 9, body: 'humain' },
    ])

    publish(`${MARKER}\ncorps`, '34', gh.run)

    expect(gh.etat.filter((one) => one.body.startsWith(MARKER))).toHaveLength(1)
    expect(gh.etat.some((one) => one.body === 'humain')).toBe(true)
  })

  // `gh pr view --json comments` rend un identifiant GraphQL, que l'API REST
  // refuse en 404. Trois lancements ont servi un tableau périmé pour ça.
  it('lit la liste par l’API REST, jamais par pr view', () => {
    const gh = faux([])

    publish(`${MARKER}\ncorps`, '34', gh.run)

    expect(gh.calls.some((one) => one.startsWith('api --paginate repos/'))).toBe(true)
    expect(gh.calls.some((one) => one.startsWith('pr view'))).toBe(false)
  })

  it('lève quand le commentaire n’est pas arrivé', () => {
    const muet = { run: (args) => (args[0] === 'repo' ? 'alexbrndl/crypte' : '[]') }

    expect(() => publish(`${MARKER}\ncorps`, '34', muet.run)).toThrow('attendu 1')
  })

  it('trouve l’identifiant par le marqueur, et rien d’autre', () => {
    expect(existing([{ id: 3, body: `${MARKER} x` }])).toBe(3)
    expect(existing([{ id: 3, body: 'sans marqueur' }])).toBeUndefined()
    expect(existing([{ id: 3 }])).toBeUndefined()
  })
})

describe('le tableau par dossier', () => {
  it('nomme le paquet ou l’application, pas le chemin entier', () => {
    expect(folderOf('/dépôt/packages/cli/src/dev.ts')).toBe('packages/cli')
    expect(folderOf('/dépôt/apps/shell/src/recover.ts')).toBe('apps/shell')
    expect(folderOf('/dépôt/test/sweep-tmp.mjs')).toBeUndefined()
  })

  // « instructions 97 % » ne dit pas où chercher ; « packages/cli 88 % de
  // branches » le dit.
  it('additionne les fichiers d’un même dossier', () => {
    const folders = byFolder(resume())

    expect([...folders.keys()].sort()).toEqual(['apps/shell', 'packages/cli', 'packages/core'])
    expect(folders.get('packages/cli').lines).toEqual([99, 100])
  })

  it('cite chaque dossier dans le corps', () => {
    const body = compose(resume(), undefined)

    expect(body).toContain('`packages/cli`')
    expect(body).toContain('`apps/shell`')
    expect(body).toContain('| **total** |')
  })

  it('ignore le total dans le regroupement', () => {
    expect(byFolder({ total: fichier(99) }).size).toBe(0)
  })
})

describe('le verdict des seuils', () => {
  it('ne nomme rien quand tout tient', () => {
    expect(failing(tenu())).toEqual([])
    expect(compose(tenu(), undefined)).toContain('✅ Seuils tenus')
  })

  it('nomme la métrique et son seuil', () => {
    const manques = failing(resume(50))

    expect(manques).toHaveLength(4)
    expect(manques[0]).toContain('sous le seuil de')
    expect(compose(resume(50), undefined)).toContain('❌')
  })

  it('dit la couverture non mesurée quand le résumé manque', () => {
    expect(failing(undefined)).toEqual(['couverture non mesurée'])
  })
})

describe('les arguments', () => {
  it('lit les chemins par défaut', () => {
    // Les cinq clés, `badge` comprise : `toEqual` ignore une clé absente valant
    // `undefined`, donc l'omettre laissait passer son retrait.
    expect(options([])).toEqual({
      pr: undefined,
      resume: 'coverage/coverage-summary.json',
      tests: 'vitest-report.json',
      sha: undefined,
      badge: undefined,
    })
    expect(options(['--badge', 'x.json']).badge).toBe('x.json')
  })

  // Sans `--pr`, le corps part sur la sortie standard et rien n'est publié :
  // c'est le régime du résumé de job.
  it('ne publie que sur --pr', () => {
    expect(options(['--pr', '34']).pr).toBe('34')
    expect(options(['--sha', 'abc']).pr).toBeUndefined()
  })
})

describe('le badge du README', () => {
  // Arrondi vers le bas : une fraction au-dessus du seuil affichée au point
  // suivant flatterait.
  it('rend le format que shields.io lit, arrondi vers le bas', () => {
    expect(badge(resume(SEUILS_DU_DÉPÔT.lines + 0.55))).toEqual({
      schemaVersion: 1,
      label: 'coverage',
      message: `${SEUILS_DU_DÉPÔT.lines}%`,
      color: 'brightgreen',
    })
  })

  // Un badge vert sous le seuil mentirait sur une porte rouge.
  it('n’est vert vif qu’au-dessus du seuil de lignes', () => {
    const seuil = SEUILS_DU_DÉPÔT.lines

    expect(badge(resume(seuil)).color).toBe('brightgreen')
    expect(badge(resume(seuil - 0.1)).color).toBe('yellow')
    expect(badge(resume(seuil - 11)).color).toBe('red')
  })

  it('lève sur un résumé sans pourcentage de lignes', () => {
    expect(() => badge({ total: {} })).toThrow('résumé de couverture illisible')
  })
})

describe('la légende', () => {
  // « branches 88 % » ne veut rien dire pour qui lit la pull request sans
  // connaître l'outil.
  it('explique les quatre métriques sous le tableau', () => {
    const body = compose(resume(), undefined)

    for (const mot of ['**lignes**', '**branches**', '**fonctions**', '**instructions**']) {
      expect(body).toContain(mot)
    }
  })

  // Rien à expliquer quand il n'y a pas de tableau.
  it('ne paraît pas quand la couverture manque', () => {
    expect(compose(undefined, undefined)).not.toContain('**branches**')
  })
})

describe('les seuils', () => {
  // Évalués une seule fois, et ici : la configuration de vitest ne les porte
  // plus, sinon ils rougissaient deux fois pour la même raison et le contrôle
  // visible n'attrapait rien de plus.
  it('sont ceux du fichier partagé, et vitest ne les évalue pas', () => {
    const partagés = JSON.parse(readFileSync('test/coverage-thresholds.json', 'utf8'))
    const config = readFileSync('vite.config.ts', 'utf8')

    expect(compose(tenu(), undefined)).toContain(`lignes ${partagés.lines} %`)
    // La clé, pas le mot : le nom du fichier partagé le contient, et le
    // commentaire qui explique où sont passés les seuils aussi.
    expect(config).not.toMatch(/thresholds\s*[:,]/)
  })
})

describe('le total par ligne', () => {
  // Le tableau totalisait par colonne et pas par dossier, donc rien ne disait
  // lequel est le plus faible dans l'ensemble.
  it('additionne les quatre métriques du dossier', () => {
    const held = {
      lines: [9, 10],
      statements: [9, 10],
      branches: [1, 10],
      functions: [10, 10],
    }

    expect(rowTotal(held)).toEqual([29, 40])
  })

  it('met le total du résumé à la même forme', () => {
    const pairs = byTotal(resume(99).total)

    expect(pairs.lines).toEqual([615, 623])
    expect(Object.keys(pairs)).toEqual(METRICS)
  })

  it('paraît dans le corps, par dossier et en bas', () => {
    const body = compose(resume(), undefined)
    const lignes = body.split('\n').filter((une) => une.startsWith('|'))

    expect(lignes[0]).toContain('| total | lignes | instructions | branches | fonctions |')
    expect(lignes.at(-1)).toContain('| **total** |')
  })

  // Zéro sur zéro n'est pas une lacune : un dossier sans branche ne doit pas
  // tomber à 0 %.
  it('rend cent quand il n’y a rien à couvrir', () => {
    const body = compose(
      {
        '/dépôt/packages/vide/src/types.ts': {
          lines: metrique(100, 0, 0),
          statements: metrique(100, 0, 0),
          branches: metrique(100, 0, 0),
          functions: metrique(100, 0, 0),
        },
        total: resume(99).total,
      },
      undefined,
    )

    expect(body).toContain('| `packages/vide` | `██████████` | **100.0 %** |')
  })
})

describe('ce que le tableau ne mesure pas', () => {
  // Une colonne à 100 % qui tait une exclusion est un mensonge par omission.
  it('nomme ce qui est hors mesure', () => {
    const body = compose(resume(), undefined)

    expect(body).toContain('Hors mesure')
    expect(body).toContain('câblage')
  })

  it('ne dit rien quand il n’y a pas de tableau', () => {
    expect(compose(undefined, undefined)).not.toContain('Hors mesure')
  })
})

describe('ce que l’exploration a trouvé', () => {
  // Un `total` amputé d'une métrique faisait lever le rendu, donc laissait le
  // commentaire d'avant en place, donc affichait des chiffres périmés.
  it('traite un résumé incomplet comme une absence de mesure', () => {
    const partiel = { total: { lines: metrique(99), statements: metrique(99) } }

    expect(compose(partiel, undefined)).toContain('Couverture non mesurée')
    expect(compose(partiel, undefined)).not.toContain('| **total** |')
  })

  // Une suite vide passe toujours : « 0 tests passent » se lirait comme un
  // succès, alors que c'est le signe qu'aucun cas n'a été collecté.
  it('ne présente pas zéro test comme un succès', () => {
    const body = compose(resume(), { numTotalTests: 0, numFailedTests: 0, testResults: [] })

    expect(body).toContain('Aucun test rapporté')
    expect(body).not.toContain('0 tests passent')
  })

  it('garde le tableau quand seul le rapport des tests est vide', () => {
    const body = compose(resume(), { numTotalTests: 0, numFailedTests: 0, testResults: [] })

    expect(body).toContain('| **total** |')
  })
})

// Le câblage du script entier, lancé en sous-processus. Le job `badge` ne tourne
// que sur `main`, donc rien d'autre ne l'éprouve : c'est exactement la panne que
// ce lot a corrigée sur `--resume`, trouvée par une simulation à la main faute
// d'un cas. Voir docs/internal/architecture.md.
describe('le script, lancé pour de vrai', () => {
  const SCRIPT = join(process.cwd(), 'test', 'coverage-report.mjs')

  // Le dossier jetable est démonté par la fixture, même quand le cas lève : le
  // nettoyage écrit après les assertions laissait un `crypte-couverture-*` dans
  // le dossier temporaire du système à chaque échec, que le ramassage du dépôt ne
  // connaît pas.
  const test = base.extend({
    // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
    // initialiser. Le renommer fait collecter zéro test : mesuré.
    dossier: async ({}, use) => {
      const racine = mkdtempSync(join(tmpdir(), 'crypte-couverture-'))

      await use({
        racine,
        // Le résumé là où le script le cherche par défaut, ou à un chemin donné.
        écrit: (pct, chemin = join('coverage', 'coverage-summary.json'), par = {}) => {
          const cible = join(racine, chemin)
          mkdirSync(dirname(cible), { recursive: true })
          writeFileSync(cible, JSON.stringify(resume(pct, par)))

          return cible
        },
        lance: (args) => {
          try {
            return {
              code: 0,
              err: '',
              out: execFileSync('node', [SCRIPT, ...args], {
                encoding: 'utf8',
                stdio: 'pipe',
                cwd: racine,
              }),
            }
          } catch (error) {
            // `err` en plus de `out` : les verdicts partent sur l'erreur standard,
            // donc un cas qui ne lisait que `out` ne pouvait rien en dire.
            return { code: error.status, out: error.stdout ?? '', err: error.stderr ?? '' }
          }
        },
      })

      rmSync(racine, { recursive: true, force: true })
    },
  })

  // Le cas du job `badge` : aucun `--resume`, donc le chemin par défaut, celui
  // dont la mauvaise résolution aurait rendu ce job rouge à chaque fusion.
  test('trouve le résumé au chemin par défaut, comme le job badge', ({ dossier }) => {
    dossier.écrit(JUSTE_AU_DESSUS.lines, join('coverage', 'coverage-summary.json'), JUSTE_AU_DESSUS)
    const cible = join(dossier.racine, 'badge.json')

    const { code } = dossier.lance(['--badge', cible])

    expect(code).toBe(0)
    expect(JSON.parse(readFileSync(cible, 'utf8')).message).toBe(`${JUSTE_AU_DESSUS.lines}%`)
  })

  // Le branchement, et pas seulement la fonction : retirer le bloc du cliquet de
  // `main()` laissait les autres cas verts, parce qu'ils appellent `drifted`
  // directement et que les deux cas de badge reçoivent justement des mesures
  // posées un point au-dessus des seuils pour ne **pas** le déclencher.
  test('le cliquet fait sortir le script en un, avec le fichier à coller', ({ dossier }) => {
    // Au-delà du cliquet, et non borné à cent : la valeur n'est comparée qu'à
    // elle-même, et un seuil de branches à cent ne laisserait aucune place.
    const dérive = SEUILS_DU_DÉPÔT.branches + 4

    dossier.écrit(JUSTE_AU_DESSUS.lines, join('coverage', 'coverage-summary.json'), {
      ...JUSTE_AU_DESSUS,
      branches: dérive,
    })

    const { code, err } = dossier.lance([])

    expect(code).toBe(1)
    expect(err).toContain('seuil à monter dans test/coverage-thresholds.json')
    expect(err).toContain('à écrire :')
    expect(err).toContain(`"branches": ${dérive}`)
  })

  test('écrit le badge que shields.io lit, et sort en zéro', ({ dossier }) => {
    const résumé = dossier.écrit(JUSTE_AU_DESSUS.lines, 'résumé.json', JUSTE_AU_DESSUS)
    const cible = join(dossier.racine, 'badge.json')

    const { code } = dossier.lance(['--resume', résumé, '--badge', cible])

    expect(code).toBe(0)
    expect(JSON.parse(readFileSync(cible, 'utf8'))).toEqual({
      schemaVersion: 1,
      label: 'coverage',
      message: `${JUSTE_AU_DESSUS.lines}%`,
      color: 'brightgreen',
    })
  })

  // Pas de couverture, pas de badge : un badge écrit sans chiffre annoncerait
  // une mesure qui n'a pas eu lieu.
  test('n’écrit aucun badge et sort en un quand le résumé manque', ({ dossier }) => {
    const cible = join(dossier.racine, 'badge.json')

    const { code } = dossier.lance([
      '--resume',
      join(dossier.racine, 'absent.json'),
      '--badge',
      cible,
    ])

    expect(code).toBe(1)
    // L'erreur nommée, pas n'importe laquelle : `toThrow()` nu passerait aussi
    // sur un badge écrit mais illisible.
    expect(() => readFileSync(cible, 'utf8')).toThrow(/ENOENT/)
  })

  // Le verdict vient en dernier : le badge est écrit, puis le code de sortie dit
  // que le seuil n'est pas tenu.
  test('sort en un sous le seuil, en ayant écrit le badge', ({ dossier }) => {
    const résumé = dossier.écrit(50, 'résumé.json')
    const cible = join(dossier.racine, 'badge.json')

    const { code } = dossier.lance(['--resume', résumé, '--badge', cible])

    expect(code).toBe(1)
    expect(JSON.parse(readFileSync(cible, 'utf8')).color).toBe('red')
  })
})

// Ce que le cas ci-dessus ne peut pas prouver : que le workflow appelle le script
// avec les bons arguments. La panne était là, pas dans le script. Le dépôt compare
// déjà un document au code de cette façon, dans `spec.test.ts`.
// Voir docs/internal/architecture.md.
describe('le workflow', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
  const appel = workflow
    .split('\n')
    .find((une) => une.includes('coverage-report.mjs') && une.includes('--badge'))

  it('vérifie le badge commité', () => {
    expect(appel, 'aucune ligne du workflow ne lance le script avec --badge').toBeTypeOf('string')
  })

  // `--resume coverage-summary.json` était vrai quand l'artefact ne portait qu'un
  // fichier, et faux depuis qu'il en porte deux : le badge n'était jamais écrit.
  it('laisse le chemin du résumé par défaut', () => {
    expect(appel).not.toContain('--resume')
  })

  // Un `needs` qui nomme un job absent rend le fichier invalide, et GitHub
  // échoue en zéro seconde sans rien dire de plus. Mesuré : en retirant un job,
  // mon découpage a emporté son voisin `dependency-review`, que `ci-passed`
  // attend.
  //
  // La lecture est séparée du contrôle pour être éprouvée sur des fichiers
  // fabriqués : la première version se trompait dans les deux sens, refusant les
  // chiffres d'un nom de job et ramassant le `push` de `on:` comme un job.
  const TÊTE = 'on:\n  push:\n    branches: [main]\n\njobs:\n  check:\n    runs-on: x\n  '

  it.for([
    [
      'un needs en ligne qui nomme un absent',
      TÊTE + 'ci-passed:\n    needs: [check, fantome]\n',
      ['fantome'],
    ],
    [
      'un needs en bloc qui nomme un absent',
      TÊTE + 'ci-passed:\n    needs:\n      - check\n      - fantome\n',
      ['fantome'],
    ],
    ['un needs simple qui nomme un absent', TÊTE + 'ci-passed:\n    needs: fantome\n', ['fantome']],
    [
      'un nom de job avec un chiffre',
      TÊTE + 'check-node-22:\n    runs-on: x\n  autre:\n    needs: check-node-22\n',
      [],
    ],
    [
      'un nom de job avec un underscore',
      TÊTE + 'ts7_probe:\n    runs-on: x\n  autre:\n    needs: ts7_probe\n',
      [],
    ],
    [
      'le déclencheur `push`, qui n’est pas un job',
      TÊTE + 'ci-passed:\n    needs: push\n',
      ['push'],
    ],
  ])('trouve %s', ([, faux, attendu]) => {
    expect(manquants(faux)).toEqual(attendu)
  })

  it('ne trouve rien à reprocher au workflow du dépôt', () => {
    expect(manquants(workflow)).toEqual([])
  })
})

// Les jobs d'un workflow et les `needs` qu'ils nomment, sans dépendance : les
// noms se lisent dans le bloc `jobs:` seulement, pour que le `push` de `on:` n'en
// soit pas un, et `needs` se lit sous ses trois formes, en ligne, en liste et en
// séquence de bloc, la dernière étant la plus courante.
function manquants(workflow) {
  const bloc = workflow.slice(workflow.indexOf('\njobs:\n'))
  const jobs = [...bloc.matchAll(/^ {2}([\w-]+):$/gm)].map((une) => une[1])
  const attendus = []

  const lignes = bloc.split('\n')
  for (const [index, ligne] of lignes.entries()) {
    const trouvé = /^ {4}needs:(.*)$/.exec(ligne)
    if (!trouvé) continue

    const reste = (trouvé[1] ?? '').trim()

    if (reste !== '') {
      attendus.push(
        ...reste
          .replaceAll(/[[\]]/g, '')
          .split(',')
          .map((un) => un.trim())
          .filter(Boolean),
      )
      continue
    }

    // La séquence de bloc : les lignes qui suivent, tant qu'elles sont des
    // éléments de liste plus indentés.
    for (const suivante of lignes.slice(index + 1)) {
      const élément = /^ {6}- (.+)$/.exec(suivante)
      if (!élément) break
      attendus.push(élément[1].trim())
    }
  }

  return attendus.filter((un) => !jobs.includes(un))
}

describe('le cliquet des seuils', () => {
  // Un seuil laissé derrière la mesure est un seuil qu'on peut baisser sans que
  // rien ne rougisse, ce qui est la seule façon de rendre la mesure inutile. Le
  // cliquet attrape les deux fautes d'un coup : le plancher qu'on oublie de monter
  // et celui qu'on baisse pour faire passer un lot.
  const mesure = (pcts) => ({
    total: Object.fromEntries(Object.entries(pcts).map(([k, pct]) => [k, { pct }])),
  })

  const SEUILS = { statements: 96, branches: 88, functions: 96, lines: 97 }

  it('un seuil que la mesure dépasse de peu ne dit rien', () => {
    expect(
      drifted(
        mesure({ statements: 96.4, branches: 89.9, functions: 98.2, lines: 98.1 }),
        SEUILS,
        3,
      ),
    ).toEqual([])
  })

  it('un seuil que la mesure dépasse largement est à monter', () => {
    const dit = drifted(
      mesure({ statements: 96, branches: 88, functions: 99.5, lines: 97 }),
      SEUILS,
      3,
    )

    expect(dit).toHaveLength(1)
    expect(dit[0]).toContain('99.5')
    expect(dit[0]).toContain('3.50')
  })

  // La faute que le cliquet existe surtout pour attraper : baisser le plancher.
  // Baissé, l'écart grandit d'autant, donc le même verdict le voit.
  it('baisser un seuil le fait rougir', () => {
    const vraie = mesure({ statements: 96.4, branches: 89.9, functions: 98.2, lines: 98.1 })

    expect(drifted(vraie, SEUILS, 3)).toEqual([])
    expect(drifted(vraie, { ...SEUILS, branches: 70 }, 3)).toHaveLength(1)
    expect(drifted(vraie, { statements: 0, branches: 0, functions: 0, lines: 0 }, 3)).toHaveLength(
      4,
    )
  })

  // Sans couverture, on ne prétend rien : `failing` dit déjà « non mesurée », et
  // deux verdicts sur la même absence en enterreraient un.
  it('sans mesure, le cliquet se tait', () => {
    expect(drifted(undefined, SEUILS, 3)).toEqual([])
    expect(drifted({}, SEUILS, 3)).toEqual([])
  })
})
