import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ce que le noyau refuse installé seul, par une compilation sans la simulation
// de plugin. Les autres tests ne peuvent pas l'atteindre. Voir architecture.md.

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

// La compilation dépasse le délai par défaut de vitest.
describe('le noyau installé seul', { timeout: 60_000 }, () => {
  // Une compilation qui ne compile rien réussit : à vérifier avant le reste.
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
