# Crypte, catalogue des plugins

> Liste de référence des plugins prévus, de leur nom, de leur statut économique et du chantier qui les porte. Ce document ne décrit pas leur fonctionnement : chaque plugin a son issue.

Réécrit le 21 août 2026 à la refonte de la roadmap. La version précédente datait de la première passe et ne connaissait ni les douze plugins pensés pour la licence, ni la frontière gratuit/payant, ni cinq conflits de noms.

---

## Principes de nommage

**Les noms techniques établis priment sur l'identité de marque.** Un développeur doit reconnaître `controls` et `a11y` sans lire la documentation. Le champ sémantique de Crypte vit dans le produit et la documentation, pas dans les noms de paquets.

Quand aucune convention ne domine, le nom est choisi pour être **transparent plutôt que court**.

**Tout est scopé sous `@crypte`.** Le nom nu `crypte` est refusé par npm, jugé trop proche de `crypto`, voir `contracts.md`, journal v0.4.

### Cinq conflits de noms, tranchés

Le document de monétisation du 20 août nommait cinq plugins autrement, en reprenant le vocabulaire de Storybook. **Les noms de ce fichier l'emportent**, parce qu'ils sont déjà raisonnés par écrit.

| Retenu | Écarté | Raison |
| --- | --- | --- |
| `theme` | `themes` + `backgrounds` | changer le fond du canvas et changer le thème appliqué relèvent du même panneau |
| `responsive` | `viewport` | transparent plutôt que court |
| `docs` | `docgen` | le plugin dessine une table, il ne génère pas un document |
| `visual-tests` | `snapshot-local` | et il reste gratuit, voir ci-dessous |
| `coverage` | `usage-finder` | il fait les deux choses, pas seulement la seconde |

---

## Statut économique

Trois valeurs. Le détail du dispositif, la vérification de licence et le comptage vivent hors de ce dépôt, avec le code qu'ils concernent.

| Statut | Sens |
| --- | --- |
| **gratuit** | MIT, publié sur npm, nécessaire pour adopter Crypte et atteindre la parité Storybook |
| **licence** | tourne en local aussi, mais outillage interactif profond. Payant, clé, zéro serveur. Jamais publié en MIT |
| **service** | nécessite que Crypte opère un backend. Pas un plugin |

**Critère de tri.** Est gratuit tout ce qui est nécessaire pour adopter Crypte. Est sous licence l'outillage interactif profond qui fait gagner des heures à un pro et que l'IA ne réplique pas.

**La règle qui découle de la leçon Tailwind : ne jamais vendre du contenu statique, clonable par un prompt. Vendre de l'outillage interactif.**

Un plugin peut être coupé en deux, basique gratuit et avancé sous licence. Trois le sont : `a11y` et `audit`, `tokens` et `tokens-inspector`, `coverage` et `usage-finder`.

---

## Chantiers

Les phases `Isoler / Outiller / Collaborer` sont retirées. Elles portaient la mention « à confirmer, les changer ne coûte rien » depuis l'origine, et le séquencement issu de la refonte ne les suit plus.

| Phase | Ce qui change à l'issue |
| --- | --- |
| `1` | l'outil est utilisable et son quatrième contrat est figé |
| `2` | il est différencié, et installable par quelqu'un qui ne nous connaît pas |
| `3` | on écrit dedans, et il y a quelque chose à vendre |
| `R` | réserve, sans engagement de date |

Chaque projet du tracker porte un **sous-numéro** qui donne son ordre dans la phase, de `1.1` à `3.3`. `R` n'en a pas : il n'a aucun voisin à départager, et lui donner une position dans une séquence contredirait « sans engagement de date ».

**La liste des projets n'est pas recopiée ici.** Ce fichier explique la convention, le tracker porte les instances : treize noms recopiés dans un document pourriraient au premier renommage. Les titres ci-dessous portent le numéro du projet qui les tient, et c'est le seul endroit où les deux se touchent.

---

## `1.3` Contrat de plugin

| Paquet | Rôle | Surfaces | Statut |
| --- | --- | --- | --- |
| `@crypte/controls` | édition des props en live | ui, preview | gratuit |
| `@crypte/a11y` | vérification d'accessibilité, axe-core | ui, preview | gratuit |

**Ces deux-là ne sont pas dans le chantier d'outillage, et c'est voulu : ils ont une fonction de contrat.** `contracts.md` §6.5 pose la condition, le contrat de plugin est stable une fois éprouvé par deux plugins aux besoins opposés. `controls` écrit dans la story, `a11y` se contente de la lire.

