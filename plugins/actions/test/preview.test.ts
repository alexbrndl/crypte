import type { MountContext, ResolvedPropDetails } from '@crypte/core/protocol'
import { describe, expect, it, vi } from 'vitest'
import { summaryOf } from '../src/called'
import hooks from '../src/preview'

// Le hook de `actions` : quelles props il remplit ou enveloppe, et ce qu'il
// envoie au panneau à chaque appel.

const fn: ResolvedPropDetails = { type: 'function', required: false }
const text: ResolvedPropDetails = { type: 'string', required: true }

const contexte = (props: Record<string, unknown>, details: Record<string, ResolvedPropDetails>) => {
  const send = vi.fn<MountContext['send']>()
  const ctx: MountContext = { id: 'x--defaut', props, options: {}, details, send }
  hooks.beforeMount(ctx)
  return { ctx, envoyes: () => send.mock.calls.map(([message]) => message) }
}

describe('the hook', () => {
  it('logs a function prop the story leaves out, and returns nothing from it', () => {
    const { ctx, envoyes } = contexte({ label: 'x' }, { label: text, onSelect: fn })

    expect((ctx.props.onSelect as (...args: unknown[]) => unknown)('pro', 2)).toBeUndefined()
    expect(envoyes()).toEqual([
      { type: 'actions:called', id: 'x--defaut', prop: 'onSelect', args: ['"pro"', '2'] },
    ])
    expect(ctx.props.label).toBe('x')
  })

  it('logs a function the story declares, then calls it and returns what it returns', () => {
    const own = vi.fn(() => 'fait')
    const { ctx, envoyes } = contexte({ onClick: own }, { onClick: fn })

    expect((ctx.props.onClick as () => unknown)()).toBe('fait')
    expect(own).toHaveBeenCalledOnce()
    expect(envoyes()).toEqual([
      { type: 'actions:called', id: 'x--defaut', prop: 'onClick', args: [] },
    ])
  })

  // `null` dit qu'il n'y en a pas : laissé tel quel, comme toute valeur qui n'est
  // pas une fonction, et rien n'est ajouté pour une prop que `details` ignore.
  it('leaves null, a value that is not a function, and a prop with no details alone', () => {
    const { ctx } = contexte({ onClose: null, onOpen: 'non' }, { onClose: fn, onOpen: fn })

    expect(ctx.props).toEqual({ onClose: null, onOpen: 'non' })
  })
})

describe('an argument, as text', () => {
  it.for([
    ['a string', 'pro', '"pro"'],
    ['a number', 2, '2'],
    ['undefined', undefined, 'undefined'],
    ['null', null, 'null'],
    ['a named function', function save() {}, 'function save'],
    ['an anonymous function', (() => () => {})(), 'function (anonymous)'],
    ['an event', new MouseEvent('click'), 'MouseEvent click'],
    [
      'a React event',
      { nativeEvent: new MouseEvent('click'), type: 'click', target: null },
      'MouseEvent click',
    ],
    ['an array', [1, 2, 3], 'Array(3)'],
    ['a class instance', new Date(0), 'Date'],
    ['a plain object', { plan: 'pro' }, '{"plan":"pro"}'],
    ['a long object', { text: 'a'.repeat(100) }, `{"text":"${'a'.repeat(70)}…`],
  ] as const)('%s', ([, value, shown]) => {
    expect(summaryOf(value)).toBe(shown)
  })

  it('names a plain object JSON cannot write', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(summaryOf(cycle)).toBe('Object')
  })
})
