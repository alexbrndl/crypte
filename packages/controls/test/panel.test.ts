import type { ResolvedPropDetails, StoryEntry } from '@crypte/core/protocol'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
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

const monte = (story: StoryEntry | null) => mount(Panel, { props: { entry: story } })

const émis = (wrapper: VueWrapper) => wrapper.emitted('overrides')?.map(([values]) => values) ?? []
const raisons = (wrapper: VueWrapper) =>
  wrapper.emitted('inapplicable')?.map(([reason]) => reason) ?? []

describe('the fields', () => {
  test('draws one field per editable prop, by its kind', () => {
    const wrapper = monte(toutes)

    expect(
      wrapper.findAll('label').map((one) => {
        const field = one.find('input, select')
        return `${one.find('span').text()}:${field.element.tagName.toLowerCase()}${field.attributes('type') ? `[${field.attributes('type')}]` : ''}`
      }),
    ).toEqual(['label:input[text]', 'count:input[number]', 'on:input[checkbox]', 'size:select'])
    expect(raisons(wrapper)).toEqual([])
  })

  // Le manifeste ne porte pas la valeur de la story : le champ part vide, avec
  // le défaut en indication, et la case n'est ni cochée ni décochée.
  test('starts empty, with the default as a hint', () => {
    const wrapper = monte(toutes)

    expect(wrapper.find('input[type="text"]').attributes('placeholder')).toBe('Nouveau')
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).indeterminate).toBe(
      true,
    )
    expect(wrapper.find('select option').text()).toBe('— valeur de la story')
    expect(wrapper.find('label').attributes('title')).toBe('Le texte.')
  })
})

describe('what an edit emits', () => {
  test('emits every value edited so far, typed as its field', async () => {
    const wrapper = monte(toutes)

    await wrapper.find('input[type="text"]').setValue('Bonjour')
    await wrapper.find('input[type="number"]').setValue('12')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    // Par rang : la seconde option est le nombre 2, qui reste un nombre.
    await wrapper.find('select').setValue('1')

    expect(émis(wrapper).at(-1)).toEqual({ label: 'Bonjour', count: 12, on: true, size: 2 })
  })

  // Vidé, un champ rend la story à sa valeur : il était vide pour elle.
  test('drops a value when its field is emptied', async () => {
    const wrapper = monte(toutes)

    await wrapper.find('input[type="text"]').setValue('Bonjour')
    await wrapper.find('input[type="number"]').setValue('12')
    await wrapper.find('select').setValue('0')

    await wrapper.find('input[type="text"]').setValue('')
    await wrapper.find('input[type="number"]').setValue('')
    await wrapper.find('select').setValue('')

    expect(émis(wrapper).slice(-3)).toEqual([{ count: 12, size: 'sm' }, { size: 'sm' }, {}])
  })

  test('goes back to the story in one click', async () => {
    const wrapper = monte(toutes)
    const retour = () => wrapper.find('button')

    expect(retour().attributes('disabled')).toBeDefined()

    await wrapper.find('input[type="text"]').setValue('Bonjour')
    expect(retour().attributes('disabled')).toBeUndefined()

    await retour().trigger('click')
    expect(émis(wrapper).at(-1)).toEqual({})
    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
  })

  // Une autre story repart de ses props : le shell lâche les valeurs, et les
  // champs suivent sans rien émettre de plus.
  test('starts over on another story, and emits nothing for it', async () => {
    const wrapper = monte(toutes)
    await wrapper.find('input[type="text"]').setValue('Bonjour')
    const avant = émis(wrapper).length

    await wrapper.setProps({ entry: { ...toutes, id: 'x--autre' } })

    expect((wrapper.find('input[type="text"]').element as HTMLInputElement).value).toBe('')
    expect(émis(wrapper)).toHaveLength(avant)
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
    ['no story on display', null, 'aucune story affichée'],
    ['a component with no props', entry('x--nue', {}), 'aucune prop sur ce composant'],
    [
      'a component with no editable prop',
      entry('x--fonctions', { onClick: { type: 'function', required: true } }),
      'aucune prop modifiable sur ce composant',
    ],
  ] as const)('folds on %s', ([, story, reason]) => {
    const wrapper = monte(story)

    expect(raisons(wrapper)).toEqual([reason])
    expect(wrapper.find('form').exists()).toBe(false)
  })

  // Le cas de DCJ-319 : rien n'a été lu, ce qui n'est pas « rien à éditer ». Le
  // panneau reste ouvert et le dit, avec la raison et ce qu'on peut y faire.
  test('says why when the props could not be read, and stays open', () => {
    const wrapper = monte(entry('x--opaque', {}, 'its props parameter has no type'))

    expect(raisons(wrapper)).toEqual([])
    expect(wrapper.find('.unread').text()).toBe(
      'Props non lues dans le fichier du composant : its props parameter has no type. Seules celles déclarées dans details de la story apparaissent ici.',
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
    expect(wrapper.findAll('label').map((one) => one.find('span').text())).toEqual(['label'])
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
