import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ce que le noyau refuse **par lui-même**, sans aucun plugin installé.
//
// Les autres tests ne peuvent pas le vérifier : une augmentation de module vaut
// pour tout le programme compilé, donc `test/plugin-simulation.d.ts` remplit les
// points d'extension partout à la fois. L'état « aucun plugin » n'existe nulle
// part parmi eux, et l'aiguillage de `StoryOptions` n'y est jamais évalué dans la
// branche qu'il existe pour tenir. Mesuré : en annulant cet aiguillage, les 45
// autres tests et `tsc` restent verts.
//
// D'où une seconde compilation, sur son propre `tsconfig` qui n'inclut pas la
// simulation. Les assertions vivent dans `test/no-plugin/cases.ts`, sous forme de
// `@ts-expect-error` : une directive inutilisée est elle-même une erreur, donc la
// compilation échoue aussi bien si le noyau accepte ce qu'il devait refuser que
// l'inverse.

const core = join(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(core, 'node_modules', '.bin', 'tsc')
const project = join(core, 'test', 'no-plugin', 'tsconfig.json')

function run(args: string[]): { ok: boolean; output: string } {
  try {
    const stdout = execFileSync(tsc, ['-p', project, ...args], {
      cwd: core,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { ok: true, output: stdout }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string }
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

// La compilation dure quelques secondes, bien au-delà du défaut de vitest.
describe('le noyau installé seul', { timeout: 60_000 }, () => {
  // Une compilation qui ne compile rien réussit. C'est arrivé : le `tsconfig` du
  // paquet exclut ce dossier, et l'exclusion se transmettait à celui-ci par
  // héritage, si bien que le programme était vide et le test vert. Ce cas se
  // vérifie avant les autres, sinon ils ne prouvent rien.
  it('compile bien le fichier de cas, sans la simulation de plugin', () => {
    const { ok, output } = run(['--listFiles'])

    expect(ok, output).toBe(true)
    expect(output).toContain('no-plugin/cases.ts')
    expect(output).not.toContain('plugin-simulation')
  })

  it('refuse ce qu’aucun plugin n’a déclaré, et accepte ses propres champs', () => {
    const { ok, output } = run([])
    expect(ok, output).toBe(true)
  })
})
