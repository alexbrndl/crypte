import type {
  Manifest,
  ManifestEntry,
  PreviewMessage,
  ShellMessage,
  StoryEntry,
  TokensEntry,
} from '@crypte/core/protocol'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test as base, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import App from '../src/App.vue'
import { Select, Tooltip } from '@crypte/ui'
import ActivityBar from '../src/navigation/activity-bar.vue'
import Panels from '../src/panels/panels.vue'
import StoryTree from '../src/navigation/story-tree.vue'

// Le composant du shell, monté dans un DOM. Il était le plus gros fichier que
// rien n'exécutait hors navigateur : 184 lignes, et la couverture ne pouvait même
// pas le lire faute d'un test qui le charge.

// Entrée complète, et sans `as never` : la version d'avant n'avait pas de champ
// `type`, ce que le transtypage taisait. Le shell ne lisait donc que des entrées
// qu'aucun producteur n'écrit, et douze cas d'ici en dépendaient.
const entry = (id: string, name: string, path: string[], storyFile: string): StoryEntry => ({
  type: 'story',
  id,
  name,
  path,
  storyFile,
  component: { name: 'Badge', file: 'x', export: 'default' },
  options: {},
  details: {},
  props: [],
  source: '<Badge />',
})

const badge = entry('badge--defaut', 'Par défaut', ['Badge'], 'stories/Badge.tsx')
const alerte = entry('badge--alerte', 'Alerte', ['Badge'], 'stories/Badge.tsx')
const bouton = entry('bouton--defaut', 'Par défaut', ['Bouton'], 'stories/Bouton.tsx')

const jetons: TokensEntry = {
  type: 'tokens',
  id: 'color--brand',
  path: ['Color'],
  name: 'Brand',
  tokens: { primary: { type: 'color', themes: { light: { value: '#4fe0a0' } } } },
}

interface Ecran {
  wrapper: VueWrapper
  // Les messages que le shell a envoyés à l'iframe.
  envoyés: ShellMessage[]
  // Ce que la preview répond, livré comme le vrai canal le livre : même origine,
  // et la fenêtre de l'iframe pour source, les deux que `createShellChannel`
  // vérifie.
  répond: (message: PreviewMessage) => Promise<void>
  statut: () => string
  // Les noms des stories de l'arbre, puis ceux des dossiers et des composants.
  noms: () => string[]
  branches: () => string[]
  story: (at: number) => DOMWrapper<Element>
  // L'entrée de l'activity bar qui porte ce libellé.
  vue: (label: string) => DOMWrapper<Element>
  écartés: () => string[]
  partielle: () => string | false
}

// Le montage lance `refresh()`, qui attend `fetch` : deux sauts de microtâche
// que `nextTick` seul ne couvre pas. Un tour de macrotâche les vide, et Vue rend
// ensuite. Sans ça, l'arbre était vide dans six cas sur treize.
const vide = async (wrapper: VueWrapper) => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await wrapper.vm.$nextTick()
}

// `location.reload` ne se redéfinit pas sous jsdom : la fenêtre de la preview est
// remplacée le temps du clic.
async function rechargeAuClic(frame: HTMLIFrameElement, clic: () => Promise<void>) {
  const reload = vi.fn()
  Object.defineProperty(frame, 'contentWindow', {
    configurable: true,
    value: { location: { reload } },
  })
  await clic()
  Reflect.deleteProperty(frame, 'contentWindow')
  return reload
}

// Le thème du système et la largeur de la fenêtre, que jsdom ne connaît pas :
// clair et large au départ, chaque écouteur gardé pour simuler un changement.
const système = {
  sombre: false,
  étroit: false,
  écouteurs: [] as ((event: MediaQueryListEvent) => void)[],
  largeurs: [] as ((event: MediaQueryListEvent) => void)[],
}
const change = (sombre: boolean) => {
  système.sombre = sombre
  for (const one of système.écouteurs) one({ matches: sombre } as MediaQueryListEvent)
}
const rétrécit = (étroit: boolean) => {
  système.étroit = étroit
  for (const one of système.largeurs) one({ matches: !étroit } as MediaQueryListEvent)
}

// Ce que répond la route de la vue santé, rendu à son défaut après chaque cas.
let santé: () => unknown = () => ({ components: null })

const monte = async (
  entries: ManifestEntry[],
  échoue = false,
  skipped?: { file: string; reason: string }[],
  // Ce que répond la route des changements, ou ce qu'elle lève, selon sa requête.
  changements: (url: string) => unknown = () => ({
    from: { ref: 'HEAD', commit: 'abcdef0' },
    changes: [],
    tokens: [],
  }),
  // Ce que dit la route du projet.
  projet: () => unknown = () => ({
    stories: 'stories',
    config: null,
    shellBytes: 83149,
    version: '1.2.3',
  }),
): Promise<Ecran> => {
  const manifest: Manifest = { version: 1, entries, ...(skipped ? { skipped } : {}) } as never

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      // Les panneaux de plugins lisent leur propre route : aucun plugin ici.
      if (url === '/@crypte/plugins.json')
        return { json: async () => ({ panels: [], refused: [], weights: [] }) } as Response
      // La vue versions lit sa propre route : rien n'a changé ici. Et les points de
      // départ que le CLI propose.
      if (url.startsWith('/@crypte/changes.json'))
        return { json: async () => changements(url) } as Response
      if (url === '/@crypte/versions.json')
        return {
          json: async () => ({
            branch: 'main',
            tags: [{ name: 'v1.0.0', date: '2026-01-01T00:00:00.000Z' }],
          }),
        } as Response
      if (url === '/@crypte/project.json') return { json: async () => projet() } as Response
      if (url === '/@crypte/health.json') return { json: async () => santé() } as Response
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
    écartés: () => wrapper.findAll('.set-aside li').map((one) => one.text()),
    partielle: () => wrapper.find('.partial').exists() && wrapper.find('.partial').text(),
    noms: () => wrapper.findAll('[role="treeitem"].story .name').map((one) => one.text()),
    branches: () =>
      wrapper.findAll('[role="treeitem"]:not(.story):not(.tokens) .name').map((one) => one.text()),
    story: (at) => wrapper.findAll('[role="treeitem"].story')[at]!,
    vue: (label) =>
      wrapper.findAll('.activity-bar .item').find((one) => one.find('.label').text() === label) ??
      wrapper.find('.activity-bar .absent'),
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

beforeEach(() => {
  // Reka fait défiler jusqu'à l'option surlignée de la palette ; jsdom n'a pas de
  // défilement.
  Element.prototype.scrollIntoView = () => {}
  vi.stubGlobal('matchMedia', (query: string) => {
    const largeur = query.includes('width')
    const liste = largeur ? 'largeurs' : 'écouteurs'
    return {
      matches: largeur ? !système.étroit : système.sombre,
      addEventListener: (_: string, one: (event: MediaQueryListEvent) => void) =>
        système[liste].push(one),
      removeEventListener: (_: string, one: (event: MediaQueryListEvent) => void) =>
        (système[liste] = système[liste].filter((other) => other !== one)),
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // L'adresse et le stockage survivent au démontage : sans ça, la story cliquée
  // par un cas devenait la première affichée du suivant.
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  système.sombre = false
  système.étroit = false
  santé = () => ({ components: null })
  delete document.documentElement.dataset.theme
})

describe('the shell tree', () => {
  // L'arbre vient du chemin du manifeste, et aucun titre n'est déclaré nulle
  // part : c'est la section 1.1 des contrats.
  test('groups stories by path, in manifest order', async ({ écran }) => {
    expect(écran.branches()).toEqual(['Badge', 'Bouton'])
    expect(écran.noms()).toEqual(['Par défaut', 'Alerte', 'Par défaut'])
  })

  // Une famille n'a pas de composant : tout son chemin est fait de dossiers. Elle
  // est de la vue tokens, que l'arbre des stories ne montre pas.
  test('keeps a tokens family out of the tree, for the categories of the tokens view', async () => {
    const écran = await monte([badge, jetons])

    expect(écran.noms()).toEqual(['Par défaut'])
    expect(écran.branches()).toEqual(['Badge'])
    await écran.vue('tokens').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(écran.wrapper.find('[role="tree"]').exists()).toBe(false)
    expect(
      écran.wrapper
        .findAll('.sidebar li a')
        .map((one) => `${one.find('.label').text()} ${one.find('.count').text()}`),
    ).toEqual(['palette 1'])
    écran.wrapper.unmount()
  })

  // Mesuré : retirer le filtre de `refresh` laissait les 675 cas au vert, aucun
  // n'envoyant autre chose que des stories dans le manifeste. `page` est réservé
  // (§4.2) : ce que le shell ne sait pas dessiner, il l'ignore.
  test('does not show a nature it cannot draw', async () => {
    const page = { type: 'page', id: 'guide', path: ['Guides'], name: 'Guide' }
    const écran = await monte([badge, page as never])

    expect(écran.branches()).toEqual(['Badge'])
    expect(écran.wrapper.findAll('[role="treeitem"]')).toHaveLength(2)
    écran.wrapper.unmount()
  })

  // La ligne d'état dit des stories, donc elle compte des stories. Sans ce cas,
  // elle annonçait le total des entrées sous le mot « stories ».
  test('counts only stories in the status line', async () => {
    const écran = await monte([badge, alerte, jetons])

    expect(écran.statut()).toBe('2 stories')
    écran.wrapper.unmount()
  })

  test('says there is no story on an empty catalog', async () => {
    const écran = await monte([])

    expect(écran.wrapper.find('.sidebar p').text()).toBe('No story.')
    écran.wrapper.unmount()
  })

  // Un catalogue illisible fige l'arbre : sans cette ligne, rien ne dirait
  // pourquoi il a cessé de suivre.
  test('says why an unreadable catalog was not read', async () => {
    const écran = await monte([badge], true)

    expect(écran.statut()).toBe('the catalogue could not be read: Unexpected end of JSON input')
    écran.wrapper.unmount()
  })
})

describe('the selection', () => {
  test('marks the displayed story', async ({ écran }) => {
    await écran.story(1).trigger('click')

    expect(écran.story(1).attributes('aria-selected')).toBe('true')
  })

  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  test('sends nothing before the preview is ready', async ({ écran }) => {
    await écran.story(1).trigger('click')
    await vide(écran.wrapper)

    expect(écran.envoyés).toEqual([])
  })

  test('sends the render of the clicked story once the preview is ready', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await écran.story(1).trigger('click')

    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {}, theme: 'light' })
  })

  // `ready` est aussi ce que dit une preview rechargée : il relit le catalogue,
  // et c'est ce qui évite d'ajouter un message au protocole.
  //
  // La ligne « preview prête, protocole v1 » n'est pas assertionnée parce qu'elle
  // n'est jamais visible : `refresh()` la remplace par le compte dans le même
  // tour. Trouvé par ce cas.
  test('rereads the catalog and renders the first story on ready', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(écran.statut()).toBe('3 stories')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {}, theme: 'light' })
  })
})

// Ce qu'un panneau a édité, par-dessus les props de la story : envoyé dans
// `render`, lâché quand on change de story, gardé quand la preview redit `ready`
// sur la même.
// Les messages de plugin, section 5.4, et ce que la preview dit d'un plugin qui a
// échoué, section 5.3 : rangés sous le nom du plugin, et oubliés quand une
// preview rechargée redit `ready`.
describe('what a plugin says between its halves', () => {
  const panneaux = (écran: Ecran) => écran.wrapper.findComponent(Panels)

  test('hands each panel the last message of its preview module', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    await écran.répond({ type: 'a:resultats', n: 1 } as unknown as PreviewMessage)
    await écran.répond({ type: 'a:resultats', n: 2 } as unknown as PreviewMessage)
    await écran.répond({ type: 'b:pong' } as unknown as PreviewMessage)

    expect(panneaux(écran).props('received')).toEqual({
      a: { type: 'a:resultats', n: 2 },
      b: { type: 'b:pong' },
    })
  })

  // Chaque `ready` fait relire la liste des plugins aux panneaux : c'est ce que
  // dit une preview rechargée après une édition de la configuration.
  test('asks the panels to read their list again at each ready', async ({ écran }) => {
    expect(panneaux(écran).props('revision')).toBe(0)

    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(panneaux(écran).props('revision')).toBe(2)
  })

  // La preview qui quitte sa page n'écoute plus : le message était perdu sans
  // trace, `ready` restant vrai. Audit à froid du projet 1.3.
  test('drops and names a message sent while the preview reloads', async ({ écran }) => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    const frame = écran.wrapper.find('iframe').element as HTMLIFrameElement

    frame.contentWindow?.dispatchEvent(new Event('pagehide'))
    panneaux(écran).vm.$emit('send', { type: 'hello:ping' })

    expect(erreur).toHaveBeenCalledWith(
      'crypte: `hello:ping` was sent before the preview was ready, and dropped',
    )
    expect(écran.envoyés.map((one) => one.type)).not.toContain('hello:ping')
  })

  test('shows what the preview says of a plugin that failed', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    await écran.répond({ type: 'plugin-error', plugin: 'a', message: 'boum' })

    expect(panneaux(écran).props('errors')).toEqual([{ plugin: 'a', message: 'boum' }])
  })

  // Une preview rechargée redit ce qui échoue encore : le garder doublerait
  // chaque ligne, et une erreur réparée survivrait à sa cause.
  test('forgets both when the preview says ready again', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await écran.répond({ type: 'a:resultats' } as unknown as PreviewMessage)
    await écran.répond({ type: 'plugin-error', plugin: 'a', message: 'boum' })

    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect([panneaux(écran).props('received'), panneaux(écran).props('errors')]).toEqual([{}, []])
  })

  // Une fois chacune : un hook qui lève à chaque rendu empilait des lignes
  // identiques. Revue de la PR #107.
  test('shows each failure once, however often the preview repeats it', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    await écran.répond({ type: 'plugin-error', plugin: 'a', message: 'boum' })
    await écran.répond({ type: 'plugin-error', plugin: 'a', message: 'boum' })
    await écran.répond({ type: 'plugin-error', plugin: 'a', message: 'autre' })

    expect(panneaux(écran).props('errors')).toEqual([
      { plugin: 'a', message: 'boum' },
      { plugin: 'a', message: 'autre' },
    ])
  })

  // Avant `ready`, le message est perdu comme un `render` le serait, mais dit.
  test('sends what a panel sends, once the preview is ready', async ({ écran }) => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    panneaux(écran).vm.$emit('send', { type: 'a:run' })
    await vide(écran.wrapper)
    expect(écran.envoyés).toEqual([])
    expect(erreur).toHaveBeenCalledWith(
      'crypte: `a:run` was sent before the preview was ready, and dropped',
    )
    erreur.mockRestore()

    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    panneaux(écran).vm.$emit('send', { type: 'a:run' })

    await expect.poll(() => écran.envoyés.at(-1)).toEqual({ type: 'a:run' })
  })
})

describe('the values a panel edited', () => {
  const édite = (écran: Ecran, values: Record<string, unknown>) =>
    écran.wrapper.findComponent(Panels).vm.$emit('overrides', values)

  test('renders the story with them', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    édite(écran, { label: 'Bonjour' })

    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({
        type: 'render',
        id: 'badge--defaut',
        overrides: { label: 'Bonjour' },
        theme: 'light',
      })
  })

  test('drops them when another story is shown', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    édite(écran, { label: 'Bonjour' })

    await écran.story(1).trigger('click')

    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {}, theme: 'light' })
  })

  // Sans story affichée, rien ne part : il n'y a rien à rendre.
  test('sends nothing while no story is on display', async () => {
    const écran = await monte([])
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    const avant = écran.envoyés.length

    édite(écran, { label: 'Bonjour' })
    await vide(écran.wrapper)

    expect(écran.envoyés).toHaveLength(avant)
    écran.wrapper.unmount()
  })

  // `ready` revient après une édition de fichier : la story reste affichée, et
  // ce qu'on vient de saisir aussi.
  test('keeps them when the preview says ready again on the same story', async ({ écran }) => {
    const rendu = {
      type: 'render',
      id: 'badge--defaut',
      overrides: { label: 'Bonjour' },
      theme: 'light',
    }
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    édite(écran, { label: 'Bonjour' })
    await expect.poll(() => écran.envoyés.at(-1)).toEqual(rendu)
    const avant = écran.envoyés.length

    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    // Le `render` de ce `ready`, et pas celui de l'édition, qui portait déjà les
    // valeurs : lu sans ce compte, le cas passait avec des valeurs perdues.
    // Revue de la PR #106.
    await expect.poll(() => écran.envoyés.length).toBeGreaterThan(avant)
    expect(écran.envoyés.at(-1)).toEqual(rendu)
  })
})

