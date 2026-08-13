// Ce que pèse un manifeste, et ce que coûterait d'en garder l'historique.
// N'assertionne rien : se lance à la main, lit ses chiffres à l'œil.
// Conclusions dans docs/internal/pistes-shell.md, section 3.
//
// Il fabrique des manifestes au lieu d'en mesurer de vrais, faute de projet
// réel. C'est là qu'est la difficulté : une première version tirait des entrées
// identiques, gzip écrasait la répétition, et 30 Ko tombaient à 0,9 Ko. La
// mesure ne valait rien. D'où les vocabulaires séparés ci-dessous, qui donnent
// à deux entrées autant de différence que dans un vrai catalogue.
//
// Brotli a été retiré de la sortie. Il annonçait 23 Ko là où gzip en donnait
// 242, ce qui n'est pas crédible : le vocabulaire reste trop restreint, et sa
// fenêtre de dictionnaire en profite bien plus que celle de gzip. Le chiffre
// aurait fini cité comme s'il valait quelque chose.

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
    const p = pick(props) + (d > props.length ? d : '')
    details[p] = {
      type: pick(kinds),
      required: rnd() > 0.7,
      description: phrase(4 + Math.floor(rnd() * 6)),
    }
    if (rnd() > 0.6) details[p].default = rnd() > 0.5 ? '' : 0
  }

  return {
    type: 'story',
    id: `${folder}/${comp.toLowerCase()}--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    path: [folder, comp],
    name,
    component: { name: comp, file: `src/components/${folder}/${comp}.tsx`, export: 'default' },
    storyFile: `stories/${folder}/${comp}.ts`,
    options: {},
    details,
    source: `<${comp} ${pick(props)}="${phrase(2)}" />`,
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
    props: Object.keys(e.details).sort().join(','),
    hash: String((JSON.stringify(e.details).length * 2654435761) % 4294967296),
  })),
}
const lockJson = JSON.stringify(lock)
console.log(
  `empreinte réduite, 500 entrées : ${(Buffer.byteLength(lockJson) / 1024).toFixed(1)} Ko brut, ${(gzipSync(lockJson).length / 1024).toFixed(1)} Ko gzip`,
)
console.log(`soit ${(Buffer.byteLength(lockJson) / 500).toFixed(0)} o par story`)
