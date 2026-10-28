import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import {
  Badge,
  CardTable,
  ColumnTitle,
  EmptyNote,
  PanelSection,
  SectionHeader,
  SidebarLink,
  Tree,
  ViewCanvas,
  type TreeNode,
} from '../src'

// Les briques de vue du shell, que la vue d'un plugin reçoit aussi par l'import
// map : ce que chacune dessine, et ce qu'elle dit à son parent.

describe('the titles and counts', () => {
  it('draws a column title with its count, and none without one', () => {
    expect(mount(ColumnTitle, { props: { title: 'Tokens', count: 7 } }).text()).toBe('Tokens7')
    expect(
      mount(ColumnTitle, { props: { title: 'Panels' } })
        .find('.count')
        .exists(),
    ).toBe(false)
  })

  it('draws a badge in its tone and size, default and md unless told', () => {
    const badge = mount(Badge, { slots: { default: '3' } })
    expect(badge.attributes()).toMatchObject({ 'data-tone': 'default', 'data-size': 'md' })
    expect(mount(Badge, { props: { tone: 'inverse', size: 'sm' } }).attributes()).toMatchObject({
      'data-tone': 'inverse',
      'data-size': 'sm',
    })
  })

  it('draws a section header with its count in a badge, its note and its action', () => {
    const header = mount(SectionHeader, {
      props: { title: 'overview', count: 2, note: 'sorted' },
      slots: { action: () => h('button', 'Run') },
    })
    expect(header.find('h2').text()).toBe('overview')
    expect(header.find('.badge').text()).toBe('2')
    expect(header.find('.note').text()).toBe('sorted')
    expect(header.find('button').text()).toBe('Run')
    expect(
      mount(SectionHeader, { props: { title: 'x' } })
        .find('.badge')
        .exists(),
    ).toBe(false)
  })
})

describe('a sidebar row', () => {
  it('marks the current one, counts, and passes its click', async () => {
    const click = vi.fn()
    const row = mount(SidebarLink, {
      props: { href: '?a', current: true, count: 4, onClick: click },
      slots: { default: 'color', icon: () => h('i', 'icône'), detail: () => h('em', 'détail') },
    })
    await row.trigger('click')
    expect(row.attributes()).toMatchObject({ href: '?a', 'aria-current': 'page' })
    expect(row.find('.label').text()).toBe('color')
    expect(row.find('.count').text()).toBe('4')
    expect(row.find('i').text()).toBe('icône')
    expect(row.find('em').text()).toBe('détail')
    expect(click).toHaveBeenCalledOnce()
    expect(
      mount(SidebarLink, { props: { href: '?b', current: false } }).attributes('aria-current'),
    ).toBeUndefined()
  })
})

describe('the canvas, the tables and the notes', () => {
  it('wraps a view, a table and a note, a failed note marked', () => {
    expect(mount(ViewCanvas, { slots: { default: 'vue' } }).classes()).toContain('view-canvas')
    const table = mount(CardTable, {
      slots: { default: () => h('tbody', [h('tr', [h('td', 'a')])]) },
    })
    expect(table.element.tagName).toBe('TABLE')
    expect(table.find('td').text()).toBe('a')
    expect(
      mount(EmptyNote, { slots: { default: 'Nothing.' } }).attributes('data-failed'),
    ).toBeUndefined()
    expect(mount(EmptyNote, { props: { failed: true } }).attributes('data-failed')).toBeDefined()
  })
})

