import type { StoryOptions } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { defineStories, propsOfStory, story } from '../src/stories'

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

describe('les props d’une story nommée', () => {
  const module = defineStories(Badge, {
    props: { label: 'commun', tone: 'neutral' },
    stories: {
      'Par défaut': {},
      Avertissement: { tone: 'warning' },
      'Avec options': story<BadgeProps>({ label: 'propre' }, {} as StoryOptions),
    },
  })

  it('met les props communes sous celles de la story', () => {
    expect(propsOfStory(module, 'Par défaut')).toEqual({ label: 'commun', tone: 'neutral' })
    expect(propsOfStory(module, 'Avertissement')).toEqual({ label: 'commun', tone: 'warning' })
  })

  // La forme longue passe par `props`, la forme courte est les props elles-mêmes.
  it('lit les deux formes d’une story', () => {
    expect(propsOfStory(module, 'Avec options')).toEqual({ label: 'propre', tone: 'neutral' })
  })

  // La fusion est plate, prop par prop : deux props qui s'excluent demandent une
  // remise à zéro explicite, ce que le contrat assume en 2.3.
  it('remplace une prop commune plutôt que de la fusionner', () => {
    const nested = defineStories(Badge, {
      props: { label: 'a', onPress: () => undefined },
      stories: { Une: { label: 'b' } },
    })

    expect(propsOfStory(nested, 'Une').label).toBe('b')
    expect(typeof propsOfStory(nested, 'Une').onPress).toBe('function')
  })

  it('rend les props communes pour un nom qu’il ne connaît pas', () => {
    expect(propsOfStory(module, 'inexistante')).toEqual({ label: 'commun', tone: 'neutral' })
  })
})
