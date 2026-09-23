import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, test as base } from 'vitest'
import { MARKER, badge, compose, drifted, failing, options, publish } from './coverage-report.mjs'

// Ce que le commentaire de pull request dit, et ce qu'il remplace. Le script
// écrit sur une pull request : sans ces cas, sa seule épreuve serait une pousse.

// Les seuils réels du dépôt, lus et jamais recopiés. Les cas qui traversent le
// badge ou le script les franchissent pour de vrai : un chiffre écrit à la main
// ici rend rouges, le jour où un lot monte un plancher, des cas que personne n'a
// touchés. Mesuré, trois d'un coup.
const SEUILS_DU_DÉPÔT = JSON.parse(
  readFileSync(join(process.cwd(), 'test', 'coverage-thresholds.json'), 'utf8'),
)

// Chaque mesure un point au-dessus de son propre seuil : au-dessus de la porte,
// sous le cliquet, quels que soient les seuils du jour. À un seuil de cent, la
// mesure vaut le seuil, et les deux comparaisons sont non strictes.
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

describe('la publication', () => {
  it('lève quand le commentaire n’est pas arrivé', () => {
    const muet = { run: (args) => (args[0] === 'repo' ? 'alexbrndl/crypte' : '[]') }

    expect(() => publish(`${MARKER}\ncorps`, '34', muet.run)).toThrow('attendu 1')
  })
})

describe('le verdict des seuils', () => {
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
  // Le seul défaut qu'aucun autre cas ne franchit, et le seul nom qui vit à
  // trois endroits sans rien qui les lie : ici, `ci.yml` `--outputFile=` et le
  // `path:` de l'artefact. Changé, le commentaire perd la moitié de son contenu
  // et le contrôle reste vert.
  it('lit le rapport de tests au chemin que la CI lui écrit', () => {
    expect(options([]).tests).toBe('vitest-report.json')
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
})

describe('ce que l’exploration a trouvé', () => {
  // Une suite vide passe toujours : « 0 tests passent » se lirait comme un
  // succès, alors que c'est le signe qu'aucun cas n'a été collecté.
  it('ne présente pas zéro test comme un succès', () => {
    const body = compose(resume(), { numTotalTests: 0, numFailedTests: 0, testResults: [] })

    expect(body).toContain('Aucun test rapporté')
    expect(body).not.toContain('0 tests passent')
  })
})

// Le câblage du script entier, lancé en sous-processus. Le job `badge` ne tourne
// que sur `main`, donc rien d'autre ne l'éprouve : c'est exactement la panne que
// ce lot a corrigée sur `--resume`, trouvée par une simulation à la main faute
// d'un cas.
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
describe('le workflow', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
  const appel = workflow
    .split('\n')
    .find((une) => une.includes('coverage-report.mjs') && une.includes('--badge'))

  it('vérifie le badge commité', () => {
    expect(appel, 'aucune ligne du workflow ne lance le script avec --badge').toBeTypeOf('string')
  })
})

describe('le cliquet des seuils', () => {
  // Un seuil laissé derrière la mesure est un seuil qu'on peut baisser sans que
  // rien ne rougisse, ce qui est la seule façon de rendre la mesure inutile. Le
  // cliquet attrape les deux fautes d'un coup : le plancher qu'on oublie de monter
  // et celui qu'on baisse pour faire passer un lot.
  const mesure = (pcts) => ({
    total: Object.fromEntries(Object.entries(pcts).map(([k, pct]) => [k, { pct }])),
  })

  const SEUILS = { statements: 96, branches: 88, functions: 96, lines: 97 }

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
})
