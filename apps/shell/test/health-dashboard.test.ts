import type { StoryEntry, TokensEntry } from '@crypte/core/protocol'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import { dashboardOf, ORPHANS, READY } from '../src/health/dashboard'
import HealthDashboard from '../src/health/health-dashboard.vue'
import type { HealthComponent } from '../src/health/health'
import { locale } from '../src/i18n'

// Le dashboard dessiné : les cases à cocher de section et de groupe, le focus
// croisé entre composants et tokens, les lignes repliées, et les flèches.

beforeEach(() => {
  locale.value = 'en'
})

const composant = (name: string, over: Partial<HealthComponent> = {}): HealthComponent => ({
  name,
  file: `src/${name}.tsx`,
  export: name,
  stories: [`${name.toLowerCase()}--a`],
  props: 0,
  required: 0,
  status: 'stable',
  usedIn: ['src/app.tsx'],
  ...over,
})

const story = (name: string): StoryEntry => ({
  type: 'story',
  id: `${name.toLowerCase()}--a`,
  path: [name],
  name: 'a',
  component: { name, file: `src/${name}.tsx`, export: name },
  storyFile: `stories/${name}.tsx`,
  options: {},
  details: {},
  props: [],
  source: '',
})

const familles: TokensEntry[] = [
  {
    type: 'tokens',
    id: 'tokens--space',
    path: ['Tokens'],
    name: 'space',
    tokens: {
      '1': { type: 'dimension', themes: { default: { value: '4px' } } },
      '2': { type: 'dimension', themes: { default: { value: '8px' } } },
      '3': { type: 'dimension', themes: { default: { value: '12px' } } },
    },
  },
]

// Deux bloquants qui ne rendent pas, un à améliorer sans story, un prêt.
const composants = [
  composant('Alpha', { tokens: ['space-1'] }),
  composant('Beta', { tokens: ['space-2'] }),
  composant('Gamma', { stories: [] }),
  composant('Delta'),
]
const audit = ['Alpha', 'Beta', 'Delta'].flatMap((name) =>
  (['light', 'dark'] as const).map((theme) =>
    name === 'Delta'
      ? { id: 'delta--a', theme, passes: 1, violations: [] }
      : { id: `${name.toLowerCase()}--a`, theme, broken: 'Boom' },
  ),
)
const dashboard = dashboardOf(composants, familles, {
  stories: ['Alpha', 'Beta', 'Delta'].map(story),
  pages: ['Alpha', 'Beta', 'Delta'].map((name) => ({
    type: 'page' as const,
    id: `page--${name}`,
    path: [],
    name,
    file: `stories/${name}.md`,
    body: '',
    storyFile: `stories/${name}.tsx`,
  })),
  audit,
  components: composants,
  categories: [],
})

const monte = (checked: string[] = [], selected: string | null = null) =>
  mount(HealthDashboard, {
    props: { dashboard, checked: new Set(checked), selected, partial: false },
  })

