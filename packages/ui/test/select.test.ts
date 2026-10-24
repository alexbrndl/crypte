import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { Select } from '../src'

describe('Select', () => {
  // Reka garde le libellé que l'option choisie avait à son premier rendu : le
  // shell renomme le point par défaut d'un build une fois le projet lu.
  it('shows the label the chosen option has now', async () => {
    const wrapper = mount(Select, {
      props: { modelValue: 'default', options: [{ value: 'default', label: 'Last commit' }] },
    })
    await nextTick()
    expect(wrapper.get('button').text()).toBe('Last commit')

    await wrapper.setProps({ options: [{ value: 'default', label: 'main' }] })
    expect(wrapper.get('button').text()).toBe('main')
  })

  it('shows its placeholder when no option is chosen', async () => {
    const wrapper = mount(Select, {
      props: { options: [{ value: 'a', label: 'A' }], placeholder: 'Pick one' },
    })
    await nextTick()
    expect(wrapper.get('button').text()).toBe('Pick one')
  })
})
