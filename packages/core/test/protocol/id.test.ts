import { describe, expect, it } from 'vitest'
import { normalizeSegment, storyId } from '../../src/protocol/id'

describe('normalizeSegment', () => {
  it('collapses any run of non-alphanumeric characters to a single dash', () => {
    expect(normalizeSegment('Par   défaut')).toBe('par-defaut')
    expect(normalizeSegment('Avec / sans')).toBe('avec-sans')
    expect(normalizeSegment('50 % — plein')).toBe('50-plein')
  })

  it('leaves no dash at the edges', () => {
    expect(normalizeSegment('  Par défaut  ')).toBe('par-defaut')
    expect(normalizeSegment('!Attention!')).toBe('attention')
  })

  // Les marques cyrilliques et grecques vivent dans la même plage que les
  // accents latins : « Всё » et « Все » tombaient sur le même identifiant.
  it('keeps the marks of non-Latin scripts', () => {
    expect(normalizeSegment('Всё')).not.toBe(normalizeSegment('Все'))
    expect(normalizeSegment('Мой')).not.toBe(normalizeSegment('Мои'))
    expect(normalizeSegment('Ελλάδα')).not.toBe(normalizeSegment('Ελλαδα'))
  })

  // Sinon deux noms identiques à l'œil désignent deux fichiers de baseline.
  it('returns a composed form, whatever form it receives', () => {
    expect(normalizeSegment('Sécurité'.normalize('NFD'))).toBe(
      normalizeSegment('Sécurité'.normalize('NFC')),
    )
    expect(normalizeSegment('한국어')).toBe('한국어'.normalize('NFC'))
  })
})

describe('storyId', () => {
  it('omits the double dash when the path is empty', () => {
    expect(storyId([], 'Par défaut')).toBe('par-defaut')
  })

  it('ignores segments that normalize to an empty string', () => {
    expect(storyId(['checkout', '  ', 'OrderSummary'], 'Par défaut')).toBe(
      'checkout/ordersummary--par-defaut',
    )
  })

  // Conséquence assumée.
  it('merges two names that differ only by an accent', () => {
    expect(storyId(['checkout'], 'État vide')).toBe(storyId(['checkout'], 'Etat vide'))
  })

  // Un segment de chemin vide est filtré : un nom vide l'est aussi, plutôt que
  // de laisser traîner `badge--`.
  it('omits the double dash when the name normalizes to an empty string', () => {
    expect(storyId(['Badge'], '🎉')).toBe('badge')
  })
})
