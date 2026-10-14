import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Alert } from '../src'

// Ce que le shell et le site reçoivent : la couleur comme seul réglage, le reste
// (rôle, classe, densité) laissé au contexte qui le pose.
describe('Alert', () => {
  it('renders its content under the requested color', () => {
    const wrapper = mount(Alert, {
      props: { color: 'error' },
      slots: { default: '<h2>Titre</h2>' },
    })

    expect(wrapper.get('.alert').attributes('data-color')).toBe('error')
    expect(wrapper.get('.alert > h2').text()).toBe('Titre')
  })

  it('leaves role and class to the caller', () => {
    const wrapper = mount(Alert, {
      props: { color: 'warning' },
      attrs: { role: 'status', class: 'set-aside' },
    })

    expect(wrapper.attributes()).toMatchObject({
      role: 'status',
      class: 'alert set-aside',
      'data-color': 'warning',
    })
  })
})
