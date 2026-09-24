import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Callout } from '../src'

// Ce que le shell et le site reçoivent : le ton comme seul réglage, le reste
// (rôle, classe, densité) laissé au contexte qui le pose.
describe('Callout', () => {
  it('rend son contenu sous le ton demandé', () => {
    const wrapper = mount(Callout, {
      props: { tone: 'danger' },
      slots: { default: '<h2>Titre</h2>' },
    })

    expect(wrapper.get('.callout').attributes('data-tone')).toBe('danger')
    expect(wrapper.get('.callout > h2').text()).toBe('Titre')
  })

  it('laisse le rôle et la classe à qui l’emploie', () => {
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
