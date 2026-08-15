import type { StoryOptions } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { defineStories, story } from '../src/stories'

// Ce qu'un fichier de story écrit, et ce que la preview en tire.
// Voir la section 2.3 de docs/contracts.md.

interface BadgeProps {
  label: string
  tone?: 'neutral' | 'warning'
  onPress?: () => void
}

const Badge = (_props: BadgeProps) => null
const Provider = (_props: { children?: unknown }) => null

describe('defineStories', () => {
  it('rend le composant et sa définition, sans les transformer', () => {
    const definition = { props: { label: 'Neuf' }, stories: { 'Par défaut': {} } }
    const module = defineStories(Badge, definition)

    expect(module.component).toBe(Badge)
    expect(module.definition).toBe(definition)
  })

  // La forme courte de la section 2.2 : tout est optionnel.
  it('accepte le composant seul', () => {
    expect(defineStories(Badge).definition).toEqual({})
  })

  // Le contrat dit qu'une enveloppe n'a pas à accepter les props de la story.
  // Sans ce cas, un `AnyComponent` mal choisi ne se verrait qu'à l'usage.
  it('accepte une enveloppe qui ne prend pas les props du composant', () => {
    const module = defineStories(Badge, { wrap: Provider, props: { label: 'x' } })

    expect(module.definition.wrap).toBe(Provider)
  })
})

describe('story', () => {
  it('sépare les props des options', () => {
    const options = { responsive: 'mobile' } as unknown as StoryOptions

    expect(story<BadgeProps>({ label: 'x' }, options)).toEqual({ props: { label: 'x' }, options })
  })

  // Sans cette absence, une entrée du manifeste porterait `options: undefined`,
  // que `JSON.stringify` laisse tomber en silence : section 4.5.
  it('ne pose pas d’options quand il n’y en a pas', () => {
    expect('options' in story<BadgeProps>({ label: 'x' })).toBe(false)
  })
})