describe('what the preview answers', () => {
  // La durée de rendu d'une story n'est plus dite : la barre d'état ne porte que
  // des chiffres sur lesquels on peut agir.
  test('states that a story rendered, without its duration', async ({ écran }) => {
    await écran.répond({
      type: 'rendered',
      id: 'badge--defaut',
      durationMs: 12.34,
    } as PreviewMessage)

    expect(écran.statut()).toBe('badge--defaut rendered')
  })

  // Ce que la story affichée a rendu, et seulement elle : un `rendered` d'une
  // autre story, arrivé entre-temps, ne remplit pas les champs de celle-ci.
  test('hands the panels what the story on display rendered with', async ({ écran }) => {
    const valeurs = () => écran.wrapper.findComponent(Panels).props('values')
    expect(valeurs()).toBeNull()

    await écran.répond({
      type: 'rendered',
      id: 'badge--defaut',
      durationMs: 1,
      values: { label: 'Nouveau' },
    } as PreviewMessage)
    expect(valeurs()).toEqual({ label: 'Nouveau' })

    await écran.répond({
      type: 'rendered',
      id: 'badge--alerte',
      durationMs: 1,
      values: { label: 'Alerte' },
    } as PreviewMessage)
    expect(valeurs()).toBeNull()
  })

  // Une story qui échoue laisse un cadre vide, et un cadre vide sans message
  // ressemble à un outil cassé.
  test('shows a render error, with its stack', async ({ écran }) => {
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
    expect(écran.statut()).toBe('render error')
    // Le point de la barre d'état passe au rouge avec elle, et pas sous une page.
    expect(écran.wrapper.find('.status-bar .dot').attributes('data-failed')).toBe('true')
    await écran.wrapper.find('nav.trail a').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(écran.wrapper.find('.status-bar .dot').attributes('data-failed')).toBeUndefined()
  })

  test('keeps the status dot green on a story that rendered, red on an unread catalogue', async ({
    écran,
  }) => {
    await écran.répond({ type: 'rendered', id: 'badge--defaut', durationMs: 1 } as PreviewMessage)
    expect(écran.wrapper.find('.status-bar .dot').attributes('data-failed')).toBeUndefined()

    const illisible = await monte([badge], true)
    expect(illisible.wrapper.find('.status-bar .dot').attributes('data-failed')).toBe('true')
    illisible.wrapper.unmount()
  })

  // Le cadre de la story d'avant ne doit plus être visible : le laisser ferait
  // croire que celle-ci a rendu.
  test('hides the frame while an error is shown', async ({ écran }) => {
    await écran.répond({
      type: 'error',
      id: 'badge--defaut',
      message: 'boum',
    } as PreviewMessage)

    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)
  })

  // Les panneaux le reçoivent aussi : `a11y` attendait sinon une analyse qui ne
  // viendrait pas. Audit à froid du projet 1.3.
  test('hands the panels the render error of the story on display', async ({ écran }) => {
    const panneaux = écran.wrapper.findComponent(Panels)
    expect(panneaux.props('failed')).toBeNull()

    await écran.répond({ type: 'error', id: 'badge--defaut', message: 'boum' } as PreviewMessage)
    expect(panneaux.props('failed')).toBe('boum')

    await écran.répond({ type: 'rendered', id: 'badge--defaut', durationMs: 1 } as PreviewMessage)
    expect(panneaux.props('failed')).toBeNull()
  })

  test('removes the error when the story changes', async ({ écran }) => {
    await écran.répond({ type: 'error', id: 'badge--defaut', message: 'boum' } as PreviewMessage)
    await écran.story(1).trigger('click')

    expect(écran.wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

// Les deux étages de ce que le catalogue a laissé de côté. L'erreur est visible
// sans qu'on la cherche, parce que la story écartée est absente de l'arbre ;
// l'avertissement est discret, parce que la story rend. `DCJ-217`.
describe('what the catalog left out', () => {
  // Le compte vient des entrées : dire « ignoré » d'un fichier qui a rendu deux
  // stories sur trois serait faux, et c'est le piège que l'issue nomme.
  test('says how much the file still yielded', async () => {
    const écran = await monte([badge, alerte], false, [
      {
        file: 'stories/Badge.tsx',
        reason: 'stories left out: one whose key is computed at runtime',
      },
      { file: 'stories/Seul.tsx', reason: 'the stories block is not an object literal' },
    ])

    expect(écran.écartés()).toEqual([
      'stories/Badge.tsx: 2 stories read, some are missing. stories left out: one whose key is computed at runtime',
      'stories/Seul.tsx: no story read. the stories block is not an object literal',
    ])
    écran.wrapper.unmount()
  })

  // La fiche partielle suit la story affichée, pas le fichier : deux stories du
  // même fichier peuvent perdre des props différentes.
  test('shows the note of the displayed story, and of it alone', async () => {
    const partielle = { ...badge, partial: '`...base` brings props this reader cannot follow' }
    const écran = await monte([partielle as never, alerte])

    expect(écran.partielle()).toBe(
      'Incomplete props table: `...base` brings props this reader cannot follow.',
    )

    await écran.story(1).trigger('click')
    await écran.wrapper.vm.$nextTick()

    expect(écran.partielle()).toBe(false)
    écran.wrapper.unmount()
  })

  // La note dit « la story rend », donc elle ne s'affiche pas à côté d'un échec
  // de rendu, où l'encart rouge remplace justement l'iframe.
  test('removes the note when the story does not render', async () => {
    const partielle = { ...badge, partial: '`...base` brings props this reader cannot follow' }
    const écran = await monte([partielle as never])

    expect(écran.partielle()).toContain('Incomplete props table')

    await écran.répond({
      type: 'error',
      id: 'badge--defaut',
      message: 'ce composant ne rend jamais',
    } as PreviewMessage)

    expect(écran.partielle()).toBe(false)
    écran.wrapper.unmount()
  })

  // Une erreur qui arrive après un changement de story ne concerne plus l'écran :
  // elle couvrait la story suivante et masquait sa note. Mesuré en revue.
  test('ignores the error of a story already left', async () => {
    const partielle = { ...alerte, partial: '`...base` brings props this reader cannot follow' }
    const écran = await monte([badge, partielle as never])

    await écran.story(1).trigger('click')
    await écran.wrapper.vm.$nextTick()

    await écran.répond({
      type: 'error',
      id: 'badge--defaut',
      message: 'ce composant ne rend jamais',
    } as PreviewMessage)

    expect(écran.wrapper.find('.failure').exists()).toBe(false)
    expect(écran.partielle()).toContain('Incomplete props table')
    écran.wrapper.unmount()
  })

  // Le cas qui compte pour l'utilisateur : il corrige son fichier, la preview
  // redit `ready`, et le bandeau doit partir. Un avertissement qui survit à sa
  // cause apprend à ne plus le lire.
  test('removes the banner when the fixed file no longer calls for it', async () => {
    const manifests: Manifest[] = [
      {
        version: 1,
        entries: [badge],
        skipped: [{ file: 'stories/Badge.tsx', reason: 'raison' }],
      } as never,
      { version: 1, entries: [badge, alerte] } as never,
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [], weights: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
                  : url === '/@crypte/health.json'
                    ? { components: null }
                    : url === '/@crypte/project.json'
                      ? { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' }
                      : (manifests.shift() ?? manifests[0]),
          }) as Response,
      ),
    )

    const wrapper = mount(App, { attachTo: document.body })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.set-aside li')).toHaveLength(1)

    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ready', protocolVersion: 1 },
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.set-aside li')).toHaveLength(0)
    wrapper.unmount()
  })
})

// L'adresse nomme la story affichée : c'est ce qu'on colle dans une pull request.
describe('the address', () => {
  test('writes the story it shows, as a step of the history', async ({ écran }) => {
    const avant = window.history.length

    await écran.story(1).trigger('click')

    expect(window.location.search).toBe('?id=badge--alerte')
    expect(window.history.length).toBe(avant + 1)
  })

  // Reka redit la sélection quand on reclique la story affichée.
  test('adds no step when the story shown is clicked again', async ({ écran }) => {
    const avant = window.history.length

    await écran.story(1).trigger('click')
    await écran.story(1).trigger('click')

    expect(window.history.length).toBe(avant + 1)
  })

  // L'adresse d'arrivée ne vaut qu'une fois : chaque `ready`, que la preview dit
  // à chaque rechargement, ramenait sinon à la story du lien collé.
  test('forgets the address it arrived at once a story is picked', async () => {
    window.history.replaceState(null, '', '/?id=badge--alerte')
    const écran = await monte([badge, alerte, bouton])

    await écran.story(2).trigger('click')
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(écran.story(2).attributes('aria-selected')).toBe('true')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'bouton--defaut', overrides: {}, theme: 'light' })
    écran.wrapper.unmount()
  })

  // Arriver sur la première story n'est pas un pas : précédent ramènerait à une
  // adresse qui ne nomme rien.
  test('names the first story without adding a step', async () => {
    const avant = window.history.length
    const écran = await monte([badge, alerte])

    expect(window.location.search).toBe('?id=badge--defaut')
    expect(window.history.length).toBe(avant)
    écran.wrapper.unmount()
  })

  test('opens the story its address names', async () => {
    window.history.replaceState(null, '', '/?id=badge--alerte')
    const écran = await monte([badge, alerte, bouton])

    expect(écran.story(1).attributes('aria-selected')).toBe('true')
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {}, theme: 'light' })
    écran.wrapper.unmount()
  })

  test('falls back on the first story when its address names none', async () => {
    window.history.replaceState(null, '', '/?id=disparue')
    const écran = await monte([badge, alerte])

    expect(écran.story(0).attributes('aria-selected')).toBe('true')
    expect(window.location.search).toBe('?id=badge--defaut')
    écran.wrapper.unmount()
  })

  test('follows the back and forward buttons, without adding a step', async ({ écran }) => {
    await écran.story(2).trigger('click')
    const avant = window.history.length

    window.history.replaceState(null, '', '/?id=badge--alerte')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)

    expect(écran.story(1).attributes('aria-selected')).toBe('true')
    expect(window.history.length).toBe(avant)
  })

  test('stays on its story when the history goes to an address naming none', async ({ écran }) => {
    await écran.story(1).trigger('click')

    window.history.replaceState(null, '', '/?id=disparue')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)

    expect(écran.story(1).attributes('aria-selected')).toBe('true')
  })

  test('stops following the address and the focus once unmounted', async () => {
    const ajoute = vi.spyOn(window, 'addEventListener')
    const retire = vi.spyOn(window, 'removeEventListener')
    const écran = await monte([badge])
    const suivi = ajoute.mock.calls.find(([type]) => type === 'popstate')?.[1]
    const focus = ajoute.mock.calls.find(([type]) => type === 'focus')?.[1]

    écran.wrapper.unmount()

    expect(suivi).toBeTypeOf('function')
    expect(retire).toHaveBeenCalledWith('popstate', suivi)
    expect(focus).toBeTypeOf('function')
    expect(retire).toHaveBeenCalledWith('focus', focus)
    ajoute.mockRestore()
    retire.mockRestore()
  })
})

describe('the keyboard', () => {
  test('shows a story on Enter', async ({ écran }) => {
    await écran.story(2).trigger('keydown', { key: 'Enter' })
    await vide(écran.wrapper)

    expect(écran.story(2).attributes('aria-selected')).toBe('true')
    expect(window.location.search).toBe('?id=bouton--defaut')
  })
})

describe('folding the tree', () => {
  const branche = (écran: Ecran, nom: string) =>
    écran.wrapper
      .findAll('[role="treeitem"]:not(.story)')
      .find((one) => one.find('.name').text() === nom)!

  test('folds a component, and remembers it at the next visit', async ({ écran }) => {
    await branche(écran, 'Bouton').find('.chevron').trigger('click')
    await vide(écran.wrapper)

    expect(écran.noms()).toEqual(['Par défaut', 'Alerte'])

    écran.wrapper.unmount()
    const ensuite = await monte([badge, alerte, bouton])

    expect(ensuite.noms()).toEqual(['Par défaut', 'Alerte'])
    expect(ensuite.branches()).toEqual(['Badge', 'Bouton'])
    ensuite.wrapper.unmount()
  })

  // Ce qui est retenu est ce qui est replié : un composant arrivé depuis s'ouvre.
  test('opens a component it has never seen', async () => {
    localStorage.setItem('crypte:tree:folded', JSON.stringify(['component:bouton']))
    const nouveau = entry('nouveau--defaut', 'Neuf', ['Nouveau'], 'stories/Nouveau.tsx')
    const écran = await monte([badge, bouton, nouveau])

    expect(écran.noms()).toEqual(['Par défaut', 'Neuf'])
    écran.wrapper.unmount()
  })

  test('unfolds what holds the story its address names', async () => {
    localStorage.setItem('crypte:tree:folded', JSON.stringify(['component:badge']))
    window.history.replaceState(null, '', '/?id=badge--alerte')
    const écran = await monte([badge, alerte, bouton])

    expect(écran.noms()).toEqual(['Par défaut', 'Alerte', 'Par défaut'])
    expect(écran.story(1).attributes('aria-selected')).toBe('true')
    écran.wrapper.unmount()
  })

  test.each(['{"component:badge": true}', 'component:badge'])(
    'reads a stored value that is not a list, %j, as nothing folded',
    async (stored) => {
      localStorage.setItem('crypte:tree:folded', stored)
      const écran = await monte([badge, bouton])

      expect(écran.noms()).toEqual(['Par défaut', 'Par défaut'])
      écran.wrapper.unmount()
    },
  )
})

// Le shell n'a plus de champ à lui, la palette mise à part : un champ posé à
// côté porte les frappes « pendant une saisie ».
const champ = () => {
  const one = document.createElement('input')
  document.body.append(one)
  return one
}

const avec = (one: StoryEntry, status: NonNullable<StoryEntry['meta']>['status']) => ({
  ...one,
  meta: { status },
})
const grisés = (wrapper: VueWrapper) =>
  wrapper.findAll('[role="treeitem"][data-dimmed] .name').map((one) => one.text())
const filtre = (wrapper: VueWrapper) => wrapper.find('[aria-label="Filter by status"]')
const états = (wrapper: VueWrapper) =>
  filtre(wrapper)
    .findAll('button')
    .map((one) => one.attributes('data-state'))

describe('the status', () => {
  test('offers no filter when no component declares a status', async ({ écran }) => {
    expect(filtre(écran.wrapper).exists()).toBe(false)
  })

  // Il grise et n'enlève rien : l'arbre garde sa forme et ses replis.
  test('greys the components of another status, one at a time, until all', async () => {
    const écran = await monte([
      avec(badge, 'stable'),
      avec(alerte, 'stable'),
      avec(bouton, 'draft'),
    ])
    const onglets = () => filtre(écran.wrapper).findAll('button')

    expect(onglets().map((one) => one.text())).toEqual(['all', 'draft', 'stable'])
    expect(grisés(écran.wrapper)).toEqual([])

    await onglets()[1]!.trigger('click')
    await vide(écran.wrapper)
    expect(écran.branches()).toEqual(['Badge', 'Bouton'])
    expect(grisés(écran.wrapper)).toEqual(['Badge', 'Par défaut', 'Alerte'])

    await onglets()[0]!.trigger('click')
    await vide(écran.wrapper)
    expect(grisés(écran.wrapper)).toEqual([])

    // Recliquer l'onglet choisi revient à tous, plutôt qu'à aucun onglet.
    await onglets()[1]!.trigger('click')
    await onglets()[1]!.trigger('click')
    await vide(écran.wrapper)
    expect(grisés(écran.wrapper)).toEqual([])
    expect(onglets()[0]!.attributes('data-state')).toBe('on')
    écran.wrapper.unmount()
  })
})

// Les guides au centre du chevron de chaque ancêtre ; la ligne choisie remplace celui
// de son parent par son marqueur, d'où part sa bande (composant row du fichier Figma).
describe('the rows of the tree', () => {
  const ligne = (wrapper: VueWrapper, nom: string) =>
    wrapper.findAll('[role="treeitem"]').find((one) => one.find('.name').text() === nom)!
  const gauches = (row: DOMWrapper<Element>, sélecteur: string) =>
    row.findAll(sélecteur).map((one) => (one.element as HTMLElement).style.left)

  test('draws one guide per ancestor, and a marker in place of the parent one', () => {
    const plié = {
      ...entry('checkout/ordersummary--x', 'X', ['checkout', 'OrderSummary'], 'stories/O.tsx'),
    }
    const wrapper = mount(StoryTree, {
      props: {
        entries: [plié, badge, jetons],
        current: plié.id,
        component: null,
        label: 'Stories',
        none: 'no story',
      },
    })

    expect(gauches(ligne(wrapper, 'checkout'), '.guide')).toEqual([])
    expect(gauches(ligne(wrapper, 'OrderSummary'), '.guide')).toEqual(['20px'])
    expect(gauches(ligne(wrapper, 'X'), '.guide')).toEqual(['20px'])
    expect(gauches(ligne(wrapper, 'X'), '.marker')).toEqual(['32px'])
    expect(gauches(ligne(wrapper, 'X'), '.band')).toEqual(['32px'])
    expect(gauches(ligne(wrapper, 'Par défaut'), '.marker')).toEqual([])
    expect(ligne(wrapper, 'checkout').find('.meta').text()).toBe('1')
    // Une famille compte comme une story.
    expect(ligne(wrapper, 'Color').find('.meta').text()).toBe('1')
    wrapper.unmount()
  })
})

describe('folding out of view', () => {
  // Un fichier cassé retire un composant un instant : son repli survit à ce qu'on
  // replie pendant son absence.
  test('keeps folded what left the tree while something else was folded', async () => {
    const branche = (wrapper: VueWrapper, nom: string) =>
      wrapper
        .findAll('[role="treeitem"]:not(.story)')
        .find((one) => one.find('.name').text() === nom)!
    const wrapper = mount(StoryTree, {
      props: {
        entries: [badge, bouton],
        current: null,
        component: null,
        label: 'Stories',
        none: 'no story',
      },
    })

    await branche(wrapper, 'Badge').find('.chevron').trigger('click')
    await wrapper.setProps({ entries: [bouton] })
    await branche(wrapper, 'Bouton').find('.chevron').trigger('click')
    await wrapper.setProps({ entries: [badge, bouton] })

    expect(wrapper.findAll('[role="treeitem"].story .name').map((one) => one.text())).toEqual([])
    wrapper.unmount()
  })

  // L'emplacement du chevron est réservé sur une story : vide, il laisse passer le clic.
  test('lets a click on the empty chevron slot of a story choose it', async () => {
    const wrapper = mount(StoryTree, {
      props: {
        entries: [badge],
        current: null,
        component: null,
        label: 'Stories',
        none: 'no story',
      },
    })

    await wrapper.find('[role="treeitem"].story .chevron').trigger('click')
    expect(wrapper.emitted('show')).toEqual([[badge.id]])
    wrapper.unmount()
  })
})

describe('a filter on what changes underneath', () => {
  // Éditer `meta.status` dans un fichier de stories atteint l'arbre en direct.
  // Comme un repli : le choix reste, et revient avec le composant qui le porte.
  test('stops greying by a status no component declares, and greys again when one does', async () => {
    const wrapper = mount(StoryTree, {
      props: {
        entries: [avec(badge, 'stable'), avec(bouton, 'draft')],
        current: null,
        component: null,
        label: 'Stories',
        none: 'no story',
      },
    })
    await filtre(wrapper).findAll('button')[1]!.trigger('click')
    expect(grisés(wrapper)).toEqual(['Badge', 'Par défaut'])

    await wrapper.setProps({ entries: [avec(badge, 'stable'), avec(bouton, 'stable')] })
    expect(grisés(wrapper)).toEqual([])
    expect(
      filtre(wrapper)
        .findAll('button')
        .map((one) => one.text()),
    ).toEqual(['all', 'stable'])
    // Le choix reste retenu, mais l'onglet montre ce qui s'applique : tous.
    expect(états(wrapper)).toEqual(['on', 'off'])

    await wrapper.setProps({ entries: [avec(badge, 'stable'), avec(bouton, 'draft')] })
    expect(grisés(wrapper)).toEqual(['Badge', 'Par défaut'])
    expect(états(wrapper)).toEqual(['off', 'on', 'off'])
    wrapper.unmount()
  })
})

