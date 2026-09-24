import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPreviewChannel, propsOfStory, wrapsOf } from '../src/preview/index'
import { collect, windowAt } from './fake-window'

const ORIGIN = 'https://crypte.test'
const AILLEURS = 'https://ailleurs.test'

const global = globalThis as unknown as { window?: unknown }

let preview = windowAt(ORIGIN)
let shell = windowAt(ORIGIN)
let recus: unknown[] = []

beforeEach(() => {
  preview = windowAt(ORIGIN)
  shell = windowAt(ORIGIN)
  preview.parent = shell
  shell.sender = preview
  recus = collect(shell)
  global.window = preview
})

afterEach(() => {
  delete global.window
})

const RENDER = { type: 'render', id: 'badge--par-defaut', overrides: { label: 'Neuf' } }

// Ce que le shell envoie, tel qu'il arrive : même origine, et le parent pour source.
function envoie(data: unknown, { origin = ORIGIN, source = shell as unknown } = {}) {
  preview.deliver({ data, origin, source }, ORIGIN)
}

describe('announcement', () => {
  it('announces nothing to a parent from another origin', () => {
    const etranger = windowAt(AILLEURS)
    etranger.sender = preview
    preview.parent = etranger
    const chezLui = collect(etranger)

    createPreviewChannel({ render: () => {} })

    expect(chezLui).toEqual([])
  })
})

describe('rendering', () => {
  it('answers error rather than letting the exception escape', () => {
    createPreviewChannel({
      render: () => {
        throw new Error('composant introuvable')
      },
    })

    expect(() => envoie(RENDER)).not.toThrow()
    expect(recus.at(-1)).toMatchObject({
      type: 'error',
      id: RENDER.id,
      message: 'composant introuvable',
    })
    expect((recus.at(-1) as { stack?: string }).stack).toContain('Error')
  })

  it('returns the message of an exception that is not an Error', () => {
    createPreviewChannel({
      render: () => {
        throw 'juste une chaîne'
      },
    })

    envoie(RENDER)

    expect(recus.at(-1)).toMatchObject({
      type: 'error',
      message: 'juste une chaîne',
      stack: undefined,
    })
  })
})

describe('what is ignored', () => {
  function monte(render: (id: string) => void = () => {}) {
    const rendus: unknown[] = []
    const canal = createPreviewChannel({
      render: (id) => {
        rendus.push(id)
        render(id)
      },
    })
    recus.length = 0

    return { rendus, canal, stop: () => canal.dispose() }
  }

  it('a message from another origin', () => {
    const { rendus } = monte()

    envoie(RENDER, { origin: AILLEURS })

    expect([rendus, recus]).toEqual([[], []])
  })

  it('a message from a window other than the parent', () => {
    const { rendus } = monte()

    envoie(RENDER, { source: windowAt(ORIGIN) })

    expect([rendus, recus]).toEqual([[], []])
  })

  it('a message without a recognizable type', () => {
    const { rendus } = monte()

    envoie(undefined)
    envoie({ id: 'sans type' })
    envoie({ type: 'zzz-inconnu' })

    expect([rendus, recus]).toEqual([[], []])
  })

  // Le rejeu passe par le même chemin que le canal : sans ça, une mise à jour à
  // chaud qui lève jetait dans le callback et rien ne remontait au shell.
  it('replays the last request, with its report', () => {
    const { rendus, canal } = monte()

    envoie(RENDER)
    recus.length = 0
    canal.again()

    expect(rendus).toEqual([RENDER.id, RENDER.id])
    expect(recus.map((message) => (message as { type: string }).type)).toEqual(['rendered'])
  })

  it('returns the error of a replay that throws', () => {
    let doitLever = false
    const { canal } = monte(() => {
      if (doitLever) throw new Error('ce composant ne rend plus')
    })

    envoie(RENDER)
    doitLever = true
    recus.length = 0
    canal.again()

    expect(recus).toEqual([
      expect.objectContaining({
        type: 'error',
        id: RENDER.id,
        message: 'ce composant ne rend plus',
      }),
    ])
  })

  it('replays nothing until something is requested', () => {
    const { rendus, canal } = monte()

    canal.again()

    expect([rendus, recus]).toEqual([[], []])
  })

  it('everything, once unsubscribed', () => {
    const { rendus, stop } = monte()

    expect(preview.listenerCount()).toBe(1)
    stop()
    envoie(RENDER)

    expect(preview.listenerCount()).toBe(0)
    expect([rendus, recus]).toEqual([[], []])
  })
})

