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

// Chaque ligne : la prop, son nombre d'appels ou un tiret, et ses derniers
// arguments sur la sous-ligne qui suit, quand il y en a.
const lignes = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .findAll('tbody tr')
    .map((one) =>
      one.classes('actions-row')
        ? `${one.find('.actions-name').text()} ${one.find('.actions-count').text()}`
        : `  ${one.find('.actions-args').text()}`,
    )
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
  it('updates the row of the prop called, for the story on display, and clears it', async () => {
    const header = entête()
    const wrapper = mount(Panel, {
      props: { actions: header, entry: entry('x--a'), received: null },
    })
    expect(wrapper.find('[role="status"]').text()).toBe('Use the component to call these props.')
    expect(lignes(wrapper)).toEqual(['onClick –'])
    expect(header.querySelector('.actions-clear')).toBeNull()
    expect(derniere(wrapper)).toBeNull()

    await wrapper.setProps({ received: appel('x--a', 'onClick', ['MouseEvent click']) })
    await wrapper.setProps({ received: appel('x--autre', 'onClick') })
    await wrapper.setProps({ received: { type: 'autre:chose' } })
    await wrapper.setProps({ received: appel('x--a', 'onClick', ['"pro"', '2']) })
    expect(lignes(wrapper)).toEqual(['onClick 2', '  "pro", 2'])
    // L'invite seulement avant le premier appel.
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    // Dans l'en-tête, jamais dans le corps du panneau.
    expect(header.querySelector('.actions-clear')).not.toBeNull()
    expect(wrapper.find('.actions-clear').exists()).toBe(false)

    await wrapper.findComponent(Button).trigger('click')
    expect(lignes(wrapper)).toEqual(['onClick –'])
  })

  // Une prop appelée que `details` ne liste pas, nommée comme une clé d'objet.
  it('gives a row to a prop called without being listed, and forgets with the next story', async () => {
    const wrapper = mount(Panel, {
      props: { actions: entête(), entry: entry('x--a'), received: null },
    })
    await wrapper.setProps({ received: appel('x--a', 'constructor') })
    await wrapper.setProps({ received: appel('x--a', 'constructor') })
    expect(lignes(wrapper)).toEqual(['onClick –', 'constructor 2'])

    await wrapper.setProps({ entry: entry('x--b') })
    expect(lignes(wrapper)).toEqual(['onClick –'])
  })

  // Un événement seul ne dit rien qu'un clic n'ait dit : pas de sous-ligne. À côté
  // d'une valeur, seule la valeur reste.
  it('leaves out the arguments that are only events', async () => {
    const wrapper = mount(Panel, {
      props: { actions: entête(), entry: entry('x--a'), received: null },
    })
    await wrapper.setProps({ received: appel('x--a', 'onClick', ['PointerEvent click']) })
    expect(lignes(wrapper)).toEqual(['onClick 1'])

    await wrapper.setProps({
      received: appel('x--a', 'onClick', ['Event change', '"pro"', 'Eventual']),
    })
    expect(lignes(wrapper)).toEqual(['onClick 2', '  "pro", Eventual'])
  })

  // Les props fonctions qu'il surveille, avec leur description.
  it('names the function props to call, their description in a tooltip', async () => {
    const wrapper = mount(Panel, {
      props: {
        actions: entête(),
        entry: entry('x--a', {
          label: { type: 'string', required: true },
          onClick: { ...fn, description: 'Fired when pressed' },
          onDismiss: fn,
        }),
        received: null,
      },
    })
    expect(lignes(wrapper)).toEqual(['onClick –', 'onDismiss –'])
    // En infobulle, pour garder une ligne par prop.
    expect(wrapper.findAll('.actions-row').map((one) => one.attributes('title'))).toEqual([
      'Fired when pressed',
      undefined,
    ])
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
    expect(wrapper.find('[role="status"]').text()).toBe(
      'Utilisez le composant pour appeler ces props.',
    )

    await wrapper.setProps({ locale: 'de' as 'fr' })
    expect(wrapper.find('[role="status"]').text()).toBe('Use the component to call these props.')
  })
})
