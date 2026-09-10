import { describe, expect, test } from 'vitest'
import { PROTOCOL_VERSION } from '@crypte/core/protocol'
import { exitCode, run } from '../src/cli'
import type { Running } from '../src/dev'
import { ConfigError } from '../src/errors'

// Ce que la commande fait de ses arguments. Rien ne l'éprouvait : la couverture
// donnait 0 % sur l'entrée du CLI, donc l'aide, la version et le code de sortie
// d'une erreur de configuration reposaient sur la lecture seule.
// Voir docs/internal/architecture.md.

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

    expect(sortie.lignes).toEqual([AIDE])
  })

  test('rend la même aide sur une commande inconnue', async () => {
    const sortie = dit()

    await run(['tourne'], sortie.log)

    expect(sortie.lignes).toEqual([AIDE])
  })

  // L'aide nomme ce que le binaire porte vraiment. Elle a déjà annoncé une
  // commande de moins que la documentation, `DCJ-286`.
  test.for(['dev', 'check', 'init'] as const)('annonce %s dans l’aide', async (commande) => {
    const sortie = dit()

    await run([], sortie.log)

    expect(sortie.lignes[0]).toContain(commande)
  })

  test.for(['dev', 'check', 'init'] as const)('passe la racine donnée à %s', async (commande) => {
    const doublure = faux()

    await run([commande, '/un/projet'], dit().log, doublure)

    expect(doublure.racines).toEqual(['/un/projet'])
  })

  // Sans racine, le dossier courant : c'est ce qu'une commande nue doit faire,
  // et rien ne le vérifiait.
  test.for(['dev', 'check', 'init'] as const)(
    'prend le dossier courant quand la racine manque sur %s',
    async (commande) => {
      const doublure = faux()

      await run([commande], dit().log, doublure)

      expect(doublure.racines).toEqual([process.cwd()])
    },
  )

  // Le code de sortie de `check` est le sien : les orphelines font échouer la
  // commande, et l'avaler rendrait le contrôle vert dans une intégration.
  test('rend le code de sortie de check', async () => {
    expect(await run(['check'], dit().log, { check: async () => 1 })).toBe(1)
  })

  test.for([['dev'], ['init'], ['--version'], ['tourne'], []] as const)(
    'sort en 0 sur %s',
    async (argv) => {
      expect(await run([...argv], dit().log, faux())).toBe(0)
    },
  )
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
