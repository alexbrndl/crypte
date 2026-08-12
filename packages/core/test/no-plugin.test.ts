import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ce que le noyau refuse installé seul, par une compilation sans la simulation
// de plugin. Les autres tests ne peuvent pas l'atteindre. Voir architecture.md.

const core = join(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(core, 'node_modules', '.bin', 'tsc')
const project = join(core, 'test', 'no-plugin', 'tsconfig.json')

// Dans `packages/react`, seul endroit d'où `@crypte/core/protocol` se résout
// comme chez un utilisateur : un paquet ne se dépend pas lui-même.
const publicPath = join(core, '..', 'react', 'test', 'tsconfig.json')

function run(args: string[], target = project): { ok: boolean; output: string } {
  try {
    const stdout = execFileSync(tsc, ['-p', target, ...args], {
      cwd: core,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { ok: true, output: stdout }
  } catch (error) {
    const failure = error as { code?: string; message?: string; stdout?: string; stderr?: string }

    // Sans ce cas, un `tsc` introuvable rend une sortie vide et le test accuse
    // le noyau d'accepter ce qu'il devait refuser.
    if (failure.code === 'ENOENT') throw new Error(`tsc introuvable : ${tsc}`)

    const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
    return { ok: false, output: output || (failure.message ?? 'échec sans sortie') }
  }
}

// La compilation dépasse le délai par défaut de vitest.
describe('le noyau installé seul', { timeout: 60_000 }, () => {
  // `--listFiles` vérifie les types comme un appel nu : une seule compilation
  // porte donc les deux garanties. Et celle sur le programme passe en premier,
  // parce qu'une compilation qui ne compile rien réussit.
  it('refuse ce qu’aucun plugin n’a déclaré, et accepte ses propres champs', () => {
    const { ok, output } = run(['--listFiles'])

    expect(output).toContain(join('no-plugin', 'cases.ts'))
    expect(output).not.toContain('plugin-simulation')
    expect(ok, output).toBe(true)
  })
})

// La simulation du noyau augmente les modules sources. Le chemin que la
// spécification recommande, augmenter `@crypte/core/protocol`, passe par les
// types publiés et n'était éprouvé nulle part.
describe('l’augmentation par la porte d’entrée publique', { timeout: 60_000 }, () => {
  it('fusionne à travers les types publiés', () => {
    const { ok, output } = run(['--listFiles'], publicPath)

    expect(output).toContain('public-augmentation.ts')
    expect(output).toContain(join('core', 'dist'))
    expect(ok, output).toBe(true)
  })
})