// La page d'un composant : ce que son fichier de stories déclare, et ses stories.
describe('the component page', () => {
  const déclaré = (one: StoryEntry, props: string[]): StoryEntry => ({
    ...one,
    props,
    component: { name: 'Badge', file: 'src/components/Badge.tsx', export: 'Badge' },
    meta: {
      status: 'stable',
      owner: 'design',
      figma: 'https://figma.com/file/x',
      description: 'A short label.',
    },
  })
  const badgeD = déclaré(badge, ['label'])
  const alerteD = déclaré(alerte, ['label', 'tone'])
  const catalogue = [badgeD, alerteD, bouton]

  const libellé = (écran: Ecran, nom: string) =>
    écran.wrapper
      .findAll('[role="treeitem"]:not(.story)')
      .find((one) => one.find('.name').text() === nom)!
  const page = (écran: Ecran) => écran.wrapper.find('.component-page')

  test('opens from the label of its component, which stays open', async () => {
    const écran = await monte(catalogue)
    const avant = window.history.length

    await libellé(écran, 'Badge').trigger('click')
    await vide(écran.wrapper)

    expect(page(écran).find('h2').text()).toBe('Badge')
    expect(window.location.search).toBe('?component=badge')
    expect(window.history.length).toBe(avant + 1)
    expect(libellé(écran, 'Badge').attributes('aria-selected')).toBe('true')
    expect(écran.noms()).toEqual(['Par défaut', 'Alerte', 'Par défaut'])
    écran.wrapper.unmount()
  })

  // Le libellé mène quelque part, il ne plie jamais, même sur la page déjà ouverte.
  test('does not fold its component when its label is clicked again', async () => {
    const écran = await monte(catalogue)

    await libellé(écran, 'Badge').trigger('click')
    await vide(écran.wrapper)
    await libellé(écran, 'Badge').trigger('click')
    await vide(écran.wrapper)

    expect(écran.noms()).toEqual(['Par défaut', 'Alerte', 'Par défaut'])
    expect(page(écran).find('h2').text()).toBe('Badge')
    écran.wrapper.unmount()
  })

  test('shows what its stories file declares, and the props each story sets', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const écran = await monte(catalogue)

    expect(page(écran).find('.description').text()).toBe('A short label.')
    expect(
      page(écran)
        .findAll('dt')
        .map((one) => one.text()),
    ).toEqual(['Status', 'Owner', 'Figma', 'Component', 'Stories'])
    expect(
      page(écran)
        .findAll('dd')
        .map((one) => one.text()),
    ).toEqual([
      'stable',
      'design',
      'https://figma.com/file/x',
      'src/components/Badge.tsx',
      'stories/Badge.tsx',
    ])
    expect(page(écran).find('dd a').attributes('href')).toBe('https://figma.com/file/x')
    expect(
      page(écran)
        .findAll('tbody tr')
        .map((row) => row.findAll('td').map((cell) => cell.text())),
    ).toEqual([
      ['Par défaut', 'label'],
      ['Alerte', 'labeltone'],
    ])
    expect(page(écran).find('tbody a').attributes('href')).toBe('?id=badge--defaut')
    écran.wrapper.unmount()
  })

  test('shows only what a component declares, and says when a story sets no prop', async () => {
    window.history.replaceState(null, '', '/?component=bouton')
    const écran = await monte(catalogue)

    expect(
      page(écran)
        .findAll('dt')
        .map((one) => one.text()),
    ).toEqual(['Component', 'Stories'])
    expect(page(écran).find('.description').exists()).toBe(false)
    expect(page(écran).find('tbody td .none-value').text()).toBe('none')
    écran.wrapper.unmount()
  })

  test('links Figma only over http or https', async () => {
    const piégé = { ...badgeD, meta: { figma: 'javascript:alert(1)' } }
    window.history.replaceState(null, '', '/?component=badge')
    const écran = await monte([piégé])

    expect(page(écran).find('dd a').exists()).toBe(false)
    expect(page(écran).find('dd code').text()).toBe('javascript:alert(1)')
    écran.wrapper.unmount()
  })

  test('keeps its component folded when its page opens from the label', async () => {
    const écran = await monte(catalogue)
    await libellé(écran, 'Badge').find('.chevron').trigger('click')

    await libellé(écran, 'Badge').trigger('click')
    await vide(écran.wrapper)

    expect(page(écran).find('h2').text()).toBe('Badge')
    expect(écran.noms()).toEqual(['Par défaut'])
    expect(JSON.parse(localStorage.getItem('crypte:tree:folded') ?? '[]')).toEqual([
      'component:badge',
    ])
    écran.wrapper.unmount()
  })

  test('unfolds the folders above a component page the history goes back to', async () => {
    const profond = entry('checkout/ordersummary--x', 'X', ['checkout', 'OrderSummary'], 's.tsx')
    window.history.replaceState(null, '', '/?id=bouton--defaut')
    const écran = await monte([profond, bouton])
    await libellé(écran, 'checkout').find('.chevron').trigger('click')
    expect(écran.branches()).toEqual(['checkout', 'Bouton'])

    window.history.replaceState(null, '', '/?component=checkout/ordersummary')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)

    expect(écran.branches()).toEqual(['checkout', 'OrderSummary', 'Bouton'])
    écran.wrapper.unmount()
  })

  test('unfolds the folders above the component its address names', async () => {
    localStorage.setItem('crypte:tree:folded', JSON.stringify(['folder:checkout']))
    const profond = entry('checkout/ordersummary--x', 'X', ['checkout', 'OrderSummary'], 's.tsx')
    window.history.replaceState(null, '', '/?component=checkout/ordersummary')
    const écran = await monte([profond, bouton])

    expect(écran.branches()).toEqual(['checkout', 'OrderSummary', 'Bouton'])
    expect(libellé(écran, 'OrderSummary').attributes('aria-selected')).toBe('true')
    écran.wrapper.unmount()
  })

  test('hides the preview and the panels while it is open', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const écran = await monte(catalogue)

    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)
    expect(écran.wrapper.findComponent(Panels).isVisible()).toBe(false)
    écran.wrapper.unmount()
  })

  test('shows a story from its list', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const écran = await monte(catalogue)
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    await page(écran).findAll('tbody a')[1]!.trigger('click', { button: 0 })
    await vide(écran.wrapper)

    expect(page(écran).exists()).toBe(false)
    expect(écran.wrapper.find('iframe').isVisible()).toBe(true)
    expect(window.location.search).toBe('?id=badge--alerte')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {}, theme: 'light' })
    écran.wrapper.unmount()
  })

  // Un clic du milieu ou avec une touche ouvre le lien ailleurs : le shell le laisse.
  test('leaves a modified click to the browser', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const écran = await monte(catalogue)

    await page(écran).findAll('tbody a')[1]!.trigger('click', { button: 0, metaKey: true })
    await vide(écran.wrapper)

    expect(page(écran).exists()).toBe(true)
    expect(window.location.search).toBe('?component=badge')
    écran.wrapper.unmount()
  })

  test('opens from the breadcrumb of a story', async () => {
    window.history.replaceState(null, '', '/?id=badge--alerte')
    const écran = await monte(catalogue)
    const fil = écran.wrapper.find('nav.trail')

    // Les séparateurs sont des éléments, espacés par la mise en page.
    // La vue d'abord, puis le composant et la story.
    expect(fil.findAll('a, [aria-current], .folder').map((one) => one.text())).toEqual([
      'stories/',
      'Badge',
      'Alerte',
    ])
    expect(fil.find('[aria-current="page"]').text()).toBe('Alerte')

    await fil.find('a').trigger('click', { button: 0 })
    await vide(écran.wrapper)

    expect(page(écran).find('h2').text()).toBe('Badge')
    expect(window.location.search).toBe('?component=badge')
    écran.wrapper.unmount()
  })

  test('names the folders above the component in the breadcrumb', async () => {
    const profond = entry('checkout/ordersummary--x', 'X', ['checkout', 'OrderSummary'], 's.tsx')
    const écran = await monte([profond])

    expect(écran.wrapper.find('nav.trail').text()).toBe('stories/checkout/OrderSummary/X')
    expect(écran.wrapper.find('nav.trail a').attributes('href')).toBe(
      '?component=checkout/ordersummary',
    )
    écran.wrapper.unmount()
  })

  test('falls back on the first story when its address names no component', async () => {
    window.history.replaceState(null, '', '/?component=disparu')
    const écran = await monte(catalogue)

    expect(page(écran).exists()).toBe(false)
    expect(window.location.search).toBe('?id=badge--defaut')
    écran.wrapper.unmount()
  })

  // Sous la page, la preview charge la première story du composant.
  test('renders the first story of the component underneath, and stays open on ready', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const écran = await monte(catalogue)

    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(page(écran).exists()).toBe(true)
    expect(window.location.search).toBe('?component=badge')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {}, theme: 'light' })
    écran.wrapper.unmount()
  })

  // La story dessous est ce qui retrouve le composant après un renommage.
  test('loads a story of the component underneath when opened from the tree', async () => {
    const écran = await monte(catalogue)
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await écran.story(2).trigger('click')

    await libellé(écran, 'Badge').trigger('click')

    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {}, theme: 'light' })
    écran.wrapper.unmount()
  })

  // Depuis le fil d'Ariane, la story qu'on regardait est déjà du composant.
  test('keeps the story underneath when it is already of the component', async () => {
    window.history.replaceState(null, '', '/?id=badge--alerte')
    const écran = await monte(catalogue)
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {}, theme: 'light' })
    const avant = écran.envoyés.length

    await écran.wrapper.find('nav.trail a').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(page(écran).find('h2').text()).toBe('Badge')
    expect(écran.envoyés.length).toBe(avant)
    écran.wrapper.unmount()
  })

  // Rien n'interdit deux fichiers de stories au même titre.
  test('stays on a component another stories file still carries', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const ailleurs = entry('badge--autre', 'Autre', ['Badge'], 'stories/Badge.more.tsx')
    const manifests: Manifest[] = [
      { version: 1, entries: [badge, alerte, ailleurs] },
      { version: 1, entries: [ailleurs] },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [], weights: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
                  : url === '/@crypte/health.json'
                    ? { components: null }
                    : url === '/@crypte/project.json'
                      ? { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' }
                      : manifests.length > 1
                        ? manifests.shift()
                        : manifests[0],
          }) as Response,
      ),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await vide(wrapper)
    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    const envoyés: ShellMessage[] = []
    frame.contentWindow?.addEventListener('message', (event) =>
      envoyés.push(event.data as ShellMessage),
    )
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ready', protocolVersion: 1 },
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
    await vide(wrapper)

    expect(wrapper.find('.component-page h2').text()).toBe('Badge')
    expect(wrapper.findAll('.component-page tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('p').at(-1)?.text()).toBe('1 story')
    await expect
      .poll(() => envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--autre', overrides: {}, theme: 'light' })
    wrapper.unmount()
  })

  // Le titre change, le fichier reste : la story retrouvée par son fichier et son
  // rang emmène la page vers le composant renommé.
  test('follows its component when the component is renamed', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const renommé = (one: StoryEntry, id: string): StoryEntry => ({ ...one, id, path: ['Pill'] })
    const manifests: Manifest[] = [
      { version: 1, entries: catalogue },
      {
        version: 1,
        entries: [renommé(badgeD, 'pill--defaut'), renommé(alerteD, 'pill--alerte'), bouton],
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [], weights: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
                  : url === '/@crypte/health.json'
                    ? { components: null }
                    : url === '/@crypte/project.json'
                      ? { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' }
                      : manifests.length > 1
                        ? manifests.shift()
                        : manifests[0],
          }) as Response,
      ),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await vide(wrapper)
    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ready', protocolVersion: 1 },
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
    await vide(wrapper)

    expect(wrapper.find('.component-page h2').text()).toBe('Pill')
    expect(window.location.search).toBe('?component=pill')
    wrapper.unmount()
  })

  test('follows back and forward between a story and a component page', async () => {
    const écran = await monte(catalogue)
    await libellé(écran, 'Badge').trigger('click')
    await vide(écran.wrapper)

    window.history.replaceState(null, '', '/?id=bouton--defaut')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(page(écran).exists()).toBe(false)
    expect(écran.story(2).attributes('aria-selected')).toBe('true')

    window.history.replaceState(null, '', '/?component=badge')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(page(écran).find('h2').text()).toBe('Badge')

    window.history.replaceState(null, '', '/?component=disparu')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(page(écran).find('h2').text()).toBe('Badge')
    écran.wrapper.unmount()
  })

  // Un fichier de stories retiré, le temps d'un renommage ou d'un changement de
  // branche : la page le dit et garde son adresse, comme une story perdue, puis
  // revient avec le fichier.
  test('says when its component leaves the catalogue, and comes back with it', async () => {
    window.history.replaceState(null, '', '/?component=badge')
    const manifests: Manifest[] = [
      { version: 1, entries: catalogue },
      { version: 1, entries: [bouton] },
      { version: 1, entries: catalogue },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [], weights: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
                  : url === '/@crypte/health.json'
                    ? { components: null }
                    : url === '/@crypte/project.json'
                      ? { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' }
                      : manifests.length > 1
                        ? manifests.shift()
                        : manifests[0],
          }) as Response,
      ),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await vide(wrapper)
    expect(wrapper.find('.component-page').exists()).toBe(true)

    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ready', protocolVersion: 1 },
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
    await vide(wrapper)

    expect(wrapper.find('.component-page').exists()).toBe(false)
    expect(wrapper.findAll('p').at(-1)?.text()).toBe('the component on display is gone')
    expect(window.location.search).toBe('?component=badge')

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ready', protocolVersion: 1 },
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
    await vide(wrapper)

    expect(wrapper.find('.component-page h2').text()).toBe('Badge')
    expect(window.location.search).toBe('?component=badge')
    wrapper.unmount()
  })
})

describe('the tree around a component', () => {
  const nœud = (wrapper: VueWrapper, nom: string) =>
    wrapper
      .findAll('[role="treeitem"]:not(.story)')
      .find((one) => one.find('.name').text() === nom)!
  const stories = (wrapper: VueWrapper) =>
    wrapper.findAll('[role="treeitem"].story .name').map((one) => one.text())
  const arbre = (entries: StoryEntry[]) =>
    mount(StoryTree, {
      props: { entries, current: null, component: null, label: 'Stories', none: 'no story' },
    })

  test('folds a component from its chevron, without opening it', async () => {
    const wrapper = arbre([badge, alerte, bouton])

    await nœud(wrapper, 'Badge').find('.chevron').trigger('click')

    expect(stories(wrapper)).toEqual(['Par défaut'])
    expect(wrapper.emitted('open')).toBeUndefined()
    wrapper.unmount()
  })

  test('opens a component on Enter, and folds it with the arrows', async () => {
    const wrapper = arbre([badge, alerte, bouton])

    await nœud(wrapper, 'Badge').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('open')).toEqual([['badge']])

    await nœud(wrapper, 'Badge').trigger('keydown', { key: 'ArrowLeft' })
    expect(stories(wrapper)).toEqual(['Par défaut'])
    wrapper.unmount()
  })

  // Un dossier n'a pas de page : son libellé le plie.
  test('folds a folder from its label, and opens nothing', async () => {
    const dedans = entry('checkout/cart--empty', 'Empty', ['checkout', 'Cart'], 'c.tsx')
    const wrapper = arbre([dedans])

    await nœud(wrapper, 'checkout').trigger('click')

    expect(stories(wrapper)).toEqual([])
    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.emitted('show')).toBeUndefined()
    wrapper.unmount()
  })
})

// La page d'une famille de tokens : chaque token dans chaque thème déclaré.
describe('the activity bar', () => {
  // Le détail du tooltip de versions, au singulier comme au pluriel.
  test('says one difference in the singular', () => {
    const barre = mount(ActivityBar, {
      props: {
        current: 'stories',
        hrefs: {
          tokens: '?tokens=color',
          stories: '/',
          health: '?health=overview',
          versions: '?changes',
        },
        counter: 1,
        searchKeys: 'Ctrl K',
        searchShortcuts: 'Control+K /',
        themeLabel: 'Dark theme',
      },
    })
    expect(
      barre
        .findAllComponents(Tooltip)
        .map((one) => one.props('detail'))
        .filter(Boolean),
    ).toEqual(['1 difference'])
    barre.unmount()
  })

  const marquée = (écran: Ecran) =>
    écran.wrapper.find('.activity-bar [aria-current="page"] .label').text()
  const clique = async (écran: Ecran, label: string) => {
    await écran.vue(label).trigger('click', { button: 0 })
    await vide(écran.wrapper)
  }

  test('marks the view on display, and leads back to the story', async () => {
    const écran = await monte([badge, alerte, jetons])
    expect(marquée(écran)).toBe('stories')

    await clique(écran, 'tokens')
    expect(marquée(écran)).toBe('tokens')
    expect(écran.wrapper.find('.sidebar .column-title').text()).toBe('Tokens1')
    await clique(écran, 'versions')
    expect(marquée(écran)).toBe('versions')
    expect(window.location.search).toBe('?changes')

    await clique(écran, 'stories')
    expect(marquée(écran)).toBe('stories')
    expect(window.location.search).toBe('?id=badge--defaut')
    expect(écran.wrapper.find('iframe').isVisible()).toBe(true)
    expect(écran.wrapper.find('.sidebar .column-title').text()).toBe('Stories2')
    écran.wrapper.unmount()
  })

  // Une page composant est de la vue stories : son entrée y ramène la story chargée.
  test('counts a component page in the stories view', async ({ écran }) => {
    await écran.wrapper.find('nav.trail a').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(marquée(écran)).toBe('stories')

    await clique(écran, 'stories')
    expect(écran.wrapper.find('.component-page').exists()).toBe(false)
    expect(window.location.search).toBe('?id=badge--defaut')
  })

  test('switches the theme from its button, which names the other theme', async ({ écran }) => {
    const infobulles = () =>
      écran.wrapper
        .findAllComponents(Tooltip)
        .map((one) => [one.props('content'), one.props('keys')].filter(Boolean).join(' '))
    expect(infobulles()).toContain('Dark theme T')

    await écran.wrapper.find('[aria-label="Dark theme"]').trigger('click')
    await vide(écran.wrapper)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(écran.wrapper.find('[aria-label="Light theme"]').exists()).toBe(true)
    expect(infobulles()).toContain('Light theme T')
  })

  // Sans token, la vue reste atteignable et dit comment en déclarer (E2).
  test('guides to the first token when the project has none', async ({ écran }) => {
    expect(écran.wrapper.findAll('.activity-bar .label').map((one) => one.text())).toEqual([
      'tokens',
      'stories',
      'health',
      'versions',
    ])

    await clique(écran, 'tokens')
    expect(window.location.search).toBe('?tokens=color')
    expect(écran.wrapper.find('.empty h2').text()).toBe('No token found')
    expect(écran.wrapper.find('.empty pre').text()).toContain('--color-accent: #009488;')
    expect(écran.wrapper.find('.sidebar .empty-note').text()).toBe('No tokens.')
    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)
    expect(écran.statut()).toBe('no tokens found')
  })

  // Sans story, l'entrée stories ramène à l'adresse nue, et non à une requête vide
  // qui laisserait la précédente en place.
  test('leads home when no story is loaded', async () => {
    const écran = await monte([jetons])
    await clique(écran, 'versions')
    expect(window.location.search).toBe('?changes')

    await clique(écran, 'stories')
    expect(window.location.search).toBe('')
    expect(marquée(écran)).toBe('stories')
    expect(écran.wrapper.find('.sidebar p').text()).toBe('No story.')
    écran.wrapper.unmount()
  })
})

describe('the tokens view', () => {
  const famille: TokensEntry = {
    type: 'tokens',
    id: 'color--brand',
    path: ['Color'],
    name: 'Brand',
    tokens: {
      primary: {
        type: 'color',
        description: 'Filled buttons only.',
        themes: {
          light: { value: '#4fe0a0' },
          dark: { value: '#1f5fd6', alias: ['color-blue', 'color-cobalt'] },
        },
      },
      // Écrit sous le seul sélecteur sombre : rien pour le thème clair (§4.2).
      night: { type: 'dimension', themes: { dark: { value: '4px' } } },
    },
  }
  const vue = (écran: Ecran) => écran.wrapper.find('.tokens-view')
  const catégories = (écran: Ecran) =>
    écran.wrapper
      .findAll('.sidebar li a')
      .map((one) => `${one.find('.label').text()} ${one.find('.count').text()}`)
  const courante = (écran: Ecran) =>
    écran.wrapper.find('.sidebar [aria-current="page"] .label').text()
  const valeurs = (écran: Ecran) =>
    vue(écran)
      .findAll('.item')
      .map((one) => `${one.find('.name').text()} ${one.find('.value').text()}`)
  const clique = async (écran: Ecran, cible: DOMWrapper<Element>) => {
    await cible.trigger('click', { button: 0 })
    await vide(écran.wrapper)
  }

  test('opens on its first category from the activity bar, without rendering anything', async () => {
    const écran = await monte([badge, famille])
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {}, theme: 'light' })
    const avant = écran.envoyés.length

    await clique(écran, écran.vue('tokens'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Un alias fait de la famille une famille sémantique, et non une palette ; sa
    // dimension a sa propre catégorie, du nom de la famille.
    expect(catégories(écran)).toEqual(['color 1', 'Brand 1'])
    expect(courante(écran)).toBe('color')
    expect(vue(écran).attributes('aria-label')).toBe('color')
    expect(window.location.search).toBe('?tokens=color')
    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)
    expect(écran.envoyés.length).toBe(avant)
    expect(écran.statut()).toBe('1 token color, light theme')
    écran.wrapper.unmount()
  })

  // Le thème du shell décide de la valeur montrée, et un thème que la source ne
  // déclare pas n'emprunte rien à un autre (§4.2).
  test('shows each value in the theme of the shell, and a theme it lacks', async () => {
    window.history.replaceState(null, '', '/?tokens=color')
    const écran = await monte([badge, famille])
    const pastille = () => vue(écran).find('.swatch').element as HTMLElement

    expect(valeurs(écran)).toEqual(['primary #4FE0A0'])
    expect(pastille().style.backgroundColor).toBe('rgb(79, 224, 160)')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }))
    await vide(écran.wrapper)
    expect(valeurs(écran)).toEqual(['primary #1F5FD6'])
    expect(pastille().style.backgroundColor).toBe('rgb(31, 95, 214)')

    await clique(écran, écran.wrapper.findAll('.sidebar li a')[1]!)
    expect(valeurs(écran)).toEqual(['night 4px'])
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }))
    await vide(écran.wrapper)
    expect(valeurs(écran)).toEqual(['night not declared'])
    écran.wrapper.unmount()
  })

  // La barre d'outils de la vue : la vue, la catégorie, puis la famille et la clé du
  // token choisi, et les actions de la maquette.
  test('names the view, the category, then the family and key of the token, in its toolbar', async () => {
    window.history.replaceState(null, '', '/?tokens=color')
    const écran = await monte([badge, famille])
    const fil = () =>
      écran.wrapper.findAll('.toolbar .trail > span').map((one) => one.text().replace(/\s+/g, ''))

    expect(fil()).toEqual(['tokens/', 'color'])
    const recharge = await rechargeAuClic(écran.wrapper.find('iframe').element, () =>
      écran.wrapper.find('.toolbar .reload').trigger('click'),
    )
    expect(recharge).toHaveBeenCalledOnce()
    expect(
      écran.wrapper
        .findAll('.toolbar .actions button')
        .map((one) => one.attributes('aria-label') ?? one.text()),
    ).toEqual(['Reload', 'Copy link', 'Panels'])
    await clique(écran, vue(écran).find('.item'))
    expect(fil()).toEqual(['tokens/', 'color/', 'Brand', '/', 'primary'])
    expect(écran.wrapper.find('.toolbar [aria-current="page"]').text()).toBe('primary')
    écran.wrapper.unmount()
  })

  // `space` est à la fois la catégorie et la famille : nommée une fois.
  test('names a category once when its family bears its name', async () => {
    window.history.replaceState(null, '', '/?tokens=space&token=space-4')
    const espace: TokensEntry = {
      type: 'tokens',
      id: 'tokens--space',
      path: ['Tokens'],
      name: 'space',
      tokens: { '4': { type: 'dimension', themes: { default: { value: '16px' } } } },
    }
    const écran = await monte([badge, espace])

    expect(
      écran.wrapper.findAll('.toolbar .trail > span').map((one) => one.text().replace(/\s+/g, '')),
    ).toEqual(['tokens/', 'space', '/', '4'])
    écran.wrapper.unmount()
  })

  test('selects a token under its own address', async () => {
    window.history.replaceState(null, '', '/?tokens=color')
    const écran = await monte([badge, famille])
    const avant = window.history.length

    await clique(écran, vue(écran).find('.item'))
    expect(window.location.search).toBe('?tokens=color&token=Brand-primary')
    expect(window.history.length).toBe(avant + 1)
    expect(vue(écran).find('.item').attributes('aria-current')).toBe('true')
    écran.wrapper.unmount()
  })

  // Le panneau suit la sélection, et ses lignes mènent au composant qui lit le token.
  test('describes the token selected, and leads to a component that reads it', async () => {
    const lecteur: StoryEntry = {
      ...badge,
      component: { ...badge.component, tokens: ['Brand-primary'] },
    }
    // Un token qui en vise un autre : sa ligne d'alias mène à sa sélection.
    const lien: TokensEntry = {
      type: 'tokens',
      id: 'color--link',
      path: ['Color'],
      name: 'Link',
      tokens: {
        base: { type: 'color', themes: { light: { value: '#4fe0a0', alias: ['Brand-primary'] } } },
      },
    }
    window.history.replaceState(null, '', '/?tokens=color')
    const écran = await monte([lecteur, famille, lien])
    const panneau = () => écran.wrapper.find('[aria-label="Token panel"]')

    expect(panneau().find('h3').text()).toBe('Token')
    await clique(écran, vue(écran).find('.item'))
    expect(panneau().find('h3').text()).toBe('Brand/primary')
    expect(panneau().text()).toContain('used by · 1 component')

    const [alias] = panneau().findAll('a')
    await clique(écran, alias!)
    expect(window.location.search).toBe('?tokens=color&token=Link-base')
    expect(panneau().find('h3').text()).toBe('Link/base')

    window.history.back()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await vide(écran.wrapper)
    expect(panneau().find('h3').text()).toBe('Brand/primary')

    await clique(écran, panneau().findAll('a').at(-1)!)
    expect(window.location.search).toBe('?component=badge')
    expect(écran.wrapper.find('.component-page').exists()).toBe(true)
    expect(panneau().exists()).toBe(false)
    écran.wrapper.unmount()
  })

  // `?id=` nomme encore une famille (§4.3) : un lien collé avant la vue tokens
  // ouvre la catégorie où elle commence.
  test('opens the category of a family named by an older address', async () => {
    window.history.replaceState(null, '', '/?id=color--brand')
    const écran = await monte([badge, famille])

    expect(courante(écran)).toBe('color')
    expect(écran.wrapper.find('.stale').exists()).toBe(false)
    écran.wrapper.unmount()
  })

  test('follows back and forward between a story and a token', async () => {
    const écran = await monte([badge, famille])
    await clique(écran, écran.vue('tokens'))

    window.history.replaceState(null, '', '/?id=badge--defaut')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(vue(écran).exists()).toBe(false)
    expect(écran.wrapper.find('iframe').isVisible()).toBe(true)

    window.history.replaceState(null, '', '/?tokens=Brand&token=Brand-night')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(courante(écran)).toBe('Brand')
    expect(vue(écran).find('[aria-current="true"] .name').text()).toBe('night')
    écran.wrapper.unmount()
  })

  test('says when its category leaves the catalogue, and comes back with it', async () => {
    window.history.replaceState(null, '', '/?tokens=color')
    // Une autre famille reste : le catalogue a encore des tokens, seule la
    // catégorie affichée est partie.
    const manifests: Manifest[] = [
      { version: 1, entries: [badge, famille] },
      { version: 1, entries: [badge, jetons] },
      { version: 1, entries: [badge, famille] },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [], weights: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
                  : url === '/@crypte/health.json'
                    ? { components: null }
                    : url === '/@crypte/project.json'
                      ? { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' }
                      : manifests.length > 1
                        ? manifests.shift()
                        : manifests[0],
          }) as Response,
      ),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await vide(wrapper)
    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    const ready = async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'ready', protocolVersion: 1 },
          origin: window.location.origin,
          source: frame.contentWindow,
        }),
      )
      await vide(wrapper)
    }

    await ready()
    expect(wrapper.find('.tokens-view').exists()).toBe(false)
    expect(wrapper.findAll('p').at(-1)?.text()).toBe('the tokens on display are gone')
    expect(window.location.search).toBe('?tokens=color')

    await ready()
    expect(wrapper.find('.tokens-view').attributes('aria-label')).toBe('color')
    wrapper.unmount()
  })
})

