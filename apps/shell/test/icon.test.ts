import { ArrowRight01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import Icon from '../src/ui/icon.vue'

// Le trait de Figma, 1,25 à 16 px, se rend à 1,875 dans le repère de 24 des
// Hugeicons. Sans `absolute-stroke-width`, le jeu garde son 1,5 d'origine.
test.each([
  ['search-01', Search01Icon],
  ['arrow-right-01', ArrowRight01Icon],
])('%s draws at 16 px with the 1.25 stroke, hidden from screen readers', (_, icon) => {
  const svg = mount(Icon, { props: { icon } }).find('svg')
  const paths = svg.findAll('path')
  expect(paths.length).toBeGreaterThan(0)
  expect(svg.attributes()).toMatchObject({
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
  })
  expect(paths.map((p) => p.attributes('stroke-width'))).toEqual(paths.map(() => '1.875'))
})
