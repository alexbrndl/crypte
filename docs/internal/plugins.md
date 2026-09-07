# Crypte, catalogue des plugins

> Liste de référence des plugins prévus, de leur nom, de leur statut économique et du chantier qui les porte. Ce document ne décrit pas leur fonctionnement : chaque plugin a son issue.

Réécrit le 21 août 2026 à la refonte de la roadmap. La version précédente datait de la première passe et ne connaissait ni la frontière gratuit/payant, ni les conflits de noms. Le tri du 7 septembre 2026 l'a ramenée de trente entrées à vingt-trois.

---

## Principes de nommage

**Les noms techniques établis priment sur l'identité de marque.** Un développeur doit reconnaître `controls` et `a11y` sans lire la documentation. Le champ sémantique de Crypte vit dans le produit et la documentation, pas dans les noms de paquets.

Quand aucune convention ne domine, le nom est choisi pour être **transparent plutôt que court**.

**Tout est scopé sous `@crypte`.** Le nom nu `crypte` est refusé par npm, jugé trop proche de `crypto`, voir `contracts.md`, journal v0.4.

### Quatre conflits de noms, tranchés

Le document de monétisation du 20 août nommait quatre plugins autrement, en reprenant le vocabulaire de Storybook. **Les noms de ce fichier l'emportent**, parce qu'ils sont déjà raisonnés par écrit.

| Retenu | Écarté | Raison |
| --- | --- | --- |
| `theme` | `themes` + `backgrounds` | changer le fond du canvas et changer le thème appliqué relèvent du même panneau |
| `responsive` | `viewport` | transparent plutôt que court |
| `docs` | `docgen` | le plugin dessine une table, il ne génère pas un document |
| `visual-tests` | `snapshot-local` | et il reste gratuit, voir ci-dessous |

---

## Statut économique

Trois valeurs, et pas une quatrième. Le détail du dispositif, la vérification de licence et le comptage vivent hors de ce dépôt, avec le code qu'ils concernent.

| Statut | Sens |
| --- | --- |
| **gratuit** | MIT, publié sur npm |
| **payant** | tourne en local, jamais publié en MIT, clé et zéro serveur |
| **porté par `serve`** | dépend d'une commande qui n'est pas un plugin |

### Les deux familles du côté gratuit

Tout ce qui est gratuit appartient à l'une des deux, ce qui évite de se demander plugin par plugin.

**La parité.** Ce que Storybook fournit déjà gratuitement. Faire payer l'un d'eux revient à demander de l'argent pour égaler ce que l'utilisateur a déjà sans payer.

**Les différenciateurs d'adoption.** Ce qui donne une raison de venir, donc ce qui doit rester dans l'argumentaire d'entrée.

**Un plugin qui n'appartient à aucune des deux n'a aucune raison structurelle d'être gratuit.**

### Le test de réplicabilité, en trois questions

Remplace le jugement « statique contre interactif », trop grossier : il faisait descendre du côté gratuit des plugins qu'un agent ne sait pas produire, au seul motif que leur sortie ressemble à un rapport.

Un plugin est **non réplicable par un agent**, donc vendable, s'il coche au moins une case.

| | Question | Pourquoi un agent échoue |
| --- | --- | --- |
| **A** | Faut-il que les composants soient réellement rendus dans un navigateur ? | un modèle décrit un contraste, il ne le mesure pas. `getComputedStyle` n'a pas d'équivalent textuel |
| **B** | Faut-il un parcours exhaustif et exact du dépôt ? | un agent échantillonne et paraphrase. Sur quatre cents composants, l'approximation est une erreur |
| **C** | La valeur est-elle dans la manipulation continue ? | tirer une courbe ou ajuster un token à l'œil ne se demande pas en prose |

**Aucune case cochée, c'est gratuit.** La sortie est du texte générique, donc clonable par un prompt, donc la leçon Tailwind s'applique : ne jamais vendre du contenu statique.

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

## Catalogue

**Un seul tableau, une ligne par paquet.** Les cinq tableaux précédents étaient la cause matérielle des doublons : rien ne signalait qu'un nom apparaissait deux fois avec deux statuts.

