import { describe, expect, test } from 'vitest'
import { complete, readQuery } from '../src/navigation/filters'

// Ce que la palette lit de sa requête, et ce que ⇥ y écrit.

describe('the query of the palette', () => {
  test('separates the filters from the name, wherever they stand', () => {
    expect(readQuery('is:draft  par défaut type:story is:stable')).toEqual({
      is: ['draft', 'stable'],
      type: ['story'],
      text: 'par défaut',
    })
  })

  // Une clé inconnue est un nom cherché comme un autre, et une clé sans valeur,
  // tapée à moitié, ne filtre encore rien.
  test('reads an unknown key as a name, and a key without a value as nothing', () => {
    expect(readQuery('a11y:violation is: type:')).toEqual({
      is: [],
      type: [],
      text: 'a11y:violation',
    })
    expect(readQuery('   ')).toEqual({ is: [], type: [], text: '' })
  })
})

describe('the completion of a filter', () => {
  test('completes a key, then its value, with the space that ends it', () => {
    expect(complete('ty')).toBe('type:')
    expect(complete('badge i')).toBe('badge is:')
    expect(complete('is:dr')).toBe('is:draft ')
    expect(complete('is:s')).toBe('is:stable ')
    expect(complete('type:s')).toBe('type:story ')
  })

  // `is:` mène à trois valeurs sans préfixe commun ; `type:` aussi.
  test('stops where the candidates part, and completes nothing it cannot', () => {
    expect(complete('is:')).toBeNull()
    expect(complete('is:d')).toBeNull()
    expect(complete('')).toBeNull()
    expect(complete('badge ')).toBeNull()
    expect(complete('zz')).toBeNull()
    expect(complete('is:zz')).toBeNull()
    expect(complete('a11y:v')).toBeNull()
    expect(complete('is:draft')).toBe('is:draft ')
    expect(complete('is:draft ')).toBeNull()
  })
})
