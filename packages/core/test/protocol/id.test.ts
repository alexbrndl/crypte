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

  // Une version antérieure ne gardait que `a-z0-9` et vidait donc tout nom écrit
  // hors alphabet latin, ce qui faisait tomber des stories distinctes sur le même
  // identifiant. Les cas suivants échoueraient tous sur cette version.
  it('conserve les écritures non latines', () => {
    expect(normalizeSegment('Активная')).toBe('активная')
    expect(normalizeSegment('ボタン')).toBe('ボタン')
    expect(normalizeSegment('禁用状态')).toBe('禁用状态')
  })

  // Le dakuten distingue deux syllabes, il n'est pas l'équivalent d'un accent
  // latin. Le retirer produirait « か » et confondrait deux noms différents.
  it('garde les marques qui portent du sens hors du latin', () => {
    expect(normalizeSegment('が')).toBe('が')
    expect(normalizeSegment('が')).not.toBe(normalizeSegment('か'))
  })

  // Le nom est recomposé : sinon deux chaînes d'apparence identique diffèrent
  // octet à octet selon leur origine, et ne désignent plus le même fichier.
  it('rend une forme recomposée, quelle que soit celle reçue', () => {
    expect(normalizeSegment('Sécurité'.normalize('NFD'))).toBe(
      normalizeSegment('Sécurité'.normalize('NFC')),
    )
    expect(normalizeSegment('한국어')).toBe('한국어'.normalize('NFC'))
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

  // Le cas qui motive la normalisation Unicode : deux noms cyrilliques distincts
  // se normalisaient tous deux en chaîne vide, donc en `button--`.
  it('distingue deux noms écrits hors alphabet latin', () => {
    expect(storyId(['Button'], 'Активная')).not.toBe(storyId(['Button'], 'Отключена'))
    expect(storyId(['Button'], 'Активная')).toBe('button--активная')
  })

  // Reste non couvert : un nom fait uniquement de symboles se normalise en chaîne
  // vide, et deux tels noms se confondent encore. La parade est la détection de
  // collision au moment où le CLI écrit le manifeste, pas ici : cette fonction n'a
  // pas connaissance des autres entrées. Ce test fige le comportement actuel.
  it('rend un identifiant vide pour un nom fait de symboles', () => {
    expect(storyId([], '🎉')).toBe('')
  })

  it('produit le même identifiant pour la même entrée, appel après appel', () => {
    const first = storyId(['checkout', 'OrderSummary'], 'Avec référence')
    const second = storyId(['checkout', 'OrderSummary'], 'Avec référence')
    expect(first).toBe(second)
  })
})
