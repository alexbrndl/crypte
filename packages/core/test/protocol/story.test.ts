import { describe, expect, it } from 'vitest'
import type { PropDetails } from '../../src/protocol/prop'
import type {
  Story,
  StoryDefinition,
  StoryMeta,
  StoryOptions,
  Wrap,
} from '../../src/protocol/story'

// Les points d'extension sont remplis par `test/plugin-simulation.d.ts`.

interface DemoProps {
  price: number
  label?: string
}

// Les assertions sont portées par `satisfies` et `@ts-expect-error` : les `expect`
// ne servent qu'à donner un corps au test.
describe('points d’extension', () => {
  it('accepte les réglages apportés par un plugin', () => {
    const override = { min: 0, max: 500, step: 10 } satisfies PropDetails
    expect(override.max).toBe(500)
  })

  it('accepte les options apportées par un plugin', () => {
    const options = { responsive: 'mobile' } satisfies StoryOptions
    expect(options.responsive).toBe('mobile')
  })

  // Le cas positif ci-dessus passerait sans plugin simulé : voir l'aiguillage
  // dans `story.ts`.
  it('refuse une option qu’aucun plugin n’a déclarée', () => {
    // @ts-expect-error `respnsive` n'est déclaré nulle part
    const typo = { respnsive: 'mobile' } satisfies StoryOptions
    expect(typo).toBeDefined()
  })

  // Sans ce cas, les précédents passeraient sur un type qui n'exige rien.
  it('refuse une clé qu’aucun plugin n’a déclarée', () => {
    // @ts-expect-error `mni` n'est déclaré nulle part
    const typo = { mni: 0 } satisfies PropDetails
    expect(typo).toBeDefined()
  })

  it('refuse une valeur du mauvais type', () => {
    // @ts-expect-error `min` est un nombre
    const wrong = { min: 'zéro' } satisfies PropDetails
    expect(wrong).toBeDefined()
  })
})

describe('PropDetails', () => {
  it('accepte aussi les champs décrits par le noyau', () => {
    const override = {
      options: ['a', 'b'],
      description: 'Une prop',
    } satisfies PropDetails
    expect(override.options).toHaveLength(2)
  })
})

describe('StoryDefinition', () => {
  it('associe les détails aux props du composant', () => {
    const definition = {
      props: { price: 10 },
      stories: { 'Par défaut': {}, Cher: { price: 500 } },
      details: { price: { min: 0, max: 500, step: 10 } },
      meta: { status: 'stable' },
    } satisfies StoryDefinition<DemoProps, unknown>

    expect(Object.keys(definition.stories)).toEqual(['Par défaut', 'Cher'])
  })

  it('refuse des détails sur une prop qui n’existe pas', () => {
    const definition = {
      // @ts-expect-error `discount` n'est pas une prop de DemoProps
      details: { discount: { min: 0 } },
    } satisfies StoryDefinition<DemoProps, unknown>
    expect(definition).toBeDefined()
  })
})

// Les trois formes de la section 2.5 de la spécification.
describe('Wrap', () => {
  const Provider = 'Provider'

  it('accepte un composant seul', () => {
    const wrap = Provider satisfies Wrap<string>
    expect(wrap).toBe('Provider')
  })

  it('accepte un composant avec ses props', () => {
    const wrap = [[Provider, { theme: 'dark' }]] satisfies Wrap<string>
    expect(wrap).toHaveLength(1)
  })

  it('accepte plusieurs enveloppes, la première étant la plus externe', () => {
    const wrap = [Provider, [Provider, { theme: 'dark' }]] satisfies Wrap<string>
    expect(wrap).toHaveLength(2)
  })

  // Le cas qui motive le retrait de la forme fonction : pour React, un composant
  // est une fonction, donc l'adaptateur ne pourrait pas distinguer les deux.
  it('refuse une fonction', () => {
    // @ts-expect-error une enveloppe est un composant, pas une fonction de rendu
    const wrap = ((story: unknown) => story) satisfies Wrap<string>
    expect(wrap).toBeDefined()
  })

  // Ce que la forme fonction servait, et que le tableau fait aussi bien : la
  // valeur est calculée au chargement du fichier de stories.
  it('accepte une valeur calculée en props', () => {
    const wrap = [[Provider, { at: Number('42') }]] satisfies Wrap<string>
    expect(wrap).toHaveLength(1)
  })

  it('refuse des props sans composant', () => {
    // @ts-expect-error une entrée tableau commence par le composant
    const wrap = [[{ theme: 'dark' }]] satisfies Wrap<string>
    expect(wrap).toBeDefined()
  })
})

describe('StoryMeta', () => {
  it('accepte les trois statuts et rend tout facultatif', () => {
    const complete = {
      status: 'deprecated',
      owner: 'design-system',
      figma: 'https://figma.com/file/x',
      description: 'Obsolète',
    } satisfies StoryMeta
    const empty = {} satisfies StoryMeta

    expect(complete.status).toBe('deprecated')
    expect(empty).toBeDefined()
  })

  it('refuse un statut hors de la liste', () => {
    // @ts-expect-error `archived` n'existe pas
    const invalid = { status: 'archived' } satisfies StoryMeta
    expect(invalid).toBeDefined()
  })
})

describe('Story', () => {
  // La forme longue imposait `options: {}` alors que la spécification ne le
  // montre nulle part.
  it('rend les options facultatives', () => {
    const story = { props: { price: 500 } } satisfies Story<{ price: number }>
    expect(story.props.price).toBe(500)
  })
})
