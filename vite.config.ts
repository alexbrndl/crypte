import { defineConfig } from 'vite-plus'

// Les réglages que tout projet de test doit avoir. Écrits ici parce que le projet
// `shell` étend la configuration du shell, pas la racine : sans eux, ses cas
// tournaient dans un ordre fixe et avec le défaut d'une seconde d'`expect.poll`.
// Voir docs/internal/architecture.md.
const partagé = {
  testTimeout: 20_000,
  hookTimeout: 30_000,
  expect: { poll: { timeout: 10_000 } },
  sequence: { shuffle: { tests: true, files: false } },
}

export default defineConfig({
  run: {
    cache: true,
  },
  lint: {
    // La fixture du lot 3 imite un projet utilisateur : son `jsconfig.json`
    // porte un commentaire et un `baseUrl`, que TypeScript 7 refuse. C'est
    // précisément ce qu'un projet réel contient, et ce que le CLI doit savoir
    // lire. La vérifier comme du code du dépôt n'aurait aucun sens.
    ignorePatterns: ['packages/cli/test/fixture/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ['packages/core/src/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            { patterns: ['react', 'react/*', 'react-dom', 'react-dom/*'] },
          ],
        },
      },
    ],
  },
  fmt: {
    // `**/.crypte/**` : l'empreinte est écrite par la suite et commitée, donc
    // deux mécanismes se disputaient sa forme. Le formateur compactait ses
    // tableaux au commit, l'écriture les dépliait au test suivant, et l'arbre
    // n'était jamais propre. Voir docs/internal/architecture.md.
    // Les instantanés sont écrits par vitest et relus en revue : le formateur et
    // l'écriture se disputeraient leur forme, comme ils l'ont fait pour
    // l'empreinte.
    ignorePatterns: ['dist/**', 'docs/**', 'README.md', '**/.crypte/**', '**/test/snapshots/**'],
    singleQuote: true,
    semi: false,
  },
  test: {
    // La couverture remplace une des trois questions que le contrôle de mutation
    // posait, et la seule qu'aucune relecture ne voit : « ce code est-il exécuté
    // par quelqu'un ? ». Mesurée en 5 s là où le contrôle demandait 20 min, elle
    // a trouvé du premier coup l'adaptateur React et l'entrée du CLI à 0 %.
    //
    // Les seuils sont au plancher mesuré, pas à 100 : un seuil qu'on baisse pour
    // faire passer un lot ne garde plus rien. Ils montent quand un lot les
    // dépasse. Voir docs/internal/architecture.md.
    coverage: {
      include: ['packages/*/src/**', 'apps/shell/src/**'],

      // `text` pour la console, `json-summary` pour le commentaire de pull
      // request. Ni `html` ni `clover`, que personne ne lit ici.
      reporter: ['text', 'json-summary'],

      // Trois fichiers de câblage, et rien d'autre : l'entrée du CLI qui appelle
      // `run`, le montage du shell, et un module de types dont il ne reste à
      // l'exécution qu'une constante.
      exclude: [
        'packages/cli/src/index.ts',
        'apps/shell/src/main.ts',
        'packages/core/src/protocol/manifest.ts',
        '**/*.d.ts',
      ],
      // Les seuils ne sont **pas** ici. Ils vivent dans
      // `test/coverage-thresholds.json` et sont évalués une seule fois, par
      // `test/coverage-report.mjs`, donc par le contrôle `coverage` de la pull
      // request : évalués aux deux endroits, ils rougissaient deux fois pour la
      // même raison et le contrôle visible n'attrapait rien de plus.
      // `pnpm ready` les applique en local. Voir docs/internal/architecture.md.
    },

    // Les cas navigateur et le rechargement à chaud copient un projet par cas et
    // la démontent après. Un lancement tué laisse la copie : soixante-huit
    // s'étaient accumulées.
    globalSetup: ['./test/sweep-tmp.mjs'],

    // Les délais et l'ordre mélangé vivaient dans les fichiers, recopiés une
    // trentaine de fois. Ici, ils se lisent d'un endroit et se changent d'un
    // endroit.
    //
    // Le défaut d'`expect.poll` est d'une seconde, ce qui ne suffit pas quand on
    // attend un serveur, un rendu React ou un rechargement à chaud.
    //
    // L'ordre des cas est mélangé, jamais celui des fichiers : mélanger les
    // fichiers annule l'optimisation qui lance les plus longs d'abord. Deux
    // couplages entre cas nous ont coûté des heures et n'ont été trouvés que par
    // hasard. La graine est imprimée par vitest, donc un échec se rejoue par
    // `--sequence.seed`.
    ...partagé,

    // Deux projets, parce que les cas navigateur ne sont pas du même genre. Ils
    // montent une copie de projet, un serveur et une page par cas ; entrelacés
    // avec les 384 autres, un d'entre eux tombait à chaque lancement, jamais le
    // même. `groupOrder` les fait passer après, seuls sur la machine.
    projects: [
      {
        extends: true,
        test: {
          name: 'unité',
          exclude: [
            '**/node_modules/**',
            '**/screen.test.ts',
            '**/adapter.test.tsx',
            '**/app.test.ts',
          ],
        },
      },
      // Le composant du shell, monté dans un DOM. La configuration du shell
      // plutôt que la racine, parce qu'elle porte le plugin Vue : sans lui, le
      // `.vue` n'est pas transformé, donc ni exécuté ni mesurable.
      {
        extends: './apps/shell/vite.config.ts',
        test: {
          ...partagé,
          name: 'shell',
          include: ['apps/shell/test/app.test.ts'],
          environment: 'jsdom',
        },
      },
      // L'adaptateur monte du React : il lui faut un DOM, et jsdom suffit. Sans
      // ce projet, le seul fichier publié qu'aucun test n'exécutait le restait,
      // ses deux seules preuves passant par un vrai navigateur et toute la pile.
      {
        extends: true,
        test: {
          name: 'adaptateur',
          include: ['**/adapter.test.tsx'],
          environment: 'jsdom',
        },
      },
      {
        extends: true,
        test: {
          name: 'écran',
          include: ['**/screen.test.ts'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
  staged: {
    // Toutes les extensions que le formateur traite réellement : un .md hors du motif
    // est passé en commit sans être vérifié, ce qui est la raison d'être de ce bloc.
    '*.{ts,tsx,js,mjs,cjs,vue,json,md,yml,yaml}': 'vp check --fix',
  },
})