| Paquet | Rôle | Surfaces | Statut | Chantier |
| --- | --- | --- | --- | --- |
| `@crypte/controls` | édition des props en live | ui, preview | gratuit | `1.3` |
| `@crypte/a11y` | vérification d'accessibilité de la story affichée, axe-core | ui, preview | gratuit | `1.3` |
| `@crypte/tokens` | découverte et lecture des variables CSS déclarées | node, puis preview | gratuit | `2.3` |
| `@crypte/docs` | table de props depuis TypeScript et JSDoc | node, ui | gratuit | `2.2` |
| `@crypte/source` | code d'appel affiché et copiable | node, ui | gratuit | `2.2` |
| `@crypte/theme` | thèmes clair et sombre, fonds du canvas | ui, preview | gratuit | `2.2` |
| `@crypte/responsive` | largeurs, points de rupture, sens de lecture | ui, preview | gratuit | `2.2` |
| `@crypte/actions` | journal des événements émis | ui, preview | gratuit | `2.2` |
| `@crypte/visual-tests` | régression visuelle sur baseline locale | node | gratuit | `2.2` |
| `@crypte/coverage` | props jamais exercées, comptage par composant, mode fuzz | node, ui | gratuit | `2.2` |
| `@crypte/interactions` | tests d'interaction | node, ui, preview | gratuit | `R` |
| `@crypte/mock` | mock d'API et date figée | node, preview | gratuit | `R` |
| `@crypte/inspect` | marges, contours, mesures | ui, preview | gratuit | `R` |
| `@crypte/grid` | stories écrites côte à côte, et deux à deux | ui | gratuit | `R` |
| `@crypte/comments` | commentaires et review sur les stories | ui, node | porté par `serve` | `3.2` |
| `@crypte/motion` | éditeur de timeline d'animations, scrubber, courbes | à décider | payant | `R` |
| `@crypte/editor` | édition visuelle des tokens et des props, création de thème, écriture par codemod | à décider | payant | `R` |
| `@crypte/recorder` | on clique dans le composant, le test s'écrit | à décider | payant | `R` |
| `@crypte/states-matrix` | génère et rend les combinaisons non écrites, états croisés aux thèmes | à décider | payant | `R` |
| `@crypte/audit` | couverture WCAG, contrastes tous thèmes, valeurs en dur, composants sans story | à décider | payant | `R` |
| `@crypte/tokens-inspector` | chaînes de résolution et diff entre thèmes | à décider | payant | `R` |
| `@crypte/deps-graph` | graphe d'impact entre composants | à décider | payant | `R` |
| `@crypte/usage-finder` | usage détaillé par prop, tendances, composants morts | à décider | payant | `R` |

**Vingt-trois entrées. Quatorze gratuites, huit payantes, une portée par `serve`.** Vingt-trois défendables valent mieux que trente dont sept sont discutables, sur un projet dont la thèse est de ne couvrir que ce qui est démontré par l'usage.

Les surfaces des payants restent à décider : aucun n'est développé, et les nommer par anticipation serait deviner.

`test/plugins-catalogue.test.ts` refuse un nom en double, un statut hors des trois valeurs et une ligne sans chantier. Ce sont les trois formes qu'ont prises les six incohérences du catalogue à cinq tableaux.

---

## `controls` et `a11y` ont une fonction de contrat

Ils ne sont pas dans le chantier d'outillage, et c'est voulu. La section 6.5 de `contracts.md` pose la condition : le contrat de plugin est stable une fois éprouvé par deux plugins aux besoins opposés. `controls` écrit dans la story, `a11y` se contente de la lire.

Tant que les deux n'existent pas, la section 6 change sans procédure. Après, tout changement est une rupture.

`controls` vient seul en premier : si l'API doit bouger, un seul plugin est à corriger.

---

## `tokens` est écrit, et pourquoi lui d'abord

**Moitié `node`, le 24 août 2026.** Il lit les variables CSS de la feuille que le projet déclare et en contribue des entrées `TokensEntry`, une par famille. La moitié `preview`, qui résoudrait les valeurs effectives par `getComputedStyle`, attend que `PreviewHooks` soit spécifié, ce qui demande son propre consommateur.

Sorti de la réserve à la refonte pour deux raisons : zeroheight et Supernova ont tous les deux un Token Manager, et c'est **le premier plugin à écrire dans le manifeste**, donc celui qui éprouve `NodeHooks` avant qu'il soit figé.

Les trois autres sources de la fiche, DTCG, `tokens.ts` et Tailwind, ne sont pas écrites : ce plugin existait pour éprouver la surface `node`, pas pour être complet.

---

## Fusions

Un paquet n'existe que si son périmètre se dit en une phrase sans recouvrir celui d'un voisin.

| Fusionné | Dans | Raison |
| --- | --- | --- |
| `diff` | `grid` | même mécanique, monter plusieurs previews côte à côte. Seuls diffèrent le nombre et le choix |
| `props-fuzzer` | `coverage` | trouver le trou et le combler sont le même geste. `coverage` dit « cette prop n'est jamais exercée », le mode fuzz propose des valeurs |
| `theme-builder` | `editor` | quatre-vingt-dix pour cent de code commun. `editor` gagne un mode création avec export DTCG |
| `rtl` | `responsive` | même famille : sous quelle condition on rend le composant, largeur ou sens de lecture |

`responsive` **garde son nom** : le tableau des conflits l'a tranché contre `viewport`, transparent plutôt que court, et couvrir trois axes ne rend pas le nom moins transparent.

