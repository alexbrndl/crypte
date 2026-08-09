# Issues de la phase 1

> Contenu des jalons, labels et issues épiques à créer sur `alexbrndl/crypte`. Voir `plugins.md` pour le catalogue complet et les phases suivantes.

Seule la phase 1 est créée. Les projets des phases suivantes sont listés dans `plugins.md` : les créer maintenant remplirait le dépôt de coquilles vides pour des mois.

---

## 1. Jalons et labels

Sans date cible : le projet avance sur du temps libre, une date inventée ne servirait qu'à être ratée.

```bash
gh api repos/alexbrndl/crypte/milestones -f title="Isoler" \
  -f description="Un composant sort de l'application et s'affiche seul."
gh api repos/alexbrndl/crypte/milestones -f title="Outiller" \
  -f description="L'outil devient fiable et agréable au quotidien."
gh api repos/alexbrndl/crypte/milestones -f title="Collaborer" \
  -f description="Les designers écrivent dedans au lieu de seulement lire."

gh label create epic --color 5319E7 --description "Sous-projet, contient des sous-issues"
gh label create socle --color 0E8A16 --description "Noyau, CLI, adaptateur React"
gh label create controls --color 1D76DB --description "Plugin controls"
gh label create adaptateur-vue --color 1D76DB --description "Adaptateur Vue et bac à sable"
gh label create build --color FBCA04 --description "Build statique et déploiement"
```

---

## 2. Les quatre issues épiques

Toutes sur le jalon `Isoler`, label `epic` plus le label de sous-projet.

### Socle

**Titre :** `Socle : noyau, CLI et adaptateur React`
**Labels :** `epic`, `socle`

```markdown
Première brique. Tout le reste en dépend.

## Périmètre

- Monorepo : `@crypte/core` (`/protocol`, `/ui`, `/preview`), `@crypte/cli`, `@crypte/react`
- Implémentation du format de story : `defineStories`, `story`, `wrap`
- Découverte des fichiers de stories et génération du manifeste (Oxc)
- Serveur de développement Vite, rechargement à chaud
- Canal `postMessage` entre le shell et la preview
- Shell : sidebar arborescente, recherche, état dans l'URL, raccourcis clavier
- Adaptateur React : montage, démontage, application des props, `wrap`
- Commandes `crypte init` et `crypte check`

Les contrats sont figés dans `docs/spec-contrats.md`. Cette issue les implémente, elle ne les rediscute pas.

## Terminé quand

`crypte dev` lancé sur le projet cible affiche `OrderSummary` avec ses six stories, la navigation fonctionne, et modifier le composant rafraîchit la preview.

## Budgets

- Démarrage à froid sous 1,5 s sur le périmètre `checkout`
- Poids installé de `@crypte/cli` + `@crypte/react` sous 15 Mo
- Aucune configuration obligatoire au-delà du chemin des stories

## Hors périmètre

Panneau de controls, documentation automatique, tests visuels, build statique.

## Points de vigilance

- Le projet cible est en Vite 6, Vite+ vise Vite 7. À tester tôt.
- React Compiler actif sur le projet cible : vérifier son effet sur le rechargement à chaud et le remontage.
- Pas de `tsconfig.json` sur le projet cible, seulement un `jsconfig.json` avec l'alias `@/`. L'inférence doit dégrader proprement.
- `crypte check` ne doit signaler que les exports identifiés comme composants.
```

### controls

**Titre :** `controls : édition des props en live`
**Labels :** `epic`, `controls`

```markdown
Premier plugin, et première valeur perçue par un développeur qui ouvre l'outil.

Il sert aussi à éprouver le contrat de plugin. Un seul plugin avant l'adaptateur Vue : si l'API doit bouger, un seul est à corriger.

## Périmètre

- `@crypte/controls`, surfaces `ui` et `preview`
- Inférence des argTypes depuis les types TypeScript et le JSDoc
- Fusion par prop et champ par champ avec le bloc `controls` du fichier de story
- Panneau d'édition dans le shell, surcharges transmises par le canal
- Props HTML en pass-through non extraites, sauf `className`

## Terminé quand

Les props de `OrderSummary` s'éditent en direct depuis le panneau, et `progress` de `ProgressLoader` se pilote au curseur entre 0 et 100.

## Points de vigilance

- Les énumérations CVA ne sont pas inférables statiquement : `Badge` exigera une déclaration manuelle des options. Comportement attendu, pas un bug.
- Le JSDoc du projet de référence est riche : l'inférence devrait donner de bons résultats malgré l'absence de `tsconfig`.
```

### Adaptateur Vue

**Titre :** `Adaptateur Vue : le verrou de l'architecture`
**Labels :** `epic`, `adaptateur-vue`

```markdown
Le moment de vérité. Si la frontière a tenu, c'est un week-end et `controls` fonctionne sans modification.

## Périmètre

- `@crypte/vue` : montage, démontage, props, `wrap`, plugin Vite
- `defineStories` et `story` exportés depuis `@crypte/vue`
- Bac à sable Vue 3 dans le monorepo : trois ou quatre composants écrits pour l'occasion, dont un avec slots et un avec `provide` / `inject`

Un vrai projet Nuxt n'est pas nécessaire. Le bac à sable suffit à prouver que le noyau et les plugins ne contiennent rien de React.

## Terminé quand

Les composants du bac à sable s'affichent, et `controls` fonctionne dessus **sans aucune modification de son code**.

## Ce que cette issue révèle

Toute correction nécessaire dans `@crypte/core` ou dans `@crypte/controls` signale une fuite de React à travers la frontière. La corriger ici coûte peu ; la découvrir au douzième plugin coûte cher.
```

### Build et déploiement

**Titre :** `Build statique et déploiement continu`
**Labels :** `epic`, `build`

```markdown
Sans URL toujours à jour, l'outil n'existe pas pour les designers. Ce n'est pas du confort, c'est la condition d'usage.

## Périmètre

- `crypte build` : sortie statique déployable
- Workflow GitHub Actions déclenché sur `main`, en parallèle du déploiement applicatif et sans jamais le bloquer
- Déploiement sur une URL dédiée, protégée par authentification puisque le dépôt applicatif est privé
- Preview par pull request : un designer voit le composant modifié avant le merge

## Terminé quand

Un merge sur `main` met l'URL à jour sans intervention, et ouvrir une pull request produit une preview.

## Note d'architecture

Le shell interroge au démarrage une route de capacités et masque les fonctions d'écriture si elle est absente. Même bundle en statique et en `crypte serve`, la différence tient à un booléen. Une heure aujourd'hui, contre une réécriture en phase 3.

Pas besoin de trois rings ici : une seule instance depuis `main`.
```

---

## 3. Après création

```bash
gh issue list --repo alexbrndl/crypte --milestone Isoler
```

Les sous-issues seront créées au démarrage de chaque épique, à partir de sa PRD. Elles n'héritent pas automatiquement du jalon ni des labels du parent : les poser à la création.