// La fusion des props d'une story nommée. Dans le noyau et pas dans un
// adaptateur : elle ne fait que mêler des objets simples, et deux adaptateurs la
// refaisant chacun divergeraient. Voir la section 2.3 de docs/contracts.md.
describe('the props of a named story', () => {
  const definition = {
    props: { label: 'commun', tone: 'neutral' },
    stories: {
      'Par défaut': {},
      Avertissement: { tone: 'warning' },
      'Avec options': { props: { label: 'propre' }, options: {} },
    },
  }

  it('puts the shared props under those of the story', () => {
    expect(propsOfStory(definition, 'Par défaut')).toEqual({ label: 'commun', tone: 'neutral' })
    expect(propsOfStory(definition, 'Avertissement')).toEqual({ label: 'commun', tone: 'warning' })
  })

  // La forme longue passe par `props`, la forme courte est les props elles-mêmes.
  it('reads both forms of a story', () => {
    expect(propsOfStory(definition, 'Avec options')).toEqual({ label: 'propre', tone: 'neutral' })
  })

  // Les surcharges du shell viennent en dernier : c'est tout leur objet.
  it('puts the overrides above everything', () => {
    expect(propsOfStory(definition, 'Avertissement', { tone: 'neutral' }).tone).toBe('neutral')
  })

  it('returns the shared props for a name it does not know', () => {
    expect(propsOfStory(definition, 'inexistante')).toEqual({ label: 'commun', tone: 'neutral' })
  })
})

// L'ordre des enveloppes, et rien d'autre : composer les composants appartient à
// l'adaptateur, mettre cette forme à plat n'appartient à aucun framework.
// Section 2.5 de docs/contracts.md.
describe('the wrappers of a story', () => {
  const Theme = 'Theme'
  const Router = 'Router'
  const Global = 'Global'

  it('accepts a single wrapper, without an array', () => {
    expect(wrapsOf(undefined, { wrap: Theme })).toEqual([{ component: Theme, props: {} }])
  })

  // La première entrée est la plus extérieure : c'est la règle du contrat, et
  // l'inverser rendrait un Router à l'intérieur de son thème.
  it('keeps the array order, outermost first', () => {
    expect(wrapsOf(undefined, { wrap: [Router, Theme] })).toEqual([
      { component: Router, props: {} },
      { component: Theme, props: {} },
    ])
  })

  it('reads the props of a pair entry', () => {
    expect(wrapsOf(undefined, { wrap: [[Theme, { mode: 'dark' }]] })).toEqual([
      { component: Theme, props: { mode: 'dark' } },
    ])
  })

  // Le cœur du contrat : le `wrap` global enveloppe celui du fichier, qui
  // enveloppe le composant. Donc le global vient en premier.
  it('puts the global wrap outside the file one', () => {
    expect(wrapsOf(Global, { wrap: Theme })).toEqual([
      { component: Global, props: {} },
      { component: Theme, props: {} },
    ])
  })

  it('accepts a global wrap alone, without a file wrap', () => {
    expect(wrapsOf([Global, Router], undefined)).toEqual([
      { component: Global, props: {} },
      { component: Router, props: {} },
    ])
  })

  // Les formes dégénérées : `null` là où un composant est attendu ne doit pas
  // faire monter une enveloppe vide, qui rendrait la story invisible.
  it('drops an entry without a component', () => {
    expect(wrapsOf(null, { wrap: [null, Theme] })).toEqual([{ component: Theme, props: {} }])
    expect(wrapsOf(undefined, { wrap: [[null, { mode: 'dark' }]] })).toEqual([])
  })

  it('treats a pair without props as a bare wrapper', () => {
    expect(wrapsOf(undefined, { wrap: [[Theme]] })).toEqual([{ component: Theme, props: {} }])
  })
})
