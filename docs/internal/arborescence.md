# Arborescence

Une ligne par fichier : ce qu'il contient, et qui le consomme. Pour le pourquoi des choix, voir `architecture.md`.

## Racine

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `package.json` | espaces de travail, scripts d'entrée | tout le dépôt |
| `pnpm-workspace.yaml` | espaces de travail, catalogue de versions | le gestionnaire de paquets |
| `vite.config.ts` | blocs `run`, `lint`, `fmt`, `test`, `staged` | toutes les commandes `vp` |
| `tsconfig.base.json` | sévérité TypeScript partagée | les `tsconfig` de chaque paquet |
| `tsconfig.json` | références vers les paquets | la vérification de types du dépôt |
| `CLAUDE.md` | contraintes et règles de travail | les agents |
| `CONTRIBUTING.md` | installation, conventions, flux | un contributeur extérieur |

## Automatisation

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `.github/workflows/ci.yml` | format, lint, types, build, tests | chaque pull request et push |
| `.github/workflows/version.yml` | maintien de la PR de version | chaque fusion sur `main` |
| `.github/workflows/require-review.yml` | contrôle de présence d'une revue | chaque pull request |
| `.github/workflows/require-changeset.yml` | contrôle de présence d'une note de version | chaque pull request |
| `.github/workflows/ts7-readiness.yml` | sonde mensuelle sur `vue-tsc` | personne, ouvre une issue |
| `.github/dependabot.yml` | veille sur les actions GitHub | Dependabot |
| `.vite-hooks/pre-commit` | lance `vp staged` | Git, avant chaque commit |
| `test/mutation-check.mjs` | casse chaque garantie, attend un test rouge | `pnpm run mutations`, la CI |
| `test/mutations.json` | catalogue des garanties, une par constat de revue | le script ci-dessus |
| `test/manifest-size.mjs` | ce que pèse un manifeste, et le coût d'en garder l'historique | personne, lancé à la main |
| `test/post-review.mjs` | publie un verdict de revue, et vérifie qu'il y est arrivé | `/review` |
| `test/post-review.test.mjs` | ce que le script refuse de publier | — |
| `test/changeset-check.mjs` | décide si une pull request doit porter une note | `require-changeset.yml` |
| `test/changeset-check.test.mjs` | ce qui exige une note, et ce qui n'en exige pas | — |
| `test/mutations.test.mjs` | les motifs du catalogue de mutations ne sont pas périmés | — |
| `test/doc-links.test.mjs` | tout document cité existe, et hors de `docs/` il est cité par son chemin | — |
| `test/published-english.test.mjs` | aucune phrase française dans le code publié | — |
| `.changeset/config.json` | mode fixe, générateur de changelog | Changesets |
| `.claude/skills/review/SKILL.md` | prompt de revue | `/review` |
| `.claude/skills/explore/SKILL.md` | méthode de découverte avant revue | `/explore` |
| `.claude/skills/changeset/SKILL.md` | prompt de note de version | `/changeset` |

## `packages/core` — `@crypte/core`

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `src/protocol/index.ts` | réexports du protocole | les trois autres paquets |
| `src/protocol/story.ts` | forme d'un fichier de stories | les adaptateurs, le CLI |
| `src/protocol/prop.ts` | ce qu'on peut dire d'une prop | `story.ts`, `manifest.ts` |
| `src/protocol/manifest.ts` | forme du catalogue | le CLI qui l'écrit, le shell qui le lit |
| `src/protocol/channel.ts` | messages du canal | `core/ui`, `core/preview` |
| `src/protocol/id.ts` | dérivation des identifiants | le CLI, le shell |
| `src/ui/index.ts` | côté shell du canal | `apps/shell`, les futurs plugins |
| `src/preview/index.ts` | côté iframe du canal | la page de preview |
| `vite.config.ts` | entrées et options du pack | `vp pack` |
| `test/protocol/id.test.ts` | cas de normalisation | — |
| `test/protocol/index.test.ts` | complétude des réexports de la porte d'entrée | — |
| `test/plugin-simulation.d.ts` | augmentations simulant un plugin installé | tous les tests sauf `no-plugin/` |
| `test/protocol/story.test.ts` | points d'extension et format de story | — |
| `test/protocol/manifest.test.ts` | conformité du catalogue à la spécification | — |
| `test/protocol/channel.test.ts` | formes des messages | — |
| `test/fake-window.ts` | deux contextes qui s'envoient de vrais messages | les trois tests ci-dessous |
| `test/ui.test.ts` | filtres et désabonnement du côté shell | — |
| `test/preview.test.ts` | filtres, réponses et désabonnement du côté preview | — |
| `test/channel.test.ts` | les deux côtés branchés, aucun message forgé | — |
| `test/no-plugin.test.ts` | lance la compilation ci-dessous | — |
| `test/no-plugin/cases.ts` | ce que le noyau refuse installé seul | — |
| `test/no-plugin/tsconfig.json` | programme sans la simulation de plugin | `no-plugin.test.ts` |
| `test/isolation.test.ts` | étanchéité des trois entrées, sur les bundles | — |
| `test/spec.test.ts` | écart entre la spécification et le code | — |

