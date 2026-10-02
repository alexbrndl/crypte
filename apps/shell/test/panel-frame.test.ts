import type { StoryEntry, StoryMeta } from '@crypte/core/protocol'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, isProxy, ref, watchEffect, type Component } from 'vue'
import PanelFrame from '../src/panel-frame.vue'

// Le cadre d'un panneau de plugin : sans objet story par story, ouverture
// retenue sous le nom du plugin, et ce qu'un panneau lève affiché à sa place.

const entry = (id: string, meta?: StoryMeta): StoryEntry => ({
  type: 'story',
  id,
  name: id,
  path: ['X'],
  storyFile: 'stories/X.tsx',
  component: { name: 'X', file: 'src/X.tsx', export: 'X' },
  options: {},
  details: {},
  props: [],
  source: '<X />',
  ...(meta ? { meta } : {}),
})

const brouillon = entry('x--brouillon', { status: 'draft' })
const nue = entry('x--nue')
const autre = entry('x--autre')

// Le panneau de `status` dans la démonstration : sans objet quand la story ne
// déclare pas de statut, et il le redit à chaque story.
const statut = defineComponent({
  props: { entry: { type: Object, default: null } },
  emits: ['inapplicable'],
  setup(props, { emit }) {
    watchEffect(() => {
      if (!(props.entry as StoryEntry | null)?.meta?.status)
        emit('inapplicable', 'aucun statut déclaré')
    })
    return () => h('p', `statut : ${(props.entry as StoryEntry | null)?.meta?.status}`)
  },
})

const monte = (panel: Component, story: StoryEntry | null, name = 'status') =>
  mount(PanelFrame, { props: { name, panel, entry: story } })

// Le style lu tel quel : `isVisible()` rendait l'inverse du DOM sur un montage
// qui n'est pas attaché au document. Mesuré.
const état = (wrapper: VueWrapper) => ({
  ouvert: wrapper.find('.head button').attributes('aria-expanded'),
  raison: wrapper.find('.inapplicable').exists() ? wrapper.find('.inapplicable').text() : null,
  corps:
    wrapper.find('.body').exists() &&
    (wrapper.find('.body').element as HTMLElement).style.display !== 'none',
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a panel with nothing to say', () => {
  test('folds to one line with its reason', async () => {
    const wrapper = monte(statut, nue)
    await wrapper.vm.$nextTick()

    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'aucun statut déclaré', corps: false })
  })

  // La décision même : déclaré story par story, jamais une fois. Le cadre
  // oublie la déclaration au changement de story, et le panneau la redit ou non.
  test('unfolds on a story it has something to say about, and folds again after', async () => {
    const wrapper = monte(statut, nue)
    await wrapper.vm.$nextTick()

    await wrapper.setProps({ entry: brouillon })
    expect(état(wrapper)).toEqual({ ouvert: 'true', raison: null, corps: true })
    expect(wrapper.find('.body').text()).toBe('statut : draft')

    await wrapper.setProps({ entry: autre })
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'aucun statut déclaré', corps: false })
  })

  // La même story relue après une édition : même identifiant, contenu neuf. Une
  // raison devenue fausse survivait jusqu'au clic suivant. Revue de la PR #105.
  test('forgets its reason when the same story is read again', async () => {
    const wrapper = monte(statut, nue)
    await wrapper.vm.$nextTick()
    expect(état(wrapper).raison).toBe('aucun statut déclaré')

    await wrapper.setProps({ entry: { ...nue, meta: { status: 'draft' } } })
    expect(état(wrapper)).toEqual({ ouvert: 'true', raison: null, corps: true })

    await wrapper.setProps({ entry: { ...nue } })
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'aucun statut déclaré', corps: false })
  })

  // Un panneau qui ne le dit qu'une fois, au montage, reste replié à tort si le
  // cadre ne l'oublie pas : c'est la déclaration « une fois » que la décision
  // refuse.
  test('forgets a declaration made once, at the next story', async () => {
    const unefois = defineComponent({
      emits: ['inapplicable'],
      setup(_, { emit }) {
        emit('inapplicable', 'dit une seule fois')
        return () => h('p', 'contenu')
      },
    })

    const wrapper = monte(unefois, nue)
    await wrapper.vm.$nextTick()
    expect(état(wrapper).raison).toBe('dit une seule fois')

    await wrapper.setProps({ entry: autre })
    expect(état(wrapper)).toEqual({ ouvert: 'true', raison: null, corps: true })
  })

  // Le cas de `a11y` : une story propre replie le panneau, puis une édition des
  // props y fait apparaître une violation, sans nouvelle entrée.
  test('unfolds on the same story when the panel says `null`', async () => {
    const analyse = defineComponent({
      props: { received: { type: Object, default: null } },
      emits: ['inapplicable'],
      setup(props, { emit }) {
        watchEffect(() => emit('inapplicable', props.received?.propre ? 'propre' : null))
        return () => h('p', 'violations')
      },
    })

    const wrapper = mount(PanelFrame, {
      props: {
        name: 'a11y',
        panel: analyse,
        entry: nue,
        received: { type: 'a11y:r', propre: true },
      },
    })
    await wrapper.vm.$nextTick()
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'propre', corps: false })

    await wrapper.setProps({ received: { type: 'a11y:r', propre: false } })
    expect(état(wrapper)).toEqual({ ouvert: 'true', raison: null, corps: true })

    await wrapper.setProps({ received: { type: 'a11y:r', propre: true } })
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'propre', corps: false })
  })

  // Replié sans raison, ce serait le panneau vide que la décision refuse.
  test.for([
    ['an empty reason', ''],
    ['no reason at all', undefined],
    ['a reason that is not text', 42],
  ] as const)('ignores %s', async ([, reason]) => {
    const muet = defineComponent({
      emits: ['inapplicable'],
      setup(_, { emit }) {
        emit('inapplicable', reason)
        return () => h('p', 'contenu')
      },
    })

    const wrapper = monte(muet, nue)
    await wrapper.vm.$nextTick()

    expect(état(wrapper)).toEqual({ ouvert: 'true', raison: null, corps: true })
  })
})

