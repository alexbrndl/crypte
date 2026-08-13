# Suivi

Ce qu'une revue a vu, qu'on a choisi de ne pas corriger tout de suite, et pourquoi.

Une pull request sort du brouillon quand plus aucun point **bloquant** ne reste. Le reste vient ici plutôt que de retenir le lot : sans cet endroit, la seule issue est de tout corriger, et la boucle de revue ne se ferme jamais.

**Ce fichier est lu par la revue.** Un point qui y figure est arbitré : le re-signaler n'apprend rien à personne. `Wrap` est remonté quatre fois avant qu'on le sorte du périmètre.

Une ligne disparaît quand le point est traité, pas avant. Les niveaux sont définis dans `.claude/skills/review/SKILL.md`.

---

## Important

### La preview n'implémente ni `update-overrides` ni `set-globals`

La section 5.2 de la spécification déclare trois messages du shell vers la preview. Un seul a un effet : `render`. Les deux autres sont reçus et ignorés.

*Ce que ça donne :* un test fixe l'état d'aujourd'hui, et le catalogue de mutation surveille que la preview n'agit que sur `render`. Implémenter les deux messages restants demandera donc de mettre à jour cette entrée, ce qui est voulu : elle dit ce que le code fait, pas ce qu'il devrait faire.

*Pourquoi ce n'est pas fait ici :* `update-overrides` suppose un panneau qui édite des valeurs, `set-globals` un thème ou une locale à appliquer. Ni l'un ni l'autre n'existe avant le lot 8.

*Origine :* revue de la PR #21.

### `Wrap` reste assignable depuis une fonction quand le composant en est une

Le retrait de la branche fonction de l'union ne suffit pas côté React, où un composant *est* une fonction : `wrap: (story) => …` compile toujours. La section 2.5 en fait donc une règle, toute fonction reçue est instanciée comme composant, et le comportement devient prévisible plutôt qu'ambigu.

*Ce qui reste ouvert :* aucun diagnostic n'avertit celui qui écrit cette forme en attendant l'ancien comportement. Un marqueur sur les composants, ou une vérification à l'exécution dans l'adaptateur, le permettrait.

*Pourquoi ce n'est pas fait ici :* le noyau ne connaît aucun framework, donc la reconnaissance appartient à l'adaptateur, qui n'existe pas encore.

*Origine :* revue de la PR #16.

### `has-review` ne regarde pas la date de la revue

Le contrôle est satisfait dès qu'une revue portant le marqueur existe, quelle que soit son ancienneté. Sur la PR #15, deux revues ont suffi pendant douze tours, y compris à la fin, alors qu'elles portaient sur un état du code vieux de plusieurs heures.

*Ce qui a été fait :* le contrôle affiche désormais la date de la revue la plus récente et celle du dernier commit, et pose un avertissement quand la première précède la seconde.

*Pourquoi il n'échoue pas :* l'exiger contredirait la règle qui permet de corriger un point non bloquant sans relancer de tour. Les deux corrections de ce diff, celles du skill et de ce workflow, invalideraient elles-mêmes la revue qui les a motivées. Trancher demande de choisir entre les deux règles, ce qui est une décision et non une correction.

*Origine :* constaté en passant la PR #16 en prêt.

### `viteConfigOf` ne fixe pas de dossier de cache

La configuration produite laisse Vite écrire dans `<projet>/node_modules/.vite`, le même dossier que le `vite dev` du projet. Deux serveurs aux plugins et aux entrées différents y écriraient le même `_metadata.json`.

*Ce qui l'atteste :* le fabricant de serveurs des tests a dû donner un cache propre à chacun, après deux échecs isolés jamais reproduits. Le code de production porte la même exposition sans la parade.

*Pourquoi ce n'est pas fait ici :* aucun serveur ne tourne encore, `viteConfigOf` n'étant consommé que par les tests. Choisir l'emplacement demande de savoir ce que le serveur de preview partage avec le projet, ce que le lot 5 tranchera.

*Origine :* revue 5 de la PR #17.

### Les chemins déclarés ne s'appliquent pas dans une feuille de style

Un `@import '@/vars.css'` dans le CSS du projet ne résout pas. Le pipeline CSS de Vite ne consulte aucun plugin : il résout `@import` et `url()` par ses propres moyens, alias compris.

