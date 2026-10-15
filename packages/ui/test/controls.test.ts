import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { Button, Checkbox, Input, Select } from '../src'

// Ce que les plugins et le shell reçoivent : l'élément natif, ses attributs et ses
// écouteurs passés tels quels, le dessin du fichier Figma en plus.
describe('Button', () => {
  it('is an outline button by default, and never submits a form', () => {
    const wrapper = mount(Button, { slots: { default: 'Copy <kbd>C</kbd>' } })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes()).toMatchObject({ type: 'button', 'data-variant': 'outline' })
    expect(wrapper.get('kbd').text()).toBe('C')
  })

  it('takes the secondary variant, and passes its attributes and listeners', async () => {
    const click = vi.fn()
    const wrapper = mount(Button, {
      props: { variant: 'secondary' },
      attrs: { 'aria-pressed': 'true', onClick: click },
    })
    await wrapper.trigger('click')

    expect(wrapper.attributes()).toMatchObject({
      'data-variant': 'secondary',
      'aria-pressed': 'true',
    })
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('Input', () => {
  it('passes type, value, placeholder and input to the native field', async () => {
    const input = vi.fn()
    const wrapper = mount(Input, {
      attrs: { type: 'number', value: '4', placeholder: 'count', onInput: input },
    })
    await wrapper.trigger('input')

    expect(wrapper.element.tagName).toBe('INPUT')
    expect((wrapper.element as HTMLInputElement).type).toBe('number')
    expect((wrapper.element as HTMLInputElement).value).toBe('4')
    expect(wrapper.attributes('placeholder')).toBe('count')
    expect(input).toHaveBeenCalledOnce()
  })
})

// Sur la liste et non sur son enveloppe : un `value` posé sur le `span` ne
// choisirait rien.
describe('Select', () => {
  it('passes its attributes and listeners to the select, its options in the slot', async () => {
    const change = vi.fn()
    const wrapper = mount(Select, {
      attrs: { value: 'b', 'aria-label': 'tone', onChange: change },
      slots: { default: '<option value="a">A</option><option value="b">B</option>' },
    })
    const select = wrapper.get('select')
    await select.trigger('change')

    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.attributes('aria-label')).toBeUndefined()
    expect(select.attributes('aria-label')).toBe('tone')
    expect((select.element as HTMLSelectElement).value).toBe('b')
    expect(change).toHaveBeenCalledOnce()
  })
})

describe('Checkbox', () => {
  it('passes checked, indeterminate and change to the native box', async () => {
    const change = vi.fn()
    const wrapper = mount(Checkbox, { attrs: { checked: true, onChange: change } })
    await wrapper.trigger('change')

    expect((wrapper.element as HTMLInputElement).type).toBe('checkbox')
    expect((wrapper.element as HTMLInputElement).checked).toBe(true)
    expect(change).toHaveBeenCalledOnce()

    const vide = mount(Checkbox, { attrs: { indeterminate: true } })
    expect((vide.element as HTMLInputElement).indeterminate).toBe(true)
  })
})
