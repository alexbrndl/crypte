import { describe, expect, it } from 'vitest'
import { normalizeSegment, storyId } from '../../src/protocol/id'

describe('normalizeSegment', () => {
  it('retire les accents sans remplacer la lettre', () => {
    expect(normalizeSegment('Avec référence')).toBe('avec-reference')
    expect(normalizeSegment('Replié sur mobile')).toBe('replie-sur-mobile')
    expect(normalizeSegment('à côté où çà')).toBe('a-cote-ou-ca')
  })

  it('passe en minuscules', () => {
    expect(normalizeSegment('OrderSummary')).toBe('ordersummary')
  })

  it('réduit toute suite de caractères non alphanumériques à un seul tiret', () => {
    expect(normalizeSegment('Par   défaut')).toBe('par-defaut')
    expect(normalizeSegment('Avec / sans')).toBe('avec-sans')
    expect(normalizeSegment('50 % — plein')).toBe('50-plein')
  })

  it('ne laisse pas de tiret au bord', () => {
    expect(normalizeSegment('  Par défaut  ')).toBe('par-defaut')
    expect(normalizeSegment('!Attention!')).toBe('attention')
  })

  it('rend une chaîne vide quand il ne reste rien', () => {
    expect(normalizeSegment('')).toBe('')
    expect(normalizeSegment('   ')).toBe('')
    expect(normalizeSegment('!!!')).toBe('')
  })
})

describe('storyId', () => {
  it('joint le chemin par des barres et sépare le nom par un double tiret', () => {
    expect(storyId(['checkout', 'OrderSummary'], 'Avec référence')).toBe(
      'checkout/ordersummary--avec-reference',
    )
  })

  it('accepte un chemin à un seul segment', () => {
    expect(storyId(['Badge'], 'Par défaut')).toBe('badge--par-defaut')
  })

  it('omet le double tiret quand le chemin est vide', () => {
    expect(storyId([], 'Par défaut')).toBe('par-defaut')
  })

  it('ignore les segments qui se normalisent en chaîne vide', () => {
    expect(storyId(['checkout', '  ', 'OrderSummary'], 'Par défaut')).toBe(
      'checkout/ordersummary--par-defaut',
    )
  })

  // Conséquence assumée : deux noms qui ne diffèrent que par un accent tombent
  // sur le même identifiant, donc sur la même entrée de manifeste.
  it('confond deux noms qui ne diffèrent que par un accent', () => {
    expect(storyId(['checkout'], 'État vide')).toBe(storyId(['checkout'], 'Etat vide'))
  })

  // L'identifiant sert d'URL et de clé de baseline : deux stories distinctes ne
  // doivent pas se retrouver sous le même, sous peine d'en écraser une en silence.
  it('donne des identifiants distincts à des noms distincts', () => {
    expect(storyId(['checkout'], 'Avec référence')).not.toBe(
      storyId(['checkout'], 'Sans référence'),
    )
  })

  it('produit le même identifiant pour la même entrée, appel après appel', () => {
    const first = storyId(['checkout', 'OrderSummary'], 'Avec référence')
    const second = storyId(['checkout', 'OrderSummary'], 'Avec référence')
    expect(first).toBe(second)
  })
})
