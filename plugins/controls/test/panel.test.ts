import type { RenderedValues, ResolvedPropDetails, StoryEntry } from '@crypte/core/protocol'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Field, Select } from '@crypte/ui'
import { describe, expect, test } from 'vitest'
import { nextTick } from 'vue'
import controls from '../src/index'
import Panel from '../src/panel.vue'

// Le panneau de `controls` : un champ par prop modifiable de `details`, les
// valeurs éditées émises telles quelles, et ce qu'il dit quand il n'a rien à
// éditer. Section 6.1 de docs/contracts.md.

const entry = (
  id: string,
  details: Record<string, ResolvedPropDetails>,
  propsUnread?: string,
): StoryEntry => ({
  type: 'story',
  id,
  name: id,
  path: ['X'],
  storyFile: 'stories/X.tsx',
  component: { name: 'X', file: 'src/X.tsx', export: 'X' },
  options: {},
  details,
  props: [],
  source: '<X />',
  ...(propsUnread === undefined ? {} : { propsUnread }),
})

// Une prop de chaque nature : quatre ont un champ, les autres non.
const toutes = entry('x--toutes', {
  label: { type: 'string', required: true, default: 'Nouveau', description: 'Le texte.' },
  count: { type: 'number', required: false },
  on: { type: 'boolean', required: false },
  size: { type: 'enum', required: false, options: ['sm', 2] },
  onClick: { type: 'function', required: false },
  children: { type: 'node', required: false },
  style: { type: 'object', required: false },
  items: { type: 'array', required: false },
  className: { type: 'unknown', required: false },
})

// Le shell tient ce que le panneau édite et le lui rend en `overrides` (6.1) :
// le montage joue ce rôle, chaque émission revient en prop.
const monte = (story: StoryEntry | null, values: RenderedValues | null = null) => {
  const wrapper: VueWrapper = mount(Panel, {
    props: {
      entry: story,
      values,
      overrides: {},
      onOverrides: (overrides: Record<string, unknown>) => void wrapper.setProps({ overrides }),
    },
  })
  return wrapper
}

const émis = (wrapper: VueWrapper) => wrapper.emitted('overrides')?.map(([values]) => values) ?? []
const raisons = (wrapper: VueWrapper) =>
  wrapper.emitted('inapplicable')?.map(([reason]) => reason) ?? []

// La liste est celle de Reka, téléportée à l'ouverture : on la lit et on la
// choisit par le composant, par rang comme le panneau.
const liste = (wrapper: VueWrapper) => wrapper.findComponent(Select)
const choix = (wrapper: VueWrapper) =>
  liste(wrapper)
    .props('options')
    .map((one) => one.label)
const choisi = (wrapper: VueWrapper) => liste(wrapper).props('modelValue') as string | undefined
const choisit = async (wrapper: VueWrapper, at: string) => {
  liste(wrapper).vm.$emit('update:modelValue', at)
  await nextTick()
}
const libellés = (wrapper: VueWrapper) =>
  wrapper.findAllComponents(Field).map((one) => one.props('label') as string)
const bouton = (wrapper: VueWrapper, texte: string) =>
  wrapper.findAll('button').find((one) => one.text() === texte)

describe('the fields', () => {
  test('draws one field per editable prop, by its kind', () => {
    const wrapper = monte(toutes)

    expect(
      wrapper.findAllComponents(Field).map((one) => {
        const control = one.findComponent(Select).exists()
          ? 'select'
          : `input[${one.find('input').attributes('type')}]`
        return `${one.props('label')}:${control}`
      }),
    ).toEqual(['label:input[text]', 'count:input[number]', 'on:input[checkbox]', 'size:select'])
    expect(raisons(wrapper)).toEqual([])
  })

  // Avant le rendu, rien n'est saisi : le défaut en indication, la case ni
  // cochée ni décochée, et la liste sur son indication.
  test('starts with nothing edited, the default as a hint before the story renders', () => {
    const wrapper = monte(toutes)

    expect(wrapper.find('input[type="text"]').attributes('placeholder')).toBe('Nouveau')
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).indeterminate).toBe(
      true,
    )
    expect(choisi(wrapper)).toBeUndefined()
    expect(liste(wrapper).props('placeholder')).toBe('—')
    expect(wrapper.findComponent(Field).props('description')).toBe('Le texte.')
  })

  // Ce que le composant affiche : la valeur rendue l'emporte sur le défaut, et
  // une valeur saisie sur les deux. Un champ texte la montre en indice, grisée.
  test('shows what the story rendered with, until a field is edited', async () => {
    const wrapper = monte(toutes, { label: 'Rendu', count: 4, on: true, size: 2 })
    const texte = wrapper.find('input[type="text"]')

    expect(texte.attributes('placeholder')).toBe('Rendu')
    expect(wrapper.find('input[type="number"]').attributes('placeholder')).toBe('4')
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
    expect(choisi(wrapper)).toBe('1')
    expect(choix(wrapper)).toEqual(['sm', '2'])
    expect(émis(wrapper)).toEqual([])

    await choisit(wrapper, '0')
    await wrapper.find('input[type="checkbox"]').setValue(false)
    expect(choisi(wrapper)).toBe('0')
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    expect(émis(wrapper).at(-1)).toEqual({ size: 'sm', on: false })
  })
})

