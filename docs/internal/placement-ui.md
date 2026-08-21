# Crypte, placement de l'UI

> Où vit chaque morceau d'interface, et ce que coûte de le rendre public. Le découpage sort de l'exploration d'interface croisée avec le catalogue de `plugins.md`.
>
> `contracts.md` fait foi sur les contrats. `pistes-shell.md` porte les propositions non arbitrées. Ce fichier ne tranche qu'un placement, ce qui reste révisable tant qu'aucun paquet n'est publié, et plus du tout après.

---

## 1. La règle, et son prix

La règle est déjà écrite dans `CLAUDE.md` :

> Par défaut dans `apps/shell`. On ne le promeut vers `core/ui` que lorsqu'un plugin réel en a besoin, jamais par anticipation : `core/ui` est une API publique qu'on ne peut plus retirer une fois publiée.

Ce qu'il faut y ajouter, c'est le prix exact. `@crypte/core` n'a **aucune dépendance d'exécution** et déclare `vue` en peer optionnelle. Publier un composant Vue dans `core/ui` rend Vue et Reka publics.

**Le prix n'est pas le poids, à une condition.** Reka n'est installé nulle part aujourd'hui, vérifié : ni dans `apps/shell/package.json`, ni dans le lockfile. Le shell l'emploiera pour son arbre, sa palette et ses popovers, et c'est **ce jour-là** qu'un plugin prenant sa primitive dans `core/ui` cessera d'ajouter quoi que ce soit au paquet livré. Tant que le shell ne l'utilise pas, publier une primitive Reka ajoute bien une dépendance d'exécution.

Le chiffre de 59 Ko d'`architecture.md` ne dit rien de ce budget : il mesure l'absence de React dans le bundle du shell, sur un arbre où Reka n'existe pas. Il est à remesurer après l'installation, pas à invoquer.

Ce qui est cher et ne dépend d'aucune condition, c'est la surface publique, qu'on ne peut plus retirer.

**Le danger, lui, est bien réel.** Si un plugin n'a pas de primitive publiée, il embarquera la sienne, donc sa propre copie de Reka, et on retombe sur la contrainte structurelle numéro 1 : deux instances du même module, contextes `provide` et `inject` dédoublés en silence. Ne rien publier n'est donc pas l'option prudente.

### Le critère

**Deux consommateurs minimum**, comptés sur le catalogue de plugins et pas estimés. Un seul consommateur, ça reste chez lui.

### La promotion se déclenche dès la phase 1

`@crypte/controls` est un paquet séparé qui ne peut pas importer depuis `apps/shell`, privé. Il n'a donc que deux issues : prendre ses champs dans `core/ui`, ou embarquer les siens. Il n'y a **aucun étagement possible** : le premier plugin de la phase 1 paie déjà le prix.

---

## 2. Les deux formes de panneau

Le catalogue impose les deux. Quatre plugins n'ajoutent qu'un corps, quatre ont besoin de leur en-tête.

| Plugin | Ce dont son panneau a besoin | Forme |
| -- | -- | -- |
| `controls` | champs mappés sur `details`, rien dans l'en-tête | simple |
| `source` | un bloc de code et sa copie | simple |
| `docs` | description, table de props, lien Figma | simple |
| `coverage` | table de taux et de compteurs | simple |
| `a11y` | violations, et relancer l'analyse | complète |
| `actions` | journal, vider et mettre en pause | complète |
| `comments` | fils, filtre des résolus, champ de saisie en pied | complète |
| `interactions` | étapes et verdicts, commandes de lecture | complète |

**Forme simple.** Le plugin rend un corps et déclare qu'il est sans objet. Le shell dessine le cadre, décide du repli, et applique la règle du sans objet lui-même.

**Forme complète.** Le plugin rend le panneau entier, **en composant la primitive publiée**. Il gagne son en-tête et son pied ; il ne gagne pas le droit de refaire le cadre. Sans cette limite, huit plugins auront huit en-têtes différents et le shell ne pourra plus replier ce qu'il ne dessine pas.

**Les plugins sans panneau du tout**, à ne pas oublier dans le contrat : `responsive`, `theme`, `rtl` et `inspect` ne contribuent qu'à la toolbar ; `grid` et `diff` visent la zone `page` ; `visual-tests`, `mock` et `links` n'ont pas de surface `ui`.

---

## 3. L'inventaire

### 3.1 Public dans `core/ui`

| Primitive | Consommateurs |
| -- | -- |
| Cadre de panneau : en-tête, libellé, emplacement d'actions, corps, pied | 8 : `controls`, `a11y`, `docs`, `source`, `actions`, `comments`, `coverage`, `interactions` |
| Ligne « sans objet », avec sa raison écrite | les mêmes 8 |
| Ligne à gouttières fixes, quatre états | 6 : `a11y`, `actions`, `coverage`, `comments`, `docs`, `diff` |
| Bouton et bascule de toolbar | 6 : `responsive`, `theme`, `rtl`, `inspect`, `grid`, `diff` |
| Bloc de code, avec sa copie | 4 : `source`, `docs`, `a11y`, `diff` |
| Famille de champs mappée sur `details` : texte, nombre, select, bascule, groupe de bascules, étiquettes, curseur | 4 : `controls` pour toute la famille, `responsive`, `theme`, `comments` |
| Marqueur d'état : statut, sévérité, verdict, compteur | 4 plugins, plus le statut du composant côté shell |
| Table à en-tête de colonnes | 3 : `docs`, `coverage`, `diff` |
| Segmenté à l'intérieur d'un corps de panneau | 3 : `a11y`, `comments`, `interactions` |
| Popover ancré à un bouton de toolbar | 2 : `theme`, `responsive` |

