import { PROTOCOL_VERSION } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { exitCode, run } from '../src/cli'
import type { Running } from '../src/dev'
import { ConfigError } from '../src/errors'

// Ce que la commande fait de ses arguments. Rien ne l'éprouvait : la couverture
// donnait 0 % sur l'entrée du CLI, donc l'aide, la version et le code de sortie
// d'une erreur de configuration reposaient sur la lecture seule.
// Voir docs/internal/architecture.md.

const dit = () => {
  const lignes: string[] = []

  return { lignes, log: (line: string) => lignes.push(line) }
}

// La commande `dev` monte un serveur : ici on n'éprouve que ce que l'entrée lui
// passe, donc une doublure qui retient sa racine.
const faux = () => {
  const racines: (string | undefined)[] = []

  return {
    racines,
    dev: async (input: string) => {
      racines.push(input)
      return undefined as unknown as Running
    },
  }
}

describe('la commande crypte', () => {
  test.for(['--version', '-v'] as const)('rend la version sur %s', async (drapeau) => {
    const sortie = dit()

    await run([drapeau], sortie.log)

    expect(sortie.lignes).toEqual(['0.0.0'])
  })

  // Le numéro de protocole est dans l'aide : un utilisateur qui écrit un plugin
  // le lit là, et le voir dériver de la constante est tout l'intérêt.
  test('rend l’aide et la version du protocole sans commande', async () => {
    const sortie = dit()

    await run([], sortie.log)

    expect(sortie.lignes).toEqual([`crypte — protocol v${PROTOCOL_VERSION}, commands: dev`])
  })

  test('rend la même aide sur une commande inconnue', async () => {
    const sortie = dit()

    await run(['tourne'], sortie.log)

    expect(sortie.lignes).toEqual([`crypte — protocol v${PROTOCOL_VERSION}, commands: dev`])
  })

  test('passe la racine donnée à dev', async () => {
    const doublure = faux()

    await run(['dev', '/un/projet'], dit().log, doublure.dev)

    expect(doublure.racines).toEqual(['/un/projet'])
  })

  // Sans racine, le dossier courant : c'est ce qu'un `crypte dev` nu doit faire,
  // et rien ne le vérifiait.
  test('prend le dossier courant quand la racine manque', async () => {
    const doublure = faux()

    await run(['dev'], dit().log, doublure.dev)

    expect(doublure.racines).toEqual([process.cwd()])
  })
})

describe('la sortie du processus', () => {
  // Une erreur de configuration est la faute de l'utilisateur : son message,
  // sans trace de pile, et un code 1.
  test('sort en 1 avec le message d’une erreur de configuration', () => {
    const sortie = dit()

    expect(exitCode(new ConfigError('crypte.config.ts est introuvable'), sortie.log)).toBe(1)
    expect(sortie.lignes).toEqual(['crypte.config.ts est introuvable'])
  })

  // Et tout le reste est une panne : la relancer garde sa trace, la ravaler
  // ferait sortir en 1 un bogue du CLI comme s'il venait du projet.
  test('relance ce qui n’est pas une erreur de configuration', () => {
    const sortie = dit()
    const panne = new TypeError('x is not a function')

    expect(() => exitCode(panne, sortie.log)).toThrow(panne)
    expect(sortie.lignes).toEqual([])
  })
})
