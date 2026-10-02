import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import Panels from '../src/panels.vue'

// La zone où le shell monte les modules shell des plugins. Le navigateur la tient
// aussi, dans `packages/cli/test/screen.test.ts`, mais contre le shell
// préconstruit, que la couverture ne lit pas.

// Un chemin absolu, comme l'URL que le shell importe : le tsconfig du shell
// n'a pas les types de Node, d'où `URL` plutôt que `node:path`.
const module = (nom: string) =>
  decodeURIComponent(new URL(`./panels/${nom}`, import.meta.url).pathname)

// Ce que `/@crypte/plugins.json` rend : les modules à monter, et ce que le CLI
// a écarté des plugins.
const monte = async (liste: unknown, refused: unknown[] = []): Promise<VueWrapper> => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (liste instanceof Error) throw liste
      return { json: async () => ({ panels: liste, refused }) } as Response
    }),
  )

  const wrapper = mount(Panels, {
    props: { entry: null, received: {}, errors: [], failed: null, revision: 0 },
  })

  // L'import d'un module prend plus d'un tour de microtâches : attendu jusqu'à
  // ce que la zone ait rendu un panneau ou un échec.
  await vi.waitFor(() => expect(wrapper.findAll('section, .failed p')).not.toEqual([]), {
    timeout: 5_000,
  })

  return wrapper
}

const montés = (wrapper: VueWrapper) =>
  wrapper
    .findAll('[data-plugin]')
    .map((one) => `${one.attributes('data-plugin')}=${one.find('.body').text()}`)

const échecs = (wrapper: VueWrapper) => wrapper.findAll('.failed p').map((one) => one.text())

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the plugin panels', () => {
  test('mounts each default export, in the order listed', async () => {
    const wrapper = await monte([
      { name: 'b', shell: module('deux.ts') },
      { name: 'a', shell: module('un.ts') },
    ])

    expect(montés(wrapper)).toEqual(['b=deux', 'a=un'])
    expect(échecs(wrapper)).toEqual([])
  })

  // `PanelProps` promet `null` tant que la partie preview n'a rien dit : le
  // shell passait `undefined`, et un panneau qui suivait le type levait au
  // montage. Revue de la PR #113.
  test('hands a panel null until its preview module has said something', async () => {
    const wrapper = await monte([
      { name: 'a', shell: module('attente.ts') },
      // Un nom qu'un objet hérite : `received[name]` rendait une fonction.
      { name: 'constructor', shell: module('attente.ts') },
    ])

    expect(montés(wrapper)).toEqual(['a=null', 'constructor=null'])
  })

  // Ce qu'un panneau envoie à sa partie preview remonte, par son cadre qui en
  // vérifie le préfixe, jusqu'au shell.
  test('passes on what a panel sends to its preview module', async () => {
    const wrapper = await monte([{ name: 'e', shell: module('bavard.ts') }])

    expect(wrapper.emitted('send')).toEqual([[{ type: 'e:run' }]])
  })

  // Ce qu'un panneau édite remonte, par son cadre, jusqu'au shell.
  test('passes on what a panel edited', async () => {
    const wrapper = await monte([{ name: 'e', shell: module('editeur.ts') }])

    expect(wrapper.emitted('overrides')).toEqual([[{ label: 'édité' }]])
  })
})

