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
| `.github/workflows/ts7-readiness.yml` | sonde mensuelle sur `vue-tsc` | personne, ouvre une issue |
| `.github/dependabot.yml` | veille sur les actions GitHub | Dependabot |
| `.vite-hooks/pre-commit` | lance `vp staged` | Git, avant chaque commit |
| `test/mutation-check.mjs` | casse chaque garantie, attend un test rouge | `pnpm run mutations`, la CI |
| `test/mutations.json` | catalogue des garanties, une par constat de revue | le script ci-dessus |
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
| `test/fixture/` | projet imité, aux contraintes réelles | `test/project.test.ts` |

## `packages/react` — `@crypte/react`

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `src/index.ts` | adaptateur, montage React | la page de preview |
| `test/public-augmentation.ts` | augmentation par la porte d'entrée publique | `core/test/no-plugin.test.ts` |
| `test/tsconfig.json` | programme du test ci-dessus | idem |

## `apps/shell` — privé, jamais publié

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `index.html` | page du shell | le navigateur |
| `preview.html` | page de la preview, chargée en iframe | le navigateur |
| `src/main.ts` | montage de l'application Vue | `index.html` |
| `src/App.vue` | interface du shell | `main.ts` |
| `src/preview.tsx` | branchement canal et adaptateur | `preview.html` |
| `src/Badge.tsx` | composant codé en dur, faute de découverte | `preview.tsx` |
| `src/env.d.ts` | déclarations pour Vite et les fichiers `.vue` | le compilateur |

## `docs`

| Fichier | Contient | Consommé par |
| -- | -- | -- |
| `spec-contrats.md` | les quatre contrats, fait foi | toutes les PRD |
| `architecture.md` | rôle de chaque mécanisme et ce qui casse sans lui | qui modifie le dépôt |
| `arborescence.md` | ce fichier | qui cherche où se trouve quoi |
| `plugins.md` | catalogue des plugins et phases | la planification |
| `suivi.md` | points de revue arbitrés, non corrigés | la revue, qui ne les re-signale plus |
| `test-format-stories.md` | test du format sur cinq composants réels | historique |