`theme` reste dehors : il porte des valeurs de tokens, pas le cadre de rendu.

---

## Sortis de la liste des plugins

| Sorti | Devient | Raison |
| --- | --- | --- |
| `portal` | un drapeau sur `crypte build` | thématiser le shell est une option de construction, et c'est du contenu statique, que la leçon Tailwind interdit de vendre |
| `workspace` | un mode de `build`, ou un service | agréger plusieurs ateliers ne se fait pas dans un atelier, ça se fait au-dessus |
| `links` | rien, ou le noyau | le shell a déjà un arbre et une palette. Naviguer d'une story à l'autre est une API de deux lignes côté preview, et aucun cas réel ne la porte |

---

## Les quatre coupes, gratuit contre payant

Le document annonçait trois plugins « coupés en deux » sans jamais écrire la coupe. Il en faut une quatrième, née de la fusion de `diff` dans `grid`.

| Gratuit | Payant | Ligne de coupe |
| --- | --- | --- |
| `a11y` | `audit` | `a11y` vérifie la story à l'écran, maintenant. `audit` parcourt tout le catalogue, croise chaque état à chaque thème, et sort un rapport exportable |
| `tokens` | `tokens-inspector` | `tokens` liste les variables et les affiche. `tokens-inspector` résout les chaînes d'alias et diffe les thèmes entre eux |
| `coverage` | `usage-finder` | `coverage` croise `details` et les props de chaque story, et compte les usages par composant. `usage-finder` détaille par prop, suit l'évolution et repère les composants morts |
| `grid` | `states-matrix` | `grid` affiche les stories écrites. `states-matrix` génère les combinaisons non écrites, et les rend. Le gratuit montre, le payant fabrique |

**Duplication corrigée.** « Valeurs en dur » figurait dans `audit` et dans `tokens-inspector`. Elle appartient à `audit`, qui est le rapport complet.

**Point ouvert.** La moitié gratuite de `coverage` compte les usages par composant, ce qui affaiblit un peu l'argument « `coverage` rend inutile le service d'analytics de zeroheight ». Pour garder l'argument intact, le comptage de base reste gratuit et `usage-finder` ne se vend que sur le détail par prop, les tendances et les composants morts. La ligne est fine.

---

## Deux plugins que la monétisation voulait payants, et qui restent gratuits

**`visual-tests`.** Il portait le nom `snapshot-local` et l'argument « Chromatic sans la facture cloud ». Il reste gratuit parce que c'est lui qui porte le **rendu visuel des pull requests**, la seule fonctionnalité qu'aucun des quatre concurrents ne propose, et la seule que Backlight avait mise en tête de son argumentaire. En faire un produit payant la retire de l'argumentaire d'adoption au moment où elle sert le plus.

La version qui se vend est ailleurs : `visual-regression` multi-navigateurs, en service cloud, qui est le seul revenu prouvé du marché.

**`coverage`.** Il portait le nom `usage-finder`. Il reste gratuit parce qu'une métrique dérivée du code **est** le différenciateur du projet, pas un supplément.

---

## Idées conservées et non retenues

Nommées ici pour ne pas être redécouvertes dans six mois.

| Idée | Décision |
| --- | --- |
| `density` | échelles de densité et zoom 200 % WCAG. Aucun cas réel. Candidate à rejoindre `responsive` si un cas apparaît |
| `i18n-preview` | langues, RTL, pseudo-localisation. Surensemble du mode RTL, qui est la moitié démontrée |
| Registre de composants partagés | autre produit, serveur et base de données |
| Composition de plusieurs instances | n'a de sens qu'à partir de trois ou quatre équipes. Voir la sortie de `workspace` |
| Support MDX | une chaîne de compilation entière pour un gain que `docs` couvre |
| Gouvernance d'entreprise | abandonné sans réserve |
| Token Manager façon zeroheight | le sens de circulation est l'inverse du nôtre |
| Analytics d'usage de la documentation | la moitié utile est dans `coverage`, l'autre dans `usage-finder` |

---

## La porte à sens unique

Publier un paquet en MIT est irréversible : rien ne redevient payant après. La réserve `R` est le mécanisme de prudence, et elle fonctionne déjà, aucun des huit payants n'ayant jamais été publié.

**L'ordre de publication compte donc plus que le statut affiché.** Un plugin dont le statut hésite reste en réserve et ne se publie pas.

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
| Les primitives qu'au moins deux plugins dessinent | noyau, `@crypte/core/ui` |
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

C'est précisément l'argument à opposer à qui trouve Storybook trop lourd : le catalogue compte vingt-trois entrées, mais **rien de ce qui n'est pas installé n'est chargé**.

Cette phrase est une promesse, donc elle a besoin d'un chiffre : c'est DCJ-193, le poids de chaque plugin affiché en barre d'état.
