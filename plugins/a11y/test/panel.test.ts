import type { StoryEntry } from '@crypte/core/protocol'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import a11y from '../src/index'
import Panel from '../src/panel.vue'
import type { Results, Violation } from '../src/results'

// Le panneau de `a11y` : ce qu'il montre d'une analyse, quand il se replie, et
// ce qu'il envoie à sa preview.

const entry = (id: string): StoryEntry => ({
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
})

const violation = (rule: string, impact: Violation['impact'], targets = ['span']): Violation => ({
  rule,
  impact,
  help: `aide de ${rule}`,
  helpUrl: `https://example.com/${rule}`,
  targets,
})

const resultats = (id: string, violations: Violation[], passes = 12): Results => ({
  type: 'a11y:results',
  id,
  passes,
  violations,
})

const monte = (story: StoryEntry | null, received: Results | null = null) =>
  mount(Panel, { props: { entry: story, received } })

const derniere = (wrapper: ReturnType<typeof monte>) => wrapper.emitted('inapplicable')?.at(-1)?.[0]

describe('what the panel shows', () => {
  it('lists the violations by impact, the gravest first, with rule and selectors', () => {
    const wrapper = monte(
      entry('x--a'),
      resultats('x--a', [
        violation('region', 'minor'),
        violation('aria-roles', 'critical', ['span[role="etiquette"]']),
        violation('list', 'minor', ['ul', 'ol']),
      ]),
    )

    const groupes = wrapper.findAll('section').map((one) => one.find('p').text())
    expect(groupes).toEqual(['Critique · 1 violation', 'Mineure · 2 violations'])

    const critique = wrapper.findAll('section')[0]!
    expect(critique.find('code').text()).toBe('aria-roles')
    expect(critique.find('a').text()).toBe('aide de aria-roles')
    expect(critique.find('a').attributes('href')).toBe('https://example.com/aria-roles')
    expect(critique.findAll('li li').map((one) => one.text())).toEqual(['span[role="etiquette"]'])
    expect(
      wrapper
        .findAll('section')[1]!
        .findAll('li li')
        .map((one) => one.text()),
    ).toEqual(['span', 'ul', 'ol'])
  })

  // Une analyse peut revenir après que la story suivante est affichée.
  it('shows nothing of the analysis of another story', () => {
    const wrapper = monte(entry('x--b'), resultats('x--a', []))

    expect(wrapper.find('[role="status"]').text()).toBe('Analyse en cours…')
    expect(wrapper.find('section').exists()).toBe(false)
    expect(derniere(wrapper)).toBeNull()
  })

  it('waits for an analysis before any has come', () => {
    const wrapper = monte(entry('x--a'))

    expect(wrapper.find('[role="status"]').text()).toBe('Analyse en cours…')
    expect(derniere(wrapper)).toBeNull()
  })
})

describe('when the panel folds', () => {
  it('folds on a story with no violation, with the rules that passed', () => {
    expect(derniere(monte(entry('x--a'), resultats('x--a', [], 12)))).toBe(
      '12 règles automatiques passées, aucune violation',
    )
    expect(derniere(monte(entry('x--a'), resultats('x--a', [], 1)))).toBe(
      '1 règle automatique passée, aucune violation',
    )
  })

  it('folds with no story on display', () => {
    expect(derniere(monte(null))).toBe('aucune story affichée')
  })

  // Le cas qui a fait accepter `null` au cadre : une édition des props ajoute
  // une violation à une story qui n'en avait pas.
  it('unfolds when the same story comes back with a violation', async () => {
    const wrapper = monte(entry('x--a'), resultats('x--a', []))
    expect(derniere(wrapper)).toBe('12 règles automatiques passées, aucune violation')

    await wrapper.setProps({ received: resultats('x--a', [violation('image-alt', 'critical')]) })

    expect(derniere(wrapper)).toBeNull()
  })
})

describe('running the analysis again', () => {
  it('asks the preview, and waits for the next result', async () => {
    const wrapper = monte(entry('x--a'), resultats('x--a', [violation('image-alt', 'critical')]))

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('send')).toEqual([[{ type: 'a11y:run' }]])
    expect(wrapper.find('[role="status"]').text()).toBe('Analyse en cours…')

    // Le même résultat qu'avant, reçu de nouveau : l'attente s'arrête quand même.
    await wrapper.setProps({ received: resultats('x--a', [violation('image-alt', 'critical')]) })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('section').exists()).toBe(true)
  })
})

describe('the plugin', () => {
  // Le panneau et les hooks construits sont à côté de la fabrique, dans `dist`.
  it('points both browser surfaces at the built modules beside it', () => {
    expect(a11y()).toEqual({
      name: 'a11y',
      shell: new URL('../src/shell.js', import.meta.url).href,
      preview: new URL('../src/preview.js', import.meta.url).href,
    })
  })
})
