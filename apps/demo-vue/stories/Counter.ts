import { defineStories } from '@crypte/vue'
import Counter from '../src/components/Counter.vue'
import Panel from '../src/components/Panel.vue'

export default defineStories(Counter, {
  wrap: Panel,
  stories: {
    'Depuis zéro': {},
    'Par dix': { start: 10, step: 10 },
  },
})
