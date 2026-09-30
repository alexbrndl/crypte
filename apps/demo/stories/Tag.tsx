import { defineStories } from '@crypte/react'
import { Tag } from '@/components/Tag'

export default defineStories(Tag, {
  props: { children: 'Étiquette' },
  stories: {
    Nue: {},
    'Avec une classe': { className: 'mise-en-avant' },
    // Une violation connue pour le panneau de `a11y` : un rôle qu'ARIA ne
    // définit pas.
    'Rôle inconnu': { role: 'etiquette' },
  },
})