describe('the checkboxes of the list', () => {
  test('are checked, mixed or empty as their rows are, and check their rows', async () => {
    const wrapper = monte(['src/Alpha.tsx:Alpha'])
    const [section, bloquants, àFaire] = wrapper
      .findAll('.health-list .header .check input, .health-list .group .check input')
      .map((one) => one.element as HTMLInputElement)

    expect([section!.checked, section!.indeterminate]).toEqual([false, true])
    expect([bloquants!.checked, bloquants!.indeterminate]).toEqual([false, true])
    expect([àFaire!.checked, àFaire!.indeterminate]).toEqual([false, false])

    await wrapper.findAll('.health-list .group .check input')[0]!.trigger('change')
    expect(wrapper.emitted('check')).toEqual([[['src/Alpha.tsx:Alpha', 'src/Beta.tsx:Beta'], true]])
  })

  // Les prêts n'ont rien à corriger : ni case de groupe, ni case de ligne.
  test('give the ready rows no checkbox, and count the rows in the prompt', () => {
    const wrapper = monte(['src/Alpha.tsx:Alpha', ORPHANS])
    const prêts = wrapper.find('.health-list .group[data-group="ready"]')
    expect(prêts.find('input').exists()).toBe(false)
    expect(wrapper.find('.in-prompt').text()).toBe(
      `2 of ${dashboard.checkable.length} in the prompt`,
    )
  })

  // Cocher une ligne ne la choisit pas.
  test('check a row without selecting it', async () => {
    const wrapper = monte()
    const coche = wrapper.find('.health-list .row .check input')
    await coche.trigger('click')
    await coche.trigger('change')
    expect(wrapper.emitted('check')).toEqual([[['src/Alpha.tsx:Alpha'], true]])
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})

describe('the focus', () => {
  const voilés = (wrapper: ReturnType<typeof monte>, selector: string) =>
    wrapper.findAll(selector).map((one) => one.attributes('data-dimmed') !== undefined)

  test('keeps a hovered component and the tokens it reads, and says so in the title', async () => {
    const wrapper = monte()
    await wrapper.find('.case').trigger('mouseenter')

    expect(voilés(wrapper, '.case')).toEqual([false, true, true, true])
    expect(voilés(wrapper, '.families .cell')).toEqual([false, true, true])
    expect(wrapper.findAll('.block .note').map((one) => one.text())).toEqual(['· 1 read by Alpha'])
    // Son abréviation apparaît sur sa ligne, seule.
    expect(
      wrapper.findAll('.health-list .abbreviation[data-shown]').map((one) => one.text()),
    ).toEqual(['Alph'])

    await wrapper.find('.case').trigger('mouseleave')
    expect(voilés(wrapper, '.case')).toEqual([false, false, false, false])
  })

  test('keeps a hovered token and the components that read it', async () => {
    const wrapper = monte()
    await wrapper.findAll('.families .cell')[1]!.trigger('mouseenter')

    expect(voilés(wrapper, '.case')).toEqual([true, false, true, true])
    expect(voilés(wrapper, '.families .cell')).toEqual([true, false, true])
    expect(wrapper.find('.block .note').text()).toBe('· 1 reads --space-2')
  })

  // Choisis, les orphelins voilent tous les composants ; les prêts, aucun token.
  test('follows the folded rows chosen', () => {
    const orphelins = monte([], ORPHANS)
    expect(voilés(orphelins, '.case')).toEqual([true, true, true, true])
    expect(voilés(orphelins, '.families .cell')).toEqual([true, true, false])
    expect(orphelins.find('.block .note').text()).toBe('· none reads the orphans')

    const prêts = monte([], READY)
    expect(voilés(prêts, '.case')).toEqual([true, true, true, false])
    expect(voilés(prêts, '.families .cell')).toEqual([false, false, false])
  })

  test('selects the folded rows on a click', async () => {
    const wrapper = monte()
    const rows = wrapper.findAll('.health-list .row')
    await rows.find((one) => one.text().includes('1 ready'))!.trigger('click')
    await rows.find((one) => one.text().includes('1 orphan'))!.trigger('click')
    expect(wrapper.emitted('select')!.map(([item]) => item)).toEqual([READY, ORPHANS])
  })
})

describe('the grids from the keyboard', () => {
  // Une seule case dans l'ordre de tabulation, les flèches pour les autres.
  test('move the one tabbable case with the arrows, Home and End', async () => {
    const wrapper = monte()
    const cases = () => wrapper.findAll('.case')
    expect(cases().map((one) => one.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])

    await cases()[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(cases().map((one) => one.attributes('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
    await cases()[1]!.trigger('keydown', { key: 'End' })
    expect(cases()[3]!.attributes('tabindex')).toBe('0')
    await cases()[3]!.trigger('keydown', { key: 'Home' })
    expect(cases()[0]!.attributes('tabindex')).toBe('0')
    // Une touche hors de la grille ne déplace rien.
    await cases()[0]!.trigger('keydown', { key: 'a' })
    expect(cases()[0]!.attributes('tabindex')).toBe('0')
  })

  test('name each case with its state', () => {
    const wrapper = monte()
    expect(wrapper.findAll('.case').map((one) => one.attributes('aria-label'))).toEqual([
      'Alpha, blocking',
      'Beta, blocking',
      'Gamma, to improve',
      'Delta, ready',
    ])
    expect(wrapper.findAll('.families .cell').map((one) => one.attributes('aria-label'))).toEqual([
      '--space-1, used',
      '--space-2, used',
      '--space-3, orphan',
    ])
  })
})

describe('the tab stops', () => {
  const entrées = (wrapper: ReturnType<typeof monte>, selector: string) =>
    wrapper.findAll(selector).filter((one) => one.attributes('tabindex') === '0').length

  // Un token choisi laisse la première case des composants dans l'ordre de
  // tabulation, et des flèches puis une autre sélection n'en laissent qu'une.
  test('keep exactly one per grid, whatever is selected or moved to', async () => {
    const wrapper = monte([], 'token:space-2')
    expect(entrées(wrapper, '.case')).toBe(1)
    expect(wrapper.findAll('.families .cell')[1]!.attributes('tabindex')).toBe('0')

    await wrapper.findAll('.case')[0]!.trigger('keydown', { key: 'ArrowRight' })
    await wrapper.findAll('.case')[1]!.trigger('keydown', { key: 'ArrowRight' })
    await wrapper.setProps({ selected: 'src/Delta.tsx:Delta' })
    expect(wrapper.findAll('.case').map((one) => one.attributes('tabindex'))).toEqual([
      '-1',
      '-1',
      '-1',
      '0',
    ])
  })
})

describe('the arrows on screen', () => {
  // Les composants s'enroulent par lignes, les tokens par colonnes : la case
  // voisine est la plus proche dans la direction, et rien au bord.
  test('follow the geometry of each grid', async () => {
    const wrapper = monte()
    const place = (selector: string, at: (index: number) => [number, number]) =>
      wrapper.findAll(selector).forEach((one, index) => {
        const [left, top] = at(index)
        one.element.getBoundingClientRect = () => ({ left, top, width: 12, height: 12 }) as DOMRect
      })
    place('.case', (index) => [index * 43, 0])
    place('.families .cell', (index) => [0, index * 14])
    const entrée = (selector: string) =>
      wrapper.findAll(selector).findIndex((one) => one.attributes('tabindex') === '0')

    await wrapper.findAll('.families .cell')[0]!.trigger('keydown', { key: 'ArrowDown' })
    expect(entrée('.families .cell')).toBe(1)
    await wrapper.findAll('.families .cell')[1]!.trigger('keydown', { key: 'ArrowRight' })
    expect(entrée('.families .cell')).toBe(1)

    await wrapper.findAll('.case')[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(entrée('.case')).toBe(1)
    await wrapper.findAll('.case')[1]!.trigger('keydown', { key: 'ArrowDown' })
    expect(entrée('.case')).toBe(1)
    await wrapper.findAll('.case')[1]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(entrée('.case')).toBe(0)
  })
})

describe('the token rows', () => {
  const cassé = dashboardOf(
    [composant('Chart', { tokens: ['chart-3'] })],
    [
      {
        type: 'tokens',
        id: 'tokens--chart',
        path: ['Tokens'],
        name: 'chart',
        tokens: {
          '3': {
            type: 'color',
            themes: { default: { value: 'var(--teal-450)', alias: ['teal-450'] } },
          },
          '6': { type: 'color', themes: { default: { value: '#000' } } },
        },
      },
    ],
    { stories: [story('Chart')], pages: [], audit: null, components: [], categories: [] },
  )

  test('say what a broken alias points at, and who reads it', () => {
    const wrapper = mount(HealthDashboard, {
      props: {
        dashboard: cassé,
        checked: new Set(['token:chart-3']),
        selected: null,
        partial: true,
      },
    })
    const ligne = wrapper
      .findAll('.health-list .row')
      .find((one) => one.text().includes('--chart-3'))!
    expect(ligne.text().replace(/\s+/g, ' ')).toMatchInlineSnapshot(
      `"--chart-3chartread by 1 · Chart→ --teal-450 missingbroken alias"`,
    )
    expect((ligne.find('input').element as HTMLInputElement).checked).toBe(true)
  })

  test('check the orphans row as one', async () => {
    const wrapper = mount(HealthDashboard, {
      props: { dashboard: cassé, checked: new Set<string>(), selected: null, partial: true },
    })
    const orphelins = wrapper
      .findAll('.health-list .row')
      .find((one) => one.text().includes('1 orphan'))!
    await orphelins.find('input').trigger('change')
    expect(wrapper.emitted('check')).toEqual([[[ORPHANS], true]])
  })

  // Le nom est un bouton : la ligne se choisit au clavier, une seule fois.
  test('select a row from the button of its name', async () => {
    const wrapper = mount(HealthDashboard, {
      props: { dashboard: cassé, checked: new Set<string>(), selected: null, partial: true },
    })
    const nom = wrapper
      .findAll('.health-list button.label')
      .find((one) => one.text() === '--chart-3')!
    await nom.trigger('click')
    expect(wrapper.emitted('select')!.map(([item]) => item)).toEqual(['token:chart-3'])
  })
})
