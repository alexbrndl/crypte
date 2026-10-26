import type { StoryEntry } from '@crypte/core/protocol'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import source from '../src/index'
import Panel from '../src/panel.vue'

// Le panneau de `source` : le code d'appel de la story affichée, à copier.

const entry = (id: string, code: string, partial?: string): StoryEntry => ({
  type: 'story',
  id,
  name: id,
  path: ['Badge'],
  storyFile: 'stories/Badge.tsx',
  component: { name: 'Badge', file: 'src/Badge.tsx', export: 'Badge' },
  options: {},
  details: {},
  props: ['label'],
  source: code,
  ...(partial ? { partial } : {}),
})

const raisons = (wrapper: ReturnType<typeof mount>) =>
  wrapper.emitted('inapplicable')?.map(([reason]) => reason) ?? []

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the plugin', () => {
  test('points the shell at its built panel', () => {
    expect(source()).toEqual({ name: 'source', shell: expect.any(String) })
  })
})

describe('the call code', () => {
  test('shows the call of the story on display, and folds with none', async () => {
    const wrapper = mount(Panel, { props: { entry: entry('badge--a', '<Badge label="Neuf" />') } })

    expect(wrapper.find('code').text()).toBe('<Badge label="Neuf" />')
    expect(raisons(wrapper)).toEqual([null])
    expect(wrapper.find('.source-partial').exists()).toBe(false)

    await wrapper.setProps({ entry: null })
    expect(wrapper.find('code').exists()).toBe(false)
    expect(raisons(wrapper).at(-1)).toBe('no story on display')
  })

  // Ce que la lecture du fichier a perdu, dont `meta`, qui ne touche pas l'appel.
  test('says what the reading of the file lost', () => {
    const wrapper = mount(Panel, {
      props: {
        entry: entry(
          'badge--a',
          '<Badge />',
          'a spread in the definition decides `meta`, so no status or owner is read',
        ),
      },
    })

    expect(wrapper.find('.source-partial').text()).toBe(
      'Incomplete reading: a spread in the definition decides `meta`, so no status or owner is read',
    )
  })

  test('copies the call, says so, and forgets it with the next story', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(Panel, { props: { entry: entry('badge--a', '<Badge label="Neuf" />') } })

    await wrapper.find('button').trigger('click')
    await nextTick()
    expect(writeText).toHaveBeenCalledWith('<Badge label="Neuf" />')
    expect(wrapper.find('button').text()).toBe('Copied')

    await wrapper.setProps({ entry: entry('badge--b', '<Badge />') })
    expect(wrapper.find('button').text()).toBe('Copy')
  })

  test('says when the browser refuses the copy', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: async () => Promise.reject(new Error('non')) },
    })
    const wrapper = mount(Panel, { props: { entry: entry('badge--a', '<Badge />') } })

    await wrapper.find('button').trigger('click')
    await nextTick()
    await nextTick()
    expect(wrapper.find('button').text()).toBe('Copy failed')
  })
})

// Le shell passe sa langue (6.1) : le panneau dit ses textes dans la sienne, et
// l'anglais pour une langue qu'il ne connaît pas. Le code reste celui du projet.
describe('the language the shell speaks', () => {
  test('draws its texts in French, and in English for a language it does not know', async () => {
    const wrapper = mount(Panel, {
      props: { entry: entry('badge--a', '<Badge />', 'un spread'), locale: 'fr' },
    })

    expect(wrapper.find('button').text()).toBe('Copier')
    expect(wrapper.find('.source-partial').text()).toBe('Lecture incomplète : un spread')
    await wrapper.setProps({ entry: null })
    expect(raisons(wrapper).at(-1)).toBe('aucune story affichée')
    await wrapper.setProps({ locale: 'de' as never })
    expect(raisons(wrapper).at(-1)).toBe('no story on display')
  })
})
