import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreviewMessage } from '../src/protocol/channel'
import type { PreviewContext } from '../src/protocol/plugin'
import {
  createPluginHost,
  createPreviewChannel,
  propsOfStory,
  wrapsOf,
  type LoadedPlugin,
} from '../src/preview/index'
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

// Ce qui suit un rendu réussi : les hooks des plugins, une fois `rendered` parti,
// pour que leur temps ne compte pas dans celui que le shell affiche. Revue de la
// PR #107 : un `afterMount` de 40 ms donnait un rendu de 40 ms.
describe('after a render', () => {
  it('hands what render returned to rendered, once rendered is out', () => {
    const ordre: unknown[] = []
    createPreviewChannel({
      render: () => 'dessinée',
      rendered: (drawn) => ordre.push(['rendered', drawn, recus.length]),
    })
    recus.length = 0

    envoie(RENDER)

    expect(ordre).toEqual([['rendered', 'dessinée', 1]])
  })

  // Une horloge que le rendu avance à 5 et les hooks à 100 : appelés avant
  // l'envoi, les hooks donnaient 100. Revue de la PR #107, la version d'avant
  // passait dans les deux ordres.
  it('leaves the plugins’ time out of the render’s', () => {
    let maintenant = 0
    const horloge = vi.spyOn(performance, 'now').mockImplementation(() => maintenant)
    createPreviewChannel({
      render: () => {
        maintenant = 5
      },
      rendered: () => {
        maintenant = 100
      },
    })
    recus.length = 0

    envoie(RENDER)

    expect(recus).toEqual([{ type: 'rendered', id: 'badge--par-defaut', durationMs: 5 }])
    horloge.mockRestore()
  })

  it('calls nothing after a render that threw', () => {
    const appels: unknown[] = []
    createPreviewChannel({
      render: () => {
        throw new Error('cassée')
      },
      rendered: (drawn) => appels.push(drawn),
    })

    envoie(RENDER)

    expect(appels).toEqual([])
  })
})

// Les messages de plugin, reconnus au deux-points de leur `type`, section 5.4 :
// passés au gestionnaire, jamais pris pour un `render`.
describe('plugin messages on the channel', () => {
  it('hands a message whose type carries a colon to the message handler', () => {
    const messages: unknown[] = []
    createPreviewChannel({ render: () => {}, message: (message) => messages.push(message) })

    envoie({ type: 'a11y:run', depth: 2 })
    envoie({ type: 'sans-deux-points' })

    expect(messages).toEqual([{ type: 'a11y:run', depth: 2 }])
  })

  it('drops a plugin message when nothing handles them', () => {
    const rendus: unknown[] = []
    createPreviewChannel({ render: (id) => rendus.push(id) })
    recus.length = 0

    envoie({ type: 'a11y:run' })

    expect([rendus, recus]).toEqual([[], []])
  })

  it('sends to the shell', () => {
    const canal = createPreviewChannel({ render: () => {} })
    recus.length = 0

    canal.send({ type: 'plugin-error', plugin: 'a', message: 'x' })

    expect(recus).toEqual([{ type: 'plugin-error', plugin: 'a', message: 'x' }])
  })
})

