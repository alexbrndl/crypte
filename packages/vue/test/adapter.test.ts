import { defineComponent, h, inject, onUnmounted, provide, ref } from 'vue'
import { describe, expect, test as base, vi } from 'vitest'
import vue from '../src/index'
import type { Adapter } from '../src/index'

// L'adaptateur Vue, monté dans un DOM. Composants écrits avec `h()` : un `.vue`
// demanderait le compilateur, que ce projet de test ne charge pas.

const test = base.extend<{ monte: { adapter: Adapter; hote: HTMLElement } }>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser.
  monte: async ({}, use) => {
    const hote = document.createElement('div')
    document.body.append(hote)
    const adapter = vue()

    await use({ adapter, hote })

    adapter.unmount()
    hote.remove()
  },
})

const Badge = defineComponent({
  props: { label: String },
  setup: (props) => () => h('span', props.label ?? 'sans nom'),
})

const Boum = defineComponent({
  setup: () => () => {
    throw new Error('ce composant ne rend jamais')
  },
})

const Compteur = defineComponent({
  setup() {
    const clics = ref(0)
    return () => h('button', { type: 'button', onClick: () => clics.value++ }, String(clics.value))
  },
})

describe('the Vue adapter', () => {
  test('renders the story before mount returns', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' }, [])

    expect(monte.hote.textContent).toBe('Neuf')
  })

  // L'erreur sort de `mount`, que le canal transforme en erreur de la story ; et
  // elle ne reste pas collée à la story suivante.
  test('throws what the component threw, then mounts a working story', ({ monte }) => {
    expect(() => monte.adapter.mount(monte.hote, Boum, {}, [])).toThrow('ne rend jamais')

    monte.adapter.mount(monte.hote, Badge, { label: 'Réparé' }, [])

    expect(monte.hote.textContent).toBe('Réparé')
  })

  // Une nouvelle application à chaque rendu : l'état du composant repart de zéro,
  // le prix d'un rendu synchrone.
  test('starts the component state over at each mount', async ({ monte }) => {
    monte.adapter.mount(monte.hote, Compteur, {}, [])
    monte.hote.querySelector('button')?.click()
    await expect.poll(() => monte.hote.textContent).toBe('1')

    monte.adapter.mount(monte.hote, Compteur, {}, [])

    expect(monte.hote.textContent).toBe('0')
  })

  // L'application d'avant est démontée, pas recouverte : Vue démonte bien l'arbre
  // d'avant, mais l'application reste enregistrée sur l'hôte, et le dit.
  test('unmounts the previous app before mounting the next', ({ monte }) => {
    const avertit = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let démontés = 0
    const Suivi = defineComponent({
      setup() {
        onUnmounted(() => démontés++)
        return () => h('i', 'suivi')
      },
    })

    monte.adapter.mount(monte.hote, Suivi, {}, [])
    monte.adapter.mount(monte.hote, Badge, { label: 'Ensuite' }, [])

    expect(démontés).toBe(1)
    expect(monte.hote.textContent).toBe('Ensuite')
    expect(avertit).not.toHaveBeenCalled()
    avertit.mockRestore()
  })

  test('empties the host on unmount, and accepts a second unmount', ({ monte }) => {
    expect(() => monte.adapter.unmount()).not.toThrow()
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' }, [])
    monte.adapter.unmount()

    expect(monte.hote.textContent).toBe('')
    expect(() => monte.adapter.unmount()).not.toThrow()
  })
})

// Section 2.5 : le premier wrapper est le plus extérieur, et chacun reçoit la
// story par son slot par défaut, avec ses propres props.
describe('wrappers', () => {
  const Cadre = (nom: string) =>
    defineComponent({
      props: { ton: String },
      setup:
        (props, { slots }) =>
        () =>
          h('div', { 'data-cadre': nom, 'data-ton': props.ton }, slots.default?.()),
    })

  test('puts the first wrapper outermost, with its props', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' }, [
      { component: Cadre('router'), props: {} },
      { component: Cadre('theme'), props: { ton: 'calme' } },
    ])

    expect(
      monte.hote.querySelector(
        '[data-cadre="router"] > [data-cadre="theme"][data-ton="calme"] > span',
      )?.textContent,
    ).toBe('Neuf')
  })

  // Un provider est ce que `wrap` existe pour poser : ce qu'il fournit atteint
  // le composant.
  test('lets a provider reach the component', ({ monte }) => {
    const Fournit = defineComponent({
      setup: (_, { slots }) => {
        provide('ton', 'fourni')
        return () => slots.default?.()
      },
    })
    const Lit = defineComponent({ setup: () => () => h('em', inject('ton', 'absent')) })

    monte.adapter.mount(monte.hote, Lit, {}, [{ component: Fournit, props: {} }])

    expect(monte.hote.textContent).toBe('fourni')
  })
})