Les tokens, en variables CSS, sont publics aussi. C'est la surface au meilleur rapport : un contrat qui n'enferme dans aucun framework.

### 3.2 Reste dans `apps/shell`

Aucun plugin ne les dessine, donc rien ne justifie de les rendre publics.

L'arbre avec ses intertitres, son guide vertical et son échelle d'états. Le filtre de statut. La palette. Le fil d'Ariane. La toolbar elle-même, dont les plugins ne remplissent que des emplacements. Le canvas. La barre d'état. Les trois modes et leurs transitions. La page composant. Le mode changements. La cascade des props. Les états nu, d'attente, d'erreur et de premier lancement.

### 3.3 Reste dans son plugin

Un seul consommateur chacun, donc pas de promotion.

Le fil de commentaires de `comments`. Les commandes de lecture de `interactions`. La jauge de taux de `coverage`, que `visual-tests` ne rattrape pas puisqu'il n'a pas de surface `ui`. La vue à deux volets de `diff`. La grille de vignettes de `grid`.

**La frise des événements appartient à `comments`**, pas au noyau. Un commentaire est un événement du composant au même titre qu'un changement de version : les séparer en deux plugins obligeait l'un à lire les données de l'autre, ce que le contrat ne prévoit pas. `comments` contribue donc à deux zones, le panneau pour les fils et la zone `page` pour la frise.

Il en découle une dégradation à prévoir : `comments` dépend de `crypte serve`, puisqu'un site statique ne peut rien écrire, alors que la frise ne lit qu'une empreinte déjà commise. **La frise doit fonctionner sans le serveur**, sinon un déploiement statique la perd sans raison.

---

## 4. Ce que ça change dans le dépôt

**`packages/core/package.json`.** Ajouter `reka-ui` en peer, et **garder les deux optionnelles**. npm ne sait pas exprimer une peer par entrée : un projet React qui installe `@crypte/react` ne se sert que de `/preview` et `/protocol`, lui exiger Vue lui vaudrait un avertissement, et une erreur avec pnpm en peers stricts. L'exigence réelle, Vue et Reka pour l'entrée `ui`, est donc portée par la documentation et par le test, pas par le manifeste.

**`packages/core/test/isolation.test.ts`.** Il ne suit que les imports **relatifs**, donc il ne peut pas voir un import de `vue`. Il faut lui ajouter le relevé des imports nus par entrée, et l'ensemble attendu : `protocol` aucun, `preview` aucun, `ui` uniquement `vue` et `reka-ui`. Sans ça, rien n'empêche `protocol` de tirer Vue par accident.

**`docs/contracts.md`, section 6.** `UIContribution` avec les deux formes de panneau, le sans objet déclaré, les commandes de palette et la zone `page`. C'est `DCJ-194`.

**`docs/internal/plugins.md`.** La ligne qui range « Sidebar, recherche, panneaux, thème de l'interface » dans `Noyau (@crypte/core/ui)` date d'avant toute décision d'interface. Elle devient `apps/shell`, à l'exception des primitives listées en 3.1. Le catalogue doit aussi passer de quinze à dix-sept plugins avec `coverage` et `diff` : c'est `DCJ-202`.

**Le Lot 7.** Ne produit plus seulement des tokens mais la bibliothèque Figma dont la page `Primitives` est la liste 3.1.

**Ce qui ne change pas.** Aucune dépendance d'exécution ajoutée au noyau, une peer n'en est pas une. Le poids du shell. L'étanchéité des trois entrées.

---

## 5. Pour la bibliothèque Figma

Trois pages, dans cet ordre de dépendance : `Variables`, puis `Primitives` qui est la liste 3.1, puis `Cadre du shell` qui est la liste 3.2, **marqué non public**. Sans ce marquage, la bibliothèque laisse croire que tout est réutilisable.

Deux axes de variantes viennent de règles qu'il serait coûteux de redécouvrir.

**Sur la ligne, un axe `contexte`, navigation ou panneau.** Les deux budgets de fond ne sont pas décoratifs. En navigation, le fond paie les états, repos, survol et courant, et la structure passe par le retrait, le chevron, la graisse et le guide vertical. En panneau, il n'y a pas d'état courant, donc le fond est libre et la bande veut dire « ceci se plie sur place ». Une seule ligne à un seul jeu de fonds et le survol redevient illisible sur les composants.

**Sur le cadre de panneau, un axe `forme`**, simple ou complète, pour que les huit plugins se posent visiblement sur la même base.

**Le focus n'est pas un état de fond** mais une bordure intérieure, précisément pour se superposer aux trois autres au lieu d'entrer en concurrence avec eux. En Figma, une variable d'effet, pas une variante de plus.

---

## 6. Ce qui reste à trancher

**La palette.** Le Lot 7 décrivait émeraude vers cobalt en ratio 75 pour 25 ; l'exploration a été menée sans charte et n'a pas suivi cette direction. À choisir avant de créer les variables, parce qu'après elles seront liées partout.

**Le rendu de la ligne « sans objet »** existe en deux endroits, écrite par le shell en forme simple, par le plugin en forme complète. À vérifier sur écran que c'est bien le même objet.

**L'hypothèse qui invaliderait tout ce fichier :** qu'un tiers doive pouvoir construire son propre shell sur `core/ui`. Rien dans le dépôt ne le suggère aujourd'hui, et `apps/shell` est privé. Si ça devient un objectif, le partage 3.1 contre 3.2 est à refaire entièrement.