// L'hôte des hooks de la section 6.2 : ce qu'il appelle, ce qu'il route, et ce
// qu'il refuse, chaque refus envoyé au shell en `plugin-error`.
describe('the plugin host', () => {
  const story = { id: 'badge--defaut', props: { label: 'x' }, options: {}, root: {} as HTMLElement }

  let envoyés: PreviewMessage[] = []
  const send = (message: PreviewMessage) => envoyés.push(message)
  const refus = (plugin: string, message: string) => ({ type: 'plugin-error', plugin, message })

  beforeEach(() => {
    envoyés = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const hôte = (...loaded: (LoadedPlugin | Promise<LoadedPlugin>)[]) =>
    createPluginHost(loaded, send)

  describe('what it refuses', () => {
    it.for([
      [
        'a module that did not load',
        { name: 'a', error: new Error('boum') },
        'its preview module could not load: boum',
      ],
      [
        'a module that threw something other than an Error',
        { name: 'a', error: 'boum' },
        'its preview module could not load: boum',
      ],
      [
        'a module with no default export',
        { name: 'a', module: {} },
        'its preview module exports no object of hooks by default',
      ],
      [
        'a default export that is not an object',
        { name: 'a', module: { default: 42 } },
        'its preview module exports no object of hooks by default',
      ],
      [
        'a null default export',
        { name: 'a', module: { default: null } },
        'its preview module exports no object of hooks by default',
      ],
      [
        'an array',
        { name: 'a', module: { default: [] } },
        'its preview module exports no object of hooks by default',
      ],
      // Un hook de la réserve, exporté et jamais appelé, échouerait en silence.
      [
        'a hook the preview does not call',
        { name: 'a', module: { default: { beforeMount: () => {} } } },
        '`beforeMount` is not a hook the preview calls, which are afterMount and onMessage',
      ],
      [
        'a hook that is not a function',
        { name: 'a', module: { default: { afterMount: 1 } } },
        '`afterMount` is not a function',
      ],
      // Exporté par nom, il n'était jamais lu, donc jamais appelé, sans un mot.
      // Audit à froid du projet 1.3.
      [
        'a hook exported by name beside the default export',
        { name: 'a', module: { default: {}, afterMount: () => {} } },
        '`afterMount` is exported by name, and the preview reads only the default export',
      ],
      // Un hook de la réserve, le premier qu'un auteur écrira (6.4). Revue de la
      // PR #116.
      [
        'a reserve hook exported by name',
        { name: 'a', module: { default: {}, beforeMount: () => {} } },
        '`beforeMount` is exported by name, and the preview reads only the default export',
      ],
      [
        'a hook exported by name with no default export',
        { name: 'a', module: { onMessage: () => {} } },
        '`onMessage` is exported by name, and the preview reads only the default export',
      ],
    ] as const)('refuses %s', ([, loaded, message]) => {
      hôte(loaded as LoadedPlugin).mounted(story)

      expect(envoyés).toEqual([refus('a', message)])
    })

    // Un accesseur qui lève pendant la lecture : sans garde, l'hôte levait à sa
    // création et emportait toute l'entrée. Mesuré.
    it('refuses a module whose hooks throw as they are read', () => {
      const piégé = {
        get afterMount() {
          throw new Error('accesseur')
        },
      }

      hôte({ name: 'a', module: { default: piégé } }).mounted(story)

      expect(envoyés).toEqual([refus('a', 'its preview module could not be read: accesseur')])
    })

    // Le type `PreviewHooks` permet un hook laissé `undefined` : l'hôte refusait
    // alors tout le module, `afterMount` compris. Audit à froid du projet 1.3.
    it('accepts a hook left undefined, and calls the others', () => {
      const vus: string[] = []
      hôte({
        name: 'a',
        module: { default: { afterMount: () => void vus.push('a'), onMessage: undefined } },
      }).mounted(story)

      expect(envoyés).toEqual([])
      expect(vus).toEqual(['a'])
    })

    it('accepts a module that exports an empty object of hooks', () => {
      hôte({ name: 'a', module: { default: {} } }).mounted(story)

      expect(envoyés).toEqual([])
    })
  })

  // La preview n'attend plus les modules de plugin : un module qui ne finissait
  // jamais de charger retenait toutes les stories. Audit à froid du projet 1.3.
  describe('a module still loading', () => {
    const tenu = () => {
      let rendre: (one: LoadedPlugin) => void = () => {}
      const promesse = new Promise<LoadedPlugin>((ok) => (rendre = ok))
      return { promesse, rendre }
    }

    it('catches up on the story on display when it arrives after a render', async () => {
      const vus: string[] = []
      const { promesse, rendre } = tenu()
      const host = hôte(promesse)

      host.mounted(story)
      expect(vus).toEqual([])

      rendre({
        name: 'a',
        module: { default: { afterMount: (ctx: PreviewContext) => void vus.push(ctx.id) } },
      })
      await promesse

      expect(vus).toEqual(['badge--defaut'])
    })

    it('lets the others run while one never finishes loading', () => {
      const vus: string[] = []
      const host = hôte(new Promise<LoadedPlugin>(() => {}), {
        name: 'b',
        module: { default: { afterMount: () => void vus.push('b') } },
      })

      host.mounted(story)

      expect(vus).toEqual(['b'])
      expect(envoyés).toEqual([])
    })

    it('runs at its place in the configuration once it has arrived', async () => {
      const vus: string[] = []
      const { promesse, rendre } = tenu()
      const host = hôte(promesse, {
        name: 'b',
        module: { default: { afterMount: () => void vus.push('b') } },
      })

      rendre({ name: 'a', module: { default: { afterMount: () => void vus.push('a') } } })
      await promesse
      host.mounted(story)

      expect(vus).toEqual(['a', 'b'])
    })

    // La fenêtre n'existait pas quand `ready` partait après tous les modules :
    // le message est perdu, et la console le disait sans hook. Revue de la PR #116.
    it('says a message arrived while a module was still loading', () => {
      const erreur = vi.mocked(console.error)
      const host = hôte(new Promise<LoadedPlugin>(() => {}))

      host.mounted(story)
      host.received({ type: 'a:run' })

      expect(erreur.mock.calls.at(-1)).toEqual([
        'crypte: `a:run` arrived while a preview module was still loading, and is dropped',
      ])
    })

    it('refuses a module that arrives broken, like one already loaded', async () => {
      const { promesse, rendre } = tenu()
      hôte(promesse)

      rendre({ name: 'a', error: new Error('boum') })
      await promesse

      expect(envoyés).toEqual([refus('a', 'its preview module could not load: boum')])
    })
  })

  describe('afterMount', () => {
    it('runs after each render, with the story drawn, for every plugin in order', () => {
      const vus: string[] = []
      const hooks = (name: string) => ({
        default: {
          afterMount: (ctx: PreviewContext) =>
            vus.push(`${name}:${ctx.id}:${String(ctx.props.label)}`),
        },
      })
      const host = hôte({ name: 'a', module: hooks('a') }, { name: 'b', module: hooks('b') })

      host.mounted(story)
      host.mounted({ ...story, id: 'badge--autre' })

      expect(vus).toEqual([
        'a:badge--defaut:x',
        'b:badge--defaut:x',
        'a:badge--autre:x',
        'b:badge--autre:x',
      ])
    })

    // Un plugin n'est pas le texte de l'auteur : son hook qui lève ne coûte ni
    // la story ni les autres plugins.
    it('refuses a hook that throws, and runs the others', () => {
      const vus: string[] = []
      const host = hôte(
        {
          name: 'a',
          module: {
            default: {
              afterMount: () => {
                throw new Error('boum')
              },
            },
          },
        },
        { name: 'b', module: { default: { afterMount: () => vus.push('b') } } },
      )

      host.mounted(story)

      expect([envoyés, vus]).toEqual([[refus('a', '`afterMount` threw: boum')], ['b']])
    })
  })

  // L'analyse d'`a11y` est asynchrone : un rejet finissait en promesse que
  // personne ne traite, et rien n'atteignait le shell. Mesuré.
  it('refuses an async hook that rejects', async () => {
    hôte({
      name: 'a',
      module: {
        default: {
          afterMount: async () => {
            throw new Error('plus tard')
          },
        },
      },
    }).mounted(story)

    await vi.waitFor(() => expect(envoyés).toEqual([refus('a', '`afterMount` threw: plus tard')]))
  })

  // Par le vrai canal : `postMessage` clone, et refuse une fonction. Le refus
  // lève dans le hook, qui est refusé à son tour, au lieu de lever dans l'entrée.
  it('refuses a hook whose message cannot cross the channel', () => {
    const canal = createPreviewChannel({ render: () => {} })
    recus.length = 0
    const host = createPluginHost(
      [
        {
          name: 'a',
          module: {
            default: {
              afterMount: (ctx: PreviewContext) => ctx.send({ type: 'a:x', f: () => {} }),
            },
          },
        },
      ],
      canal.send,
    )

    host.mounted(story)

    expect(recus).toEqual([
      {
        type: 'plugin-error',
        plugin: 'a',
        message: expect.stringMatching(/^`afterMount` threw: .*could not be cloned/),
      },
    ])
  })

  describe('what a hook sends', () => {
    const qui = (message: unknown) => ({
      name: 'a',
      module: {
        default: { afterMount: (ctx: PreviewContext) => ctx.send(message as { type: string }) },
      },
    })

    it('goes to the shell under its plugin’s name', () => {
      hôte(qui({ type: 'a:resultats', n: 2 })).mounted(story)

      expect(envoyés).toEqual([{ type: 'a:resultats', n: 2 }])
    })

    // Sous un autre préfixe, il atteindrait un autre panneau, ou aucun.
    it.for([
      [
        'another plugin’s name',
        { type: 'b:resultats' },
        'it sent `b:resultats`, whose type does not start with `a:`',
      ],
      [
        'no prefix',
        { type: 'resultats' },
        'it sent `resultats`, whose type does not start with `a:`',
      ],
      ['no type', {}, 'it sent `undefined`, whose type does not start with `a:`'],
    ] as const)('is refused under %s', ([, message, raison]) => {
      hôte(qui(message)).mounted(story)

      expect(envoyés).toEqual([refus('a', raison)])
    })
  })

  describe('onMessage', () => {
    it('receives a message for its plugin alone, against the story last drawn', () => {
      const vus: string[] = []
      const écoute = (name: string) => ({
        name,
        module: {
          default: {
            onMessage: (ctx: PreviewContext, message: { type: string }) =>
              vus.push(`${name}:${message.type}:${ctx.id}`),
          },
        },
      })
      // `ab` en tête : router vers le premier qui écoute passerait sinon.
      const host = hôte(écoute('ab'), écoute('a'))

      host.mounted(story)
      host.mounted({ ...story, id: 'badge--dernier' })
      host.received({ type: 'a:run' })

      expect(vus).toEqual(['a:a:run:badge--dernier'])
    })

    it('refuses a hook that throws', () => {
      const host = hôte({
        name: 'a',
        module: {
          default: {
            onMessage: () => {
              throw new Error('boum')
            },
          },
        },
      })

      host.mounted(story)
      host.received({ type: 'a:run' })

      expect(envoyés).toEqual([refus('a', '`onMessage` threw: boum')])
    })

    // Dans la console seulement : rien n'a échoué chez un plugin, le message
    // n'avait simplement personne à qui aller.
    it.for([
      ['before any story rendered', true, 'crypte: `a:run` arrived before any story rendered'],
      ['for a plugin with no onMessage', false, 'crypte: no preview hook receives `a:run`'],
    ] as const)('says a message that arrives %s, and calls nothing', ([, sansRendu, dit]) => {
      const vus: string[] = []
      const host = hôte({
        name: 'a',
        module: { default: sansRendu ? { onMessage: () => vus.push('appelé') } : {} },
      })

      if (!sansRendu) host.mounted(story)
      host.received({ type: 'a:run' })

      expect([vus, envoyés]).toEqual([[], []])
      expect(console.error).toHaveBeenCalledWith(dit)
    })
  })
})
