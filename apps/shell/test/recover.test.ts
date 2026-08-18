import type { StoryEntry } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { landing, recovered, unreadable } from '../src/recover'

// Où retombe la sélection quand le catalogue change sous elle. Perdre sa place à
// chaque frappe est pire que ne pas recharger du tout, d'où un repli plutôt
// qu'une sélection vide. Voir docs/internal/architecture.md.

function entry(id: string, name: string, storyFile: string): StoryEntry {
  return { id, name, path: ['Badge'], storyFile, component: { name: 'Badge', file: 'x' } } as never
}

const defaut = entry('badge--par-defaut', 'Par défaut', 'stories/Badge.tsx')
const alerte = entry('badge--avertissement', 'Avertissement', 'stories/Badge.tsx')
const autre = entry('bouton--par-defaut', 'Par défaut', 'stories/Bouton.tsx')

describe('la sélection après un changement de catalogue', () => {
  it('garde l’identifiant quand il existe encore', () => {
    expect(recovered(alerte, [defaut, alerte], [defaut, alerte, autre])).toBe(alerte.id)
  })

  it('prend la première story quand rien n’était affiché', () => {
    expect(recovered(null, [], [defaut, alerte])).toBe(defaut.id)
  })

  it('rend rien quand rien n’était affiché et qu’il n’y a rien', () => {
    expect(recovered(null, [], [])).toBeNull()
  })

  // Le cas qui décide de la règle : renommer une story change son identifiant,
  // et le même rang dans le même fichier désigne la story renommée.
  it('suit un renommage sur place, par le rang dans le fichier', () => {
    const renommee = entry('badge--alerte', 'Alerte', 'stories/Badge.tsx')

    expect(recovered(alerte, [defaut, alerte], [defaut, renommee, autre])).toBe(renommee.id)
  })

  // Sans le rang, le repli serait la première story du fichier, ce qui
  // enverrait sur `Par défaut` quelqu'un qui renommait `Avertissement`.
  it('ne retombe pas sur la première story du fichier', () => {
    const renommee = entry('badge--alerte', 'Alerte', 'stories/Badge.tsx')

    expect(recovered(alerte, [defaut, alerte], [defaut, renommee])).not.toBe(defaut.id)
  })

  // Une story retirée au milieu laisse le rang au-delà de ce que le fichier
  // porte encore.
  it('prend la dernière du fichier quand le rang n’existe plus', () => {
    expect(recovered(alerte, [defaut, alerte], [defaut, autre])).toBe(defaut.id)
  })

  // Le fichier entier a disparu : proposer la première story d'ailleurs
  // enverrait sur un composant que personne n'a ouvert.
  it('rend rien quand le fichier affiché a disparu', () => {
    expect(recovered(alerte, [defaut, alerte, autre], [autre])).toBeNull()
  })

  // L'affichée peut ne pas être dans le catalogue d'avant : un premier
  // rafraîchissement échoué laisse une sélection sans liste. Le rang vaut alors
  // -1, et prendre la dernière du fichier vaut mieux que ne rien rendre.
  it('retombe sur la dernière du fichier quand l’affichée n’était pas dans la liste', () => {
    const renommee = entry('badge--alerte', 'Alerte', 'stories/Badge.tsx')

    expect(recovered(alerte, [], [defaut, renommee])).toBe(renommee.id)
  })

  // Le troisième état. Confondu avec « rien n'a jamais été affiché », une
  // sauvegarde sur n'importe quel autre fichier faisait sauter la sélection sur
  // la première story, juste après avoir dit qu'il n'y avait plus rien.
  it('ne propose rien après une sélection perdue', () => {
    expect(recovered('effacée', [defaut, alerte], [defaut, alerte, autre])).toBeNull()
  })

  // Un catalogue vide n'a rien perdu. Confondu avec une sélection perdue, il ne
  // se sélectionnait plus jamais tout seul une fois la première story écrite.
  it('reprend la première story après un catalogue vide', () => {
    expect(recovered(null, [], [defaut, alerte])).toBe(defaut.id)
  })

  it('rend rien quand le catalogue est devenu vide', () => {
    expect(recovered(alerte, [defaut, alerte], [])).toBeNull()
  })
})

// Ce que le shell devient, et pas seulement où il retombe : la distinction
// entre « rien n'a jamais été affiché » et « la sélection vient d'être perdue »
// se décide ici, hors d'un rendu Vue.
describe('l’atterrissage après un rafraîchissement', () => {
  it('n’efface rien sur un catalogue vide', () => {
    expect(landing(null, [], [])).toEqual({ id: null, shown: null, status: undefined })
  })

  // Le bloquant du tour 2 : marqué effacé, un projet sans story ne se
  // sélectionnait plus jamais tout seul une fois la première écrite.
  it('reprend la main dès qu’une première story arrive', () => {
    const vide = landing(null, [], [])

    expect(landing(vide.shown, [], [defaut]).id).toBe(defaut.id)
  })

  it('efface et le dit quand la sélection est perdue', () => {
    expect(landing(alerte, [defaut, alerte, autre], [autre])).toEqual({
      id: null,
      shown: 'effacée',
      status: 'la story affichée a disparu',
    })
  })

  it('ne redit rien tant que la sélection tient', () => {
    expect(landing(alerte, [defaut, alerte], [defaut, alerte])).toEqual({
      id: alerte.id,
      shown: alerte,
      status: undefined,
    })
  })
})

describe('un catalogue illisible', () => {
  it('dit ce qui a empêché de le lire', () => {
    expect(unreadable(new Error('Unexpected end of JSON input'))).toBe(
      'catalogue illisible : Unexpected end of JSON input',
    )
  })

  // Un rejet qui n'est pas une erreur reste lisible plutôt que de rendre
  // « [object Object] ».
  it('rend lisible ce qui n’est pas une erreur', () => {
    expect(unreadable(503)).toBe('catalogue illisible : 503')
  })
})
