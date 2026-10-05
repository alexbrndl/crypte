import type {
  Manifest,
  ManifestEntry,
  PreviewMessage,
  ShellMessage,
  StoryEntry,
  TokensEntry,
} from '@crypte/core/protocol'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, test as base, vi } from 'vitest'
import App from '../src/App.vue'
import Panels from '../src/panels.vue'
import StoryTree from '../src/story-tree.vue'

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

const monte = async (
  entries: ManifestEntry[],
  échoue = false,
  skipped?: { file: string; reason: string }[],
  // Ce que répond la route des changements, ou ce qu'elle lève.
  changements: () => unknown = () => ({ changes: [] }),
): Promise<Ecran> => {
  const manifest: Manifest = { version: 1, entries, ...(skipped ? { skipped } : {}) } as never

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      // Les panneaux de plugins lisent leur propre route : aucun plugin ici.
      if (url === '/@crypte/plugins.json')
        return { json: async () => ({ panels: [], refused: [] }) } as Response
      // Le mode changements lit sa propre route : rien n'a changé ici.
      if (url === '/@crypte/changes.json') return { json: async () => changements() } as Response
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
  // L'adresse et le stockage survivent au démontage : sans ça, la story cliquée
  // par un cas devenait la première affichée du suivant.
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

describe('the shell tree', () => {
  // L'arbre vient du chemin du manifeste, et aucun titre n'est déclaré nulle
  // part : c'est la section 1.1 des contrats.
  test('groups stories by path, in manifest order', async ({ écran }) => {
    expect(écran.branches()).toEqual(['Badge', 'Bouton'])
    expect(écran.noms()).toEqual(['Par défaut', 'Alerte', 'Par défaut'])
  })

  // Une famille n'a pas de composant : tout son chemin est fait de dossiers.
  test('puts a tokens family under its folders, apart from the stories', async () => {
    const écran = await monte([badge, jetons])

    expect(écran.noms()).toEqual(['Par défaut'])
    expect(écran.branches()).toEqual(['Badge', 'Color'])
    expect(
      écran.wrapper.findAll('[role="treeitem"].tokens .name').map((one) => one.text()),
    ).toEqual(['Brand'])
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

    expect(écran.wrapper.find('nav p').text()).toBe('no story')
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
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {} })
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
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {} })
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
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: { label: 'Bonjour' } })
  })

  test('drops them when another story is shown', async ({ écran }) => {
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    édite(écran, { label: 'Bonjour' })

    await écran.story(1).trigger('click')

    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {} })
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
    const rendu = { type: 'render', id: 'badge--defaut', overrides: { label: 'Bonjour' } }
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
  test('states the duration of a render', async ({ écran }) => {
    await écran.répond({
      type: 'rendered',
      id: 'badge--defaut',
      durationMs: 12.34,
    } as PreviewMessage)

    expect(écran.statut()).toBe('badge--defaut rendered in 12.3 ms')
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
  })

  // Le cadre de la story d'avant ne doit plus être visible : le laisser ferait
  // croire que celle-ci a rendu.
  test('hides the frame while an error is shown', async ({ écran }) => {
    await écran.répond({
      type: 'error',
      id: 'badge--defaut',
      message: 'boum',
    } as PreviewMessage)

    expect(écran.wrapper.find('iframe').attributes('style')).toContain('display: none')
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
                ? { panels: [], refused: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
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
      .toEqual({ type: 'render', id: 'bouton--defaut', overrides: {} })
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
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {} })
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

describe('the search', () => {
  const cherche = async (écran: Ecran, texte: string) => {
    await écran.wrapper.find('input[type="search"]').setValue(texte)
    await vide(écran.wrapper)
  }

  test('keeps the stories whose name, or whose component name, holds it', async ({ écran }) => {
    await cherche(écran, 'bout')
    expect(écran.branches()).toEqual(['Bouton'])
    expect(écran.noms()).toEqual(['Par défaut'])

    await cherche(écran, 'alerte')
    expect(écran.noms()).toEqual(['Alerte'])
  })

  test('says when nothing matches', async ({ écran }) => {
    await cherche(écran, 'nulle part')

    expect(écran.noms()).toEqual([])
    expect(écran.wrapper.find('nav').text()).toContain('nothing matches')
  })

  // Une recherche ouvre tout ce qu'elle trouve, et ce qu'on y replie ne survit
  // pas à la recherche.
  test('opens what it finds, and forgets what was folded while searching', async ({ écran }) => {
    await branche(écran, 'Bouton').find('.chevron').trigger('click')
    await vide(écran.wrapper)

    await cherche(écran, 'par')
    expect(écran.noms()).toEqual(['Par défaut', 'Par défaut'])

    await branche(écran, 'Badge').find('.chevron').trigger('click')
    await vide(écran.wrapper)
    expect(écran.noms()).toEqual(['Par défaut'])

    await cherche(écran, '')
    expect(écran.noms()).toEqual(['Par défaut', 'Alerte'])

    await cherche(écran, 'par')
    expect(écran.noms()).toEqual(['Par défaut', 'Par défaut'])
  })

  const branche = (écran: Ecran, nom: string) =>
    écran.wrapper
      .findAll('[role="treeitem"]:not(.story)')
      .find((one) => one.find('.name').text() === nom)!
})

describe('the status', () => {
  const avec = (one: StoryEntry, status: NonNullable<StoryEntry['meta']>['status']) => ({
    ...one,
    meta: { status },
  })

  test('shows the status beside its component, never beside a story', async () => {
    const écran = await monte([avec(badge, 'stable'), avec(alerte, 'stable'), bouton])

    expect(écran.wrapper.findAll('.status').map((one) => one.text())).toEqual(['stable'])
    écran.wrapper.unmount()
  })

  test('offers no filter when no component declares a status', async ({ écran }) => {
    expect(écran.wrapper.find('[aria-label="Filter by status"]').exists()).toBe(false)
  })

  test('keeps the components of the chosen status', async () => {
    const écran = await monte([
      avec(badge, 'stable'),
      avec(alerte, 'stable'),
      avec(bouton, 'draft'),
    ])
    const filtre = écran.wrapper.find('[aria-label="Filter by status"]')

    expect(filtre.findAll('button').map((one) => one.text())).toEqual(['draft', 'stable'])

    await filtre.findAll('button')[0]!.trigger('click')
    await vide(écran.wrapper)

    expect(écran.branches()).toEqual(['Bouton'])
    écran.wrapper.unmount()
  })
})

describe('a filter on what changes underneath', () => {
  const avec = (one: StoryEntry, status: NonNullable<StoryEntry['meta']>['status']) => ({
    ...one,
    meta: { status },
  })
  const noms = (wrapper: VueWrapper) =>
    wrapper.findAll('[role="treeitem"]:not(.story) .name').map((one) => one.text())
  const filtre = (wrapper: VueWrapper) => wrapper.find('[aria-label="Filter by status"]')

  // Éditer `meta.status` dans un fichier de stories atteint l'arbre en direct.
  // Comme un repli : le choix reste, et revient avec le composant qui le porte.
  test('stops filtering by a status no component declares, and filters again when one does', async () => {
    const wrapper = mount(StoryTree, {
      props: {
        entries: [avec(badge, 'stable'), avec(bouton, 'draft')],
        current: null,
        component: null,
      },
    })
    await filtre(wrapper).findAll('button')[0]!.trigger('click')
    expect(noms(wrapper)).toEqual(['Bouton'])

    await wrapper.setProps({ entries: [avec(badge, 'stable'), avec(bouton, 'stable')] })

    expect(noms(wrapper)).toEqual(['Badge', 'Bouton'])
    expect(
      filtre(wrapper)
        .findAll('button')
        .map((one) => one.attributes('data-state')),
    ).toEqual(['off'])

    await wrapper.setProps({ entries: [avec(badge, 'stable'), avec(bouton, 'draft')] })

    expect(noms(wrapper)).toEqual(['Bouton'])
    expect(
      filtre(wrapper)
        .findAll('button')
        .map((one) => one.attributes('data-state')),
    ).toEqual(['on', 'off'])
    wrapper.unmount()
  })

  test('keeps folded what the filter hides while something else is folded', async () => {
    const écran = await monte([
      avec(badge, 'stable'),
      avec(alerte, 'stable'),
      avec(bouton, 'draft'),
    ])
    const branche = (nom: string) =>
      écran.wrapper
        .findAll('[role="treeitem"]:not(.story)')
        .find((one) => one.find('.name').text() === nom)!
    const draft = () => filtre(écran.wrapper).findAll('button')[0]!

    await branche('Badge').find('.chevron').trigger('click')
    await draft().trigger('click')
    await branche('Bouton').find('.chevron').trigger('click')
    await draft().trigger('click')
    await vide(écran.wrapper)

    expect(écran.branches()).toEqual(['Badge', 'Bouton'])
    expect(écran.noms()).toEqual([])
    écran.wrapper.unmount()
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
    expect(page(écran).find('tbody td .none').text()).toBe('none')
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
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {} })
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

    expect(fil.text().replace(/\s+/g, ' ')).toBe('Badge / Alerte')
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

    expect(écran.wrapper.find('nav.trail').text().replace(/\s+/g, ' ')).toBe(
      'checkout / OrderSummary / X',
    )
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
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {} })
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
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {} })
    écran.wrapper.unmount()
  })

  // Depuis le fil d'Ariane, la story qu'on regardait est déjà du composant.
  test('keeps the story underneath when it is already of the component', async () => {
    window.history.replaceState(null, '', '/?id=badge--alerte')
    const écran = await monte(catalogue)
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--alerte', overrides: {} })
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
                ? { panels: [], refused: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
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
      .toEqual({ type: 'render', id: 'badge--autre', overrides: {} })
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
                ? { panels: [], refused: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
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
                ? { panels: [], refused: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
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
    mount(StoryTree, { props: { entries, current: null, component: null } })

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
describe('the tokens page', () => {
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
  const page = (écran: Ecran) => écran.wrapper.find('.tokens-page')
  const feuille = (écran: Ecran) => écran.wrapper.find('[role="treeitem"].tokens')

  test('opens from the tree, without rendering anything in the preview', async () => {
    const écran = await monte([badge, famille])
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {} })
    const avant = écran.envoyés.length

    await feuille(écran).trigger('click')
    await vide(écran.wrapper)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(page(écran).find('h2').text()).toBe('Brand')
    expect(window.location.search).toBe('?id=color--brand')
    expect(feuille(écran).attributes('aria-selected')).toBe('true')
    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)
    expect(écran.envoyés.length).toBe(avant)
    écran.wrapper.unmount()
  })

  test('shows each token in each theme, its alias chain, and a theme it lacks', async () => {
    window.history.replaceState(null, '', '/?id=color--brand')
    const écran = await monte([badge, famille])

    expect(
      page(écran)
        .findAll('thead th')
        .map((one) => one.text()),
    ).toEqual(['Token', 'light', 'dark'])
    const lignes = page(écran)
      .findAll('tbody tr')
      .map((row) => [
        row.find('th code').text(),
        row.find('th .kind').text(),
        row.find('th .description').exists() ? row.find('th .description').text() : null,
        ...row.findAll('td').map((cell) => cell.text()),
      ])
    expect(lignes).toEqual([
      [
        'primary',
        'color',
        'Filled buttons only.',
        '#4fe0a0',
        '#1f5fd6 via color-blue → color-cobalt',
      ],
      ['night', 'dimension', null, 'not declared', '4px'],
    ])
    écran.wrapper.unmount()
  })

  // `background-color` et pas `background` : une valeur en `url(…)` n'y charge rien.
  test('draws a swatch for a color, and none for another kind', async () => {
    window.history.replaceState(null, '', '/?id=color--brand')
    const écran = await monte([famille])
    const pastilles = page(écran).findAll('.swatch')

    expect(pastilles).toHaveLength(2)
    expect((pastilles[0]!.element as HTMLElement).style.backgroundColor).toBe('rgb(79, 224, 160)')
    expect((pastilles[0]!.element as HTMLElement).style.backgroundImage).toBe('')
    écran.wrapper.unmount()
  })

  test('follows back and forward between a story and a family', async () => {
    const écran = await monte([badge, famille])
    await feuille(écran).trigger('click')
    await vide(écran.wrapper)

    window.history.replaceState(null, '', '/?id=badge--defaut')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(page(écran).exists()).toBe(false)
    expect(écran.wrapper.find('iframe').isVisible()).toBe(true)

    window.history.replaceState(null, '', '/?id=color--brand')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)
    expect(page(écran).find('h2').text()).toBe('Brand')
    écran.wrapper.unmount()
  })

  test('says when its family leaves the catalogue, and comes back with it', async () => {
    window.history.replaceState(null, '', '/?id=color--brand')
    const manifests: Manifest[] = [
      { version: 1, entries: [badge, famille] },
      { version: 1, entries: [badge] },
      { version: 1, entries: [badge, famille] },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          ({
            json: async () =>
              url === '/@crypte/plugins.json'
                ? { panels: [], refused: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
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
    expect(wrapper.find('.tokens-page').exists()).toBe(false)
    expect(wrapper.findAll('p').at(-1)?.text()).toBe('the tokens on display are gone')
    expect(window.location.search).toBe('?id=color--brand')

    await ready()
    expect(wrapper.find('.tokens-page h2').text()).toBe('Brand')
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

    expect(écran.statut()).toBe('2 stories')

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
                ? { panels: [], refused: [] }
                : url === '/@crypte/changes.json'
                  ? { changes: [] }
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

    expect(wrapper.find('.tokens-page h2').text()).toBe('Brand')
    expect(wrapper.findAll('p').at(-1)?.text()).toBe('1 story')
    wrapper.unmount()
  })
})

// Ce qui a changé depuis le dernier commit, lu par le CLI dans Git.
describe('the changes mode', () => {
  const lus = {
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
  }
  const entrée = (écran: Ecran) => écran.wrapper.find('nav .changes-entry')
  const page = (écran: Ecran) => écran.wrapper.find('.changes-page')
  const ouvre = async (écran: Ecran) => {
    await entrée(écran).trigger('click', { button: 0 })
    await vide(écran.wrapper)
  }

  test('opens from the foot of the navigation, which counts the changes', async () => {
    const écran = await monte([badge, alerte, bouton], false, undefined, () => lus)
    const avant = window.history.length

    expect(entrée(écran).find('.counter').text()).toBe('4')
    await ouvre(écran)

    expect(page(écran).find('h2').text()).toBe('Changes since the last commit')
    expect(window.location.search).toBe('?changes')
    expect(window.history.length).toBe(avant + 1)
    expect(entrée(écran).attributes('aria-current')).toBe('page')
    expect(écran.wrapper.find('iframe').isVisible()).toBe(false)
    expect(écran.wrapper.find('[role="treeitem"][aria-selected="true"]').exists()).toBe(false)
    écran.wrapper.unmount()
  })

  test('groups what appeared, changed and disappeared, each row leading somewhere', async () => {
    const écran = await monte([badge, alerte, bouton], false, undefined, () => lus)
    await ouvre(écran)

    expect(
      page(écran)
        .findAll('h3')
        .map((one) => one.text()),
    ).toEqual(['Appeared · 1', 'Changed · 1', 'Disappeared · 2'])
    const lignes = page(écran)
      .findAll('li')
      .map((one) => [
        one.find('a, code').text(),
        ...one.findAll('.added, .removed, .status').map((part) => part.text()),
      ])
    expect(lignes).toEqual([
      ['Badge / Alerte'],
      ['Bouton / Par défaut', '+tone', '−label', 'draft → stable'],
      ['badge--ancienne'],
      ['parti--defaut'],
    ])

    expect(
      page(écran)
        .findAll('li a')
        .map((one) => one.attributes('href')),
    ).toEqual(['?id=badge--alerte', '?id=bouton--defaut', '?component=badge'])
    écran.wrapper.unmount()
  })

  test('shows a story from its row, and the component of a story that disappeared', async () => {
    const écran = await monte([badge, alerte, bouton], false, undefined, () => lus)
    await ouvre(écran)

    await page(écran).findAll('li a')[0]!.trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(page(écran).exists()).toBe(false)
    expect(window.location.search).toBe('?id=badge--alerte')

    await ouvre(écran)
    await page(écran).findAll('li a')[2]!.trigger('click', { button: 0 })
    await vide(écran.wrapper)
    expect(écran.wrapper.find('.component-page h2').text()).toBe('Badge')
    expect(window.location.search).toBe('?component=badge')
    écran.wrapper.unmount()
  })

  test('says when nothing changed, and counts zero', async () => {
    const écran = await monte([badge], false, undefined, () => ({ changes: [] }))
    await ouvre(écran)

    expect(entrée(écran).find('.counter').text()).toBe('0')
    expect(page(écran).find('.note').text()).toBe('Nothing changed in the catalogue.')
    écran.wrapper.unmount()
  })

  // Le mode reste accessible et dit pourquoi, sinon rien ne distingue « aucun
  // changement » d'une fonction cassée.
  test('says why the changes cannot be read, and counts nothing', async () => {
    const écran = await monte([badge], false, undefined, () => ({
      reason: 'the project is not in a Git repository',
    }))
    await ouvre(écran)

    expect(entrée(écran).find('.counter').exists()).toBe(false)
    expect(page(écran).find('.note').text()).toBe(
      'The changes cannot be read: the project is not in a Git repository.',
    )
    écran.wrapper.unmount()
  })

  test('says why when its route cannot be read', async () => {
    const écran = await monte([badge], false, undefined, () => {
      throw new Error('Unexpected token')
    })
    await ouvre(écran)

    expect(page(écran).find('.note').text()).toBe(
      'The changes cannot be read: its route could not be read: Unexpected token.',
    )
    écran.wrapper.unmount()
  })

  test('opens from its address, with the first story loaded underneath', async () => {
    window.history.replaceState(null, '', '/?changes')
    const écran = await monte([badge, alerte], false, undefined, () => lus)
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(page(écran).exists()).toBe(true)
    expect(window.location.search).toBe('?changes')
    expect(écran.statut()).toBe('2 stories')
    await expect
      .poll(() => écran.envoyés.at(-1))
      .toEqual({ type: 'render', id: 'badge--defaut', overrides: {} })
    écran.wrapper.unmount()
  })

  test('follows back and forward to the changes', async ({ écran }) => {
    window.history.replaceState(null, '', '/?changes')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vide(écran.wrapper)

    expect(page(écran).exists()).toBe(true)
  })

  test('reads the changes again with the catalogue', async () => {
    const réponses = [{ changes: [] }, lus]
    const écran = await monte([badge, alerte, bouton], false, undefined, () =>
      réponses.length > 1 ? réponses.shift() : réponses[0],
    )
    expect(entrée(écran).find('.counter').text()).toBe('0')

    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)

    expect(entrée(écran).find('.counter').text()).toBe('4')
    écran.wrapper.unmount()
  })

  // Un commit ne touche aucun fichier que Vite surveille : aucun `ready` ne suit.
  test('reads the changes again when the window regains focus, and when the mode opens', async () => {
    const réponses: unknown[] = [{ changes: [] }, lus, { changes: [] }]
    const écran = await monte([badge, alerte, bouton], false, undefined, () =>
      réponses.length > 1 ? réponses.shift() : réponses[0],
    )
    expect(entrée(écran).find('.counter').text()).toBe('0')

    window.dispatchEvent(new Event('focus'))
    await vide(écran.wrapper)
    expect(entrée(écran).find('.counter').text()).toBe('4')

    await ouvre(écran)
    expect(entrée(écran).find('.counter').text()).toBe('0')
    expect(page(écran).find('.note').text()).toBe('Nothing changed in the catalogue.')
    écran.wrapper.unmount()
  })

  // Deux `ready` rapprochés : la réponse la plus lente ne remplace pas la dernière.
  test('keeps the changes read last when two answers cross', async () => {
    let lente!: (value: unknown) => void
    const réponses: (() => unknown)[] = [
      () => new Promise((resolve) => (lente = resolve)),
      () => ({ changes: [] }),
    ]
    const écran = await monte([badge], false, undefined, () => (réponses.shift() ?? (() => ({})))())
    await écran.répond({ type: 'ready', protocolVersion: 1 } as PreviewMessage)
    expect(entrée(écran).find('.counter').text()).toBe('0')

    lente(lus)
    await vide(écran.wrapper)

    expect(entrée(écran).find('.counter').text()).toBe('0')
    écran.wrapper.unmount()
  })
})
