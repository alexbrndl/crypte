import { defineConfig } from 'vite-plus'

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

      // Trois fichiers de câblage, et rien d'autre : l'entrée du CLI qui appelle
      // `run`, le montage du shell, et un module de types dont il ne reste à
      // l'exécution qu'une constante.
      exclude: [
        'packages/cli/src/index.ts',
        'apps/shell/src/main.ts',
        'packages/core/src/protocol/manifest.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        statements: 96,
        branches: 88,
        functions: 96,
        lines: 97,
      },
    },

    // Les cas navigateur et le rechargement à chaud copient un projet par cas et
    // la démontent après. Un lancement tué, ce que le contrôle de mutation fait
    // couramment, laisse la copie : soixante-huit s'étaient accumulées.
    globalSetup: ['./test/sweep-tmp.mjs'],

    // Les délais vivaient dans les fichiers, recopiés une trentaine de fois.
    // Ici, ils se lisent d'un endroit et se changent d'un endroit.
    testTimeout: 20_000,
    hookTimeout: 30_000,

    // Le défaut d'`expect.poll` est d'une seconde, ce qui ne suffit pas quand on
    // attend un serveur, un rendu React ou un rechargement à chaud. Réglé ici,
    // il cesse d'être recopié une trentaine de fois dans les fichiers.
    expect: { poll: { timeout: 10_000 } },

    // L'ordre des cas est mélangé, jamais celui des fichiers : mélanger les
    // fichiers annule l'optimisation qui lance les plus longs d'abord.
    //
    // Deux couplages entre cas nous ont coûté des heures et n'ont été trouvés
    // que par hasard : un cas qui supprimait ce que le précédent avait écrit, et
    // un autre qui lisait un compteur rempli par ses voisins. La graine est
    // imprimée par vitest, donc un échec se rejoue par `--sequence.seed`.
    sequence: { shuffle: { tests: true, files: false } },

    // Deux projets, parce que les cas navigateur ne sont pas du même genre. Ils
    // montent une copie de projet, un serveur et une page par cas ; entrelacés
    // avec les 384 autres, un d'entre eux tombait à chaque lancement, jamais le
    // même. `groupOrder` les fait passer après, seuls sur la machine.
    projects: [
      {
        extends: true,
        test: {
          name: 'unité',
          exclude: ['**/node_modules/**', '**/screen.test.ts', '**/adapter.test.tsx'],
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
