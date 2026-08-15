import { defineStories } from '@crypte/react'
import { Boom } from '@/components/Boom'

export default defineStories(Boom, {
  meta: { status: 'draft' },
  stories: {
    'Échoue au rendu': { reason: 'ce composant ne rend jamais' },
  },
})
