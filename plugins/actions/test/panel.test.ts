import type { ResolvedPropDetails, StoryEntry } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import actions from '../src/index'
import type { Called } from '../src/called'
import Panel from '../src/panel.vue'

// L'emplacement d'action de l'en-tête, où le panneau place ses boutons (6.1).
const entête = () => document.body.appendChild(document.createElement('span'))

// Le panneau de `actions` : les appels de la story affichée, quand il se replie,
// et ce qu'il oublie.

const fn: ResolvedPropDetails = { type: 'function', required: false }

const entry = (
  id: string,
  details: Record<string, ResolvedPropDetails> = { onClick: fn },
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
})

const appel = (id: string, prop: string, args: string[] = []): Called => ({
  type: 'actions:called',
  id,
  prop,
  args,
})

const lignes = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.actions-calls li').map((one) => one.findAll('span')[1]!.text())
const derniere = (wrapper: ReturnType<typeof mount>) => wrapper.emitted('inapplicable')?.at(-1)?.[0]

describe('the plugin', () => {
  it('points the shell at its built panel and hooks', () => {
    expect(actions()).toEqual({
      name: 'actions',
      shell: expect.any(String),
      preview: expect.any(String),
    })
  })
})

describe('the calls', () => {
  it('lists the calls of the story on display, newest first, and clears them', async () => {
    const wrapper = mount(Panel, {
      props: { actions: entête(), entry: entry('x--a'), received: null },
    })
    expect(wrapper.find('[role="status"]').text()).toBe('No call yet: use the component.')
    expect(derniere(wrapper)).toBeNull()

    await wrapper.setProps({ received: appel('x--a', 'onClick', ['MouseEvent click']) })
    await wrapper.setProps({ received: appel('x--autre', 'onClick') })
    await wrapper.setProps({ received: { type: 'autre:chose' } })
    await wrapper.setProps({ received: appel('x--a', 'onClick', ['"pro"', '2']) })
    expect(lignes(wrapper)).toEqual(['onClick("pro", 2)', 'onClick(MouseEvent click)'])

    await wrapper.findComponent(Button).trigger('click')
    expect(wrapper.find('.actions-calls').exists()).toBe(false)
  })

  it('forgets the calls with the next story, and keeps a hundred', async () => {
    const wrapper = mount(Panel, {
      props: { actions: entête(), entry: entry('x--a'), received: null },
    })
    for (let at = 0; at < 101; at += 1)
      await wrapper.setProps({ received: appel('x--a', `on${at}`) })
    expect(lignes(wrapper)).toHaveLength(100)
    expect(lignes(wrapper)[0]).toBe('on100()')

    await wrapper.setProps({ entry: entry('x--b') })
    expect(wrapper.find('.actions-calls').exists()).toBe(false)
  })

  it('folds with no story, and on a component with no function prop', async () => {
    const wrapper = mount(Panel, { props: { actions: entête(), entry: null, received: null } })
    expect(derniere(wrapper)).toBe('no story on display')

    await wrapper.setProps({ entry: entry('x--a', { label: { type: 'string', required: true } }) })
    expect(derniere(wrapper)).toBe('no function prop')
  })

  it('speaks French, and English for a language it does not know', async () => {
    const wrapper = mount(Panel, {
      props: { actions: entête(), entry: entry('x--a', {}), received: null, locale: 'fr' },
    })
    expect(derniere(wrapper)).toBe('aucune prop fonction')
    expect(wrapper.find('[role="status"]').text()).toBe('Aucun appel : utilisez le composant.')

    await wrapper.setProps({ locale: 'de' as 'fr' })
    expect(wrapper.find('[role="status"]').text()).toBe('No call yet: use the component.')
  })
})
