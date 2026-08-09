# Crypte, catalogue des plugins

> Liste de référence des plugins prévus, de leur nom et de leur position dans la feuille de route. Ce document ne décrit pas leur fonctionnement : chaque plugin aura sa propre PRD.

---

## Principes de nommage

**Les noms techniques établis priment sur l'identité de marque.** Un développeur doit reconnaître `controls` et `a11y` sans lire la documentation. Le champ sémantique de Crypte vit dans le produit et la documentation, pas dans les noms de paquets.

Quand aucune convention ne domine, le nom est choisi pour être transparent plutôt que court.

**Tout est scopé sous `@crypte`.** Le nom nu `crypte` est refusé par npm, jugé trop proche de `crypto` (voir `spec-contrats.md`, journal v0.4).

---

## Phases

| Phase | Nom | Ce qui change à l'issue de la phase |
|---|---|---|
| 1 | Isoler | Un composant sort de l'application et s'affiche seul |
| 2 | Outiller | L'outil devient fiable et agréable au quotidien |
| 3 | Collaborer | Les designers écrivent dedans au lieu de seulement lire |
| — | Plus tard | Réserve, sans engagement de date |

> Noms de phases à confirmer. Ils n'apparaissent nulle part ailleurs, les changer ne coûte rien.

---

## Les quinze plugins

Chaque plugin est un projet distinct, avec sa propre PRD et ses issues. Les surfaces correspondent au contrat défini en section 6 de `spec-contrats.md`.

### Phase 1 — Isoler

| Paquet | Rôle | Surfaces |
|---|---|---|
| `@crypte/controls` | Édition des props en live | ui, preview |

Un seul plugin en phase 1, volontairement. Il sert à éprouver le contrat de plugin avant l'adaptateur Vue : si l'API doit bouger, un seul plugin est à corriger.

### Phase 2 — Outiller

| Paquet | Rôle | Surfaces |
|---|---|---|
| `@crypte/a11y` | Vérification d'accessibilité (axe-core) | ui, preview |
| `@crypte/visual-tests` | Régression visuelle | node |
| `@crypte/docs` | Table de props depuis TypeScript et JSDoc | node, ui |
| `@crypte/source` | Code source copiable | node, ui |
| `@crypte/responsive` | Largeurs et test responsive | ui, preview |
| `@crypte/theme` | Thèmes clair et sombre, fonds | ui, preview |
| `@crypte/actions` | Journal des événements | ui, preview |

`a11y` vient en premier. Avec `controls`, il forme le couple qui valide le contrat de plugin : le premier écrit dans la story, le second se contente de la lire. Tant que ces deux-là n'existent pas, le contrat reste modifiable sans procédure.

`theme` absorbe ce que Storybook sépare en `themes` et `backgrounds`. Changer le fond du canvas et changer le thème appliqué au composant relèvent du même panneau.

### Phase 3 — Collaborer

| Paquet | Rôle | Surfaces |
|---|---|---|
| `@crypte/comments` | Commentaires et review sur les stories | ui, node |

Dépend de `crypte serve`, qui n'est pas un plugin mais une commande du CLI : un site statique ne peut rien écrire. Un commentaire porte une URL libre, ce qui permet de le lier à un ticket sans que Crypte connaisse Linear, Jira ou GitHub.

### Plus tard

| Paquet | Rôle | Surfaces |
|---|---|---|
| `@crypte/interactions` | Tests d'interaction | node, ui, preview |
| `@crypte/mock` | Mock d'API et date figée | node, preview |
| `@crypte/links` | Navigation entre stories | preview |
| `@crypte/rtl` | Sens de lecture inversé | ui, preview |
| `@crypte/inspect` | Marges, contours, mesures | ui, preview |
| `@crypte/grid` | Variantes côte à côte | ui |

`inspect` fusionne ce que Storybook sépare en `measure` et `outline`. Deux réglages du même panneau.

`grid` mérite une mention : c'est lui qui rend au design system la vue d'ensemble qu'un format de story à deux niveaux aurait apportée. Le nœud parent de la sidebar affiche les stories côte à côte ; cliquer sur une feuille isole. Il peut même regrouper des stories de composants différents, ce qu'un format hiérarchique n'aurait pas permis.

---

## Ce qui n'est pas un plugin

| | Nature |
|---|---|
| `crypte dev`, `crypte build` | Commandes du CLI |
| `crypte check` | Commande du CLI, vérifie stories orphelines et composants sans story |
| `crypte init` | Commande du CLI, initialise un projet existant |
| `crypte serve` | Commande du CLI, sert l'instance éditable et l'écriture en pull request |
| Sidebar, recherche, panneaux, thème de l'interface | Noyau (`@crypte/core/ui`) |
| `wrap`, décorateurs | Format de story, résolu par l'adaptateur |

---

## Écarté volontairement

**Registre de composants partagés entre équipes**, dans l'esprit de Bit. Ce n'est pas un plugin mais un autre produit, avec un serveur et une base de données.

**Composition de plusieurs instances** en une seule vue, l'équivalent de Storybook Composition. N'a de sens qu'à partir de trois ou quatre équipes.

**Support MDX.** Ajoute une chaîne de compilation entière pour un gain que `docs` couvre largement.

**Télémétrie.** Non.

---

## Rappel

Sans aucun plugin installé, Crypte affiche des composants isolés avec rechargement à chaud. Trois ou quatre plugins suffisent à en faire un outil utile.

C'est précisément l'argument à opposer à qui trouve Storybook trop lourd : quinze plugins existent, mais rien de ce qui n'est pas installé n'est chargé.