// La ligne d'état parle de ce qui est affiché, pas de la story chargée dessous.
describe('the status line under a page', () => {
  const famille: TokensEntry = { ...jetons }

  test('ignores the render of the story underneath a family or a component', async () => {
    window.history.replaceState(null, '', '/?id=color--brand')
    const écran = await monte([badge, alerte, famille])
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await écran.répond({ type: 'rendered', id: 'badge--defaut', durationMs: 1.2 } as PreviewMessage)

    expect(écran.statut()).toBe('1 token palette, light theme')

    window.history.replaceState(null, '', '/?component=badge')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    await écran.répond({ type: 'rendered', id: 'badge--defaut', durationMs: 1.2 } as PreviewMessage)

    expect(écran.statut()).toBe('2 stories')
    écran.wrapper.unmount()
  })

  // La story dessous perd son fichier : la famille, elle, n'a rien perdu.
  test('does not say a story is gone under a family that is still there', async () => {
    window.history.replaceState(null, '', '/?id=color--brand')
    const manifests: Manifest[] = [
      { version: 1, entries: [badge, bouton, famille] },
      { version: 1, entries: [bouton, famille] },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [], weights: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
                  : url === '/@crypte/health.json'
                    ? { components: null }
                    : url === '/@crypte/project.json'
                      ? { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' }
                      : manifests.length > 1
                        ? manifests.shift()
                        : manifests[0],
          }) as Response,
      ),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await vide(wrapper)
    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ready', protocolVersion: 1 },
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
    await vide(wrapper)

    expect(wrapper.find('.tokens-view').attributes('aria-label')).toBe('palette')
    expect(wrapper.findAll('p').at(-1)?.text()).toBe('1 token palette, light theme')
    wrapper.unmount()
  })
})

// Ce qui a changé depuis un commit, lu par le CLI dans Git : les écarts dans la
// sidebar, le détail de celui qu'on choisit dans le canvas.
describe('the versions view', () => {
  const lus = {
    from: { ref: 'HEAD', commit: 'abcdef0' },
    changes: [
      { kind: 'appeared', id: 'badge--alerte' },
      {
        kind: 'changed',
        id: 'bouton--defaut',
        props: { before: ['label'], after: ['tone'] },
        status: { before: 'draft', after: 'stable' },
      },
      { kind: 'disappeared', id: 'badge--ancienne' },
      { kind: 'disappeared', id: 'parti--defaut' },
    ],
    tokens: [
      {
        kind: 'changed',
        family: 'color--brand',
        key: 'primary',
        before: { light: '#000000' },
        after: { light: '#4fe0a0' },
      },
    ],
  }
  const lecteur: StoryEntry = {
    ...badge,
    component: { ...badge.component, tokens: ['Brand-primary'] },
  }
  const entrée = (écran: Ecran) => écran.vue('versions')
  const vue = (écran: Ecran) => écran.wrapper.find('.versions-view')
  const lignes = (écran: Ecran) =>
    écran.wrapper
      .findAll('.sidebar li a')
      .map((one) =>
        [
          one.find('.sign').text().charAt(0),
          one.find('.label').text(),
          one.find('.detail').text(),
        ].join(' '),
      )
  const ligne = (écran: Ecran, label: string) =>
    écran.wrapper.findAll('.sidebar li a').find((one) => one.find('.label').text() === label)!
  const clique = async (écran: Ecran, cible: DOMWrapper<Element>) => {
    await cible.trigger('click', { button: 0 })
    await vide(écran.wrapper)
  }

  test('opens from the activity bar, which counts the differences', async () => {
    const écran = await monte([lecteur, alerte, bouton, jetons], false, undefined, () => lus)
    const avant = window.history.length

    expect(entrée(écran).find('.count').text()).toBe('5')
    // Chaque entrée a son tooltip, à droite de la barre ; versions dit son compte.
    expect(
      écran.wrapper
        .findComponent(ActivityBar)
        .findAllComponents(Tooltip)
        .map((one) =>
          [one.props('side'), one.props('content'), one.props('detail')].filter(Boolean).join(' '),
        ),
    ).toEqual([
      'right Search or run',
      'right tokens',
      'right stories',
      'right health',
      'right versions 5 differences',
      'right Dark theme',
    ])
    await clique(écran, entrée(écran))

    expect(vue(écran).find('h2').text()).toBe('What changed since the last commit')
    expect(window.location.search).toBe('?changes')
    expect(window.history.length).toBe(avant + 1)
    expect(entrée(écran).attributes('aria-current')).toBe('page')
    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)
    expect(écran.statut()).toBe('5 differences since the last commit')
    écran.wrapper.unmount()
  })

  // Les tokens d'abord, chaque ligne signée + ~ −, le libellé et ce qui a bougé.
  test('lists the differences in the sidebar, signed, the tokens first', async () => {
    window.history.replaceState(null, '', '/?changes')
    const écran = await monte([lecteur, alerte, bouton, jetons], false, undefined, () => lus)

    expect(écran.wrapper.findAll('.sidebar .group .column-title').map((one) => one.text())).toEqual(
      ['Tokens1', 'Stories4'],
    )
    expect(lignes(écran)).toEqual([
      '~ Brand-primary light',
      '+ Alerte Badge',
      '~ Par défaut props · draft → stable',
      '− badge--ancienne story',
      '− parti--defaut story',
    ])
    écran.wrapper.unmount()
  })

  test('details a story under its own address, and leads to it', async () => {
    window.history.replaceState(null, '', '/?changes')
    const écran = await monte([lecteur, alerte, bouton, jetons], false, undefined, () => lus)

    await clique(écran, ligne(écran, 'Par défaut'))
    expect(window.location.search).toBe('?changes&change=story:bouton--defaut')
    expect(ligne(écran, 'Par défaut').attributes('aria-current')).toBe('page')
    const détail = vue(écran).find('.change')
    expect(détail.text().replace(/\s+/g, ' ')).toContain('Status: draft → stable')
    expect(détail.find('.added').text()).toBe('tone')
    expect(détail.find('.removed').text()).toBe('label')

    await clique(écran, détail.find('h3 a'))
    expect(window.location.search).toBe('?id=bouton--defaut')
    écran.wrapper.unmount()
  })

  test('details a token before and after, and the components that read it', async () => {
    window.history.replaceState(null, '', '/?changes&change=token:color--brand/primary')
    const écran = await monte([lecteur, alerte, bouton, jetons], false, undefined, () => lus)
    const détail = vue(écran).find('.change')

    expect(détail.find('h3').text()).toBe('Brand-primary')
    expect(
      détail.findAll('tbody tr').map((one) =>
        one
          .findAll('th, td')
          .map((cell) => cell.text().trim())
          .join(' '),
      ),
    ).toEqual(['light #000000 #4fe0a0'])
    expect(détail.find('h4').text()).toBe('Read by 1 component')
    await clique(écran, détail.find('.readers a'))
    expect(window.location.search).toBe('?component=badge')
    écran.wrapper.unmount()
  })

  // Une story partie mène à la page de son composant, s'il en reste une.
  test('leads a story that disappeared to its component, when one remains', async () => {
    window.history.replaceState(null, '', '/?changes&change=story:badge--ancienne')
    const écran = await monte([lecteur, alerte, bouton, jetons], false, undefined, () => lus)

    expect(vue(écran).find('.change h3 a').attributes('href')).toBe('?component=badge')
    await clique(écran, ligne(écran, 'parti--defaut'))
    expect(vue(écran).find('.change h3 a').exists()).toBe(false)
    expect(vue(écran).find('.change').text()).toContain('This story is gone.')
    écran.wrapper.unmount()
  })

  // Le point de départ se tape : une date part du dernier commit avant elle, le
  // reste se lit comme une révision. Il entre dans l'adresse et dans la requête.
  test('starts from a commit, a tag or a date typed in', async () => {
    const lues: string[] = []
    const écran = await monte([badge], false, undefined, (url) => {
      lues.push(url)
      return { ...lus, from: { ref: 'v1.0.0', commit: '1234567' } }
    })
    await clique(écran, entrée(écran))
    const champ = écran.wrapper.find('.sidebar input')

    await champ.setValue('v1.0.0')
    await champ.trigger('keydown', { key: 'Enter' })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?changes&from=v1.0.0')
    expect(lues.at(-1)).toBe('/@crypte/changes.json?from=v1.0.0')
    expect(vue(écran).find('h2').text()).toBe('What changed since v1.0.0')

    await champ.setValue('2026-09-16')
    await champ.trigger('keydown', { key: 'Enter' })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?changes&before=2026-09-16')
    expect(lues.at(-1)).toBe('/@crypte/changes.json?before=2026-09-16')
    écran.wrapper.unmount()
  })

  // Le menu : le dernier commit, la branche par défaut, deux périodes et chaque tag
  // que le CLI liste. Un choix entre dans l'adresse et dans la requête.
  test('starts from a point of its menu, the default branch, a period or a tag', async () => {
    const lues: string[] = []
    const écran = await monte([badge], false, undefined, (url) => (lues.push(url), lus))
    await clique(écran, entrée(écran))
    const menu = écran.wrapper.find('.sidebar').findComponent(Select)

    expect(menu.props('options').map((one: { label: string }) => one.label)).toEqual([
      'Last commit',
      'main',
      'Last 7 days',
      'Last 30 days',
      'v1.0.0 · 2026-01-01',
    ])
    menu.vm.$emit('update:modelValue', 'ref:v1.0.0')
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?changes&from=v1.0.0')
    expect(lues.at(-1)).toBe('/@crypte/changes.json?from=v1.0.0')

    const semaine = menu.props('options')[2]!.value as string
    menu.vm.$emit('update:modelValue', semaine)
    await vide(écran.wrapper)
    expect(window.location.search).toBe(`?changes&before=${semaine.slice(7)}`)

    menu.vm.$emit('update:modelValue', 'ref:HEAD')
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?changes')
    expect(lues.at(-1)).toBe('/@crypte/changes.json')
    écran.wrapper.unmount()
  })

  // Quittée, la vue oublie son point : l'entrée mène au dernier commit, et son
  // compteur compte depuis lui.
  test('forgets where it started once left, the counter counting from the last commit', async () => {
    const écran = await monte([badge, alerte, bouton, jetons], false, undefined, (url) =>
      url.includes('from=') ? lus : { ...lus, changes: [], tokens: [] },
    )
    await clique(écran, entrée(écran))
    const champ = écran.wrapper.find('.sidebar input')
    await champ.setValue('v1')
    await champ.trigger('keydown', { key: 'Enter' })
    await vide(écran.wrapper)
    expect(entrée(écran).find('.count').text()).toBe('5')

    await clique(écran, écran.vue('stories'))
    expect(entrée(écran).attributes('href')).toBe('?changes')
    expect(entrée(écran).find('.count').text()).toBe('0')
    écran.wrapper.unmount()
  })

  // Une date dite « before 2026-09-16 » par le CLI se lit comme la date seule, et un
  // tag qui commence comme une date reste un tag.
  test('says a date as itself, and reads a tag that starts like one as a revision', async () => {
    const lues: string[] = []
    const écran = await monte([badge], false, undefined, (url) => {
      lues.push(url)
      return {
        ...lus,
        changes: [],
        tokens: [],
        from: { ref: 'before 2026-09-16', commit: '1234567' },
      }
    })
    await clique(écran, entrée(écran))

    expect(vue(écran).find('h2').text()).toBe('What changed since 2026-09-16')
    expect(écran.statut()).toBe('0 differences since 2026-09-16')
    const champ = écran.wrapper.find('.sidebar input')
    await champ.setValue('2026-09-16-hotfix')
    await champ.trigger('keydown', { key: 'Enter' })
    await vide(écran.wrapper)
    expect(lues.at(-1)).toBe('/@crypte/changes.json?from=2026-09-16-hotfix')
    écran.wrapper.unmount()
  })

  // Un token apparu n'a pas d'avant, un token parti pas d'après.
  test('details a token that appeared or disappeared, a side with no value', async () => {
    const deux = {
      ...lus,
      changes: [],
      tokens: [
        { kind: 'appeared', family: 'color--brand', key: 'primary', after: { light: '#4fe0a0' } },
        { kind: 'disappeared', family: 'color--old', key: 'base', before: { light: '#111111' } },
      ],
    }
    window.history.replaceState(null, '', '/?changes&change=token:color--brand/primary')
    const écran = await monte([badge, jetons], false, undefined, () => deux)
    const cellules = () =>
      vue(écran)
        .findAll('tbody tr')
        .map((one) =>
          one
            .findAll('th, td')
            .map((cell) => cell.text().trim())
            .join(' '),
        )

    expect(cellules()).toEqual(['light none #4fe0a0'])
    await clique(écran, ligne(écran, 'base'))
    expect(cellules()).toEqual(['light #111111 none'])
    expect(lignes(écran)).toEqual(['+ Brand-primary token', '− base token'])
    écran.wrapper.unmount()
  })

  test('says when nothing changed, and counts zero', async () => {
    const écran = await monte([badge])
    await clique(écran, entrée(écran))

    expect(entrée(écran).find('.count').text()).toBe('0')
    expect(vue(écran).find('.empty-note').text()).toBe('Nothing changed in the catalogue.')
    expect(écran.wrapper.find('.sidebar .empty-note').text()).toBe('No difference.')
    écran.wrapper.unmount()
  })

  // La vue reste accessible et dit pourquoi, sinon rien ne distingue « aucun
  // changement » d'une fonction cassée.
  test('says why the changes cannot be read, and counts nothing', async () => {
    const écran = await monte([badge], false, undefined, () => ({
      reason: 'the project is not in a Git repository',
    }))
    await clique(écran, entrée(écran))

    expect(entrée(écran).find('.count').exists()).toBe(false)
    expect(vue(écran).find('.empty-note').text()).toBe(
      'The changes cannot be read: the project is not in a Git repository.',
    )
    écran.wrapper.unmount()
  })

  test('says why when its route cannot be read', async () => {
    const écran = await monte([badge], false, undefined, () => {
      throw new Error('Unexpected token')
    })
    await clique(écran, entrée(écran))

    expect(vue(écran).find('.empty-note').text()).toBe(
      'The changes cannot be read: its route could not be read: Unexpected token.',
    )
    écran.wrapper.unmount()
  })

  // Une empreinte commise avant les tokens : leur historique commence après elle.
  test('says the tokens have no history before a fingerprint that lacks them', async () => {
    const écran = await monte([badge], false, undefined, () => ({
      ...lus,
      changes: [],
      tokens: null,
    }))
    await clique(écran, entrée(écran))

    expect(vue(écran).find('.empty-note').text()).toContain(
      'The tokens have no history before this commit',
    )
    écran.wrapper.unmount()
  })

  test('opens from its address, with the first story loaded underneath', async () => {
    window.history.replaceState(null, '', '/?changes&from=main')
    const lues: string[] = []
    const écran = await monte([badge, alerte], false, undefined, (url) => (lues.push(url), lus))
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(vue(écran).exists()).toBe(true)
    expect(window.location.search).toBe('?changes&from=main')
    expect(lues.at(-1)).toBe('/@crypte/changes.json?from=main')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {}, theme: 'light' })
    écran.wrapper.unmount()
  })

  test('follows back and forward to a difference', async () => {
    const écran = await monte([lecteur, alerte, bouton, jetons], false, undefined, () => lus)
    window.history.replaceState(null, '', '/?changes&change=story:badge--alerte')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)

    expect(vue(écran).find('.change').text()).toContain('A new story.')
    écran.wrapper.unmount()
  })

  test('reads the changes again with the catalogue', async () => {
    const réponses = [{ ...lus, changes: [], tokens: [] }, lus]
    const écran = await monte([badge, alerte, bouton], false, undefined, () =>
      réponses.length > 1 ? réponses.shift() : réponses[0],
    )
    expect(entrée(écran).find('.count').text()).toBe('0')

    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(entrée(écran).find('.count').text()).toBe('5')
    écran.wrapper.unmount()
  })

  // Un commit ne touche aucun fichier que Vite surveille : aucun `ready` ne suit.
  test('reads the changes again when the window regains focus, and when the view opens', async () => {
    const vides = { ...lus, changes: [], tokens: [] }
    const réponses: unknown[] = [vides, lus, vides]
    const écran = await monte([badge, alerte, bouton], false, undefined, () =>
      réponses.length > 1 ? réponses.shift() : réponses[0],
    )
    expect(entrée(écran).find('.count').text()).toBe('0')

    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)
    expect(entrée(écran).find('.count').text()).toBe('5')

    await clique(écran, entrée(écran))
    expect(entrée(écran).find('.count').text()).toBe('0')
    expect(vue(écran).find('.empty-note').text()).toBe('Nothing changed in the catalogue.')
    écran.wrapper.unmount()
  })

  // Deux `ready` rapprochés : la réponse la plus lente ne remplace pas la dernière.
  test('keeps the changes read last when two answers cross', async () => {
    let lente!: (value: unknown) => void
    const réponses: (() => unknown)[] = [
      () => new Promise((resolve) => (lente = resolve)),
      () => ({ ...lus, changes: [], tokens: [] }),
    ]
    const écran = await monte([badge], false, undefined, () => (réponses.shift() ?? (() => ({})))())
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    expect(entrée(écran).find('.count').text()).toBe('0')

    lente(lus)
    await vide(écran.wrapper)

    expect(entrée(écran).find('.count').text()).toBe('0')
    écran.wrapper.unmount()
  })
})

// Ce que le serveur dit du projet : une configuration qu'il n'a pas pu relire.
describe('a configuration the server could not read', () => {
  const raison = 'crypte.config.ts could not be loaded: Unexpected end of input'

  test('is said above every page, with what to do next', async () => {
    const écran = await monte([badge], false, undefined, undefined, () => ({
      stories: 'stories',
      config: raison,
    }))
    const encadré = écran.wrapper.find('.config')

    expect(encadré.attributes('role')).toBe('alert')
    expect(encadré.find('h2').text()).toBe('crypte.config.ts could not be read')
    expect(encadré.find('p').text().replace(/\s+/g, ' ')).toBe(
      `Crypte keeps serving the configuration it read before. Fix the file and save it again: ${raison}`,
    )
    écran.wrapper.unmount()
  })

  test('is read again when the window regains focus', async () => {
    const réponses: unknown[] = [
      { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' },
      { stories: 'stories', config: raison, shellBytes: 83149 },
    ]
    const écran = await monte([badge], false, undefined, undefined, () =>
      réponses.length > 1 ? réponses.shift() : réponses[0],
    )
    expect(écran.wrapper.find('.config').exists()).toBe(false)

    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)

    expect(écran.wrapper.find('.config').exists()).toBe(true)
    écran.wrapper.unmount()
  })

  test('says nothing when its route cannot be read', async () => {
    const écran = await monte([badge], false, undefined, undefined, () => {
      throw new Error('Unexpected token')
    })

    expect(écran.wrapper.find('.config').exists()).toBe(false)
    écran.wrapper.unmount()
  })
})

