import { describe, expect, it } from 'vitest'
import { propsOfStory } from '../../src/preview'

// La fusion des props d'une story nommée. Dans le noyau et pas dans un
// adaptateur : elle ne fait que mêler des objets simples, et deux adaptateurs la
// refaisant chacun divergeraient. Voir la section 2.3 de docs/contracts.md.

const definition = {
  props: { label: 'commun', tone: 'neutral' },
  stories: {
    'Par défaut': {},
    Avertissement: { tone: 'warning' },
    'Avec options': { props: { label: 'propre' }, options: {} },
  },
}

describe('les props d’une story nommée', () => {
  it('met les props communes sous celles de la story', () => {
    expect(propsOfStory(definition, 'Par défaut')).toEqual({ label: 'commun', tone: 'neutral' })
    expect(propsOfStory(definition, 'Avertissement')).toEqual({ label: 'commun', tone: 'warning' })
  })

  // La forme longue passe par `props`, la forme courte est les props elles-mêmes.
  it('lit les deux formes d’une story', () => {
    expect(propsOfStory(definition, 'Avec options')).toEqual({ label: 'propre', tone: 'neutral' })
  })

  // Les surcharges du shell viennent en dernier : c'est tout leur objet.
  it('pose les surcharges au-dessus de tout', () => {
    expect(propsOfStory(definition, 'Avertissement', { tone: 'neutral' }).tone).toBe('neutral')
  })

  // La fusion est plate, prop par prop : deux props qui s'excluent demandent une
  // remise à zéro explicite, ce que le contrat assume en 2.3.
  it('remplace une prop commune plutôt que de la fusionner', () => {
    const nested = {
      props: { label: 'a', onPress: () => undefined },
      stories: { Une: { label: 'b' } },
    }

    expect(propsOfStory(nested, 'Une').label).toBe('b')
    expect(typeof propsOfStory(nested, 'Une').onPress).toBe('function')
  })

  it('rend les props communes pour un nom qu’il ne connaît pas', () => {
    expect(propsOfStory(definition, 'inexistante')).toEqual({ label: 'commun', tone: 'neutral' })
  })

  it('rend un objet vide quand rien n’est déclaré', () => {
    expect(propsOfStory({}, 'quoi que ce soit')).toEqual({})
  })
})
