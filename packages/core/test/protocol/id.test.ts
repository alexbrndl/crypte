import { describe, expect, it } from 'vitest'
import { normalizeSegment, storyId } from '../../src/protocol/id'

describe('normalizeSegment', () => {
  it('réduit toute suite de caractères non alphanumériques à un seul tiret', () => {
    expect(normalizeSegment('Par   défaut')).toBe('par-defaut')
    expect(normalizeSegment('Avec / sans')).toBe('avec-sans')
    expect(normalizeSegment('50 % — plein')).toBe('50-plein')
  })

  it('ne laisse pas de tiret au bord', () => {
    expect(normalizeSegment('  Par défaut  ')).toBe('par-defaut')
    expect(normalizeSegment('!Attention!')).toBe('attention')
  })

  // Les marques cyrilliques et grecques vivent dans la même plage que les
  // accents latins : « Всё » et « Все » tombaient sur le même identifiant.
  it('garde les marques des écritures non latines', () => {
    expect(normalizeSegment('Всё')).not.toBe(normalizeSegment('Все'))
    expect(normalizeSegment('Мой')).not.toBe(normalizeSegment('Мои'))
    expect(normalizeSegment('Ελλάδα')).not.toBe(normalizeSegment('Ελλαδα'))
  })

  // Sinon deux noms identiques à l'œil désignent deux fichiers de baseline.
  it('rend une forme recomposée, quelle que soit celle reçue', () => {
    expect(normalizeSegment('Sécurité'.normalize('NFD'))).toBe(
      normalizeSegment('Sécurité'.normalize('NFC')),
    )
    expect(normalizeSegment('한국어')).toBe('한국어'.normalize('NFC'))
  })
})

describe('storyId', () => {
  it('omet le double tiret quand le chemin est vide', () => {
    expect(storyId([], 'Par défaut')).toBe('par-defaut')
  })

  it('ignore les segments qui se normalisent en chaîne vide', () => {
    expect(storyId(['checkout', '  ', 'OrderSummary'], 'Par défaut')).toBe(
      'checkout/ordersummary--par-defaut',
    )
  })

  // Conséquence assumée.
  it('confond deux noms qui ne diffèrent que par un accent', () => {
    expect(storyId(['checkout'], 'État vide')).toBe(storyId(['checkout'], 'Etat vide'))
  })

  // Un segment de chemin vide est filtré : un nom vide l'est aussi, plutôt que
  // de laisser traîner `badge--`.
  it('omet le double tiret quand le nom se normalise en chaîne vide', () => {
    expect(storyId(['Badge'], '🎉')).toBe('badge')
  })
})
