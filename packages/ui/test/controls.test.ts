import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { Button, Checkbox, Field, Input, Select, Tooltip } from '../src'

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

// Sur le déclencheur, que `Field` nomme par son id : la liste elle-même est
// téléportée dans le document à l'ouverture.
describe('Select', () => {
  const options = [
    { value: '0', label: 'neutral' },
    { value: '1', label: 'warning' },
  ]

  it('shows the label of its value, its attributes on the trigger', async () => {
    const wrapper = mount(Select, {
      props: { options, modelValue: '1' },
      attrs: { id: 'tone', 'aria-label': 'tone' },
      attachTo: document.body,
    })
    await nextTick()
    const trigger = wrapper.get('[role="combobox"]')

    expect(trigger.attributes()).toMatchObject({ id: 'tone', 'aria-label': 'tone' })
    expect(trigger.text()).toBe('warning')
    wrapper.unmount()
  })

  it('shows its placeholder with no value', () => {
    const wrapper = mount(Select, { props: { options, placeholder: '—' } })

    expect(wrapper.get('[role="combobox"]').text()).toBe('—')
  })

  it('emits the value of the option chosen', async () => {
    const wrapper = mount(Select, {
      props: { options, modelValue: '1' },
      attachTo: document.body,
    })
    await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Enter' })
    await nextTick()
    const neutre = [...document.querySelectorAll('[role="option"]')].find(
      (one) => one.textContent?.trim() === 'neutral',
    ) as HTMLElement
    neutre.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([['0']])
    wrapper.unmount()
  })
})

// L'étiquette nomme le contrôle par l'id qu'elle lui donne, et le marqueur ne dit
// « overridden » que pour une valeur saisie.
describe('Field', () => {
  it('labels its control, and says when the value is overridden', async () => {
    const wrapper = mount(Field, {
      props: { label: 'tone' },
      slots: {
        default: '<template #default="{ id }"><input :id="id" /></template>',
        action: '<button>Reset</button>',
      },
    })

    expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('input').attributes('id'))
    expect(wrapper.get('label').text()).toBe('tone')
    expect(wrapper.find('.marker').exists()).toBe(false)
    expect(wrapper.get('.action button').text()).toBe('Reset')

    await wrapper.setProps({ overridden: true })
    expect(wrapper.get('.marker').text()).toBe('overridden')
  })

  // La description au survol de l'étiquette, et pour le clavier sur le contrôle,
  // qui la reçoit par `described-by` ; sans description, rien de tout ça.
  it('describes its control when it has a description, and only then', async () => {
    const champ = (description?: string) =>
      mount(Field, {
        props: { label: 'tone', description },
        slots: {
          default:
            '<template #default="{ id, describedBy }"><input :id="id" :aria-describedby="describedBy" /></template>',
        },
      })

    const décrit = champ('Neutre par défaut.')
    const lien = décrit.get('input').attributes('aria-describedby')
    expect(décrit.findComponent(Tooltip).props('content')).toBe('Neutre par défaut.')
    expect(décrit.get(`[id="${lien}"]`).text()).toBe('Neutre par défaut.')

    const nu = champ()
    expect(nu.get('input').attributes('aria-describedby')).toBeUndefined()
    expect(nu.findComponent(Tooltip).exists()).toBe(false)
    expect(nu.find('.description').exists()).toBe(false)
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

// Au survol, le déclencheur portant le lien vers son texte. Au focus clavier
// seulement, ce que jsdom ne sait pas dire : jugé dans le navigateur.
describe('Tooltip', () => {
  it('shows its content and its keys on hover, described by them', async () => {
    const wrapper = mount(Tooltip, {
      props: { content: 'Full screen', keys: 'F' },
      slots: { default: '<button>plein écran</button>' },
      attachTo: document.body,
    })
    wrapper
      .get('button')
      .element.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }),
      )
    await new Promise((resolve) => setTimeout(resolve, 500))
    await nextTick()
    const bulle = document.querySelector('[role="tooltip"]')

    expect(bulle?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Full screen F')
    expect(document.querySelector('.crypte-tooltip-keys')?.textContent).toBe('F')
    expect(wrapper.get('button').attributes('aria-describedby')).toBe(bulle?.id)
    wrapper.unmount()
  })

  // Le détail suit le libellé, lu après une espace ; le côté se choisit, le haut
  // sinon.
  it('adds its detail after the content, on the side asked', async () => {
    const wrapper = mount(Tooltip, {
      props: { content: 'versions', detail: '3 differences', side: 'right' },
      slots: { default: '<button>versions</button>' },
      attachTo: document.body,
    })
    wrapper
      .get('button')
      .element.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }),
      )
    await new Promise((resolve) => setTimeout(resolve, 500))
    await nextTick()

    expect(
      document.querySelector('[role="tooltip"]')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('versions 3 differences')
    expect(document.querySelector('.crypte-tooltip-detail')?.textContent).toBe('3 differences')
    expect(document.querySelector('.crypte-tooltip')?.getAttribute('data-side')).toBe('right')
    wrapper.unmount()
  })

  // Sans raccourci, ni touche ni espace : le texte lu est le contenu seul.
  it('draws no key and adds nothing to its content without keys', async () => {
    const wrapper = mount(Tooltip, {
      props: { content: 'The shell, gzipped' },
      slots: { default: '<button>poids</button>' },
      attachTo: document.body,
    })
    wrapper
      .get('button')
      .element.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }),
      )
    await new Promise((resolve) => setTimeout(resolve, 500))
    await nextTick()

    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('The shell, gzipped')
    expect(document.querySelector('.crypte-tooltip-keys')).toBeNull()
    expect(document.querySelector('.crypte-tooltip-detail')).toBeNull()
    expect(document.querySelector('.crypte-tooltip')?.getAttribute('data-side')).toBe('top')
    wrapper.unmount()
  })
})
