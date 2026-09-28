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

const monte = async (liste: unknown): Promise<VueWrapper> => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (liste instanceof Error) throw liste
      return { json: async () => liste } as Response
    }),
  )

  const wrapper = mount(Panels, { props: { entry: null } })

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

  test('names the list when it cannot be read', async () => {
    const wrapper = await monte(new Error('Unexpected end of JSON input'))

    expect(montés(wrapper)).toEqual([])
    expect(échecs(wrapper)).toEqual([
      "la liste des plugins n'a pas pu se charger : Unexpected end of JSON input",
    ])
  })
})