describe('an empty catalogue', () => {
  test('guides to the first story, where Crypte looked, in place of the canvas', async () => {
    const écran = await monte([], false, undefined, undefined, () => ({
      stories: 'src/stories',
      config: null,
    }))
    const guide = écran.wrapper.find('.empty')

    expect(guide.find('h2').text()).toBe('No story in src/stories/')
    expect(guide.find('.path').text()).toBe('src/stories/')
    expect(guide.find('.mapping').text()).toBe(
      'src/components/ui/Badge.tsx  >  src/stories/ui/Badge.ts',
    )
    expect(guide.find('pre').text()).toMatchInlineSnapshot(`
      "import { defineStories } from '@crypte/react'
      import { Badge } from '../../../src/components/ui/Badge'

      export default defineStories(Badge)"
    `)
    expect(guide.find('.outcome').text()).toBe(
      'The file appears and its story renders, without a restart.',
    )
    expect(écran.wrapper.find('.canvas').isVisible()).toBe(false)
    écran.wrapper.unmount()
  })

  test('copies the shortest story file', async () => {
    const écrit = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })
    const écran = await monte([])
    const copie = écran.wrapper.find('.empty .copy')

    await copie.trigger('click')
    await vide(écran.wrapper)
    expect(écrit).toHaveBeenCalledWith(écran.wrapper.find('.empty pre').text())
    expect(écran.wrapper.find('.empty pre').text()).toContain(
      "import { Badge } from '../../src/components/ui/Badge'",
    )
    expect(copie.text()).toBe('Copied')
    écran.wrapper.unmount()
  })

  test('says when the file could not be copied', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    })
    const écran = await monte([])

    await écran.wrapper.find('.empty .copy').trigger('click')
    await vide(écran.wrapper)
    expect(écran.wrapper.find('.empty .copy').text()).toBe('Copy failed')
    écran.wrapper.unmount()
  })

  // Les familles sont de la vue tokens : la vue stories reste vide, et le dit.
  test('says nothing before the catalogue is read, and guides the stories view beside tokens', async () => {
    const illisible = await monte([badge], true)
    expect(illisible.wrapper.find('.empty').exists()).toBe(false)
    illisible.wrapper.unmount()

    const jetonsSeuls = await monte([jetons])
    expect(jetonsSeuls.wrapper.find('.empty').exists()).toBe(true)
    await jetonsSeuls.vue('tokens').trigger('click', { button: 0 })
    await vide(jetonsSeuls.wrapper)
    expect(jetonsSeuls.wrapper.find('.empty').exists()).toBe(false)
    jetonsSeuls.wrapper.unmount()
  })
})

describe('an address the catalogue no longer holds', () => {
  test('says so, shows the first story, and lets go at the next click', async () => {
    window.history.replaceState(null, '', '/?id=badge--renommee')
    const écran = await monte([badge, alerte])

    expect(écran.wrapper.find('.stale').text().replace(/\s+/g, ' ')).toBe(
      'badge--renommee is not in the catalogue any more: it was probably renamed. Showing the first story instead.',
    )
    expect(écran.story(0).attributes('aria-selected')).toBe('true')

    await écran.story(1).trigger('click')
    await vide(écran.wrapper)
    expect(écran.wrapper.find('.stale').exists()).toBe(false)
    écran.wrapper.unmount()
  })

  test('says so for a component page too', async () => {
    window.history.replaceState(null, '', '/?component=disparu')
    const écran = await monte([badge])

    expect(écran.wrapper.find('.stale code').text()).toBe('disparu')
    écran.wrapper.unmount()
  })

  test('says nothing of an address it holds, story or family', async () => {
    window.history.replaceState(null, '', '/?id=color--brand')
    const famille = await monte([badge, jetons])
    expect(famille.wrapper.find('.stale').exists()).toBe(false)
    famille.wrapper.unmount()

    window.history.replaceState(null, '', '/?id=badge--defaut')
    const story = await monte([badge])
    expect(story.wrapper.find('.stale').exists()).toBe(false)
    story.wrapper.unmount()
  })
})

describe('the toolbar of a story', () => {
  const bouton = (écran: Ecran, texte: string) =>
    // Le libellé, sans le raccourci qui le suit.
    écran.wrapper.findAll('.toolbar button').find((one) => one.text().startsWith(texte))!

  // La preview relit le manifeste à son `ready` : la recharger suffit.
  test('reloads the preview', async ({ écran }) => {
    const recharge = await rechargeAuClic(écran.wrapper.find('iframe').element, () =>
      bouton(écran, 'Reload').trigger('click'),
    )

    expect(recharge).toHaveBeenCalledOnce()
  })

  test('copies the address of the story on display', async ({ écran }) => {
    const écrit = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })

    await bouton(écran, 'Copy link').trigger('click')
    await vide(écran.wrapper)

    expect(écrit).toHaveBeenCalledWith(window.location.href)
    expect(écran.wrapper.find('.toolbar .copy').text()).toBe('Copied')
  })

  test('says when the address could not be copied', async ({ écran }) => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    })

    await bouton(écran, 'Copy link').trigger('click')
    await vide(écran.wrapper)

    expect(écran.wrapper.find('.toolbar .copy').text()).toBe('Copy failed')
  })

  test('shows the preview alone in full screen, without navigation or panels', async ({
    écran,
  }) => {
    await écran.wrapper.find('[aria-label="Full screen"]').trigger('click')

    expect(écran.wrapper.find('main').classes()).toContain('full')
    expect(écran.wrapper.find('.nav-column').isVisible()).toBe(false)
    expect(écran.wrapper.findComponent(Panels).isVisible()).toBe(false)

    // Sur la scène, qui reste : c'est d'ici qu'on le quitte.
    await écran.wrapper.find('[aria-label="Leave full screen"]').trigger('click')
    expect(écran.wrapper.find('.nav-column').isVisible()).toBe(true)
  })

  // La bascule rouvre les panneaux en plein écran ; le quitter rend l'état d'avant.
  test('lets the panels toggle work in full screen, and restores them on leaving', async ({
    écran,
  }) => {
    const panneaux = () => écran.wrapper.find('#panels')
    const bascule = () => écran.wrapper.find('.panels-toggle')
    await écran.wrapper.find('[aria-label="Full screen"]').trigger('click')
    expect(bascule().attributes('aria-expanded')).toBe('false')

    await bascule().trigger('click')
    expect(panneaux().isVisible()).toBe(true)
    expect(bascule().attributes('aria-expanded')).toBe('true')
    await bascule().trigger('click')
    await écran.wrapper.find('[aria-label="Leave full screen"]').trigger('click')
    expect(panneaux().isVisible()).toBe(true)

    // Le seuil passé en plein écran ne rouvre rien, et décide de l'état rendu.
    await écran.wrapper.find('[aria-label="Full screen"]').trigger('click')
    rétrécit(true)
    await vide(écran.wrapper)
    await écran.wrapper.find('[aria-label="Leave full screen"]').trigger('click')
    expect(panneaux().isVisible()).toBe(false)
    await écran.wrapper.find('[aria-label="Full screen"]').trigger('click')
    rétrécit(false)
    await vide(écran.wrapper)
    expect(panneaux().isVisible()).toBe(false)
    await écran.wrapper.find('[aria-label="Leave full screen"]').trigger('click')
    expect(panneaux().isVisible()).toBe(true)

    // Fermés avant le plein écran, ils le restent en sortant.
    await bascule().trigger('click')
    await écran.wrapper.find('[aria-label="Full screen"]').trigger('click')
    await bascule().trigger('click')
    await écran.wrapper.find('[aria-label="Leave full screen"]').trigger('click')
    expect(panneaux().isVisible()).toBe(false)
  })

  test('names its shortcuts on its buttons', async ({ écran }) => {
    expect(
      écran.wrapper
        .findAll('.stage-tools [aria-keyshortcuts]')
        .map((one) => one.attributes('aria-keyshortcuts')),
    ).toEqual(['f'])
    expect(écran.wrapper.find('[aria-label="Search or run"]').attributes('aria-keyshortcuts')).toBe(
      'Control+K /',
    )
  })
})

// La story à l'échelle, son cadre à la même taille : sur la racine du document de
// la preview.
describe('the zoom', () => {
  // jsdom ne charge pas la page de la preview : un document à la place du sien.
  const racine = (écran: Ecran) => {
    const page = document.implementation.createHTMLDocument()
    Object.defineProperty(écran.wrapper.find('iframe').element, 'contentDocument', { value: page })
    return page.documentElement.style
  }
  const niveau = (écran: Ecran) => écran.wrapper.find('.stage-tools .level').text()
  // Le menu de Reka, téléporté dans le document à l'ouverture.
  const article = (texte: string) =>
    [...document.querySelectorAll('[role^="menuitem"]')].find((one) =>
      one.textContent?.trim().startsWith(texte),
    ) as HTMLElement
  const ouvre = async (écran: Ecran) => {
    await écran.wrapper.find('.stage-tools .level').trigger('keydown', { key: 'Enter' })
    await vide(écran.wrapper)
    await vide(écran.wrapper)
  }
  const choisit = async (écran: Ecran, texte: string) => {
    await ouvre(écran)
    article(texte).click()
    await vide(écran.wrapper)
  }
  const frappe = async (écran: Ecran, key: string) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await vide(écran.wrapper)
  }

  // Toute l'échelle dans le menu, le niveau courant coché ; les touches la
  // parcourent aussi, de 25 à 400 %.
  test('takes a value from its menu, and steps by its keys from 25 to 400 %', async ({ écran }) => {
    const style = racine(écran)
    await ouvre(écran)
    expect(
      [...document.querySelectorAll('[role="menuitemradio"]')].map((one) => [
        one.textContent?.trim(),
        one.getAttribute('aria-checked'),
      ]),
    ).toEqual([
      ['25 %', 'false'],
      ['50 %', 'false'],
      ['75 %', 'false'],
      ['100 %', 'true'],
      ['125 %', 'false'],
      ['150 %', 'false'],
      ['200 %', 'false'],
      ['300 %', 'false'],
      ['400 %', 'false'],
    ])
    article('150 %').click()
    await vide(écran.wrapper)
    expect(niveau(écran)).toBe('150 %')
    expect(style.zoom).toBe('1.5')

    for (let i = 0; i < 9; i += 1) await frappe(écran, '-')
    expect(niveau(écran)).toBe('25 %')
    for (let i = 0; i < 9; i += 1) await frappe(écran, '+')
    expect(niveau(écran)).toBe('400 %')
  })

  test('answers +, = and -, and comes back to actual size on 0 or from its menu', async ({
    écran,
  }) => {
    const style = racine(écran)
    await frappe(écran, '+')
    await frappe(écran, '=')
    expect(niveau(écran)).toBe('150 %')
    await frappe(écran, '-')
    expect(niveau(écran)).toBe('125 %')
    await frappe(écran, '0')
    expect(niveau(écran)).toBe('100 %')
    expect(style.zoom).toBe('')

    await frappe(écran, '+')
    await choisit(écran, '100 %')
    expect(style.zoom).toBe('')
  })

  // Menu ouvert, les touches du zoom marchent, comme son pied l'annonce ; Échap
  // le ferme sans quitter le plein écran. Revues de #146 et #151.
  test('steps by its keys while its menu is open, and keeps the others', async ({ écran }) => {
    await frappe(écran, 'f')
    await ouvre(écran)
    const menu = document.querySelector('[role="menu"]')!
    const tape = async (key: string, options: KeyboardEventInit = {}) => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
      await vide(écran.wrapper)
    }

    await tape('+')
    expect(niveau(écran)).toBe('125 %')
    // Sous ⌘ ou Ctrl, celles du navigateur.
    await tape('0', { metaKey: true })
    await tape('-', { ctrlKey: true })
    expect(niveau(écran)).toBe('125 %')
    await tape('0')
    for (const key of ['f', 'Escape']) await tape(key)

    expect(écran.wrapper.find('main').classes()).toContain('full')
    expect(niveau(écran)).toBe('100 %')
    expect(écran.wrapper.find('.stage-tools .level').attributes('aria-label')).toBe('Zoom, 100 %')
  })

  // Non modal, il laisse passer Tab, et se ferme alors : sinon le focus filait
  // dans la preview, le menu ouvert par-dessus. Revue de #156.
  test('closes its menu on Tab', async ({ écran }) => {
    await ouvre(écran)
    expect(document.querySelector('[role="menu"]')).not.toBeNull()

    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    await vide(écran.wrapper)

    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  // Ouvert, le menu se pose sur le niveau courant : un lecteur d'écran annonce
  // ce qui est choisi, pas le premier article.
  test('opens its menu on the level in use', async ({ écran }) => {
    await frappe(écran, '+')
    await ouvre(écran)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(document.activeElement?.textContent?.trim()).toBe('125 %')
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-describedby')).toBe(
      'zoom-keys',
    )
  })

  // Une page rechargée repart à 1 : chaque `ready` repose l'échelle.
  test('is set again on the page of each ready', async ({ écran }) => {
    const style = racine(écran)
    await frappe(écran, '+')
    style.zoom = ''
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(style.zoom).toBe('1.25')
  })

  test('leaves the keys alone under a page', async ({ écran }) => {
    window.history.replaceState(null, '', '/?component=badge')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    await frappe(écran, '+')

    window.history.replaceState(null, '', '/?id=badge--defaut')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(niveau(écran)).toBe('100 %')
  })
})

describe('the shortcuts', () => {
  const frappe = async (
    écran: Ecran,
    key: string,
    options: KeyboardEventInit = {},
    sur: Element = document.body,
  ) => {
    sur.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
    await vide(écran.wrapper)
  }

  // La palette est la recherche, plein écran compris.
  test('opens the palette on /', async ({ écran }) => {
    await frappe(écran, 'f')
    await frappe(écran, '/')

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(écran.wrapper.find('main').classes()).toContain('full')
  })

  test('toggles full screen with f, Escape leaving it', async ({ écran }) => {
    await frappe(écran, 'f')
    expect(écran.wrapper.find('main').classes()).toContain('full')
    await frappe(écran, 'Escape')
    expect(écran.wrapper.find('main').classes()).not.toContain('full')
  })

  test('stays out of the way while typing, and of the browser own shortcuts', async ({ écran }) => {
    const saisie = champ()
    await frappe(écran, 'f', {}, saisie)
    saisie.remove()
    await frappe(écran, 'f', { ctrlKey: true })
    await frappe(écran, 'f', { metaKey: true })

    expect(écran.wrapper.find('main').classes()).not.toContain('full')
    expect(window.location.search).toBe('?id=badge--defaut')
  })

  test('acts on a story only, never on a page', async ({ écran }) => {
    window.history.replaceState(null, '', '/?component=badge')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)

    await frappe(écran, 'f')

    expect(écran.wrapper.find('main').classes()).not.toContain('full')
    expect(window.location.search).toBe('?component=badge')
  })
})

// Les raccourcis selon le clavier, et le plein écran qu'on quitte sans Échap.
describe('the shortcuts on other keyboards', () => {
  const frappe = async (écran: Ecran, key: string, options: KeyboardEventInit = {}) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
    await vide(écran.wrapper)
  }

  // Alt+F ouvre le menu Fichier sous Windows.
  test('leaves f under Alt to the browser', async ({ écran }) => {
    await frappe(écran, 'f', { altKey: true })

    expect(écran.wrapper.find('main').classes()).not.toContain('full')
  })
})

// La colonne de droite suit la largeur, et le bouton la bascule à toute largeur.
// jsdom ne lit pas les media queries : le stub de `matchMedia` tient la largeur,
// et le cas navigateur de `screen.test.ts` la mise en page par-dessus le canvas.
describe('the panels toggle', () => {
  const bascule = (écran: Ecran) => écran.wrapper.find('.panels-toggle')
  const colonne = (écran: Ecran) => écran.wrapper.find('#panels')
  const clique = async (écran: Ecran) => {
    await bascule(écran).trigger('click')
    await vide(écran.wrapper)
  }

  test('shows the panels on a wide window, and hides them on demand', async ({ écran }) => {
    expect(bascule(écran).attributes('aria-controls')).toBe('panels')
    // Ouverte, l'icône remplit sa colonne : un tracé plein s'ajoute aux deux traits.
    const pleins = () => bascule(écran).findAll('path[fill="currentColor"]').length
    expect(bascule(écran).attributes('aria-expanded')).toBe('true')
    expect(colonne(écran).isVisible()).toBe(true)
    expect(pleins()).toBe(1)

    await clique(écran)
    expect(bascule(écran).attributes('aria-expanded')).toBe('false')
    expect(colonne(écran).isVisible()).toBe(false)
    expect(pleins()).toBe(0)

    // Dans la grille, Échap n'a rien à fermer.
    await clique(écran)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vide(écran.wrapper)
    expect(colonne(écran).isVisible()).toBe(true)
  })

  // Passer le seuil rend l'état de son côté : fermée en dessous, ouverte au-dessus.
  test('starts closed on a narrow window, and follows the threshold', async () => {
    système.étroit = true
    const écran = await monte([badge])
    expect(colonne(écran).isVisible()).toBe(false)

    await clique(écran)
    expect(colonne(écran).isVisible()).toBe(true)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vide(écran.wrapper)
    expect(colonne(écran).isVisible()).toBe(false)

    rétrécit(false)
    await vide(écran.wrapper)
    expect(colonne(écran).isVisible()).toBe(true)
    rétrécit(true)
    await vide(écran.wrapper)
    expect(colonne(écran).isVisible()).toBe(false)
    écran.wrapper.unmount()
  })

  test('hides the token panel too', async () => {
    window.history.replaceState(null, '', '/?tokens=palette')
    const écran = await monte([badge, jetons])
    expect(bascule(écran).attributes('aria-controls')).toBe('token-panel')
    expect(écran.wrapper.find('#token-panel').exists()).toBe(true)

    await clique(écran)
    expect(écran.wrapper.find('#token-panel').exists()).toBe(false)
    écran.wrapper.unmount()
  })

  // Fermée, la colonne cache l'encadré des plugins en échec : le bouton le marque.
  test('marks a plugin that failed or was refused, while the panels are hidden', async ({
    écran,
  }) => {
    const marque = () => bascule(écran).find('.trouble')
    écran.wrapper.findComponent(Panels).vm.$emit('troubles', 1)
    await vide(écran.wrapper)
    expect(marque().exists()).toBe(false)

    await clique(écran)
    expect(marque().attributes('aria-label')).toBe('a plugin failed')

    écran.wrapper.findComponent(Panels).vm.$emit('troubles', 0)
    await vide(écran.wrapper)
    expect(marque().exists()).toBe(false)
    await écran.répond({
      type: 'plugin-error',
      plugin: 'a11y',
      message: 'boom',
    } as PreviewMessage)
    expect(marque().exists()).toBe(true)
  })
})