describe('whether a panel is open', () => {
  test('is remembered under the plugin’s name', async () => {
    const wrapper = monte(statut, brouillon)
    await wrapper.find('.head button').trigger('click')

    expect(état(wrapper).corps).toBe(false)
    expect(localStorage.getItem('crypte:panel:status')).toBe('closed')

    // Un autre montage, comme après un rechargement : fermé. Un autre plugin
    // garde sa propre clé, donc reste ouvert.
    expect(état(monte(statut, brouillon)).ouvert).toBe('false')
    expect(état(monte(statut, brouillon, 'autre')).ouvert).toBe('true')

    await wrapper.find('.head button').trigger('click')
    expect(localStorage.getItem('crypte:panel:status')).toBeNull()
  })

  // En navigation privée, `localStorage` lève : le cadre reste ouvert et suit
  // le clic, sans rien retenir.
  test('follows the click when nothing can be remembered', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    const wrapper = monte(statut, brouillon)
    expect(état(wrapper).ouvert).toBe('true')

    await wrapper.find('.head button').trigger('click')
    expect(état(wrapper).ouvert).toBe('false')
  })

  // Replié, il s'ouvre quand même : la relance de `a11y` vit dans son corps, et
  // un menu ouvert dans l'iframe ne déclenche aucun rendu. DCJ-327.
  test('opens a folded panel on a click, its reason kept', async () => {
    const wrapper = monte(statut, nue)
    await wrapper.vm.$nextTick()

    await wrapper.find('.head button').trigger('click')
    expect(état(wrapper)).toEqual({ ouvert: 'true', raison: 'aucun statut déclaré', corps: true })

    await wrapper.find('.head button').trigger('click')
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'aucun statut déclaré', corps: false })

    // Refermer un panneau replié ne dit rien des stories suivantes.
    expect(localStorage.getItem('crypte:panel:status')).toBeNull()
  })

  // Pour la story affichée seulement, et rien n'est retenu : la décision du
  // panneau reprend à la suivante, et le choix de l'utilisateur ne bouge pas.
  test('folds again at the next story, and remembers nothing of it', async () => {
    const wrapper = monte(statut, nue)
    await wrapper.vm.$nextTick()
    await wrapper.find('.head button').trigger('click')

    await wrapper.setProps({ entry: autre })
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'aucun statut déclaré', corps: false })
    expect(localStorage.getItem('crypte:panel:status')).toBeNull()

    await wrapper.setProps({ entry: brouillon })
    expect(état(wrapper)).toEqual({ ouvert: 'true', raison: null, corps: true })
  })

  // Le panneau change d'avis sur la même story, comme `a11y` après une relance
  // ou une édition des props : le clic de l'utilisateur tient. Revue de la PR #112.
  describe('when the panel changes its mind on the same story', () => {
    const analyse = defineComponent({
      props: { received: { type: Object, default: null } },
      emits: ['inapplicable'],
      setup(props, { emit }) {
        watchEffect(() => emit('inapplicable', props.received?.propre ? 'propre' : null))
        return () => h('p', 'violations')
      },
    })
    const recu = (propre: boolean) => ({ type: 'a11y:r', propre })
    const monteAnalyse = (propre: boolean) =>
      mount(PanelFrame, {
        props: { name: 'a11y', panel: analyse, entry: nue, received: recu(propre) },
      })

    test('keeps open a folded panel the user opened, when it unfolds', async () => {
      localStorage.setItem('crypte:panel:a11y', 'closed')
      const wrapper = monteAnalyse(true)
      await wrapper.vm.$nextTick()
      await wrapper.find('.head button').trigger('click')

      await wrapper.setProps({ received: recu(false) })

      expect(état(wrapper)).toEqual({ ouvert: 'true', raison: null, corps: true })
    })

    // Ouvert replié, une violation arrive, l'utilisateur referme, la story
    // redevient propre : le panneau ne se rouvre pas seul.
    test('keeps closed a panel the user closed, when it folds again', async () => {
      const wrapper = monteAnalyse(true)
      await wrapper.vm.$nextTick()
      await wrapper.find('.head button').trigger('click')
      await wrapper.setProps({ received: recu(false) })
      await wrapper.find('.head button').trigger('click')

      await wrapper.setProps({ received: recu(true) })
      expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'propre', corps: false })

      await wrapper.setProps({ received: recu(false) })
      expect(état(wrapper)).toEqual({ ouvert: 'false', raison: null, corps: false })
    })
  })

  // Les deux états se croisent : fermé par l'utilisateur, puis sans objet, puis
  // de nouveau quelque chose à dire. Le choix de l'utilisateur tient.
  test('stays closed through a story with nothing to say', async () => {
    const wrapper = monte(statut, brouillon)
    await wrapper.find('.head button').trigger('click')

    await wrapper.setProps({ entry: nue })
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: 'aucun statut déclaré', corps: false })

    await wrapper.setProps({ entry: brouillon })
    expect(état(wrapper)).toEqual({ ouvert: 'false', raison: null, corps: false })
  })
})

