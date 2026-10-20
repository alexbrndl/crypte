import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import ActivityBar from '../src/navigation/activity-bar.vue'

// La barre d'activité : ses comptes tiennent dans le badge `sm`.

const monte = (counter: number | null, todo: number) =>
  mount(ActivityBar, {
    props: {
      current: 'stories',
      hrefs: { stories: '?', tokens: '?tokens', health: '?health', versions: '?changes' },
      counter,
      todo,
      searchKeys: '⌘K',
      searchShortcuts: '⌘K',
      themeLabel: 'light',
    },
  })

describe('the counts of the activity bar', () => {
  test('cap at 9+, health first then versions', () => {
    expect(
      monte(12, 10)
        .findAll('.count')
        .map((one) => one.text()),
    ).toEqual(['9+', '9+'])
    expect(
      monte(9, 1)
        .findAll('.count')
        .map((one) => one.text()),
    ).toEqual(['1', '9'])
  })

  test('show nothing when nothing is counted', () => {
    expect(monte(null, 0).findAll('.count')).toHaveLength(0)
  })
})