// La comparaison : une seconde preview en dark, la première passée en light, et
// seule la première parle au shell.
// La vue santé : les composants du dossier déclaré, ce qu'il leur manque, et la
// story à créer pour qui n'en a pas.
describe('the health view', () => {
  const composants = [
    {
      name: 'Badge',
      file: 'src/components/Badge.tsx',
      export: 'Badge',
      stories: ['badge--defaut', 'badge--alerte'],
      props: 2,
      status: 'deprecated',
      changed: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      statusSince: '2026-10-14T10:00:00.000Z',
      usedBy: ['src/components/Bouton.tsx:Bouton'],
    },
    {
      name: 'Select',
      file: 'src/components/form/Select.tsx',
      export: 'default',
      stories: [],
      props: 9,
      required: 2,
      status: 'draft',
      skeleton: { file: 'stories/form/Select.tsx', source: 'squelette' },
    },
    {
      name: 'Avatar',
      file: 'src/components/Avatar.tsx',
      export: 'Avatar',
      stories: [],
      props: 2,
      required: 0,
      skeleton: { file: 'stories/Avatar.tsx', source: 'autre' },
    },
    {
      name: 'Bouton',
      file: 'src/components/Bouton.tsx',
      export: 'Bouton',
      stories: ['bouton--defaut'],
      props: 1,
      status: 'stable',
    },
  ]
  const lignes = (écran: Ecran) =>
    écran.wrapper.findAll('.health-view tbody tr').map((one) =>
      one
        .findAll('th, td')
        .map((cell) => cell.text())
        .join(' | '),
    )
  const page = async (écran: Ecran, libellé: string) => {
    await écran.wrapper
      .findAll('.health a')
      .find((one) => one.find('.label').text() === libellé)!
      .trigger('click', { button: 0 })
    await vide(écran.wrapper)
  }

  test('opens on its overview from the activity bar, with the score of its gauges', async () => {
    santé = () => ({ components: composants })
    const écran = await monte([badge, alerte, bouton])

    await écran.vue('health').trigger('click', { button: 0 })
    await vide(écran.wrapper)

    expect(window.location.search).toBe('?health=overview')
    expect(écran.wrapper.find('.score .top').text()).toBe('50 % overall health')
    expect(écran.wrapper.find('.gauge').text().replace(/\s+/g, ' ')).toBe('stories 2/4')
    expect(
      écran.wrapper
        .findAll('.health a')
        .map((one) => `${one.find('.label').text()} ${one.find('.count').text()}`),
      // L'accessibilité ne compte rien avant l'audit.
    ).toEqual(['overview 4', 'without story 2', 'render errors ', 'accessibility ', 'statuses 2'])
    // Ce qui pose problème d'abord, un point chacun : sans story, ou déprécié
    // encore utilisé ; le nom départage.
    expect(lignes(écran)).toEqual([
      'Avatar | 0 | not tested |  | ',
      'Badge | 2 | not tested | deprecated | 3 days ago',
      'Select | 0 | not tested | draft | ',
      'Bouton | 1 | not tested | stable | ',
    ])
    expect(écran.wrapper.find('.toolbar .trail').text().replace(/\s+/g, '')).toBe('health/overview')
    expect(écran.statut()).toBe('4 components, 2 with a story')
    écran.wrapper.unmount()
  })

  test('fills the panel with what the chosen component needs, under its own address', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=unstoried')
    const écran = await monte([badge, alerte, bouton])
    const écrit = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })

    expect(lignes(écran)).toEqual([
      'Select | src/components/form/Select.tsx | 9 | copy the skeleton',
      'Avatar | src/components/Avatar.tsx | 2 | copy the skeleton',
    ])
    expect(écran.wrapper.find('#health-panel .empty-note').text()).toBe(
      'Select a row to see what it needs.',
    )

    await écran.wrapper.find('.health-view tbody tr').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe(
      '?health=unstoried&item=src/components/form/Select.tsx:default',
    )
    expect(écran.wrapper.find('#health-panel h3').text()).toBe('Select · to do')
    expect(écran.wrapper.find('#health-panel code.label').text()).toBe('stories/form/Select.tsx')
    await écran.wrapper.find('#health-panel .copy').trigger('click')
    await vide(écran.wrapper)
    expect(écrit).toHaveBeenCalledWith('squelette')
    expect(écran.wrapper.find('#health-panel .copy').text()).toBe('Skeleton copied')
    // Ses props requises, à donner à sa story ; et son fichier, dans les liens.
    expect(écran.wrapper.find('[aria-label="To do"] .required').text()).toBe(
      '2 required props to fill in its Default story.',
    )
    expect(écran.wrapper.find('[aria-label="Links"] code.label').text()).toBe(
      'src/components/form/Select.tsx',
    )

    // Le bouton de la ligne copie aussi, sans la choisir.
    await écran.wrapper.findAll('.health-view .link').at(1)!.trigger('click')
    await vide(écran.wrapper)
    expect(écran.wrapper.findAll('.health-view .link').map((one) => one.text())).toEqual([
      'copy the skeleton',
      'copied',
    ])
    écran.wrapper.unmount()
  })

  // Un composant déprécié reste un problème tant qu'un autre l'importe ; sa date
  // ouvre ce qui a changé depuis, le statut compris.
  test('lists the statuses, deprecated first, and leads to the components still using one', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=statuses&item=src/components/Badge.tsx:Badge')
    const écran = await monte([badge, alerte, bouton])

    expect(lignes(écran)).toEqual([
      'Badge | deprecated | 14 Oct | 1 component',
      'Select | draft |  | no component',
    ])
    expect(écran.wrapper.find('.health-view [data-ink="error"]').text()).toBe('1 component')
    // Son état, et ce qu'il demande ; ses stories, dans les liens.
    expect(écran.wrapper.find('#health-panel .caption').text()).toBe(
      'deprecated since 14 Oct · changed 3 days ago',
    )
    const àReprendre = () => écran.wrapper.find('[aria-label="To do"] a.link')
    expect(àReprendre().text()).toBe('Deprecated: replace it in Bouton')
    expect(àReprendre().attributes('href')).toBe(
      '?health=overview&item=src/components/Bouton.tsx:Bouton',
    )
    expect(écran.wrapper.find('.toolbar [aria-current="page"]').text()).toBe('Badge')

    await écran.wrapper.find('[aria-label="Links"] a.link').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?id=badge--defaut')
    expect(écran.wrapper.find('.health-view').exists()).toBe(false)
    écran.wrapper.unmount()

    window.history.replaceState(null, '', '/?health=statuses')
    const autre = await monte([badge, alerte, bouton])
    await autre.wrapper.find('.health-view .since').trigger('click', { button: 0 })
    await vide(autre.wrapper)
    expect(window.location.search).toBe('?changes&before=2026-10-14T10:00:00.000Z')
    autre.wrapper.unmount()
  })

  // Une page que la vue n'a pas mène à la vue d'ensemble.
  test('opens an unknown page on the overview, and changes page from the sidebar', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=nope')
    const écran = await monte([badge, alerte, bouton])

    expect(écran.wrapper.find('.health [aria-current="page"] .label').text()).toBe('overview')
    await page(écran, 'without story')
    expect(window.location.search).toBe('?health=unstoried')
    expect(écran.wrapper.find('.health-view h2').text()).toBe('without story')
    écran.wrapper.unmount()
  })

  // L'audit : chaque story en light puis en dark dans une preview cachée, et ce
  // que le plugin a11y en dit, une ligne par story et par règle.
  test('audits every story in both themes, and lists what the a11y plugin finds', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=accessibility')
    const écran = await monte([badge, alerte, bouton])
    const vue = () => écran.wrapper.find('[aria-label="Health, accessibility"]')

    expect(vue().find('.empty-note').text()).toContain('Install @crypte/a11y')
    écran.wrapper.findComponent(Panels).vm.$emit('weights', [{ plugin: 'a11y', bytes: 1 }])
    await vide(écran.wrapper)
    expect(écran.wrapper.find('.gauge:nth-of-type(3)').exists()).toBe(false)

    const contraste = {
      rule: 'color-contrast',
      impact: 'serious',
      help: 'Elements must meet minimum color contrast',
      helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
      targets: ['.badge'],
    }
    const nom = {
      ...contraste,
      rule: 'button-name',
      impact: 'critical',
      help: 'Buttons must have discernible text',
      targets: ['button'],
    }
    const demandés: unknown[] = []
    await vue().find('.run').trigger('click')
    await vide(écran.wrapper)
    const cadre = écran.wrapper.find('.audit-frame').element as HTMLIFrameElement
    const dit = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: window.location.origin,
          source: cadre.contentWindow,
        }),
      )
    cadre.contentWindow!.addEventListener('message', (event) => {
      const { id, theme } = event.data as { id: string; theme: string }
      demandés.push(`${id} ${theme}`)
      const violations =
        id === 'badge--alerte' && theme === 'dark'
          ? [contraste]
          : id === 'bouton--defaut'
            ? [nom]
            : []
      setTimeout(() => dit({ type: 'a11y:results', id, passes: 3, violations }))
    })
    dit({ type: 'ready', protocolVersion: 1 })
    await expect.poll(() => écran.wrapper.find('.audit-frame').exists()).toBe(false)
    await vide(écran.wrapper)

    expect(demandés).toEqual([
      'badge--defaut light',
      'badge--defaut dark',
      'badge--alerte light',
      'badge--alerte dark',
      'bouton--defaut light',
      'bouton--defaut dark',
    ])
    expect(
      vue()
        .findAll('.cards li')
        .map((one) => one.text().replace(/\s+/g, ' ')),
    ).toEqual(['1 story without violation', '1 serious violation', '1 critical violation'])
    expect(
      vue()
        .findAll('tbody tr')
        .map((one) =>
          one
            .findAll('th, td')
            .map((cell) => cell.text())
            .join(' | '),
        ),
    ).toEqual([
      'Bouton / Par défaut | button-name | Buttons must have discernible text, in light and dark | critical',
      'Badge / Alerte | color-contrast | Elements must meet minimum color contrast, in dark | serious',
    ])
    // La jauge a11y apparaît, et le score en fait la moyenne avec les stories.
    expect(écran.wrapper.findAll('.gauge').map((one) => one.text().replace(/\s+/g, ' '))).toEqual([
      'stories 2/4',
      'render 3/3',
      'a11y 1/3',
    ])
    expect(écran.wrapper.find('.score .top strong').text()).toBe('61 %')
    expect(écran.statut()).toMatch(/^audit of 3 stories in \d+\.\d s$/)

    // Une violation choisie remplit le panneau : la story, les éléments, la règle.
    await vue().find('tbody tr').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?health=accessibility&item=bouton--defaut:button-name')
    expect(écran.wrapper.find('#health-panel h3').text()).toBe('button-name · to do')
    expect(écran.wrapper.find('#health-panel code.label').text()).toBe('button')

    // La vue d'ensemble compte les violations par composant.
    await page(écran, 'overview')
    expect(lignes(écran).map((one) => one.split(' | ').slice(0, 3).join(' | '))).toEqual([
      'Avatar | 0 | not tested',
      'Badge | 2 | 1 violation',
      'Select | 0 | not tested',
      'Bouton | 1 | 1 violation',
    ])
    écran.wrapper.unmount()
  })

  // Une preview qui ne dit jamais `ready` : l'audit s'arrête, et la page dit pourquoi.
  test('says why the audit could not run', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=accessibility')
    const écran = await monte([badge])
    écran.wrapper.findComponent(Panels).vm.$emit('weights', [{ plugin: 'a11y', bytes: 1 }])
    await vide(écran.wrapper)

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await écran.wrapper.find('[aria-label="Health, accessibility"] .run').trigger('click')
      await vi.advanceTimersByTimeAsync(9000)
    } finally {
      vi.useRealTimers()
    }
    await vide(écran.wrapper)

    expect(écran.wrapper.find('.audit-frame').exists()).toBe(false)
    expect(écran.wrapper.find('[data-failed]').text()).toBe(
      'The audit could not run: the preview never said it was ready.',
    )
    écran.wrapper.unmount()
  })

  // Une story qui ne rend pas n'est pas propre, et l'audit la nomme.
  test('lists the stories that fail to render on their own page', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=accessibility')
    const écran = await monte([badge, alerte])
    écran.wrapper.findComponent(Panels).vm.$emit('weights', [{ plugin: 'a11y', bytes: 1 }])
    await vide(écran.wrapper)

    await écran.wrapper.find('[aria-label="Health, accessibility"] .run').trigger('click')
    await vide(écran.wrapper)
    const cadre = écran.wrapper.find('.audit-frame').element as HTMLIFrameElement
    const dit = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: window.location.origin,
          source: cadre.contentWindow,
        }),
      )
    cadre.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      setTimeout(() =>
        dit(
          id === 'badge--alerte'
            ? { type: 'error', id, message: 'boum' }
            : { type: 'a11y:results', id, passes: 1, violations: [] },
        ),
      )
    })
    dit({ type: 'ready', protocolVersion: 1 })
    await expect.poll(() => écran.wrapper.find('.audit-frame').exists()).toBe(false)
    await vide(écran.wrapper)

    // Un rendu en échec n'est pas une story non auditée : il a sa page.
    expect(écran.wrapper.find('.unaudited').exists()).toBe(false)
    expect(écran.wrapper.find('.cards li').text().replace(/\s+/g, ' ')).toBe(
      '1 story without violation',
    )
    await page(écran, 'render errors')
    expect(écran.wrapper.find('.health [aria-current="page"] .count').text()).toBe('1')
    expect(
      écran.wrapper.findAll('[aria-label="Health, render errors"] tbody tr').map((one) =>
        one
          .findAll('th, td')
          .map((cell) => cell.text())
          .join(' | '),
      ),
    ).toEqual(['Badge / Alerte | boum | light and dark'])
    await écran.wrapper
      .find('[aria-label="Health, render errors"] tbody tr')
      .trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(écran.wrapper.find('[aria-label="To do"] .message').text()).toBe('boum')
    expect(écran.wrapper.findAll('.gauge').map((one) => one.text().replace(/\s+/g, ' '))).toContain(
      'render 1/2',
    )
    écran.wrapper.unmount()
  })

  // L'audit part seul, une fois la première story rendue et les plugins lus, et
  // le badge de Santé compte ce qu'il reste à faire.
  test('runs the audit at start, and counts what is left to do on its badge', async () => {
    santé = () => ({ components: composants })
    const écran = await monte([badge, alerte, bouton])
    const badgeSanté = () => écran.vue('health').find('.count')
    await expect.poll(() => badgeSanté().exists()).toBe(true)
    expect(badgeSanté().text()).toBe('2')
    expect(écran.wrapper.find('.audit-frame').exists()).toBe(false)

    écran.wrapper.findComponent(Panels).vm.$emit('weights', [])
    await écran.répond({
      type: 'rendered',
      id: 'badge--defaut',
      durationMs: 1,
      values: {},
    } as PreviewMessage)
    expect(écran.wrapper.find('.audit-frame').exists()).toBe(true)

    // Sans le plugin a11y, l'audit attend le rendu seul.
    const cadre = écran.wrapper.find('.audit-frame').element as HTMLIFrameElement
    const dit = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: window.location.origin,
          source: cadre.contentWindow,
        }),
      )
    cadre.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      setTimeout(() =>
        dit(
          id === 'bouton--defaut'
            ? { type: 'error', id, message: 'boum' }
            : { type: 'rendered', id, durationMs: 1, values: {} },
        ),
      )
    })
    dit({ type: 'ready', protocolVersion: 1 })
    await expect.poll(() => écran.wrapper.find('.audit-frame').exists()).toBe(false)
    await vide(écran.wrapper)
    expect(badgeSanté().text()).toBe('3')

    // Le rendu ne part qu'une fois : une autre story rendue ne le relance pas.
    await écran.répond({
      type: 'rendered',
      id: 'badge--alerte',
      durationMs: 1,
      values: {},
    } as PreviewMessage)
    expect(écran.wrapper.find('.audit-frame').exists()).toBe(false)
    écran.wrapper.unmount()
  })

  // Un défaut de contraste nomme les tokens dont la valeur est une couleur
  // mesurée, avec le nombre de composants qui les lisent, chacun menant au token.
  test('names the tokens probably behind a contrast violation', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=accessibility')
    const lecteur = { ...bouton, component: { ...bouton.component, tokens: ['Brand-primary'] } }
    const écran = await monte([badge, alerte, lecteur, jetons])
    écran.wrapper.findComponent(Panels).vm.$emit('weights', [{ plugin: 'a11y', bytes: 1 }])
    await vide(écran.wrapper)
    const contraste = {
      rule: 'color-contrast',
      impact: 'serious',
      help: 'Elements must meet minimum color contrast ratio thresholds',
      helpUrl: 'u',
      targets: ['button'],
      colors: ['#4FE0A0', '#ffffff'],
    }
    await écran.wrapper.find('[aria-label="Health, accessibility"] .run').trigger('click')
    await vide(écran.wrapper)
    const cadre = écran.wrapper.find('.audit-frame').element as HTMLIFrameElement
    const dit = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: window.location.origin,
          source: cadre.contentWindow,
        }),
      )
    cadre.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      setTimeout(() =>
        dit({
          type: 'a11y:results',
          id,
          passes: 1,
          violations: id === 'bouton--defaut' ? [contraste] : [],
        }),
      )
    })
    dit({ type: 'ready', protocolVersion: 1 })
    await expect.poll(() => écran.wrapper.find('.audit-frame').exists()).toBe(false)
    await vide(écran.wrapper)

    await écran.wrapper
      .find('[aria-label="Health, accessibility"] tbody tr')
      .trigger('click', { button: 0 })
    await vide(écran.wrapper)
    const liens = écran.wrapper.find('[aria-label="Links"]')
    expect(liens.findAll('.caption').map((one) => one.text())).toContain(
      'tokens probably at fault · 1',
    )
    const suspect = liens
      .findAll('a.link')
      .find((one) => one.find('code').exists() && one.find('code').text() === 'Brand-primary')!
    expect(suspect.find('.meta').text()).toBe('1 component')
    await suspect.trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toContain('token=Brand-primary')
    écran.wrapper.unmount()
  })

  // Sans rien à corriger, le bouton du prompt reste à sa place, désactivé.
  test('keeps its prompt button disabled with nothing to fix', async () => {
    santé = () => ({ components: composants.filter((one) => one.stories.length > 0) })
    window.history.replaceState(null, '', '/?health=overview')
    const écran = await monte([badge, alerte, bouton])
    const prompt = () => écran.wrapper.find('.toolbar .prompt')
    expect(prompt().attributes('disabled')).toBeDefined()

    santé = () => ({ components: composants })
    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)
    expect(prompt().attributes('disabled')).toBeUndefined()
    écran.wrapper.unmount()
  })

  // Le panneau To do mène à ce qu'il nomme : le rendu en échec d'une story, les
  // violations d'un composant ; Links, à sa page.
  test('leads from the to do of a component to its render errors and violations', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=accessibility')
    const écran = await monte([badge, alerte, bouton])
    écran.wrapper.findComponent(Panels).vm.$emit('weights', [{ plugin: 'a11y', bytes: 1 }])
    await vide(écran.wrapper)
    const nom = {
      rule: 'button-name',
      impact: 'critical',
      help: 'Buttons must have discernible text',
      helpUrl: 'u',
      targets: ['button'],
    }
    const lance = async () => {
      await écran.wrapper.find('[aria-label="Health, accessibility"] .run').trigger('click')
      await vide(écran.wrapper)
      const cadre = écran.wrapper.find('.audit-frame').element as HTMLIFrameElement
      const dit = (data: unknown) =>
        window.dispatchEvent(
          new MessageEvent('message', {
            data,
            origin: window.location.origin,
            source: cadre.contentWindow,
          }),
        )
      cadre.contentWindow!.addEventListener('message', (event) => {
        const { id } = event.data as { id: string }
        setTimeout(() =>
          dit(
            id === 'bouton--defaut'
              ? { type: 'a11y:results', id, passes: 1, violations: [nom] }
              : { type: 'error', id, message: `boum ${id}` },
          ),
        )
      })
      dit({ type: 'ready', protocolVersion: 1 })
      await expect.poll(() => écran.wrapper.find('.audit-frame').exists()).toBe(false)
      await vide(écran.wrapper)
    }
    await lance()
    // Relancé à la demande : les mêmes résultats.
    await lance()

    const choisit = async (lien: string) => {
      await page(écran, 'overview')
      await écran.wrapper.find(`a[href="${lien}"]`).trigger('click', { button: 0 })
      await vide(écran.wrapper)
    }
    // La vue d'ensemble liste tout ce que compte le badge, l'audit compris, chaque
    // ligne menant à sa page.
    await page(écran, 'overview')
    const liste = () => écran.wrapper.find('[aria-label="Everything to do"]')
    expect(
      liste()
        .findAll('a')
        .map((one) => `${one.text()} → ${one.attributes('href')}`),
    ).toEqual([
      'Fix the render of Badge / Alerte → ?health=failures&item=badge--alerte',
      'Fix the render of Badge / Par défaut → ?health=failures&item=badge--defaut',
      'Fix button-name in Bouton / Par défaut → ?health=accessibility&item=bouton--defaut:button-name',
      'Write the story of Select → ?health=unstoried&item=src/components/form/Select.tsx:default',
      'Write the story of Avatar → ?health=unstoried&item=src/components/Avatar.tsx:Avatar',
    ])
    expect(écran.vue('health').find('.count').text()).toBe('5')

    // Tout ce qui reste, en un prompt : un titre par point, dans l'ordre de la
    // liste. Le texte même est tenu par prompt.test.ts.
    const écrit = vi.fn(async (_texte: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })
    const titres = () =>
      écrit.mock.lastCall![0].split('\n').filter((ligne) => ligne.startsWith('### '))
    await écran.wrapper.find('.toolbar .prompt').trigger('click')
    await vide(écran.wrapper)
    expect(titres()).toEqual([
      '### Badge / Alerte',
      '### Badge / Par défaut',
      '### button-name in Bouton / Par défaut (critical)',
      '### Select',
      '### Avatar',
    ])
    expect(écran.wrapper.find('.toolbar .prompt').text()).toBe('Fix prompt copied')
    // Une liste qui change oublie la copie : le texte copié n'est plus celui-là.
    santé = () => ({ components: composants.filter((one) => one.name !== 'Avatar') })
    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)
    expect(écran.wrapper.find('.toolbar .prompt').text()).toBe('Copy fix prompt')
    santé = () => ({ components: composants })
    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)
    await liste().find('a').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?health=failures&item=badge--alerte')

    await choisit('?health=overview&item=src/components/Badge.tsx:Badge')
    const àFaire = () => écran.wrapper.find('[aria-label="To do"]')
    expect(
      àFaire()
        .findAll('a.link')
        .map((one) => one.text()),
    ).toEqual([
      'Fix the render of Alerte',
      'Fix the render of Par défaut',
      'Deprecated: replace it in Bouton',
    ])
    // Le prompt de ce que le composant demande, ses deux rendus.
    await àFaire().find('.head .prompt').trigger('click')
    await vide(écran.wrapper)
    expect(titres()).toEqual(['### Badge / Alerte', '### Badge / Par défaut'])
    expect(àFaire().find('.head .prompt').text()).toBe('Fix prompt copied')
    await àFaire().find('a.link').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?health=failures&item=badge--alerte')
    expect(
      écran.wrapper
        .findAll('[aria-label="Health, render errors"] tbody th')
        .map((one) => one.text()),
    ).toEqual(['Badge / Alerte', 'Badge / Par défaut'])

    // Le fil d'Ariane ramène à la page, la ligne choisie oubliée.
    await choisit('?health=overview&item=src/components/Bouton.tsx:Bouton')
    await àFaire().find('a.link').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?health=accessibility&item=bouton--defaut:button-name')

    await choisit('?health=overview&item=src/components/Bouton.tsx:Bouton')
    await écran.wrapper.find('.toolbar .trail a').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?health=overview')

    await choisit('?health=overview&item=src/components/Bouton.tsx:Bouton')
    await écran.wrapper
      .find('[aria-label="Links"] a[href="?component=bouton"]')
      .trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?component=bouton')
    écran.wrapper.unmount()
  })

  // La première story lève : l'audit part quand même, la liste des plugins ayant
  // échoué ; et la page des rendus le relance, ou dit pourquoi il n'a pas tourné.
  test('starts after a first render that throws, and runs again from its page', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=failures')
    const écran = await monte([badge, alerte, bouton])
    const vue = () => écran.wrapper.find('[aria-label="Health, render errors"]')
    expect(vue().find('.empty-note').text()).toBe('The audit has not run yet.')

    écran.wrapper.findComponent(Panels).vm.$emit('troubles', 1)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const principale = écran.wrapper.find('iframe').element as HTMLIFrameElement
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'error', id: 'badge--defaut', message: 'boum' },
          origin: window.location.origin,
          source: principale.contentWindow,
        }),
      )
      await vi.advanceTimersByTimeAsync(10)
      expect(écran.wrapper.find('.audit-frame').exists()).toBe(true)
      expect(vue().find('[role="status"]').text()).toBe('Rendering every story, 0 of 6 renders.')
      await vi.advanceTimersByTimeAsync(9000)
    } finally {
      vi.useRealTimers()
    }
    await vide(écran.wrapper)
    expect(vue().find('[data-failed]').text()).toBe(
      'The audit could not run: the preview never said it was ready.',
    )

    // Relancé d'ici, sans plugin a11y : chaque story rend.
    await vue().find('.run').trigger('click')
    await vide(écran.wrapper)
    const cadre = écran.wrapper.find('.audit-frame').element as HTMLIFrameElement
    const dit = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: window.location.origin,
          source: cadre.contentWindow,
        }),
      )
    cadre.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      setTimeout(() => dit({ type: 'rendered', id, durationMs: 1, values: {} }))
    })
    dit({ type: 'ready', protocolVersion: 1 })
    await expect.poll(() => écran.wrapper.find('.audit-frame').exists()).toBe(false)
    await vide(écran.wrapper)
    expect(vue().find('.empty-note').text()).toBe('Every story renders.')
    expect(vue().find('[data-failed]').exists()).toBe(false)
    expect(vue().find('.run').text()).toBe('Run again')
    écran.wrapper.unmount()
  })

  // Hors de la vue aussi : le badge suit les composants sans story.
  test('reads the health again on focus for the badge, outside its view', async () => {
    santé = () => ({ components: composants })
    const écran = await monte([badge, alerte, bouton])
    const badgeSanté = () => écran.vue('health').find('.count')
    await expect.poll(() => badgeSanté().exists()).toBe(true)
    expect(badgeSanté().text()).toBe('2')

    santé = () => ({ components: composants.filter((one) => one.name !== 'Avatar') })
    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)
    await vide(écran.wrapper)
    expect(badgeSanté().text()).toBe('1')
    écran.wrapper.unmount()
  })

  // Le cœur de Santé se remplit selon le score, que son tooltip dit en clair ; la
  // vue d'ensemble liste ce que compte le badge ; ses panneaux se plient.
  test('fills its heart with the score, lists what its badge counts, and folds its panels', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=overview&item=src/components/Bouton.tsx:Bouton')
    const écran = await monte([badge, alerte, bouton])
    await expect.poll(() => écran.vue('health').find('.count').exists()).toBe(true)

    // 50 % : la moitié du cœur, de 3,5 à 20,5 dans sa grille, part du bas.
    expect(écran.vue('health').find('clipPath rect').attributes('y')).toBe('12')
    expect(
      écran.wrapper
        .findComponent(ActivityBar)
        .findAllComponents(Tooltip)
        .find((one) => one.props('content') === 'health')
        ?.props('detail'),
    ).toBe('50 % · 2 to do')

    const liste = () => écran.wrapper.find('[aria-label="Everything to do"]')
    expect(liste().find('.badge').text()).toBe('2')
    expect(
      liste()
        .findAll('a')
        .map((one) => one.text()),
    ).toEqual(['Write the story of Select', 'Write the story of Avatar'])
    await liste().find('a').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe(
      '?health=unstoried&item=src/components/form/Select.tsx:default',
    )

    // Tout l'en-tête plie son panneau ; ouverts au départ, sans source, le repli
    // retenu comme celui des panneaux des stories.
    const entête = (nom: string) => écran.wrapper.find(`[aria-label="${nom}"] .toggle`)
    const corps = (nom: string) => écran.wrapper.find(`[aria-label="${nom}"] .body`)
    expect(entête('To do').attributes('aria-expanded')).toBe('true')
    expect(écran.wrapper.find('#health-panel .head .note').exists()).toBe(false)
    await entête('Links').trigger('click')
    expect(entête('Links').attributes('aria-expanded')).toBe('false')
    expect(corps('Links').isVisible()).toBe(false)
    expect(corps('To do').isVisible()).toBe(true)
    expect(localStorage.getItem('crypte:panel:shell:links')).toBe('false')
    écran.wrapper.unmount()
  })

  // Les tokens que lisent ses stories, menant à leur catégorie quand elle existe.
  test('links the tokens its stories read', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=overview&item=src/components/Bouton.tsx:Bouton')
    const lecteur = {
      ...bouton,
      component: { ...bouton.component, tokens: ['Brand-primary', 'absent-x'] },
    }
    const écran = await monte([badge, alerte, lecteur, jetons])
    const liens = écran.wrapper.find('[aria-label="Links"]')

    expect(liens.findAll('a.link code.label').map((one) => one.text())).toEqual(['Brand-primary'])
    expect(liens.find('a.link[href*="tokens"]').attributes('href')).toBe(
      '?tokens=palette&token=Brand-primary',
    )
    expect(liens.findAll('p.row code.label').map((one) => one.text())).toContain('absent-x')
    await liens.find('a.link[href*="tokens"]').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?tokens=palette&token=Brand-primary')
    écran.wrapper.unmount()
  })

  // Un composant sans story est hors du catalogue : rien ne surveille son fichier,
  // et la vue relit ses données au retour sur la fenêtre.
  test('reads its data again when the window regains focus', async () => {
    santé = () => ({ components: composants })
    window.history.replaceState(null, '', '/?health=unstoried')
    const écran = await monte([badge, alerte, bouton])
    expect(lignes(écran)).toHaveLength(2)

    santé = () => ({ components: composants.filter((one) => one.name !== 'Avatar') })
    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)
    await vide(écran.wrapper)
    expect(lignes(écran)).toHaveLength(1)
    écran.wrapper.unmount()
  })

  // Une route qui ne répond pas n'est pas un dossier absent : aucun guide à copier.
  test('says the data could not be read, rather than asking for a folder', async () => {
    santé = () => {
      throw new Error('500')
    }
    window.history.replaceState(null, '', '/?health=overview')
    const écran = await monte([badge])

    expect(écran.wrapper.find('.health .empty-note').text()).toBe('could not be read')
    expect(écran.wrapper.find('.empty').exists()).toBe(false)
    expect(écran.statut()).toBe('the health of the components could not be read')
    écran.wrapper.unmount()
  })

  test('says how to declare a components folder when the project has none', async () => {
    window.history.replaceState(null, '', '/?health=overview')
    const écran = await monte([badge])

    expect(écran.wrapper.find('.health .empty-note').text()).toBe('No components folder.')
    expect(écran.wrapper.find('.empty h2').text()).toBe('No components folder')
    expect(écran.wrapper.find('#health-panel').exists()).toBe(false)
    expect(écran.statut()).toBe('no components folder declared')
    écran.wrapper.unmount()
  })
})

