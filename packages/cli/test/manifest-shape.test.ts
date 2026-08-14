import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Manifest } from '@crypte/core/protocol'
import { describe, expect, it } from 'vitest'
import { buildCatalogue } from '../src/manifest'
import { loadProject } from '../src/project'

// Le manifeste de la fixture, en entier, écrit à la main. Les autres cas
// vérifient un champ à la fois ; celui-ci fige la forme, donc un champ qui
// apparaît, disparaît ou change de nom se voit ici et nulle part ailleurs.

const here = dirname(fileURLToPath(import.meta.url))

const EXPECTED: Manifest = {
  version: 1,
  entries: [
    {
      type: 'story',
      id: 'badge--default',
      path: ['Badge'],
      name: 'Default',
      component: { name: 'Badge', file: 'src/components/Badge.jsx', export: 'Badge' },
      storyFile: 'stories/Badge.js',
      options: {},
      details: {},
      props: [],
      source: '<Badge />',
    },
    {
      type: 'story',
      id: 'checkout/ordersummary--par-defaut',
      path: ['checkout', 'OrderSummary'],
      name: 'Par défaut',
      component: {
        name: 'OrderSummary',
        file: 'src/components/checkout/OrderSummary.jsx',
        export: 'default',
      },
      storyFile: 'stories/checkout/OrderSummary.jsx',
      options: {},
      details: {},
      props: ['benefits', 'title'],
      meta: { status: 'stable', owner: 'checkout' },
      source:
        "<OrderSummary title=\"Formule complète\" benefits={['Historique complet', 'Données vérifiées']} />",
    },
    {
      type: 'story',
      id: 'checkout/ordersummary--avec-reference',
      path: ['checkout', 'OrderSummary'],
      name: 'Avec référence',
      component: {
        name: 'OrderSummary',
        file: 'src/components/checkout/OrderSummary.jsx',
        export: 'default',
      },
      storyFile: 'stories/checkout/OrderSummary.jsx',
      options: {},
      details: {},
      props: ['benefits', 'reference', 'title'],
      meta: { status: 'stable', owner: 'checkout' },
      source:
        '<OrderSummary title="Formule complète" benefits={[\'Historique complet\', \'Données vérifiées\']} reference="REF-4821-KD" />',
    },
    {
      type: 'story',
      id: 'checkout/ordersummary--replie-sur-mobile',
      path: ['checkout', 'OrderSummary'],
      name: 'Replié sur mobile',
      component: {
        name: 'OrderSummary',
        file: 'src/components/checkout/OrderSummary.jsx',
        export: 'default',
      },
      storyFile: 'stories/checkout/OrderSummary.jsx',
      options: { responsive: 'mobile' },
      details: {},
      props: ['benefits', 'children', 'reference', 'title'],
      meta: { status: 'stable', owner: 'checkout' },
      source:
        '<OrderSummary title="Formule complète" benefits={[\'Historique complet\', \'Données vérifiées\']} reference="REF-4821" children={<span>Neuf</span>} />',
    },
  ],
}

describe('la forme du manifeste', () => {
  it('est celle que la fixture produit, champ pour champ', async () => {
    const { manifest } = buildCatalogue(await loadProject(join(here, 'fixture')))

    expect(manifest).toEqual(EXPECTED)
  })

  // `toEqual` ignore une clé dont la valeur est `undefined`, donc un champ
  // ajouté vide passerait. La comparaison des clés, elle, le voit.
  it('ne porte aucun champ de plus que ceux attendus', async () => {
    const { manifest } = buildCatalogue(await loadProject(join(here, 'fixture')))

    for (const [index, entry] of manifest.entries.entries()) {
      expect(Object.keys(entry).sort()).toEqual(Object.keys(EXPECTED.entries[index] ?? {}).sort())
    }
  })

  // Tout doit survivre à un aller-retour JSON : section 4.5.
  it('survit à un aller-retour JSON', async () => {
    const { manifest } = buildCatalogue(await loadProject(join(here, 'fixture')))

    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest)
  })
})
