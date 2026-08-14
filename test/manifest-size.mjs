// Ce que pèse un manifeste, et ce que coûterait d'en garder l'historique.
// N'assertionne rien, se lance à la main. Voir docs/internal/architecture.md.

import { gzipSync } from 'node:zlib'

const folders = [
  'checkout',
  'ui',
  'account',
  'search',
  'billing',
  'onboarding',
  'marketing',
  'admin',
]
const comps = [
  'OrderSummary',
  'PricingCard',
  'ProgressLoader',
  'Badge',
  'Tabs',
  'DataTable',
  'Combobox',
  'Avatar',
  'Toast',
  'Drawer',
  'Stepper',
  'FileDrop',
  'Calendar',
  'Chart',
  'Banner',
]
const names = [
  'Par défaut',
  'Avec référence',
  'Depuis une annonce',
  'Sans bénéfices',
  'Replié sur mobile',
  'Sélectionné',
  'Le plus populaire',
  'Étape 2',
  'Dernière étape',
  'Import externe',
  'Chargement',
  'Vide',
  'Erreur',
  'Long libellé',
  'Compact',
]
const props = [
  'title',
  'label',
  'value',
  'items',
  'onSelect',
  'disabled',
  'variant',
  'size',
  'reference',
  'sourceUrl',
  'placeholder',
  'columns',
  'rows',
  'density',
  'align',
  'icon',
  'href',
  'count',
  'total',
  'step',
]
const kinds = [
  'string',
  'number',
  'boolean',
  'enum',
  'object',
  'array',
  'function',
  'node',
  'unknown',
]
const words =
  'récapitulatif commande colonne gauche checkout libellé affiché tête bandeau confirmation liste bénéfices inclus formule référence adresse annonce origine profil recherche classes supplémentaires état intermédiaire polling'.split(
    ' ',
  )

// Déterministe : deux lancements donnent les mêmes chiffres, sinon on ne peut
// comparer aucune mesure à la précédente.
let seed = 42
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = (a) => a[Math.floor(rnd() * a.length)]
const phrase = (n) => Array.from({ length: n }, () => pick(words)).join(' ')

// La forme de `StoryEntry`, voir packages/core/src/protocol/manifest.ts.
function makeEntry(i) {
  const folder = pick(folders)
  const comp = pick(comps) + (i % 7 === 0 ? String(i) : '')
  const name = pick(names)
  const detailCount = 3 + Math.floor(rnd() * 10)
  const details = {}

  for (let d = 0; d < detailCount; d++) {
    // Suffixé dès qu'un nom est retiré deux fois, sinon les deux props se
    // confondent dans `details` et l'entrée pèse moins qu'elle ne devrait.
    // `d > props.length` ne se déclenchait jamais, `d` allant au plus à 11.
    const tire = pick(props)
    const p = tire in details ? `${tire}${d}` : tire
    details[p] = {
      type: pick(kinds),
      required: rnd() > 0.7,
      description: phrase(4 + Math.floor(rnd() * 6)),
    }
    if (rnd() > 0.6) details[p].default = rnd() > 0.5 ? '' : 0
  }

  // `details` est la surface du composant, `props` ce que **cette** story pose :
  // un sous-ensemble, puisqu'une story n'exerce presque jamais tout. Les deux
  // listes confondues, l'empreinte pèserait plus qu'elle ne doit et ne bougerait
  // pas quand une story change de props.
  const surface = Object.keys(details)
  const set = surface.slice(0, 1 + Math.floor(rnd() * Math.min(6, surface.length)))

  return {
    type: 'story',
    id: `${folder}/${comp.toLowerCase()}--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    path: [folder, comp],
    name,
    component: { name: comp, file: `src/components/${folder}/${comp}.tsx`, export: 'default' },
    storyFile: `stories/${folder}/${comp}.ts`,
    options: {},
    details,
    props: [...set].sort(),
    // Le code d'appel porte les props posées, comme celui que le CLI reconstruit
    // du texte de l'auteur : un seul nom sous-estimait le champ d'un facteur cinq.
    source: `<${comp}${set.map((prop) => ` ${prop}="${phrase(2)}"`).join('')} />`,
    meta: {
      status: pick(['draft', 'stable', 'deprecated']),
      owner: pick(['design-system', 'funnel', 'growth']),
    },
  }
}

const manifest = (n) => ({ version: 1, entries: Array.from({ length: n }, (_, i) => makeEntry(i)) })
const k = (v) => (v / 1024).toFixed(1).padStart(8)

console.log('entrées |     brut |     gzip')
const gzipBy = {}
for (const n of [23, 100, 500, 2000]) {
  seed = 42
  const json = JSON.stringify(manifest(n))
  gzipBy[n] = gzipSync(json).length
  console.log(`${String(n).padStart(7)} |${k(Buffer.byteLength(json))} |${k(gzipBy[n])}`)
}

// Une copie entière par version, ce qu'on ferait sans réfléchir.
console.log('\nhistorique complet, 500 entrées, gzip par version, sans déduplication')
for (const v of [20, 100, 500, 2000])
  console.log(
    `${String(v).padStart(5)} versions : ${((gzipBy[500] * v) / 1024 / 1024).toFixed(1)} Mo`,
  )

// Cas réaliste : d'une version à l'autre, seules quelques entrées changent.
console.log('')
seed = 42
const v1 = manifest(500)
const v2 = {
  ...v1,
  entries: v1.entries.map((e, i) => (i % 50 === 0 ? { ...e, name: `${e.name} bis` } : e)),
}
const delta = v2.entries.filter((e, i) => JSON.stringify(e) !== JSON.stringify(v1.entries[i]))
const deltaGz = gzipSync(JSON.stringify({ changed: delta })).length
console.log(
  `2 % d'entrées modifiées : delta gzip = ${(deltaGz / 1024).toFixed(1)} Ko contre ${(gzipBy[500] / 1024).toFixed(1)} Ko pour la version entière`,
)
console.log(`2000 versions en deltas : ${((deltaGz * 2000) / 1024 / 1024).toFixed(1)} Mo`)

// Forme réduite : ce qui mérite d'être versionné, pas tout le manifeste. C'est
// elle qui est retenue, commise sous régime de lockfile.
console.log('')
seed = 42
const full = manifest(500)
const lock = {
  version: 1,
  entries: full.entries.map((e) => ({
    id: e.id,
    component: `${e.component.file}#${e.component.export}`,
    status: e.meta.status,
    // Le champ de l'entrée, pas une reconstitution depuis `details` : ce sont
    // deux listes différentes, et c'est celle des props posées qui doit être
    // versionnée. Dérivée de `details`, l'empreinte ne bougeait pas quand une
    // story changeait de props sans que le composant change.
    props: e.props.join(','),
    hash: String((JSON.stringify(e.details).length * 2654435761) % 4294967296),
  })),
}
const lockJson = JSON.stringify(lock)
console.log(
  `empreinte réduite, 500 entrées : ${(Buffer.byteLength(lockJson) / 1024).toFixed(1)} Ko brut, ${(gzipSync(lockJson).length / 1024).toFixed(1)} Ko gzip`,
)
console.log(`soit ${(Buffer.byteLength(lockJson) / 500).toFixed(0)} o par story`)