describe('the light and dark comparison', () => {
  const bouton = (écran: Ecran) => écran.wrapper.find('[aria-label="Compare light and dark"]')
  const sombre = (écran: Ecran) => écran.wrapper.find('iframe[title="preview, dark"]')

  test('draws the story in light and in dark, side by side, until pressed again', async ({
    écran,
  }) => {
    change(true)
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect.poll(() => écran.envoyés.at(-1)).toMatchObject({ theme: 'dark' })
    expect(sombre(écran).exists()).toBe(false)

    expect(bouton(écran).attributes('aria-pressed')).toBe('false')
    await bouton(écran).trigger('click')
    expect(bouton(écran).attributes('aria-pressed')).toBe('true')
    expect(écran.wrapper.findAll('figcaption').map((one) => one.text())).toEqual(['light', 'dark'])
    // Chaque cadre porte le fond du thème qu'il dessine, et la première passe en
    // light, même sous un shell sombre.
    expect(écran.wrapper.findAll('iframe').map((one) => one.attributes('data-scheme'))).toEqual([
      'light',
      'dark',
    ])
    await expect.poll(() => écran.envoyés.at(-1)).toMatchObject({ theme: 'light' })

    const cadre = sombre(écran).element as HTMLIFrameElement
    const reçus: ShellMessage[] = []
    cadre.contentWindow!.addEventListener('message', (event) =>
      reçus.push(event.data as ShellMessage),
    )
    const dit = async (message: PreviewMessage) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: message,
          origin: window.location.origin,
          source: cadre.contentWindow,
        }),
      )
      await vide(écran.wrapper)
    }
    await dit({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect
      .poll(() => reçus.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {}, theme: 'dark' })

    // Une valeur éditée rend les deux ; une erreur de la seconde ne couvre rien.
    écran.wrapper.findComponent(Panels).vm.$emit('overrides', { label: 'Neuf' })
    await vide(écran.wrapper)
    await expect
      .poll(() => reçus.at(-1))
      .toMatchObject({ overrides: { label: 'Neuf' }, theme: 'dark' })
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toMatchObject({ overrides: { label: 'Neuf' }, theme: 'light' })
    await dit({ type: 'error', id: 'badge--defaut', message: 'boum' } as PreviewMessage)
    expect(écran.wrapper.find('.failure').exists()).toBe(false)

    await bouton(écran).trigger('click')
    expect(sombre(écran).exists()).toBe(false)
    expect(écran.wrapper.find('figcaption').exists()).toBe(false)
    await expect.poll(() => écran.envoyés.at(-1)).toMatchObject({ theme: 'dark' })
  })
})

// Une valeur de token essayée part avec chaque rendu de la preview, la barre
// d'état le dit, et Reset rend la valeur du fichier : rien n'est écrit.
describe('a token value tried', () => {
  test('travels with every render until it is reset', async () => {
    window.history.replaceState(null, '', '/?tokens=palette&token=Brand-primary')
    const écran = await monte([badge, alerte, jetons])
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    const champ = () => écran.wrapper.find('#token-panel .try input')
    const dernier = () =>
      écran.envoyés.filter((one) => one.type === 'render').at(-1) as { tokens?: unknown }

    await champ().setValue('#e11d48')
    await vide(écran.wrapper)
    expect(dernier().tokens).toEqual({ 'Brand-primary': '#e11d48' })
    expect(écran.wrapper.find('.status-bar .tried').text()).toBe('1 token tried')
    expect(écran.wrapper.find('.tokens-view .value').text()).toBe('#E11D48')

    await écran.wrapper.find('#token-panel .try .reset').trigger('click')
    await vide(écran.wrapper)
    expect(dernier().tokens).toBeUndefined()
    expect(écran.wrapper.find('.status-bar .tried').exists()).toBe(false)
    écran.wrapper.unmount()
  })
})

// La vue d'un plugin, section 6.1 : son entrée sous un séparateur, sa sidebar,
// son canvas et son panneau, l'élément choisi dans l'adresse.
describe('the view of a plugin', () => {
  const partie = (nom: string, choix?: string) =>
    defineComponent({
      props: { item: { type: String, default: null } },
      emits: ['item'],
      setup:
        (props, { emit }) =>
        () =>
          h('div', { class: nom }, [
            `${nom}:${props.item ?? 'none'}`,
            ...(choix ? [h('button', { onClick: () => emit('item', choix) }, choix)] : []),
          ]),
    })
  const i18n = {
    name: 'i18n',
    label: 'i18n',
    icon: [['path', { d: 'M0 0' }]] as [string, Record<string, string>][],
    canvas: partie('canvas'),
    sidebar: partie('side', 'fr'),
    panel: partie('detail'),
  }
  const clique = async (écran: Ecran, cible: DOMWrapper<Element>) => {
    await cible.trigger('click', { button: 0 })
    await vide(écran.wrapper)
  }
  const vues = async (écran: Ecran, liste: unknown[]) => {
    écran.wrapper.findComponent(Panels).vm.$emit('views', liste)
    écran.wrapper.findComponent(Panels).vm.$emit('troubles', 0)
    await vide(écran.wrapper)
  }

  test('opens from its entry, chooses an item from its sidebar, and keeps it in the address', async () => {
    const écran = await monte([badge, alerte])
    await vues(écran, [i18n])
    await clique(écran, écran.vue('i18n'))
    expect(window.location.search).toBe('?view=i18n')
    expect(écran.wrapper.find('.sidebar .column-title').text()).toBe('i18n')
    expect(écran.wrapper.find('.plugin-view .canvas').text()).toBe('canvas:none')
    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)

    await clique(écran, écran.wrapper.find('.sidebar .side button'))
    expect(window.location.search).toBe('?view=i18n&item=fr')
    expect(écran.wrapper.find('.plugin-view .canvas').text()).toBe('canvas:fr')
    expect(écran.wrapper.find('#view-panel .detail').text()).toBe('detail:fr')
    expect(écran.wrapper.find('.toolbar .trail').text().replace(/\s+/g, '')).toBe('i18n/fr')

    // Son panneau se replie comme les autres, retenu sous sa propre clé.
    await écran.wrapper.find('#view-panel .toggle').trigger('click')
    expect(localStorage.getItem('crypte:panel:view:i18n')).toBe('false')

    await clique(écran, écran.vue('stories'))
    expect(écran.wrapper.find('.plugin-view').exists()).toBe(false)
    expect(écran.wrapper.find('iframe').isVisible()).toBe(true)

    // Elle s'ouvre aussi depuis ⌘K, parmi les pages.
    écran.wrapper.findComponent(ActivityBar).vm.$emit('search')
    await vide(écran.wrapper)
    const ligne = [...document.querySelectorAll('[role="dialog"] [role="option"]')].find((one) =>
      one.textContent?.includes('i18n'),
    ) as HTMLElement
    expect(ligne.textContent?.replace(/\s+/g, '')).toBe('viewi18n')
    ligne.click()
    await vide(écran.wrapper)
    expect(window.location.search).toBe('?view=i18n')
    écran.wrapper.unmount()
  })

  // L'adresse d'arrivée ouvre la vue dès que ses composants arrivent ; une vue
  // qu'aucun plugin ne dessine le dit, une fois la liste lue.
  test('opens from its address, and says when no plugin draws it', async () => {
    window.history.replaceState(null, '', '/?view=i18n&item=de')
    const écran = await monte([badge, alerte])
    await vues(écran, [i18n])
    expect(écran.wrapper.find('.plugin-view .canvas').text()).toBe('canvas:de')
    écran.wrapper.unmount()

    window.history.replaceState(null, '', '/?view=absente')
    const autre = await monte([badge, alerte])
    await vues(autre, [i18n])
    expect(autre.wrapper.find('.stage .empty-note').text()).toBe(
      'No plugin draws a view named absente.',
    )
    autre.wrapper.unmount()
  })
})

describe('leaving full screen without Escape', () => {
  test('is left when a page opens, and does not come back with the next story', async ({
    écran,
  }) => {
    const plein = () => écran.wrapper.find('main').classes().includes('full')
    await écran.wrapper.find('[aria-label="Full screen"]').trigger('click')
    expect(plein()).toBe(true)

    await écran.wrapper.find('nav.trail a').trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(écran.wrapper.find('.component-page').exists()).toBe(true)

    await écran.story(1).trigger('click')
    await vide(écran.wrapper)
    expect(plein()).toBe(false)
    expect(écran.wrapper.find('.nav-column').isVisible()).toBe(true)
  })

  // Sans story affichée, aucune barre ne permettrait d'en sortir.
  test('is never entered with no story on display', async () => {
    const écran = await monte([])

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    await vide(écran.wrapper)

    expect(écran.wrapper.find('main').classes()).not.toContain('full')
    expect(écran.wrapper.find('.nav-column').isVisible()).toBe(true)
    écran.wrapper.unmount()
  })

  // Le fichier de la story affichée supprimé : la barre et son bouton de sortie partent.
  test('is left when the story on display goes', async () => {
    const manifests: Manifest[] = [
      { version: 1, entries: [badge, bouton] },
      { version: 1, entries: [bouton] },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [], weights: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
                  : url === '/@crypte/health.json'
                    ? { components: null }
                    : url === '/@crypte/project.json'
                      ? { stories: 'stories', config: null, shellBytes: 83149, version: '1.2.3' }
                      : manifests.length > 1
                        ? manifests.shift()
                        : manifests[0],
          }) as Response,
      ),
    )
    const wrapper = mount(App, { attachTo: document.body })
    await vide(wrapper)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    await vide(wrapper)
    expect(wrapper.find('main').classes()).toContain('full')

    const frame = wrapper.find('iframe').element as HTMLIFrameElement
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ready', protocolVersion: 1 },
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
    await vide(wrapper)

    expect(wrapper.find('main').classes()).not.toContain('full')
    expect(wrapper.find('.nav-column').isVisible()).toBe(true)

    // Quitté, pas masqué : la story suivante ne le rallume pas.
    await wrapper.find('[role="treeitem"].story').trigger('click')
    await vide(wrapper)
    expect(window.location.search).toBe('?id=bouton--defaut')
    expect(wrapper.find('main').classes()).not.toContain('full')
    wrapper.unmount()
  })
})

describe('the version', () => {
  test('is written in the status bar, once the project is read', async ({ écran }) => {
    expect(écran.wrapper.find('.status-bar .version').text()).toBe('Crypte 1.2.3')
  })
})

describe('the figures of the status bar', () => {
  const chiffres = (écran: Ecran) => écran.wrapper.findAll('.figures li').map((one) => one.text())

  test('weighs the shell as the server measured it', async ({ écran }) => {
    expect(chiffres(écran)).toEqual(['Shell 83.1 kB'])
    expect(écran.wrapper.find('.figures li').findComponent(Tooltip).props('content')).toBe(
      'The shell, gzipped',
    )
  })

  // Rien tant que le projet ne se lit pas, plutôt qu'un chiffre faux.
  test('weighs nothing and names no version when the project cannot be read', async () => {
    const écran = await monte([badge], false, undefined, undefined, () => {
      throw new Error('hors ligne')
    })

    expect(chiffres(écran)).toEqual([])
    expect(écran.wrapper.find('.version').exists()).toBe(false)
    écran.wrapper.unmount()
  })

  // De l'ouverture de la page à la première story rendue, et seulement elle :
  // les rendus suivants ne la déplacent pas.
  test('times the first render from the opening of the page, once', async ({ écran }) => {
    const maintenant = vi.spyOn(performance, 'now')
    expect(chiffres(écran)).toEqual(['Shell 83.1 kB'])

    maintenant.mockReturnValue(1234.4)
    await écran.répond({ type: 'rendered', id: 'badge--defaut', durationMs: 1 } as PreviewMessage)
    maintenant.mockReturnValue(9999)
    await écran.répond({ type: 'rendered', id: 'badge--alerte', durationMs: 1 } as PreviewMessage)
    maintenant.mockRestore()

    expect(écran.wrapper.find('.status-bar .render').text()).toBe('First render 1234 ms')
  })

  // Le compte seul, le poids de chacun dans l'infobulle, dans l'ordre de la
  // configuration : un plugin sans surface navigateur à zéro.
  test('counts the plugins, and weighs each as its panels listed them', async ({ écran }) => {
    écran.wrapper.findComponent(Panels).vm.$emit('weights', [
      { plugin: 'a11y', bytes: 156_843 },
      { plugin: 'tokens', bytes: 0 },
    ])
    await vide(écran.wrapper)

    expect(chiffres(écran)).toEqual(['Shell 83.1 kB', '2 plugins'])
    expect(écran.wrapper.findAll('.figures li')[1]!.findComponent(Tooltip).props('content')).toBe(
      'a11y 156.8 kB\ntokens 0.0 kB',
    )
  })
})