describe('what a panel is refused', () => {
  test('names a module that does not load or exports no component, and mounts the rest', async () => {
    const wrapper = await monte([
      { name: 'absent', shell: module('absent.ts') },
      { name: 'chaine', shell: module('chaine.ts') },
      { name: 'nombre', shell: module('quarante-deux.ts') },
      { name: 'a', shell: module('un.ts') },
    ])

    expect(montés(wrapper)).toEqual(['a=un'])
    expect(échecs(wrapper)).toEqual([
      expect.stringMatching(/^absent n'a pas pu se charger : \S/),
      "chaine n'a pas pu se charger : une chaîne, pas une erreur",
      "nombre n'a pas pu se charger : le module n'exporte pas de composant par défaut",
    ])
  })

  // Ce que la preview a dit d'un plugin, section 5.3, à côté de ce qui n'a pas
  // chargé dans le shell.
  test('names a plugin the preview says failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ panels: [], refused: [] }) }) as Response),
    )
    const wrapper = mount(Panels, {
      props: {
        entry: null,
        received: {},
        errors: [{ plugin: 'a11y', message: 'boum' }],
        failed: null,
        revision: 0,
      },
    })

    expect(échecs(wrapper)).toEqual(['a11y dans la preview : boum'])
  })

  // Le terminal était le seul endroit où un refus se disait. DCJ-194.
  test('names what the CLI refused of a plugin, with its reason', async () => {
    const wrapper = await monte(
      [{ name: 'a', shell: module('un.ts') }],
      [
        {
          plugin: 'b',
          reason: '`toolbar` is not a key of a plugin, which are name, shell, preview and node',
        },
        { plugin: 'plugins[2]', reason: 'a plugin with a browser surface needs a `name`' },
      ],
    )

    // Les refus s'affichent avant que les modules finissent de charger : sans
    // cette attente, le cas lisait les panneaux trop tôt sous couverture.
    await vi.waitFor(() => expect(montés(wrapper)).toEqual(['a=un']))
    expect(échecs(wrapper)).toEqual([
      'Refusé chez b : `toolbar` is not a key of a plugin, which are name, shell, preview and node',
      'Refusé chez plugins[2] : a plugin with a browser surface needs a `name`',
    ])
  })

  test('names the list when it cannot be read', async () => {
    const wrapper = await monte(new Error('Unexpected end of JSON input'))

    expect(montés(wrapper)).toEqual([])
    expect(échecs(wrapper)).toEqual([
      "la liste des plugins n'a pas pu se charger : Unexpected end of JSON input",
    ])
  })
})