*Ce qui a été essayé :* fournir en plus un `resolve.alias` pour les motifs traduisibles. Mesuré, ça résout le CSS **et casse le repli du JavaScript** : un alias s'applique avant le résolveur et réécrit sans condition, donc une première cible inexistante ne retombe plus sur la seconde. Le remède était pire.

*Ce qui le lèverait :* transformer le contenu des feuilles de style avant que Vite ne les résolve, en réécrivant les spécificateurs. C'est un travail à part, avec ses propres cas limites, `url()` et les `@import` conditionnels.

*Origine :* revue 5 de la PR #17.

### Un chemin ne peut pas remplacer un paquet installé

`"paths": { "vue": ["shims/vue.js"] }` reste sans effet quand `vue` est installé : le résolveur passe après ceux de Vite, qui trouvent le paquet d'abord.

*Mesuré :* l'import rend `/node_modules/vue/…`, là où TypeScript rendrait le fichier de remplacement.

*Pourquoi ce n'est pas fait :* ce même ordre est ce qui empêche un motif fourre-tout de détourner les imports que Vite résout déjà. Le corriger demande de distinguer les deux cas, donc de savoir quels identifiants un chemin a le droit d'intercepter.

*Ce que ça coûte :* le remplacement d'un paquet, motif courant pour `react-native-web` ou une variante de build, est ignoré sans un mot.

*Origine :* revue 6 de la PR #17.

### Des échecs isolés, jamais reproduits

Quatre fois sur le lot 3, puis une fois sur le lot 0 decies, une commande a échoué sans raison visible puis a réussi à l'identique juste après :

| Ce qui a échoué | Ce qu'on a vu ensuite |
|---|---|
| deux tests isolés | vingt-trois lancements verts |
| le contrôle de mutation | deux relances vertes |
| `vp run -r pack`, code 2 | « Build complete » affiché, trois relances à zéro |
| un test, juste avant un commit | treize lancements verts |
| un test de `post-review`, dans la foulée d'un `vp check --fix` | quatre lancements verts sur un fichier identique au fichier rouge |

*Ce qui a été fait :* donner un dossier de cache propre à chaque serveur de test, la seule cause plausible qui ait été mesurée, à savoir qu'ils partageaient `node_modules/.vite`. Les trois autres occurrences sont postérieures.

*Ce qui reste :* aucune cause démontrée. Les quatre surviennent autour d'un commit ou d'un enchaînement de commandes, ce qui suggère une course avec le cache de tâches, mais rien ne l'établit.

*Pourquoi c'est consigné :* une instabilité rare finit par tomber en intégration continue, où personne ne saura la reproduire. La noter permet au moins de compter.

### `vite` est une dépendance du CLI, pas une dépendance de pair

`CrypteConfig.vite.plugins` transporte des instances créées par le projet contre **sa** version de Vite, et elles s'exécuteront dans le conteneur de celle du CLI. Sous pnpm, un projet en Vite 7 verrait son plugin tourner sous Vite 8.

*Pourquoi c'est ainsi aujourd'hui :* le produit promet deux paquets installés, pas trois. Exiger Vite en dépendance de pair déplacerait ce choix sur l'utilisateur.

*Ce qui reste à trancher :* accepter d'imposer notre version, ou suivre celle du projet. La question se pose vraiment quand un serveur tourne, donc au lot 5.

*Origine :* revue 7 de la PR #17.

### `docs/` s'annonce en anglais et ne l'est qu'à un quart

`CONTRIBUTING.md` et `arborescence.md` étiquettent `docs/` comme public et anglais, alors que sur ses quatre documents, seul `decisions.md` l'est. `README.md`, `CONTRIBUTING.md` et `spec-contrats.md` sont en français.

*Ce qui a été fait :* les deux étiquettes disent désormais que la bascule est en cours, et `decisions.md` nomme l'issue qui la termine.

*Pourquoi ce n'est pas fait ici :* traduire `spec-contrats.md` avant de l'avoir confronté au code reviendrait à traduire des phrases fausses, ce que `DCJ-208` corrige. `README.md` et `CONTRIBUTING.md` suivent en `DCJ-209`.

*Origine :* revue de la PR #23.

### `commentsOnly` accepte des commentaires qui ne sont pas inertes