Tant que les deux n'existent pas, la section 6 change sans procédure. Après, tout changement est une rupture.

`controls` vient seul en premier : si l'API doit bouger, un seul plugin est à corriger.

---

## `2.3` Entrée tokens

**Écrit, moitié `node`, le 24 août 2026.** Il lit les variables CSS de la feuille que le projet déclare et en contribue des entrées `TokensEntry`, une par famille. La moitié `preview`, qui résoudrait les valeurs effectives par `getComputedStyle`, attend que `PreviewHooks` soit spécifié, ce qui demande son propre consommateur.

Les trois autres sources de la fiche, DTCG, `tokens.ts` et Tailwind, ne sont pas écrites : ce plugin existait pour éprouver la surface `node` avant qu'elle soit figée, pas pour être complet.

| Paquet | Rôle | Surfaces | Statut |
| --- | --- | --- | --- |
| `@crypte/tokens` | découverte et lecture des tokens | node, puis preview | gratuit |

Sorti de la réserve de `contracts.md` §7 à la refonte. Deux raisons : zeroheight et Supernova ont tous les deux un Token Manager, et c'est **le premier plugin à écrire dans le manifeste**, donc celui qui éprouve `NodeHooks` avant qu'il soit figé.

Le partage est celui qui existe déjà pour les props : le type `TokensEntry` dans le noyau, la découverte et la lecture dans le plugin. La ligne n'est pas « important ou pas », c'est **produire de la donnée contre l'afficher**.

Deux surfaces et non une : `node` découvre les noms et les sources, `preview` résout les valeurs effectives, `getComputedStyle` étant le seul moyen d'avoir des valeurs justes en clair comme en sombre.

---

## `2.2` Outillage quotidien

| Paquet | Rôle | Surfaces | Statut |
| --- | --- | --- | --- |
| `@crypte/docs` | table de props depuis TypeScript et JSDoc | node, ui | gratuit |
| `@crypte/source` | code d'appel affiché et copiable | node, ui | gratuit |
| `@crypte/theme` | thèmes clair et sombre, fonds du canvas | ui, preview | gratuit |
| `@crypte/responsive` | largeurs et points de rupture | ui, preview | gratuit |
| `@crypte/actions` | journal des événements émis | ui, preview | gratuit |
| `@crypte/visual-tests` | régression visuelle sur baseline locale | node | gratuit |
| `@crypte/coverage` | props jamais exercées, et usage réel des composants | node, ui | gratuit |

`theme` absorbe ce que Storybook sépare en `themes` et `backgrounds`.

`actions` est le premier et seul usage démontré de `ctx.props` modifiable dans `beforeMount`, cas écrit en `contracts.md` §6.4.

`coverage` fait deux choses. Sans rien scanner, il croise `details` et les props propres de chaque story pour dire ce qui n'est documenté nulle part. En prolongeant le parcours de `crypte check`, il compte les usages réels dans l'application. Le second point justifie à lui seul que ce soit un plugin : le noyau n'a aucune raison de savoir lire le code applicatif.

### Deux plugins que la monétisation voulait payants, et qui restent gratuits

**`visual-tests`.** Il portait le nom `snapshot-local` et l'argument « Chromatic sans la facture cloud ». Il reste gratuit parce que c'est lui qui porte le **rendu visuel des pull requests**, la seule fonctionnalité qu'aucun des quatre concurrents ne propose, et la seule que Backlight avait mise en tête de son argumentaire. En faire un produit payant la retire de l'argumentaire d'adoption au moment où elle sert le plus.

La version qui se vend est ailleurs : `visual-regression` multi-navigateurs, en service cloud, qui est le seul revenu prouvé du marché. Ce plugin local n'y fait pas concurrence, il y amène.

**`coverage`.** Il portait le nom `usage-finder`. Il reste gratuit parce qu'une métrique dérivée du code **est** le différenciateur du projet, pas un supplément. C'est aussi lui qui rend inutile un service cloud entier, les analytics d'usage de documentation de zeroheight, en répondant avant qu'on ait posé la question.

---

## Plugins par défaut

**Décision : `docs`, `controls` et `tokens` sont activés par défaut, et désactivables.**

Le CLI les déclare en dépendance et les active quand aucune configuration ne dit le contraire. La dépendance va dans le bon sens : c'est le CLI qui dépend des plugins, jamais le noyau.

| Situation | Comportement |
| --- | --- |
| pas de fichier de configuration | on prend le préréglage |
| fichier de configuration sans champ `plugins` | on prend le préréglage |
| champ `plugins` défini | on prend **exactement** ce qui est listé |