// La palette vit dans un portail, hors du composant monté : lue dans le document.
describe('the command palette', () => {
  const touche = async (écran: Ecran, init: KeyboardEventInit, cible: Element = document.body) => {
    cible.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
    await vide(écran.wrapper)
  }
  const ouvre = (écran: Ecran) => touche(écran, { key: 'k', ctrlKey: true })
  const infobulles = (écran: Ecran) =>
    écran.wrapper
      .findAllComponents(Tooltip)
      .map((one) => [one.props('content'), one.props('keys')].filter(Boolean).join(' '))
  const dialogue = () => document.querySelector('[role="dialog"]')
  // Le contexte et le libellé comme un chemin, puis la fin de ligne.
  const ligne = (one: Element) =>
    [
      [one.querySelector('.context')?.textContent, one.querySelector('.label')?.textContent]
        .filter(Boolean)
        .join(' / '),
      one.querySelector('.trailing')?.textContent?.trim(),
    ]
      .filter(Boolean)
      .join(' ')
  const options = () => [...document.querySelectorAll('[role="dialog"] [role="option"]')].map(ligne)
  const groupes = () =>
    [...document.querySelectorAll('[role="dialog"] [role="group"]')].map(
      (one) => one.firstElementChild?.textContent,
    )
  const tape = async (écran: Ecran, texte: string) => {
    const champ = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    champ.value = texte
    champ.dispatchEvent(new Event('input', { bubbles: true }))
    await vide(écran.wrapper)
  }
  const choisit = async (écran: Ecran, libellé: string) => {
    const option = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"] [role="option"]'),
    ].find(
      (one) =>
        [one.querySelector('.context')?.textContent, one.querySelector('.label')?.textContent]
          .filter(Boolean)
          .join(' / ') === libellé,
    )
    option!.click()
    await vide(écran.wrapper)
  }

  // Ctrl+K hors macOS, que jsdom n'est pas : sous macOS, Ctrl+K efface la fin de
  // la ligne d'un champ.
  test('opens with Ctrl K and closes with it', async ({ écran }) => {
    expect(dialogue()).toBeNull()

    const frappe = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    // Même pendant une saisie.
    const saisie = champ()
    saisie.dispatchEvent(frappe)
    saisie.remove()
    await vide(écran.wrapper)
    expect(dialogue()).not.toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"] input'))
    // Le navigateur ne la reçoit pas : Ctrl+K y mène à la barre de recherche.
    expect(frappe.defaultPrevented).toBe(true)

    // Et depuis son propre champ, où est le focus.
    await touche(
      écran,
      { key: 'k', ctrlKey: true },
      document.querySelector('[role="dialog"] input')!,
    )
    expect(dialogue()).toBeNull()

    await touche(écran, { key: 'k', metaKey: true })
    await touche(écran, { key: 'k', ctrlKey: true, altKey: true })
    expect(dialogue()).toBeNull()
  })

  test('opens with ⌘K on macOS, and leaves Ctrl K to the field', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh)')
    const écran = await monte([badge])

    try {
      const recherche = écran.wrapper.find('[aria-label="Search or run"]')
      expect(recherche.attributes('aria-keyshortcuts')).toBe('Meta+K /')
      expect(infobulles(écran)).toContain('Search or run ⌘K')
      await touche(écran, { key: 'k', ctrlKey: true })
      expect(dialogue()).toBeNull()
      await touche(écran, { key: 'k', metaKey: true })
      expect(dialogue()).not.toBeNull()
    } finally {
      écran.wrapper.unmount()
    }
  })

  test('opens from the activity bar, its shortcut in its tooltip', async ({ écran }) => {
    const bouton = écran.wrapper.find('[aria-label="Search or run"]')

    expect(infobulles(écran)).toContain('Search or run Ctrl K')
    expect(bouton.attributes('aria-keyshortcuts')).toBe('Control+K /')
    await bouton.trigger('click')
    await vide(écran.wrapper)
    expect(dialogue()).not.toBeNull()
  })

  // Les actions d'abord, leur raccourci affiché : c'est là qu'ils se lisent.
  test('lists the actions with their keys, then every destination', async ({ écran }) => {
    await ouvre(écran)

    expect(groupes()).toEqual(['Actions', 'Components', 'Stories', 'Pages', 'Filters'])
    expect(options()).toEqual([
      'Dark theme T',
      'Copy link',
      'Full screen F',
      'Zoom in +',
      'Zoom out -',
      'Actual size 0',
      'Install a plugin…',
      'Badge',
      'Bouton',
      'Badge / Par défaut',
      'Badge / Alerte',
      'Bouton / Par défaut',
      'Changes since the last commit',
      'is: / draft · stable · deprecated',
      'type: / story · component · token',
    ])
  })

  test('offers only the theme under a page', async ({ écran }) => {
    await ouvre(écran)
    await choisit(écran, 'Bouton')
    await ouvre(écran)

    // La story quittée revient en tête, parmi les récents.
    expect(groupes().slice(0, 2)).toEqual(['Recent', 'Actions'])
    expect(options().slice(0, 4)).toEqual([
      'Badge / Par défaut just now',
      'Dark theme T',
      'Install a plugin…',
      'Badge',
    ])
  })

  // Replié par `fold` : sans accents ni séparateurs.
  test('narrows by name, folded like the search of the tree', async ({ écran }) => {
    await ouvre(écran)

    await tape(écran, 'par defaut')
    expect(options()).toEqual(['Badge / Par défaut', 'Bouton / Par défaut'])
    // La première surlignée, qu'Entrée choisit.
    expect(ligne(document.querySelector('[role="option"][data-highlighted]')!)).toBe(
      'Badge / Par défaut',
    )

    await tape(écran, 'zzz')
    expect(options()).toEqual([])
    expect(document.querySelector('[role="dialog"] .empty-note')?.textContent?.trim()).toBe(
      'Nothing matches.',
    )

    // Rouverte, elle repart de rien.
    await ouvre(écran)
    await ouvre(écran)
    expect(options()).toHaveLength(15)
  })

  test('goes to a story, and closes', async ({ écran }) => {
    await ouvre(écran)
    await choisit(écran, 'Badge / Alerte')

    expect(dialogue()).toBeNull()
    expect(window.location.search).toBe('?id=badge--alerte')
    expect(écran.wrapper.find('.trail [aria-current="page"]').text()).toBe('Alerte')
  })

  test('goes to a component page, and to the changes mode', async ({ écran }) => {
    await ouvre(écran)
    await choisit(écran, 'Bouton')
    expect(window.location.search).toBe('?component=bouton')
    expect(écran.wrapper.find('.component-page').exists()).toBe(true)

    await ouvre(écran)
    await choisit(écran, 'Changes since the last commit')
    expect(window.location.search).toBe('?changes')
    expect(écran.wrapper.find('.versions-view').exists()).toBe(true)
  })

  test('goes to a family of tokens', async () => {
    const écran = await monte([badge, jetons])

    await ouvre(écran)
    expect(groupes()).toEqual(['Actions', 'Components', 'Stories', 'Tokens', 'Pages', 'Filters'])
    await choisit(écran, 'Color / Brand')

    expect(window.location.search).toBe('?tokens=palette')
    expect(écran.wrapper.find('.tokens-view').exists()).toBe(true)
    écran.wrapper.unmount()
  })

  // Une fois fermée. Le focus que la fermeture rend au bouton, jsdom ne le rend
  // pas : le cas navigateur de `screen.test.ts` le tient.
  test('runs an action once closed, and only once', async ({ écran }) => {
    await ouvre(écran)
    await choisit(écran, 'Full screen')
    expect(écran.wrapper.find('main').classes()).toContain('full')

    // Fermée sans choix, elle ne relance pas la dernière commande.
    await ouvre(écran)
    await touche(écran, { key: 'Escape' }, document.querySelector('[role="dialog"] input')!)
    expect(écran.wrapper.find('main').classes()).toContain('full')

    await ouvre(écran)
    expect(options()[2]).toBe('Leave full screen F')
    await choisit(écran, 'Leave full screen')
    expect(écran.wrapper.find('main').classes()).not.toContain('full')
  })

  // Comme la touche `f` : sans story affichée, aucune barre ne sortirait du plein écran.
  test('offers only the search with no story on display', async () => {
    const écran = await monte([jetons])

    await ouvre(écran)
    expect(groupes()).toEqual(['Actions', 'Tokens', 'Pages', 'Filters'])
    expect(options()).toEqual([
      'Dark theme T',
      'Install a plugin…',
      'Color / Brand',
      'Changes since the last commit',
      'is: / draft · stable · deprecated',
      'type: / story · component · token',
    ])
    écran.wrapper.unmount()
  })

  test('launches the actions of the toolbar', async ({ écran }) => {
    const écrit = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })

    await ouvre(écran)
    await choisit(écran, 'Copy link')
    expect(écrit).toHaveBeenCalledWith(window.location.href)

    const zoom = () => écran.wrapper.find('.stage-tools .level').text()
    await ouvre(écran)
    await choisit(écran, 'Zoom in')
    expect(zoom()).toBe('125 %')
    await ouvre(écran)
    await choisit(écran, 'Actual size')
    expect(zoom()).toBe('100 %')
    await ouvre(écran)
    await choisit(écran, 'Zoom out')
    expect(zoom()).toBe('75 %')
  })

  test('closes with Escape, and leaves full screen on', async ({ écran }) => {
    await touche(écran, { key: 'f' })
    await ouvre(écran)

    await touche(écran, { key: 'Escape' }, document.querySelector('[role="dialog"] input')!)

    expect(dialogue()).toBeNull()
    expect(écran.wrapper.find('main').classes()).toContain('full')
  })

  // Deux clés se combinent, deux valeurs s'additionnent, et le nom s'y ajoute. Le
  // statut est celui du composant, ses stories le suivent.
  test('filters by status and by type, combined with a name', async () => {
    const écran = await monte([
      avec(badge, 'draft'),
      avec(alerte, 'draft'),
      avec(bouton, 'stable'),
      jetons,
    ])
    const filtres = ['is: / draft · stable · deprecated', 'type: / story · component · token']

    await ouvre(écran)
    // Sans nom tapé, les filtres restent proposés sous les résultats.
    await tape(écran, 'is:draft')
    expect(options()).toEqual([
      'Badge draft',
      'Badge / Par défaut draft',
      'Badge / Alerte draft',
      ...filtres,
    ])
    expect(document.querySelector('[role="dialog"] .count')?.textContent).toBe('3 results')

    await tape(écran, 'is:draft is:stable type:story')
    expect(options()).toEqual([
      'Badge / Par défaut draft',
      'Badge / Alerte draft',
      'Bouton / Par défaut stable',
      ...filtres,
    ])

    await tape(écran, 'is:stable type:component')
    expect(options()).toEqual(['Bouton stable', ...filtres])

    await tape(écran, 'type:token')
    expect(options()).toEqual(['Color / Brand', ...filtres])

    await tape(écran, 'type:story alerte')
    expect(options()).toEqual(['Badge / Alerte draft'])

    // Une valeur inconnue ne garde rien, et rien de ce qui ne porte pas de statut.
    // Dans le filtre, aucune valeur ne commence par zz ; clos, il ne garde rien.
    await tape(écran, 'is:zz')
    expect(options()).toEqual([])
    expect(document.querySelector('[role="dialog"] .empty-note')?.textContent?.trim()).toBe(
      'Nothing matches.',
    )
    await tape(écran, 'is:zz ')
    expect(options()).toEqual(filtres)
    expect(document.querySelector('[role="dialog"] .count')?.textContent).toBe('0 results')
    écran.wrapper.unmount()
  })

  test('completes a filter with Tab, and leaves the field alone when nothing completes', async ({
    écran,
  }) => {
    await ouvre(écran)
    const champ = document.querySelector<HTMLInputElement>('[role="dialog"] input')!

    await tape(écran, 'ty')
    const frappe = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    champ.dispatchEvent(frappe)
    await vide(écran.wrapper)
    expect(champ.value).toBe('type:')
    expect(frappe.defaultPrevented).toBe(true)

    await tape(écran, 'badge')
    const vaine = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    champ.dispatchEvent(vaine)
    await vide(écran.wrapper)
    expect(champ.value).toBe('badge')
  })

  test('writes a filter key from its row, and stays open', async ({ écran }) => {
    await ouvre(écran)
    await tape(écran, 'is:draft ')
    await choisit(écran, 'type: / story · component · token')

    expect(dialogue()).not.toBeNull()
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe(
      'is:draft type:',
    )
    // Un nom qui ne commence aucune clé : les filtres ne se proposent plus.
    await tape(écran, 'badge')
    expect(groupes()).not.toContain('Filters')
  })

  // `ty` est un nom cherché, et le début de `type:` : la ligne du filtre suit les
  // résultats, et la choisir remplace le mot.
  test('offers the filter a word begins, and writes it in place of the word', async ({ écran }) => {
    await ouvre(écran)
    await tape(écran, 'badge ty')
    expect(groupes().at(-1)).toBe('Filters')
    expect(options().at(-1)).toBe('type: / story · component · token')

    await choisit(écran, 'type: / story · component · token')
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe(
      'badge type:',
    )
  })

  // Dans un filtre, seules ses valeurs : en choisir une l'écrit, et les résultats
  // reviennent.
  test('offers only the values of the filter being written', async ({ écran }) => {
    await ouvre(écran)
    // Écrit par ⇥, et non tapé : la première valeur reste surlignée pour Entrée.
    await tape(écran, 'badge typ')
    document
      .querySelector('[role="dialog"] input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    await vide(écran.wrapper)
    expect(groupes()).toEqual(['Values'])
    expect(options()).toEqual(['type: / story', 'type: / component', 'type: / token'])
    expect(ligne(document.querySelector('[role="option"][data-highlighted]')!)).toBe(
      'type: / story',
    )
    expect(document.querySelector('[role="dialog"] .count')?.textContent).toBe('3 values')

    await tape(écran, 'badge type:co')
    expect(options()).toEqual(['type: / component'])
    expect(document.querySelector('[role="dialog"] .count')?.textContent).toBe('1 value')
    await choisit(écran, 'type: / component')

    expect(dialogue()).not.toBeNull()
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')!.value).toBe(
      'badge type:component ',
    )
    expect(options()).toEqual(['Badge'])
  })

  // Retenus d'une session à l'autre, le plus récent d'abord, et seulement ce qui
  // existe encore. Un stockage illisible ne propose rien.
  test('offers the places left, newest first, with their age', async ({ écran }) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await ouvre(écran)
      await choisit(écran, 'Bouton')
      vi.setSystemTime(Date.now() + 5 * 60_000)
      await ouvre(écran)
      await choisit(écran, 'Badge / Alerte')
      vi.setSystemTime(Date.now() + 60_000)
      await ouvre(écran)

      expect(options().slice(0, 2)).toEqual(['Bouton 1 min ago', 'Badge / Par défaut 6 min ago'])
      expect(JSON.parse(localStorage.getItem('crypte:palette:recent')!)).toHaveLength(2)
      await choisit(écran, 'Bouton')
      expect(window.location.search).toBe('?component=bouton')
      // Revenu sur la page, elle sort des récents tant qu'on y est.
      await ouvre(écran)
      expect(options().slice(0, 2)).toEqual([
        'Badge / Alerte just now',
        'Badge / Par défaut 6 min ago',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  test('forgets what is gone, and an unreadable storage', async () => {
    localStorage.setItem(
      'crypte:palette:recent',
      JSON.stringify([
        { key: 'gone--story', at: 0 },
        { key: 'badge--alerte', at: Date.now() },
        'x',
      ]),
    )
    const écran = await monte([badge, alerte])
    await ouvre(écran)
    expect(groupes()[0]).toBe('Recent')
    expect(options()[0]).toBe('Badge / Alerte just now')
    écran.wrapper.unmount()

    localStorage.setItem('crypte:palette:recent', '{')
    const illisible = await monte([badge, alerte])
    await ouvre(illisible)
    expect(groupes()[0]).toBe('Actions')
    illisible.wrapper.unmount()
  })

  // Ni catalogue ni installation à chaud : la commande à copier.
  test('shows the npm command of a plugin to install, and copies it', async ({ écran }) => {
    const écrit = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })

    await ouvre(écran)
    await choisit(écran, 'Install a plugin…')
    expect(dialogue()).not.toBeNull()
    const copie = () => document.querySelector<HTMLButtonElement>('[role="dialog"] .copy')!
    expect(document.querySelector('[role="dialog"] .snippet code')?.textContent).toBe(
      'npm install -D <package>',
    )
    expect(copie().disabled).toBe(true)

    const champ = document.querySelector<HTMLInputElement>('[role="dialog"] .install input')!
    expect(document.activeElement).toBe(champ)
    champ.value = '@acme/crypte-figma'
    champ.dispatchEvent(new Event('input', { bubbles: true }))
    await vide(écran.wrapper)
    copie().click()
    await vide(écran.wrapper)

    expect(écrit).toHaveBeenCalledWith('npm install -D @acme/crypte-figma')
    expect(copie().textContent?.trim()).toBe('Copied')
    // La configuration suit le paquet : l'import et l'appel.
    expect(document.querySelector('[role="dialog"] .config')?.textContent).toBe(
      "// crypte.config.ts\nimport figma from '@acme/crypte-figma'\n\nplugins: [figma()],",
    )

    // Sans sa version à l'import, et sans mot réservé pour nom.
    for (const [paquet, attendu] of [
      ['@acme/crypte-figma@2', "import figma from '@acme/crypte-figma'"],
      ['crypte-plugin-default', "import defaultPlugin from 'crypte-plugin-default'"],
      ['42', "import plugin from '42'"],
    ]) {
      champ.value = paquet!
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      await vide(écran.wrapper)
      expect(document.querySelector('[role="dialog"] .config')?.textContent?.split('\n')[1]).toBe(
        attendu,
      )
    }

    // Rouverte, elle revient à la recherche.
    await ouvre(écran)
    await ouvre(écran)
    expect(document.querySelector('[role="dialog"] .install')).toBeNull()
    await choisit(écran, 'Install a plugin…')
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] .install input')!.value).toBe(
      '',
    )
    expect(copie().textContent?.trim()).toBe('Copy')
  })
})

describe('the theme', () => {
  const racine = () => document.documentElement.dataset.theme
  const touche = async (écran: Ecran, key: string, cible: Element = document.body) => {
    cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await vide(écran.wrapper)
  }
  const ctrlK = async (écran: Ecran) => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    )
    await vide(écran.wrapper)
  }
  // Le libellé de la bascule, lu dans la palette ouverte puis refermée.
  const bascule = async (écran: Ecran) => {
    await ctrlK(écran)
    const libellé = [...document.querySelectorAll('[role="dialog"] [role="option"] .label')]
      .map((one) => one.textContent)
      .find((one) => one?.endsWith('theme'))
    await ctrlK(écran)
    return libellé
  }

  // Rien de posé : le système décide, et le libellé suit ce qu'il montre.
  test('follows the system until one is chosen', async ({ écran }) => {
    expect(racine()).toBeUndefined()
    expect(await bascule(écran)).toBe('Dark theme')

    change(true)
    await vide(écran.wrapper)
    expect(racine()).toBeUndefined()
    expect(await bascule(écran)).toBe('Light theme')
  })

  // Pour la page seulement : rien n'est retenu pour le lancement suivant.
  test('switches on t, for the page only', async ({ écran }) => {
    await touche(écran, 't')
    expect(racine()).toBe('dark')

    await touche(écran, 't')
    expect(racine()).toBe('light')
    expect(localStorage.getItem('crypte:theme')).toBeNull()
  })

  // La preview suit le thème du shell, rendue à nouveau à chaque bascule (5.2).
  test('draws the preview in the shell theme, again on each switch', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {}, theme: 'light' })

    await touche(écran, 't')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({
        type: 'render',
        id: 'badge--defaut',
        overrides: {},
        theme: 'dark',
      })
  })

  // Alt+T est un raccourci du navigateur sous Windows, comme Alt+F.
  test('ignores t typed in a field, or under Alt', async ({ écran }) => {
    const saisie = champ()
    await touche(écran, 't', saisie)
    saisie.remove()
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 't', altKey: true, bubbles: true }),
    )
    await vide(écran.wrapper)

    expect(racine()).toBeUndefined()
  })

  // Un choix qu'une version d'avant avait retenu ne compte plus.
  test('starts from the system at every launch, whatever an older version stored', async () => {
    localStorage.setItem('crypte:theme', 'dark')
    const écran = await monte([badge])
    expect(racine()).toBeUndefined()
    expect(await bascule(écran)).toBe('Dark theme')
    écran.wrapper.unmount()
  })

  // Navigation privée, données du site bloquées : le shell monte et bascule, sans
  // rien retenir.
  test('mounts and switches when storage throws', async () => {
    const lève = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(lève)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(lève)
    const écran = await monte([badge])

    expect(écran.noms()).toEqual(['Par défaut'])
    await touche(écran, 't')
    expect(racine()).toBe('dark')
    écran.wrapper.unmount()
  })

  // Un système déjà sombre au montage : le premier t passe en clair.
  test('starts dark with a dark system, and leaves it on t', async () => {
    système.sombre = true
    const écran = await monte([badge])

    expect(await bascule(écran)).toBe('Light theme')
    await touche(écran, 't')
    expect(racine()).toBe('light')
    écran.wrapper.unmount()
  })

  test('switches from the palette, which names the other theme', async ({ écran }) => {
    change(true)
    await vide(écran.wrapper)
    await ctrlK(écran)

    const option = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"] [role="option"]'),
    ].find((one) => one.querySelector('.label')?.textContent === 'Light theme')
    option!.click()
    await vide(écran.wrapper)
    expect(racine()).toBe('light')
  })
})

describe('the empty catalogue beside its neighbours', () => {
  test('stays silent when a stories file was set aside, which the notice below names', async () => {
    const écran = await monte([], false, [{ file: 'stories/Cassee.tsx', reason: 'does not parse' }])

    expect(écran.wrapper.find('.empty').exists()).toBe(false)
    expect(écran.écartés()).toHaveLength(1)
    écran.wrapper.unmount()
  })

  test('names no folder it does not know', async () => {
    const écran = await monte([], false, undefined, undefined, () => {
      throw new Error('Unexpected token')
    })

    expect(écran.wrapper.find('.empty h2').text()).toBe('No story found')
    écran.wrapper.unmount()
  })

  // « Showing the first story instead » sur un catalogue qui n'en a aucune.
  test('says nothing of a stale address when there is no story to show instead', async () => {
    window.history.replaceState(null, '', '/?id=disparue')
    const écran = await monte([])

    expect(écran.wrapper.find('.stale').exists()).toBe(false)
    expect(écran.wrapper.find('.empty').exists()).toBe(true)
    écran.wrapper.unmount()
  })
})
