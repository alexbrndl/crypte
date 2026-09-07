// Le catalogue tenait dans cinq tableaux, et rien ne signalait qu'un nom y
// apparaissait deux fois avec deux statuts. Voir docs/internal/architecture.md.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const fichier = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'internal',
  'plugins.md',
)
const STATUTS = ['gratuit', 'payant', 'porté par serve']
const CHANTIER = /^(\d\.\d|R)$/

const cellules = (ligne) =>
  ligne
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.replaceAll('`', '').trim())

// Le seul tableau dont l'en-tête porte « Paquet » et « Statut ». Les tableaux de
// fusions, de coupes et d'idées écartées n'en ont pas, donc ils sont ignorés.
function catalogue() {
  const lignes = readFileSync(fichier, 'utf8').split('\n')
  const tête = lignes.findIndex((l) => {
    if (!l.trim().startsWith('|')) return false
    const noms = cellules(l).map((c) => c.toLowerCase())
    return noms.includes('paquet') && noms.includes('statut')
  })
  expect(tête, 'aucun tableau de catalogue dans plugins.md').toBeGreaterThan(-1)

  const colonnes = cellules(lignes[tête]).map((c) => c.toLowerCase())
  const rangs = []
  for (let i = tête + 2; i < lignes.length && lignes[i].trim().startsWith('|'); i += 1) {
    const c = cellules(lignes[i])
    rangs.push({
      nom: c[colonnes.indexOf('paquet')],
      statut: c[colonnes.indexOf('statut')],
      chantier: c[colonnes.indexOf('chantier')],
      ligne: i + 1,
    })
  }
  return rangs
}

test('un paquet, une ligne', () => {
  const noms = catalogue().map((r) => r.nom)
  expect(noms.filter((n, i) => noms.indexOf(n) !== i)).toEqual([])
})

test('le statut est l’une des trois valeurs, et le chantier existe', () => {
  const fautifs = catalogue().filter(
    (r) => !STATUTS.includes(r.statut) || !CHANTIER.test(r.chantier),
  )
  expect(fautifs.map((r) => `${r.nom} ligne ${r.ligne} : ${r.statut} / ${r.chantier}`)).toEqual([])
})

// Le compte n'est pas décoratif : il fait rougir l'ajout d'une ligne dont le tri
// n'a pas été refait, ce qui est exactement ce qui avait produit les doublons.
test('vingt-trois entrées, quatorze gratuites, huit payantes, une portée par serve', () => {
  const rangs = catalogue()
  const combien = (s) => rangs.filter((r) => r.statut === s).length
  expect({
    total: rangs.length,
    gratuit: combien('gratuit'),
    payant: combien('payant'),
    serve: combien('porté par serve'),
  }).toEqual({ total: 23, gratuit: 14, payant: 8, serve: 1 })
})