describe('a panel section', () => {
  it('folds from its whole header, says what it folds, and shows its alert folded or not', async () => {
    const section = mount(PanelSection, {
      props: { title: 'controls', open: false },
      slots: {
        default: 'corps',
        note: 'no status',
        action: () => h('button', { class: 'reset' }, 'Reset all'),
        alert: () => h('p', { class: 'alerte' }, 'threw'),
      },
    })
    const toggle = section.find('.toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe(section.find('.body').attributes('id'))
    expect(section.find(`#${toggle.attributes('aria-describedby')}`).text()).toBe('no status')
    expect((section.find('.body').element as HTMLElement).style.display).toBe('none')
    expect(section.find('.alerte').text()).toBe('threw')
    await toggle.trigger('click')
    await section.find('.note').trigger('click')
    expect(section.emitted('toggle')).toHaveLength(2)

    const bare = mount(PanelSection, { props: { title: 'x', open: true } })
    expect(bare.find('.body').exists()).toBe(false)
    expect(bare.find('.toggle').attributes('aria-describedby')).toBeUndefined()
  })

  // Verrouillée, son titre n'est plus un bouton, et sa note ne la plie plus. Son
  // corps reste monté, caché, et son action joignable.
  it('has no toggle when locked, its body kept and its action reachable', async () => {
    const section = mount(PanelSection, {
      props: { title: 'a11y', open: false, locked: true },
      slots: {
        default: 'corps',
        note: 'no violation',
        action: () => h('button', { class: 'again' }, 'Run again'),
      },
    })
    expect(section.findAll('button').map((one) => one.text())).toEqual(['Run again'])
    expect(section.find('.toggle').text()).toBe('a11y')
    expect((section.find('.body').element as HTMLElement).style.display).toBe('none')
    await section.find('.toggle').trigger('click')
    await section.find('.note').trigger('click')
    expect(section.emitted('toggle')).toBeUndefined()
  })
})

describe('a tree', () => {
  const items: TreeNode[] = [
    {
      key: 'f',
      label: 'Forms',
      kind: 'folder',
      count: 2,
      selectable: false,
      children: [
        {
          key: 'c',
          label: 'Select',
          kind: 'component',
          children: [{ key: 's', label: 'Default' }],
        },
        { key: 'd', label: 'Input', dimmed: true },
      ],
    },
  ]
  const row = (tree: ReturnType<typeof mount>, label: string) =>
    tree.findAll('[role="treeitem"]').find((one) => one.find('.name').text() === label)!

  it('draws every row open, with its count, its kind and its dimming', () => {
    const tree = mount(Tree, { props: { items, selected: 's', label: 'Stories' } })
    expect(tree.findAll('.name').map((one) => one.text())).toEqual([
      'Forms',
      'Select',
      'Default',
      'Input',
    ])
    expect(row(tree, 'Forms').find('.count').text()).toBe('2')
    expect(row(tree, 'Forms').attributes('data-kind')).toBe('folder')
    expect(row(tree, 'Input').attributes('data-dimmed')).toBeDefined()
    expect(row(tree, 'Default').attributes('data-selected')).toBeDefined()
    expect(tree.attributes('aria-label')).toBe('Stories')
  })

  it('chooses a row, folds a folder on a click, and folds from the chevron', async () => {
    const tree = mount(Tree, { props: { items, selected: null, label: 'x' } })
    await row(tree, 'Select').trigger('click')
    expect(tree.emitted('select')).toEqual([['c']])
    // Choisi, un composant ne se plie pas sur son libellé.
    expect(tree.findAll('.name').map((one) => one.text())).toContain('Default')

    await row(tree, 'Select').find('.chevron').trigger('click')
    expect(tree.findAll('.name').map((one) => one.text())).not.toContain('Default')

    await row(tree, 'Forms').trigger('click')
    expect(tree.emitted('select')).toEqual([['c']])
    expect(tree.findAll('.name').map((one) => one.text())).toEqual(['Forms'])
    expect(tree.emitted('update:expanded')!.at(-1)).toEqual([[]])
  })

  // Les données d'une vue de plugin arrivent après le montage : une branche
  // nouvelle s'ouvre comme les autres, ce que l'utilisateur a plié le reste.
  it('opens a branch that arrives after the mount, and keeps what was folded', async () => {
    const tree = mount(Tree, { props: { items: [], selected: null, label: 'x' } })
    await tree.setProps({ items })
    expect(tree.findAll('.name').map((one) => one.text())).toEqual([
      'Forms',
      'Select',
      'Default',
      'Input',
    ])
    await row(tree, 'Select').find('.chevron').trigger('click')
    await tree.setProps({
      items: [...items, { key: 'g', label: 'Guides', children: [{ key: 'h', label: 'Colours' }] }],
    })
    expect(tree.findAll('.name').map((one) => one.text())).toEqual([
      'Forms',
      'Select',
      'Input',
      'Guides',
      'Colours',
    ])
  })

  it('follows the expanded list its parent keeps', async () => {
    const tree = mount(Tree, { props: { items, selected: null, label: 'x', expanded: ['f'] } })
    expect(tree.findAll('.name').map((one) => one.text())).toEqual(['Forms', 'Select', 'Input'])
    await row(tree, 'Select').find('.chevron').trigger('click')
    expect(tree.emitted('update:expanded')!.at(-1)).toEqual([['f', 'c']])
    // Le parent ne l'a pas suivi : l'arbre reste comme il le dit.
    expect(tree.findAll('.name').map((one) => one.text())).toEqual(['Forms', 'Select', 'Input'])
  })
})