Le CLI exporte un tableau `defaultPlugins` à étaler, pour qui veut le préréglage plus les siens. **Personne ne se demande jamais d'où sort un plugin qu'il n'a pas écrit.**

**Contrainte dure qui vient avec : un plugin par défaut doit être invisible quand il n'a rien à dire.** Pas de section vide dans la sidebar, pas de message « aucun token détecté ». C'est la règle `inapplicable` de `decisions.md`, et elle cesse d'être du confort ici : ces trois plugins tournent chez des gens qui ne les ont pas demandés.

---

## `R` Réserve gratuite

Sept plugins au catalogue, sans engagement de date.

| Paquet | Rôle | Surfaces |
| --- | --- | --- |
| `@crypte/interactions` | tests d'interaction | node, ui, preview |
| `@crypte/mock` | mock d'API et date figée | node, preview |
| `@crypte/links` | navigation entre stories | preview |
| `@crypte/rtl` | sens de lecture inversé | ui, preview |
| `@crypte/inspect` | marges, contours, mesures | ui, preview |
| `@crypte/grid` | variantes côte à côte | ui |
| `@crypte/diff` | deux stories du même composant, côte à côte | ui |

`inspect` fusionne ce que Storybook sépare en `measure` et `outline`. Deux réglages du même panneau.

`grid` mérite une mention : c'est lui qui rend au design system la vue d'ensemble qu'un format de story à deux niveaux aurait apportée. Le nœud parent de la sidebar affiche les stories côte à côte, cliquer sur une feuille isole. Il peut même regrouper des stories de composants différents, ce qu'un format hiérarchique n'aurait pas permis.

`diff` monte deux previews à la demande, ce qui est très différent d'en monter sept par défaut. Il partage sa mécanique avec `grid` et sort après lui.

**Deux pistes venues du document de monétisation, non retenues comme paquets distincts.** `density`, échelles de densité et zoom 200 % WCAG, et `i18n-preview`, langues, RTL et pseudo-localisation. La seconde est un surensemble de `rtl`, qui est la moitié démontrée. Ni l'une ni l'autre n'a de cas réel : elles restent nommées ici pour ne pas être redécouvertes.

---

## `R` Réserve sous licence

Douze plugins pensés pour la frontière payante. **Aucun n'a jamais été publié, donc tous restent libres de licence.** Aucun ne se développe avant que la frontière soit écrite.

| Paquet | Justification |
| --- | --- |
| `motion` | **vaisseau amiral** : éditeur de timeline d'animations, scrubber, courbes. Unique sur le marché, purement interactif, non réplicable par un prompt |
| `editor` | édition visuelle en local : tokens, props, courbes. Crypte réécrit les fichiers source par codemod, sans service |
| `audit` | rapport complet en local ou en CI : couverture WCAG, contrastes tous thèmes, valeurs en dur, composants sans story. Exportable |
| `states-matrix` | grille de tous les états croisés aux thèmes, d'un coup. Gain quotidien, pain point Storybook connu |
| `usage-finder` | où chaque composant est utilisé, avec quelles props. « Omlet en local, sans abonnement » |
| `deps-graph` | graphe d'impact entre composants. Valeur qui grandit avec l'équipe |
| `props-fuzzer` | génération de cas extrêmes |
| `tokens-inspector` | chaînes de résolution, diff entre thèmes, détection des valeurs en dur |
| `theme-builder` | création et édition visuelle de thèmes, export DTCG |
| `recorder` | on clique dans le composant, Crypte génère le test correspondant |
| `portal` | export statique white-label, le design system aux couleurs de l'entreprise |
| `workspace` | agrégateur monorepo, plusieurs ateliers fusionnés en un portail |

**Le nom « Crypte Pro » est écarté.** Le pack sous licence portera un nom de l'univers dark fantasy. Pistes non tranchées : Reliquaire, Arcane, Sceau.

**Attention sur `portal` et `workspace`.** Ce sont les deux plus proches du contenu statique, donc les deux que la leçon Tailwind menace le plus. À réexaminer avant de les développer.

---

## `3.2` Ce qui dépend de `crypte serve`

| Paquet | Rôle | Surfaces | Statut |
| --- | --- | --- | --- |
| `@crypte/comments` | commentaires et review sur les stories | ui, node | gratuit en mono-utilisateur |

`comments` dépend de `crypte serve`, qui n'est pas un plugin mais une commande du CLI : un site statique ne peut rien écrire.