describe('a panel that throws', () => {
  // Il peut ne lever que sur certaines stories : remonté à la suivante.
  const fragile = defineComponent({
    props: { entry: { type: Object, default: null } },
    setup(props) {
      return () => {
        if ((props.entry as StoryEntry | null)?.id === nue.id) throw new Error('rendu cassé')
        return h('p', 'rendu')
      }
    },
  })

  test('shows its error in its place, and renders again on the next story', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const wrapper = monte(fragile, nue, 'fragile')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.panel-failed').text()).toBe('Ce panneau a levé : rendu cassé')
    expect(wrapper.find('.body').exists()).toBe(false)

    await wrapper.setProps({ entry: brouillon })
    expect(wrapper.find('.panel-failed').exists()).toBe(false)
    expect(wrapper.find('.body').text()).toBe('rendu')
  })

  // L'erreur ne compte pas dans ce que le clic bascule : fermé par
  // l'utilisateur pendant qu'il lève, le panneau le reste. Revue de la PR #112.
  test('still follows the click while it shows its error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = monte(fragile, nue, 'fragile')
    await wrapper.vm.$nextTick()

    await wrapper.find('.head button').trigger('click')
    expect(localStorage.getItem('crypte:panel:fragile')).toBe('closed')

    await wrapper.find('.head button').trigger('click')
    expect(localStorage.getItem('crypte:panel:fragile')).toBeNull()
  })

  test('names what it throws when that is not an Error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const chaine = defineComponent({
      setup() {
        // Ce qu'un panneau peut lever sans que ce soit une `Error`.
        throw 'une chaîne'
      },
    })

    const wrapper = monte(chaine, nue, 'chaine')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.panel-failed').text()).toBe('Ce panneau a levé : une chaîne')
  })
})