## `packages/cli` — `@crypte/cli`

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `src/index.ts` | binaire `crypte` | l'utilisateur final |
| `src/config.ts` | contrat de `crypte.config.ts`, `defineConfig` | le projet utilisateur |
| `src/project.ts` | chargement de la configuration, config Vite | le futur serveur |
| `src/config-paths.ts` | où le projet déclare ses chemins | `project.ts` |
| `src/paths.ts` | le résolveur qui les applique | `project.ts` |
| `src/errors.ts` | l'erreur montrée à l'utilisateur | `project.ts`, `config-paths.ts` |
| `src/stories.ts` | lecture d'un fichier de story, sans l'exécuter | `manifest.ts` |
| `src/manifest.ts` | parcours du dossier, résolution, écriture du catalogue | `dev.ts` |
| `src/dev.ts` | `crypte dev` : catalogue, empreinte, serveur | `index.ts` |
| `src/serve.ts` | les deux pages servies, et l'entrée de la preview | `dev.ts` |
| `scripts/copy-shell.mjs` | copie le shell construit dans `dist/shell` | le script `pack` |
| `src/fingerprint.ts` | la forme réduite du catalogue, commitée | la suite de tests, le futur serveur |
| `test/fixture/` | projet imité, aux contraintes réelles | `test/project.test.ts` |
| `test/fixture/stories/` | les premiers fichiers de story du dépôt | `test/stories.test.ts`, `test/manifest*.test.ts` |
| `test/stories.test.ts` | ce que la lecture d'un fichier refuse de deviner | — |
| `test/manifest.test.ts` | parcours, résolution, collisions d'identifiants | — |
| `test/manifest-shape.test.ts` | fige la forme du manifeste, champ pour champ | — |
| `test/dev.test.ts` | ce que le serveur sert vraiment, sur un serveur qui écoute | — |
| `test/screen.test.ts` | ce que l'utilisateur voit, dans Chromium | — |
| `test/fingerprint.test.ts` | ce que l'empreinte garde, replie, et ignore ; écrit celle de la fixture | — |
| `test/fixture/.crypte/fingerprint.json` | l'empreinte commitée de la fixture, sous régime de verrouillage | `git diff --exit-code` en CI |
| `test/guide.test.ts` | exécute les exemples de `docs/guide.md` | — |

## `packages/react` — `@crypte/react`

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `src/index.ts` | adaptateur, montage React | la page de preview |
| `src/stories.ts` | `defineStories`, `story`, et les types qu'ils inferent | un fichier de story |
| `test/public-augmentation.ts` | augmentation par la porte d'entrée publique | `core/test/no-plugin.test.ts` |
| `test/tsconfig.json` | programme du test ci-dessus | idem |

## `apps/demo` — privé, le projet témoin qui rend

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `crypte.config.ts` | un vrai adaptateur React, un alias `@/`, une entrée CSS | `crypte dev` |
| `src/components/Badge.tsx` | composant d'exemple, deux props documentées | `stories/Badge.tsx` |
| `src/components/Boom.tsx` | composant qui échoue exprès | `stories/Boom.tsx` |
| `stories/` | quatre stories, dont une qui ne rend jamais | le catalogue |
| `.crypte/fingerprint.json` | son empreinte, commitée sous régime de verrouillage | `git diff --exit-code` |

Distinct de `packages/cli/test/fixture`, qui n'a ni `package.json` ni React et n'en aura pas : elle éprouve la lecture d'un projet **sans** TypeScript ni dépendances déclarées, ce qu'aucun autre projet du dépôt ne fait.

## `apps/shell` — privé, jamais publié

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `index.html` | page du shell, la seule qu'il porte | le navigateur |
| `src/main.ts` | montage de l'application Vue | `index.html` |
| `src/App.vue` | arbre des stories, sélection, panneau d'erreur | `main.ts` |

Construit à l'avance et copié dans `packages/cli/dist/shell`. La page de la preview n'est plus ici : elle est servie par le CLI et compilée par le Vite du projet, faute de quoi elle imposerait Vue et React à un projet qui n'en veut pas. Voir `docs/decisions.md`.
| `src/env.d.ts` | déclarations pour Vite et les fichiers `.vue` | le compilateur |

## `docs` — public, en anglais à terme

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `contracts.md` | les quatre contrats, fait foi | toutes les PRD |
| `decisions.md` | ce qu'on a choisi, écarté, et ce qui rouvrirait le choix | qui se demande pourquoi |
| `guide.md` | comment installer Crypte sur un projet, en anglais | l'utilisateur, le futur site |

## `docs/internal` — notes du mainteneur, en français

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `architecture.md` | rôle de chaque mécanisme et ce qui casse sans lui | qui modifie le dépôt |
| `arborescence.md` | ce fichier | qui cherche où se trouve quoi |
| `plugins.md` | catalogue des dix-sept plugins et des phases | la planification |
| `suivi.md` | points de revue arbitrés, non corrigés | la revue, qui ne les re-signale plus |
| `pistes-shell.md` | propositions issues de l'exploration d'interface, non arbitrées | qui ouvrira les lots du shell |
| `placement-ui.md` | ce qui est public dans `core/ui`, ce qui reste dans le shell, et le prix | les lots 7 à 9, la bibliothèque Figma |
| `spec-journal.md` | l'historique des versions de la spécification, v0.1 à v0.9 | qui cherche pourquoi un contrat a changé |
| `test-format-stories.md` | test du format sur cinq composants réels, **périmé sur trois points** | historique |