Le contrôle de note de version exempte toute ligne commençant par `//`. Or `/// <reference types="…" />` est recopiée dans les déclarations émises, et `// @ts-expect-error` ou `// eslint-disable-next-line` changent ce qui compile.

*Mesuré :* aucune de ces directives dans `packages/*/src` aujourd'hui, et aucun `.d.ts` écrit à la main sous `src/`. Le cas est vacant.

*Pourquoi ce n'est pas fait ici :* les distinguer demande de reconnaître trois formes dont aucune n'existe dans le dépôt. Le jour où l'une apparaît, la mesure qui justifie l'exemption ne couvre plus le critère.

*Origine :* revue de la PR #23.

## Observations

### Le contrôle de la spécification lit moins de formes que celui du barrel

`spec.test.ts` reconnaît `export interface|type|const|function`, quand `index.test.ts` couvre aussi `export declare`, `class`, `enum`, `let`, `var`, `async function` et les blocs `export { X }` sans `from`.

*Conséquence :* un type déclaré puis exporté séparément échappe au contrôle, et la partie normative peut l'ignorer en silence.

*Origine :* revue 12 du lot 2.

### Un fichier publié déplacé hors de `src/` n'exige aucune note

L'API des fichiers d'une pull request rend un renommage sous son seul nouveau nom, et `filesOf` ne garde pas `previous_filename`. Déplacer `packages/core/src/id.ts` vers `packages/core/scripts/` retire donc une porte d'entrée publique sans qu'aucune note soit exigée.

*Pourquoi ce n'est pas fait ici :* le cas demande de lire un troisième champ et de le croiser avec le même motif, pour une situation qu'aucun lot n'a produite. En pratique, un fichier de `src/` sorti de là force à toucher le barrel, qui est dans `src/`.

*Origine :* revue de la PR #19.

### Le câblage réel de `changedFiles` n'est pas exécuté par les tests

`changedFiles(run)` est éprouvé avec un lanceur injecté : la valeur par défaut, `git diff --name-only origin/main...HEAD`, ne s'exécute jamais en test. Une erreur d'arguments passerait au vert.

*Pourquoi ce n'est pas fait ici :* il faut un dépôt jetable avec un `origin` et deux branches, pour couvrir une commande de trois arguments. Le même compromis vaut pour `publish`, dont l'appel `gh` réel n'est pas davantage exercé.

*Ce qui l'atteste malgré tout :* la commande a tourné pour de bon à chaque publication de revue de cette pull request, trois fois.

*Origine :* revue 3 de la PR #18.

### `post-review` vérifie le fichier d'un point, pas sa ligne

L'API exige que `line` tombe dans une portion du diff, pas seulement dans un fichier qu'il touche. Le script vérifie l'appartenance du fichier, jamais celle de la ligne : un point ancré sur la ligne 400 d'un fichier dont le diff ne change que les dix premières est publié, et l'appel entier échoue en 422.

*Pourquoi ce n'est pas fait ici :* il faut analyser les en-têtes de section du diff pour reconstruire les lignes admissibles, ce qui est un lot en soi. Le fichier est le cas le plus fréquent, et il est couvert.

*Origine :* exploration du lot 0 decies, après la revue de la PR #18.

### La relance du contrôle de revue reste écrite à la main

`post-review.mjs` publie le verdict, mais `require-review.yml` ne réagit qu'à l'ouverture d'une pull request et aux nouvelles poussées : le contrôle reste rouge jusqu'à une relance, que la section 7 du skill fait en deux commandes.

*Pourquoi ce n'est pas dans le script :* `gh run rerun` échoue sur un lancement encore en cours, donc l'étape serait au mieux tentée. Un script dont une partie peut échouer sans conséquence contredit exactement ce qu'il apporte, un code de sortie qui veut dire quelque chose.

*Origine :* exploration du lot 0 decies.

### `sideEffects: false` n'est ni documenté ni gardé

Le champ est ajouté au manifeste publié pour qu'un bundler consommateur puisse élaguer l'import que rolldown conserve dans `preview`. Il est exact aujourd'hui, les trois entrées ne déclarant que des constantes et des fonctions.

*Conséquence :* le jour où un module du protocole acquiert un effet de bord au chargement, les bundlers des consommateurs le supprimeront sans avertissement.

*Origine :* revue 12 du lot 2.
