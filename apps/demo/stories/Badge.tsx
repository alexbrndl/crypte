import { defineStories } from '@crypte/react'
import { Badge } from '@/components/Badge'

export default defineStories(Badge, {
  meta: { status: 'stable' },
  props: { label: 'Nouveau' },
  stories: {
    'Par défaut': {},
    Avertissement: { tone: 'warning' },
    'Libellé long': { label: 'Vérification en cours' },
  },
})
