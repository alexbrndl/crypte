import { defineStories } from '@crypte/vue'
import Badge from '../src/components/Badge.vue'

export default defineStories(Badge, {
  meta: { status: 'stable' },
  props: { label: 'Nouveau' },
  stories: {
    'Par défaut': {},
    Avertissement: { tone: 'warning' },
  },
})
