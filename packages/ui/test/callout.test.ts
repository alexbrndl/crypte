import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Callout } from '../src'

// Ce que le shell et le site reçoivent : le ton comme seul réglage, le reste
// (rôle, classe, densité) laissé au contexte qui le pose.
describe('Callout', () => {
  it('renders its content under the requested tone', () => {
    const wrapper = mount(Callout, {
      props: { tone: 'danger' },
      slots: { default: '<h2>Titre</h2>' },
    })

    expect(wrapper.get('.callout').attributes('data-tone')).toBe('danger')
    expect(wrapper.get('.callout > h2').text()).toBe('Titre')
  })

  it('leaves role and class to the caller', () => {
    const wrapper = mount(Callout, {
      props: { tone: 'warning' },
      attrs: { role: 'status', class: 'set-aside' },
    })

    expect(wrapper.attributes()).toMatchObject({
      role: 'status',
      class: 'callout set-aside',
      'data-tone': 'warning',
    })
  })
})
