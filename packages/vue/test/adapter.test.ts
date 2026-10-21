import { defineComponent, h, inject, onUnmounted, provide, ref } from 'vue'
import { describe, expect, test as base } from 'vitest'
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

  // Le même composant, qui lève puis ne lève plus : une prop corrigée dans
  // `controls` doit suffire à le faire rendre.
  test('renders the same component again once it stops throwing', ({ monte }) => {
    const Fragile = defineComponent({
      props: { casse: Boolean },
      setup: (props) => () => {
        if (props.casse) throw new Error('cassé')
        return h('b', 'entier')
      },
    })

    expect(() => monte.adapter.mount(monte.hote, Fragile, { casse: true }, [])).toThrow('cassé')
    monte.adapter.mount(monte.hote, Fragile, { casse: false }, [])

    expect(monte.hote.textContent).toBe('entier')
  })

  // La racine est gardée : un composant du même type garde son état d'un rendu à
  // l'autre, ce qu'une édition de `controls` demande, comme avec React.
  test('keeps component state from one mount to the next', async ({ monte }) => {
    monte.adapter.mount(monte.hote, Compteur, {}, [])
    monte.hote.querySelector('button')?.click()
    await expect.poll(() => monte.hote.textContent).toBe('1')

    monte.adapter.mount(monte.hote, Compteur, {}, [])

    expect(monte.hote.textContent).toBe('1')
  })

  test('renders new props before mount returns', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Avant' }, [])
    monte.adapter.mount(monte.hote, Badge, { label: 'Après' }, [])

    expect(monte.hote.textContent).toBe('Après')
  })

  // Après un démontage, l'état repart de zéro : la preview démonte quand le
  // rechargement à chaud remplace son module, jamais à un changement de story.
  test('starts from fresh state after an unmount', async ({ monte }) => {
    monte.adapter.mount(monte.hote, Compteur, {}, [])
    monte.hote.querySelector('button')?.click()
    await expect.poll(() => monte.hote.textContent).toBe('1')
    monte.adapter.unmount()

    monte.adapter.mount(monte.hote, Compteur, {}, [])

    expect(monte.hote.textContent).toBe('0')
  })

  // Vue rend un commentaire vide pour ce qui n'est pas un composant, et n'avertit
  // qu'en console : la story disparaîtrait, annoncée rendue.
  test('throws on a value that is not a component, wrapper included', ({ monte }) => {
    expect(() => monte.adapter.mount(monte.hote, undefined, {}, [])).toThrow(
      'undefined is not a Vue component',
    )
    expect(() =>
      monte.adapter.mount(monte.hote, Badge, {}, [{ component: {}, props: {} }]),
    ).toThrow('an object with neither `render` nor `setup` is not a Vue component')
    expect(() => monte.adapter.mount(monte.hote, 'Badge', {}, [])).toThrow(
      'a string is not a Vue component',
    )
    expect(() => monte.adapter.mount(monte.hote, { template: '<b/>' }, {}, [])).toThrow(
      'a component declares a `template` but no render function',
    )
  })

  // Un autre hôte : l'arbre de l'hôte d'avant est démonté, pas laissé en place
  // avec ses effets.
  test('unmounts what the previous host held when the host changes', ({ monte }) => {
    let démontés = 0
    const Suivi = defineComponent({
      setup() {
        onUnmounted(() => démontés++)
        return () => h('i', 'suivi')
      },
    })

    const autre = document.createElement('div')
    monte.adapter.mount(autre, Suivi, {}, [])
    monte.adapter.mount(monte.hote, Badge, { label: 'Ensuite' }, [])

    expect(démontés).toBe(1)
    expect(autre.textContent).toBe('')
    expect(monte.hote.textContent).toBe('Ensuite')
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
