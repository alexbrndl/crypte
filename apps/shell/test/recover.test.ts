import type { StoryEntry } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { recovered } from '../src/recover'

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

  it('rend rien quand le catalogue est devenu vide', () => {
    expect(recovered(alerte, [defaut, alerte], [])).toBeNull()
  })
})
