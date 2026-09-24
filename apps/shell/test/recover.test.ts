import type { StoryEntry } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { landing, recovered, unreadable } from '../src/recover'

// Où retombe la sélection quand le catalogue change sous elle. Perdre sa place à
// chaque frappe est pire que ne pas recharger du tout, d'où un repli plutôt
// qu'une sélection vide.

function entry(id: string, name: string, storyFile: string): StoryEntry {
  return { id, name, path: ['Badge'], storyFile, component: { name: 'Badge', file: 'x' } } as never
}

const defaut = entry('badge--par-defaut', 'Par défaut', 'stories/Badge.tsx')
const alerte = entry('badge--avertissement', 'Avertissement', 'stories/Badge.tsx')
const autre = entry('bouton--par-defaut', 'Par défaut', 'stories/Bouton.tsx')

describe('the selection after a catalog change', () => {
  it('takes the first story when nothing was displayed', () => {
    expect(recovered(null, [], [defaut, alerte])).toBe(defaut.id)
  })

  // Le cas qui décide de la règle : renommer une story change son identifiant,
  // et le même rang dans le même fichier désigne la story renommée.
  it('follows an in-place rename, by rank in the file', () => {
    const renommee = entry('badge--alerte', 'Alerte', 'stories/Badge.tsx')

    expect(recovered(alerte, [defaut, alerte], [defaut, renommee, autre])).toBe(renommee.id)
  })

  // L'affichée peut ne pas être dans le catalogue d'avant : un premier
  // rafraîchissement échoué laisse une sélection sans liste. Le rang vaut alors
  // -1, et prendre la dernière du fichier vaut mieux que ne rien rendre.
  it('falls back to the last one in the file when the displayed one was not in the list', () => {
    const renommee = entry('badge--alerte', 'Alerte', 'stories/Badge.tsx')

    expect(recovered(alerte, [], [defaut, renommee])).toBe(renommee.id)
  })

  // Le troisième état. Confondu avec « rien n'a jamais été affiché », une
  // sauvegarde sur n'importe quel autre fichier faisait sauter la sélection sur
  // la première story, juste après avoir dit qu'il n'y avait plus rien.
  it('offers nothing while the lost story’s file stays missing', () => {
    const perdue = { lost: alerte, before: [defaut, alerte, autre] }

    expect(recovered(perdue, [autre], [autre])).toBeNull()
  })

  // Une erreur de syntaxe retire le fichier entier du catalogue, et sa
  // réparation l'y remet : la story perdue revient à l'écran.
  it('returns to the lost story when its file comes back', () => {
    const perdue = { lost: alerte, before: [defaut, alerte, autre] }

    expect(recovered(perdue, [autre], [defaut, alerte, autre])).toBe(alerte.id)
  })

  // Réparée et renommée d'un même geste : c'est le catalogue gardé à la perte
  // qui donne son rang, celui d'avant la réparation ne la contient plus.
  it('finds by rank a lost story that comes back renamed', () => {
    const perdue = { lost: alerte, before: [defaut, alerte, autre] }
    const renommee = entry('badge--attention', 'Attention', 'stories/Badge.tsx')
    const derniere = entry('badge--z', 'Z', 'stories/Badge.tsx')

    expect(recovered(perdue, [autre], [defaut, renommee, derniere, autre])).toBe(renommee.id)
  })
})

// Ce que le shell devient, et pas seulement où il retombe : la distinction
// entre « rien n'a jamais été affiché » et « la sélection vient d'être perdue »
// se décide ici, hors d'un rendu Vue.
describe('the landing after a refresh', () => {
  it('clears nothing on an empty catalog', () => {
    expect(landing(null, [], [])).toEqual({ id: null, shown: null, status: undefined })
  })

  it('clears and says so when the selection is lost', () => {
    expect(landing(alerte, [defaut, alerte, autre], [autre])).toEqual({
      id: null,
      shown: { lost: alerte, before: [defaut, alerte, autre] },
      status: 'la story affichée a disparu',
    })
  })

  it('says nothing more while the selection holds', () => {
    expect(landing(alerte, [defaut, alerte], [defaut, alerte])).toEqual({
      id: alerte.id,
      shown: alerte,
      status: undefined,
    })
  })
})

describe('an unreadable catalog', () => {
  // Un rejet qui n'est pas une erreur reste lisible plutôt que de rendre
  // « [object Object] ».
  it('makes readable what is not an error', () => {
    expect(unreadable(503)).toBe('catalogue illisible : 503')
  })
})
