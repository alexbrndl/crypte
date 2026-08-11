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

  // `a-z0-9` seul donnait une chaîne vide pour tous ces noms.
  it('conserve les écritures non latines', () => {
    expect(normalizeSegment('Активная')).toBe('активная')
    expect(normalizeSegment('ボタン')).toBe('ボタン')
    expect(normalizeSegment('禁用状态')).toBe('禁用状态')
  })

  // Les marques cyrilliques et grecques vivent dans la même plage que les
  // accents latins : « Всё » et « Все » tombaient sur le même identifiant.
  it('garde les marques des écritures non latines', () => {
    expect(normalizeSegment('Всё')).not.toBe(normalizeSegment('Все'))
    expect(normalizeSegment('Мой')).not.toBe(normalizeSegment('Мои'))
    expect(normalizeSegment('Ελλάδα')).not.toBe(normalizeSegment('Ελλαδα'))
  })

  // Le dakuten distingue deux syllabes : le retirer donnerait « か ».
  it('garde les marques qui portent du sens hors du latin', () => {
    expect(normalizeSegment('が')).toBe('が')
    expect(normalizeSegment('が')).not.toBe(normalizeSegment('か'))
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

  // Conséquence assumée.
  it('confond deux noms qui ne diffèrent que par un accent', () => {
    expect(storyId(['checkout'], 'État vide')).toBe(storyId(['checkout'], 'Etat vide'))
  })

  // Sinon une story en écrase une autre en silence.
  it('donne des identifiants distincts à des noms distincts', () => {
    expect(storyId(['checkout'], 'Avec référence')).not.toBe(
      storyId(['checkout'], 'Sans référence'),
    )
  })

  // Les deux donnaient `button--` avant la normalisation Unicode.
  it('distingue deux noms écrits hors alphabet latin', () => {
    expect(storyId(['Button'], 'Активная')).not.toBe(storyId(['Button'], 'Отключена'))
    expect(storyId(['Button'], 'Активная')).toBe('button--активная')
  })

  // Collision assumée : la parade est la détection au moment où le CLI écrit le
  // manifeste, cette fonction ignorant les autres entrées.
  it('rend un identifiant vide pour un nom fait de symboles', () => {
    expect(storyId([], '🎉')).toBe('')
  })

  // Un segment de chemin vide est filtré : un nom vide l'est aussi, plutôt que
  // de laisser traîner `badge--`.
  it('omet le double tiret quand le nom se normalise en chaîne vide', () => {
    expect(storyId(['Badge'], '🎉')).toBe('badge')
  })

  it('produit le même identifiant pour la même entrée, appel après appel', () => {
    const first = storyId(['checkout', 'OrderSummary'], 'Avec référence')
    const second = storyId(['checkout', 'OrderSummary'], 'Avec référence')
    expect(first).toBe(second)
  })
})
