import { describe, expect, test } from 'vitest'
import { PROTOCOL_VERSION } from '@crypte/core/protocol'
import { exitCode, run } from '../src/cli'
import type { Running } from '../src/dev'
import { ConfigError } from '../src/errors'

// Ce que la commande fait de ses arguments. Rien ne l'éprouvait : la couverture
// donnait 0 % sur l'entrée du CLI, donc l'aide, la version et le code de sortie
// d'une erreur de configuration reposaient sur la lecture seule.

const AIDE = `crypte — protocol v${PROTOCOL_VERSION}, commands: dev, check, init`

const dit = () => {
  const lignes: string[] = []

  return { lignes, log: (line: string) => lignes.push(line) }
}

// Les trois commandes montent un serveur, lisent un projet ou écrivent un
// fichier : ici on n'éprouve que ce que l'entrée leur passe, donc des doublures
// qui retiennent leur racine.
const faux = () => {
  const racines: string[] = []

  return {
    racines,
    dev: async (input: string) => {
      racines.push(input)
      return undefined as unknown as Running
    },
    check: async (input: string) => {
      racines.push(input)
      return 0
    },
    init: (input: string) => {
      racines.push(input)
    },
  }
}

describe('the crypte command', () => {
  test.for(['--version', '-v'] as const)('prints the version on %s', async (drapeau) => {
    const sortie = dit()

    await run([drapeau], sortie.log)

    expect(sortie.lignes).toEqual(['0.0.0'])
  })

  // Le numéro de protocole est dans l'aide : un utilisateur qui écrit un plugin
  // le lit là, et le voir dériver de la constante est tout l'intérêt.
  test('prints the help and the protocol version without a command', async () => {
    const sortie = dit()

    await run([], sortie.log)

    expect(sortie.lignes).toEqual([AIDE])
  })

  test.for(['dev', 'check', 'init'] as const)('passes the given root to %s', async (commande) => {
    const doublure = faux()

    await run([commande, '/un/projet'], dit().log, doublure)

    expect(doublure.racines).toEqual(['/un/projet'])
  })

  // Sans racine, le dossier courant : c'est ce qu'une commande nue doit faire,
  // et rien ne le vérifiait.
  test.for(['dev', 'check', 'init'] as const)(
    'uses the current directory when the root is missing on %s',
    async (commande) => {
      const doublure = faux()

      await run([commande], dit().log, doublure)

      expect(doublure.racines).toEqual([process.cwd()])
    },
  )

  // Le code de sortie de `check` est le sien : les orphelines font échouer la
  // commande, et l'avaler rendrait le contrôle vert dans une intégration.
  test('returns the exit code of check', async () => {
    expect(await run(['check'], dit().log, { check: async () => 1 })).toBe(1)
  })
})

describe('the process exit', () => {
  // Une erreur de configuration est la faute de l'utilisateur : son message,
  // sans trace de pile, et un code 1.
  test('exits with 1 and the message of a config error', () => {
    const sortie = dit()

    expect(exitCode(new ConfigError('crypte.config.ts est introuvable'), sortie.log)).toBe(1)
    expect(sortie.lignes).toEqual(['crypte.config.ts est introuvable'])
  })

  // Et tout le reste est une panne : la relancer garde sa trace, la ravaler
  // ferait sortir en 1 un bogue du CLI comme s'il venait du projet.
  test('rethrows what is not a config error', () => {
    const sortie = dit()
    const panne = new TypeError('x is not a function')

    expect(() => exitCode(panne, sortie.log)).toThrow(panne)
    expect(sortie.lignes).toEqual([])
  })
})