Un commentaire porte une URL libre, ce qui permet de le lier à un ticket sans que Crypte connaisse Linear, Jira ou GitHub. Et il s'ancre sur un identifiant **et** un état du manifeste, donc on sait s'il porte encore sur la même chose.

Le plugin suit la ligne de partage de `serve` : gratuit en mono-utilisateur, payant en multi. Le service cloud `comments` en est la version hébergée, et c'est un autre produit.

---

## Ce qui n'est pas un plugin

| | Nature |
| --- | --- |
| `crypte dev`, `crypte build` | commandes du CLI |
| `crypte check` | commande du CLI, vérifie stories orphelines et composants sans story |
| `crypte init` | commande du CLI, initialise un projet existant |
| `crypte serve` | commande du CLI, sert l'instance éditable et l'écriture en pull request |
| Serveur MCP local | binaire en stdio qui lit le manifeste. Une centaine de lignes, gratuit par stratégie, DCJ-237 |
| Skill de génération de stories | un skill versionné dans le dépôt, DCJ-238 |
| Export au format Storybook | un drapeau sur `crypte build`, jamais un plugin, DCJ-241 |
| Poids de chaque plugin au build | mesure du CLI, DCJ-193. Le document de monétisation l'appelait `bundle-weight` |
| Arbre, recherche, palette, cadre des panneaux, thème de l'interface | `apps/shell`, privé |
| Les primitives qu'au moins deux plugins dessinent | noyau, `@crypte/core/ui`, voir `placement-ui.md` |
| `wrap`, décorateurs | format de story, résolu par l'adaptateur |
| Entrée `page` | entrée du manifeste, pas un plugin. Le contenu est rédigé, pas dérivé |

**La migration depuis Storybook** est un skill ou une commande, pas un plugin. Gratuite malgré sa valeur : c'est la meilleure arme d'adoption, et une conversion automatique des stories CSF vaut plus en entrée qu'en revenu.

---

## Services cloud

Douze services conservés en réserve. Ils ne sont pas des plugins, ils ne vivent pas dans ce dépôt, et ils ne se construisent pas avant d'avoir une base d'utilisateurs.

`hosting`, `comments`, `visual-regression`, `pr-bot`, `visual-edit`, `design-sync`, `radar`, `conformité`, `guichet`, `parcours`, `oracle`, `orchestrateur`.

**Regard critique honnête :** la plupart ont déjà des équivalents. `radar` face à Omlet, `conformité` face à OverlayQA, le gardien face à ESLint custom plus CI, comme constaté en interne. Ils ne deviennent pertinents qu'avec des utilisateurs, et se différencieront par l'intégration native à Crypte plutôt que par la nouveauté.

Le seul revenu prouvé du marché est `visual-regression`, celui de Chromatic.

---

## Écarté volontairement

**Télémétrie dans le CLI. Non.** Aucune, jamais.

Ce qui existe est côté `serve` payant, et il est annoncé : dans le README, et dans le produit. Quatre règles le tiennent, dont deux qui comptent ici : l'appel ne bloque jamais, et il ne porte qu'une empreinte salée, un horodatage et un type d'événement, jamais un nom de dépôt en clair.

La distinction est écrite parce que confondre les deux est ce qui produit une télémétrie **découverte** au lieu d'annoncée, et sur un outil qui vit dans le code de ses utilisateurs, la première coûte infiniment plus cher que la seconde.

**Registre de composants partagés entre équipes**, dans l'esprit de Bit. Ce n'est pas un plugin mais un autre produit, avec un serveur et une base de données.

**Composition de plusieurs instances** en une seule vue, l'équivalent de Storybook Composition. N'a de sens qu'à partir de trois ou quatre équipes.

**Support MDX.** Ajoute une chaîne de compilation entière pour un gain que `docs` couvre largement.

**Gouvernance d'entreprise** (SSO, plages IP, rôles, permissions par styleguide). Abandonné sans réserve.

**Token Manager au sens de zeroheight et Supernova.** Le sens de circulation est l'inverse du nôtre.

**Analytics d'usage de la documentation.** La moitié utile est dans `coverage`.

---

## Rappel

Sans aucun plugin installé, Crypte affiche des composants isolés avec rechargement à chaud. Trois plugins par défaut en font un outil utile à la première commande.

C'est précisément l'argument à opposer à qui trouve Storybook trop lourd : le catalogue compte une trentaine d'entrées, mais **rien de ce qui n'est pas installé n'est chargé**.

Cette phrase est une promesse, donc elle a besoin d'un chiffre : c'est DCJ-193, le poids de chaque plugin affiché en barre d'état.