// Ce qu'un panneau échange avec sa partie preview, section 5.4 : le dernier
// message reçu en prop, et ce qu'il envoie, sous son propre nom seulement.
describe('the messages of a panel', () => {
  const bavard = defineComponent({
    props: { received: { type: Object, default: null } },
    emits: ['send'],
    setup(props, { emit }) {
      return () =>
        h('div', [
          h('output', (props.received as { type?: string } | null)?.type ?? ''),
          h('button', { class: 'bon', onClick: () => emit('send', { type: 'status:run' }) }),
          h('button', { class: 'autre', onClick: () => emit('send', { type: 'autre:run' }) }),
        ])
    },
  })

  test('hands the panel the last message its preview module sent', async () => {
    const wrapper = monte(bavard, brouillon)

    await wrapper.setProps({ received: { type: 'status:pong' } })

    expect(wrapper.find('output').text()).toBe('status:pong')
  })

  test('passes on a message sent under the plugin’s name', async () => {
    const wrapper = monte(bavard, brouillon)

    await wrapper.find('.bon').trigger('click')

    expect(wrapper.emitted('send')).toEqual([[{ type: 'status:run' }]])
  })

  // Sous un autre nom, il atteindrait un autre plugin : refusé, et dit.
  test('drops a message sent under another name, and says so', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = monte(bavard, brouillon)

    await wrapper.find('.autre').trigger('click')

    expect(wrapper.emitted('send')).toBeUndefined()
    expect(erreur).toHaveBeenCalledWith(
      'crypte: status: its panel sent `autre:run`, whose type does not start with `status:`',
    )
  })
})

// Un panneau Vue envoie volontiers son état : ses proxys faisaient lever
// `postMessage` dans le shell, sans nom de plugin. Revue de la PR #107.
describe('what a panel sends, as JSON', () => {
  const envoie = (message: () => unknown) =>
    defineComponent({
      emits: ['send'],
      setup(_, { emit }) {
        return () => h('button', { onClick: () => emit('send', message()) })
      },
    })

  test('passes on a plain copy of a message that holds a panel’s state', async () => {
    const règles = ref(['color-contrast'])
    const wrapper = monte(
      // Chaque forme que JSON rend telle quelle, l'état réactif compris : retirer
      // l'une d'elles de `faithful` jetait le message. Revue de la PR #107.
      envoie(() => ({
        type: 'status:run',
        rules: règles.value,
        nothing: null,
        on: false,
        depth: 2,
        options: { strict: true },
      })),
      brouillon,
    )

    await wrapper.find('.body button').trigger('click')

    const [[copie]] = wrapper.emitted('send') as [[{ rules: unknown }]]
    expect(copie).toEqual({
      type: 'status:run',
      rules: ['color-contrast'],
      nothing: null,
      on: false,
      depth: 2,
      options: { strict: true },
    })
    expect(isProxy(copie.rules)).toBe(false)
  })

  // Ce que JSON perdrait sans lever : retiré en silence, le champ manquerait à
  // l'arrivée sans que rien le dise. Revue de la PR #107.
  test.for([
    ['a function', () => ({ type: 'status:run', f: () => {} }), '`f` is a function'],
    ['undefined', () => ({ type: 'status:run', u: undefined }), '`u` is undefined'],
    ['a Map', () => ({ type: 'status:run', m: new Map() }), '`m` is a Map'],
    ['a Date', () => ({ type: 'status:run', d: new Date(0) }), '`d` is a Date'],
    ['NaN', () => ({ type: 'status:run', n: Number.NaN }), '`n` is NaN'],
    [
      'a value inside an array',
      () => ({ type: 'status:run', l: [1, () => {}] }),
      '`1` is a function',
    ],
  ] as const)('drops a message holding %s, and names it', async ([, message, raison]) => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = monte(envoie(message), brouillon)

    await wrapper.find('.body button').trigger('click')

    expect(wrapper.emitted('send')).toBeUndefined()
    expect(erreur).toHaveBeenCalledWith(
      `crypte: status: its panel sent \`status:run\`, which does not survive JSON: ${raison}`,
    )
  })

  test('drops a message that does not survive JSON, and says so', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cyclique: Record<string, unknown> = { type: 'status:run' }
    cyclique['self'] = cyclique
    const wrapper = monte(
      envoie(() => cyclique),
      brouillon,
    )

    await wrapper.find('.body button').trigger('click')

    expect(wrapper.emitted('send')).toBeUndefined()
    expect(erreur).toHaveBeenCalledWith(
      expect.stringMatching(
        /^crypte: status: its panel sent `status:run`, which does not survive JSON: /,
      ),
    )
  })
})