describe('the form', () => {
  // Sans ce refus, Entrée dans un champ envoie le formulaire, et le navigateur
  // recharge le shell entier.
  test('never submits', () => {
    const wrapper = monte(toutes)
    const submit = new Event('submit', { cancelable: true })

    wrapper.find('form').element.dispatchEvent(submit)

    expect(submit.defaultPrevented).toBe(true)
  })

  // Une option objet, écrite dans `details`, n'est pas proposée : un override
  // est toujours une primitive, et `postMessage` refusait celle-ci. Revue de la
  // PR #106.
  test('offers only the primitive options of an enum', async () => {
    const wrapper = monte(
      entry('x--objets', {
        size: { type: 'enum', required: false, options: [{ w: 1 }, 'md', null] },
      }),
    )

    expect(choix(wrapper)).toEqual(['md', 'null'])

    await choisit(wrapper, '0')
    expect(émis(wrapper).at(-1)).toEqual({ size: 'md' })
  })

  // Un `enum` écrit sans ses valeurs : la liste n'a rien à proposer.
  test('offers nothing for an enum with no options', () => {
    const wrapper = monte(entry('x--sans-options', { size: { type: 'enum', required: false } }))

    expect(choix(wrapper)).toEqual([])
  })
})

describe('what an edit emits', () => {
  test('emits every value edited so far, typed as its field', async () => {
    const wrapper = monte(toutes)

    await wrapper.find('input[type="text"]').setValue('Bonjour')
    await wrapper.find('input[type="number"]').setValue('12')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    // Par rang : la seconde option est le nombre 2, qui reste un nombre.
    await choisit(wrapper, '1')

    expect(émis(wrapper).at(-1)).toEqual({ label: 'Bonjour', count: 12, on: true, size: 2 })
  })

  // Vidé, un champ rend la story à sa valeur : il était vide pour elle.
  test('drops a value when its field is emptied', async () => {
    const wrapper = monte(toutes)

    await wrapper.find('input[type="text"]').setValue('Bonjour')
    await wrapper.find('input[type="number"]').setValue('12')

    await wrapper.find('input[type="text"]').setValue('')
    await wrapper.find('input[type="number"]').setValue('')

    expect(émis(wrapper).slice(-2)).toEqual([{ count: 12 }, {}])
  })

  // Le champ surchargé le dit, et se rend seul à la story : les autres gardent
  // ce qui a été saisi.
  test('marks an overridden field, and gives that one back to the story', async () => {
    const wrapper = monte(toutes)
    await wrapper.find('input[type="text"]').setValue('Bonjour')
    await choisit(wrapper, '1')

    const champs = wrapper.findAllComponents(Field)
    expect(champs.map((one) => one.props('overridden'))).toEqual([true, false, false, true])
    expect(wrapper.findAll('button').filter((one) => one.text() === 'Reset')).toHaveLength(2)

    await champs[3]!.find('button').trigger('click')
    expect(émis(wrapper).at(-1)).toEqual({ label: 'Bonjour' })
    expect(wrapper.findAllComponents(Field).map((one) => one.props('overridden'))).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  // Une autre story repart de ses props, ou l'en-tête rend tout à la story : le
  // shell lâche les valeurs, et les champs suivent sans rien émettre de plus.
  test('follows the shell when it drops the values, and emits nothing for it', async () => {
    const wrapper = monte(toutes)
    await wrapper.find('input[type="text"]').setValue('Bonjour')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await choisit(wrapper, '1')
    const avant = émis(wrapper).length

    await wrapper.setProps({ entry: { ...toutes, id: 'x--autre' }, overrides: {} })

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).indeterminate).toBe(
      true,
    )
    expect(choisi(wrapper)).toBeUndefined()
    expect(émis(wrapper)).toHaveLength(avant)
  })

  // Décochée, la case vaut `false`, pas la valeur de la story : elle n'est
  // plus indéterminée.
  test('emits false for an unchecked box', async () => {
    const wrapper = monte(toutes)

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('input[type="checkbox"]').setValue(false)

    expect(émis(wrapper).at(-1)).toEqual({ on: false })
  })

  // La même story relue garde ce qui a été saisi, comme le shell garde les
  // valeurs.
  test('keeps its values when the same story is read again', async () => {
    const wrapper = monte(toutes)
    await wrapper.find('input[type="text"]').setValue('Bonjour')

    await wrapper.setProps({ entry: { ...toutes } })

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('Bonjour')
  })
})

describe('what it says when there is nothing to edit', () => {
  test.for([
    ['no story on display', null, 'no story on display'],
    ['a component with no props', entry('x--nue', {}), 'no prop on this component'],
    [
      'a component with no editable prop',
      entry('x--fonctions', { onClick: { type: 'function', required: true } }),
      'no editable prop on this component',
    ],
  ] as const)('folds on %s', ([, story, reason]) => {
    const wrapper = monte(story)

    expect(raisons(wrapper)).toEqual([reason])
    expect(wrapper.find('form').exists()).toBe(false)
  })

  // Le cas de DCJ-319 : rien n'a été lu, ce qui n'est pas « rien à éditer ». Le
  // panneau reste ouvert et le dit, avec la raison et ce qu'on peut y faire.
  test('says why when the props could not be read, and stays open', () => {
    const wrapper = monte(entry('x--opaque', {}, 'nothing the reader follows types its props'))

    expect(raisons(wrapper)).toEqual([])
    expect(wrapper.find('.unread').text()).toBe(
      'Props not read from the component file: nothing the reader follows types its props. Only those the story declares in details appear here.',
    )
  })

  test('draws the props the story declared beside that note', () => {
    const wrapper = monte(
      entry(
        'x--declaree',
        { label: { type: 'string', required: true } },
        'its file does not parse',
      ),
    )

    expect(wrapper.find('.unread').exists()).toBe(true)
    expect(libellés(wrapper)).toEqual(['label'])
  })
})

describe('the plugin', () => {
  // Le panneau construit est à côté de la fabrique, dans `dist`.
  test('points its shell surface at the built panel beside it', () => {
    const plugin = controls()

    expect(plugin.name).toBe('controls')
    expect(plugin.shell).toBe(new URL('../src/shell.js', import.meta.url).href)
  })
})
