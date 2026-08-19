import { defineStories } from '@crypte/react'
import { Badge } from '@/components/Badge'
import { Tone } from '@/components/Frame'

export default defineStories(Badge, {
  wrap: [[Tone, { tone: 'calm' }]],
  meta: { status: 'stable' },
  props: { label: 'Nouveau' },
  stories: {
    'Par défaut': {},
    Avertissement: { tone: 'warning' },
    'Libellé long': { label: 'Vérification en cours' },
  },
})
