import type { Manifest, PreviewMessage, ShellMessage, StoryEntry } from '@crypte/core/protocol'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, test as base, vi } from 'vitest'
import App from '../src/App.vue'

// Le composant du shell, monté dans un DOM. Il était le plus gros fichier que
// rien n'exécutait hors navigateur : 184 lignes, et la couverture ne pouvait même
// pas le lire faute d'un test qui le charge. Voir docs/internal/architecture.md.

const entry = (id: string, name: string, path: string[], storyFile: string): StoryEntry =>
  ({
    id,
    name,
    path,
    storefile: storyFile,
    storyFile,
    component: { name: 'Badge', file: 'x' },
  }) as never

const badge = entry('badge--defaut', 'Par défaut', ['Badge'], 'stories/Badge.tsx')
const alerte = entry('badge--alerte', 'Alerte', ['Badge'], 'stories/Badge.tsx')
const bouton = entry('bouton--defaut', 'Par défaut', ['Bouton'], 'stories/Bouton.tsx')

interface Ecran {
  wrapper: VueWrapper
  // Les messages que le shell a envoyés à l'iframe.
  envoyés: ShellMessage[]
  // Ce que la preview répond, livré comme le vrai canal le livre : même origine,
  // et la fenêtre de l'iframe pour source, les deux que `createShellChannel`
  // vérifie.
  répond: (message: PreviewMessage) => Promise<void>
  statut: () => string
  noms: () => string[]
}

// Le montage lance `refresh()`, qui attend `fetch` : deux sauts de microtâche
// que `nextTick` seul ne couvre pas. Un tour de macrotâche les vide, et Vue rend
// ensuite. Sans ça, l'arbre était vide dans six cas sur treize.
const vide = async (wrapper: VueWrapper) => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await wrapper.vm.$nextTick()
}

const monte = async (entries: StoryEntry[], échoue = false): Promise<Ecran> => {
  const manifest: Manifest = { version: 1, entries } as never

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (échoue) throw new Error('Unexpected end of JSON input')

      return { json: async () => manifest } as Response
    }),
  )

  const wrapper = mount(App, { attachTo: document.body })
  await vide(wrapper)

  const frame = wrapper.find('iframe').element as HTMLIFrameElement
  const envoyés: ShellMessage[] = []

  frame.contentWindow?.addEventListener('message', (event) =>
    envoyés.push(event.data as ShellMessage),
  )

  return {
    wrapper,
    envoyés,
    répond: async (message) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: window.location.origin,
          source: frame.contentWindow,
        }),
      )
      await vide(wrapper)
    },
    statut: () => wrapper.findAll('p').at(-1)?.text() ?? '',
    noms: () => wrapper.findAll('button').map((one) => one.text()),
  }
}

const test = base.extend<{ écran: Ecran }>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser. Le renommer fait collecter zéro test : mesuré.
  écran: async ({}, use) => {
    const écran = await monte([badge, alerte, bouton])

    await use(écran)

    écran.wrapper.unmount()
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('l’arbre du shell', () => {
  // L'arbre vient du chemin du manifeste, et aucun titre n'est déclaré nulle
  // part : c'est la section 1.1 des contrats.
  test('groupe les stories par chemin, dans l’ordre du manifeste', async ({ écran }) => {
    expect(écran.wrapper.findAll('h2').map((one) => one.text())).toEqual(['Badge', 'Bouton'])
    expect(écran.noms()).toEqual(['Par défaut', 'Alerte', 'Par défaut'])
  })

  test('compte les stories dans la ligne d’état', async ({ écran }) => {
    expect(écran.statut()).toBe('3 stories')
  })

  test('dit qu’il n’y a aucune story sur un catalogue vide', async () => {
    const écran = await monte([])

    expect(écran.wrapper.find('nav p').text()).toBe('aucune story')
    écran.wrapper.unmount()
  })

  // Un catalogue illisible fige l'arbre : sans cette ligne, rien ne dirait
  // pourquoi il a cessé de suivre.
  test('dit pourquoi un catalogue illisible n’a pas été lu', async () => {
    const écran = await monte([badge], true)

    expect(écran.statut()).toBe('catalogue illisible : Unexpected end of JSON input')
    écran.wrapper.unmount()
  })
})

describe('la sélection', () => {
  test('marque la story affichée', async ({ écran }) => {
    await écran.wrapper.findAll('button')[1]?.trigger('click')

    expect(écran.wrapper.findAll('button')[1]?.attributes('aria-current')).toBe('true')
  })

  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  test('n’envoie rien avant que la preview soit prête', async ({ écran }) => {
    await écran.wrapper.findAll('button')[1]?.trigger('click')
    await vide(écran.wrapper)

    expect(écran.envoyés).toEqual([])
  })

  test('envoie le rendu de la story cliquée une fois la preview prête', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await écran.wrapper.findAll('button')[1]?.trigger('click')

    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {} })
  })

  // `ready` est aussi ce que dit une preview rechargée : il relit le catalogue,
  // et c'est ce qui évite d'ajouter un message au protocole.
  //
  // La ligne « preview prête, protocole v1 » n'est pas assertionnée parce qu'elle
  // n'est jamais visible : `refresh()` la remplace par le compte dans le même
  // tour. Trouvé par ce cas, consigné dans docs/internal/suivi.md.
  test('relit le catalogue et rend la première story sur ready', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(écran.statut()).toBe('3 stories')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {} })
  })
})

describe('ce que la preview répond', () => {
  test('dit la durée d’un rendu', async ({ écran }) => {
    await écran.répond({
      type: 'rendered',
      id: 'badge--defaut',
      durationMs: 12.34,
    } as PreviewMessage)

    expect(écran.statut()).toBe('badge--defaut rendu en 12.3 ms')
  })

  // Une story qui échoue laisse un cadre vide, et un cadre vide sans message
  // ressemble à un outil cassé.
  test('affiche l’erreur d’un rendu, avec sa pile', async ({ écran }) => {
    await écran.répond({
      type: 'error',
      id: 'badge--defaut',
      message: 'ce composant ne rend jamais',
      stack: 'at Boum',
    } as PreviewMessage)

    const alerte = écran.wrapper.find('[role="alert"]')

    expect(alerte.exists()).toBe(true)
    expect(alerte.text()).toContain('ce composant ne rend jamais')
    expect(alerte.find('pre').text()).toBe('at Boum')
    expect(écran.statut()).toBe('erreur de rendu')
  })

  // Le cadre de la story d'avant ne doit plus être visible : le laisser ferait
  // croire que celle-ci a rendu.
  test('cache le cadre pendant qu’une erreur est affichée', async ({ écran }) => {
    await écran.répond({
      type: 'error',
      id: 'badge--defaut',
      message: 'boum',
    } as PreviewMessage)

    expect(écran.wrapper.find('iframe').attributes('style')).toContain('display: none')
  })

  test('retire l’erreur quand on change de story', async ({ écran }) => {
    await écran.répond({ type: 'error', id: 'badge--defaut', message: 'boum' } as PreviewMessage)
    await écran.wrapper.findAll('button')[1]?.trigger('click')

    expect(écran.wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  // Ni un message d'une autre origine ni un message venu d'ailleurs que l'iframe
  // ne doivent être crus : c'est ce que le canal filtre.
  test('ignore un message d’une autre origine', async ({ écran }) => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'error', id: 'x', message: 'injecté' },
        origin: 'https://ailleurs.example',
      }),
    )
    await écran.wrapper.vm.$nextTick()

    expect(écran.wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
