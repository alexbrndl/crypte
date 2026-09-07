import { defineStories } from '@crypte/react'
import { Tag } from '@/components/Tag'

export default defineStories(Tag, {
  props: { children: 'Étiquette' },
  stories: { Nue: {}, 'Avec une classe': { className: 'mise-en-avant' } },
})