// Une édition de la configuration relance le serveur et recharge la preview, qui
// redit `ready` : la liste est relue à ce moment. Lue au montage seulement, un
// plugin retiré gardait son panneau. Audit à froid du projet 1.3.
describe('the list read again', () => {
  const listes = (...réponses: unknown[]) => {
    const fetch = vi.fn()
    for (const one of réponses)
      fetch.mockImplementationOnce(async () => ({ json: async () => one }))
    vi.stubGlobal('fetch', fetch)
  }

  test('follows the new configuration, and keeps a panel that did not change', async () => {
    listes(
      {
        panels: [
          { name: 'garde', shell: module('compte.ts') },
          { name: 'part', shell: module('un.ts') },
        ],
        refused: [],
      },
      {
        panels: [{ name: 'garde', shell: module('compte.ts') }],
        refused: [{ plugin: 'neuf', reason: 'a plugin with a browser surface needs a `name`' }],
      },
    )
    const wrapper = mount(Panels, {
      props: { entry: null, received: {}, errors: [], failed: null, revision: 0 },
    })
    await vi.waitFor(() => expect(montés(wrapper)).toEqual(['garde=1', 'part=un']))

    await wrapper.setProps({ revision: 1 })

    await vi.waitFor(() => expect(montés(wrapper)).toEqual(['garde=1']))
    expect(échecs(wrapper)).toEqual([
      'Refusé chez neuf : a plugin with a browser surface needs a `name`',
    ])
  })

  // Deux lectures qui se croisent : celle du montage et celle du premier `ready`.
  test('keeps the latest reading when an older one finishes after it', async () => {
    let tardive: (value: unknown) => void = () => {}
    const fetch = vi.fn()
    fetch.mockImplementationOnce(
      () =>
        new Promise(
          (ok) =>
            (tardive = () =>
              ok({
                json: async () => ({
                  panels: [{ name: 'vieux', shell: module('un.ts') }],
                  refused: [{ plugin: 'vieux', reason: 'périmé' }],
                }),
              })),
        ),
    )
    fetch.mockImplementationOnce(async () => ({
      json: async () => ({ panels: [{ name: 'neuf', shell: module('deux.ts') }], refused: [] }),
    }))
    vi.stubGlobal('fetch', fetch)

    const wrapper = mount(Panels, {
      props: { entry: null, received: {}, errors: [], failed: null, revision: 0 },
    })
    await wrapper.setProps({ revision: 1 })
    await vi.waitFor(() => expect(montés(wrapper)).toEqual(['neuf=deux']))

    tardive(undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(montés(wrapper)).toEqual(['neuf=deux'])
    // Ses refus non plus : posés avant le contrôle, ils passaient. Revue de la
    // PR #117.
    expect(échecs(wrapper)).toEqual([])
  })

  test('keeps the latest reading when an older one fails after it', async () => {
    let échoue: (reason: unknown) => void = () => {}
    const fetch = vi.fn()
    fetch.mockImplementationOnce(() => new Promise((_, non) => (échoue = non)))
    fetch.mockImplementationOnce(async () => ({
      json: async () => ({ panels: [{ name: 'neuf', shell: module('deux.ts') }], refused: [] }),
    }))
    vi.stubGlobal('fetch', fetch)

    const wrapper = mount(Panels, {
      props: { entry: null, received: {}, errors: [], failed: null, revision: 0 },
    })
    await wrapper.setProps({ revision: 1 })
    await vi.waitFor(() => expect(montés(wrapper)).toEqual(['neuf=deux']))

    échoue(new Error('réseau coupé'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(échecs(wrapper)).toEqual([])
  })
})

// Deux panneaux qui éditent : remplacer à chaque émission effaçait l'édition de
// l'autre. Fusionnées dans l'ordre de `plugins`, le dernier gagnant. Audit à
// froid du projet 1.3.
describe('what several panels edit', () => {
  test('merges the values of every panel, the later one winning a prop both edit', async () => {
    const wrapper = await monte([
      { name: 'editeur', shell: module('editeur.ts') },
      { name: 'ton', shell: module('ton.ts') },
    ])

    expect(wrapper.emitted('overrides')?.at(-1)).toEqual([{ label: 'du ton', tone: 'warning' }])
  })

  test('keeps the configuration order whatever panel edits last', async () => {
    const wrapper = await monte([
      { name: 'ton', shell: module('ton.ts') },
      { name: 'editeur', shell: module('editeur.ts') },
    ])

    expect(wrapper.emitted('overrides')?.at(-1)).toEqual([{ tone: 'warning', label: 'édité' }])
  })

  // Le second panneau édite avant le premier : l'ordre est celui de `plugins`,
  // pas celui des émissions.
  test('merges in configuration order, not in the order panels edit', async () => {
    const wrapper = await monte([
      { name: 'a', shell: module('un.ts') },
      { name: 'b', shell: module('deux.ts') },
    ])
    const frames = wrapper.findAllComponents({ name: 'PanelFrame' })

    frames[1]?.vm.$emit('overrides', { label: 'de b' })
    frames[0]?.vm.$emit('overrides', { label: 'de a' })

    expect(wrapper.emitted('overrides')?.at(-1)).toEqual([{ label: 'de b' }])
  })

  // La même story relue, un objet neuf au même `id` après une édition de fichier,
  // puis la liste relue au `ready` suivant : chaque panneau garde ses valeurs,
  // comme le shell garde les siennes. Revue de la PR #118.
  test('keeps what each panel edited when the same story is read again', async () => {
    const wrapper = await monte([
      { name: 'editeur', shell: module('editeur.ts') },
      { name: 'ton', shell: module('ton.ts') },
    ])
    await wrapper.setProps({ entry: { id: 'x--meme' } as never })
    const frames = wrapper.findAllComponents({ name: 'PanelFrame' })
    frames[0]?.vm.$emit('overrides', { label: 'gardé' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          panels: [
            { name: 'editeur', shell: module('editeur.ts') },
            { name: 'ton', shell: module('ton.ts') },
          ],
          refused: [],
        }),
      })),
    )
    await wrapper.setProps({ entry: { id: 'x--meme' } as never, revision: 1 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    frames[1]?.vm.$emit('overrides', { tone: 'calm' })

    expect(wrapper.emitted('overrides')?.at(-1)).toEqual([{ label: 'gardé', tone: 'calm' }])
  })

  test('forgets what each panel edited when the story changes', async () => {
    const wrapper = await monte([
      { name: 'editeur', shell: module('editeur.ts') },
      { name: 'ton', shell: module('ton.ts') },
    ])
    const frames = wrapper.findAllComponents({ name: 'PanelFrame' })
    await wrapper.setProps({ entry: { id: 'x--autre' } as never })

    frames[1]?.vm.$emit('overrides', { tone: 'calm' })

    expect(wrapper.emitted('overrides')?.at(-1)).toEqual([{ tone: 'calm' }])
  })
})
