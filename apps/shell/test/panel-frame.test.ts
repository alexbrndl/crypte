import type { StoryEntry, StoryMeta } from '@crypte/core/protocol'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, watchEffect, type Component } from 'vue'
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
})
