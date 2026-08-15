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

*Origine :* revue de la PR #21, devenue `DCJ-214` à la convergence.

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

### `exportsOf` devine l'entrée d'un paquet plutôt que de la lire

Le contrôle des exemples du guide code en dur l'entrée de chaque paquet, `config.ts` pour le CLI et `index.ts` pour les autres, et ne reconnaît que quatre formes d'export. Un exemple qui citerait `@crypte/core/protocol` échouerait sur un fichier introuvable, avec un message sans rapport avec la garantie.

*Pourquoi ce n'est pas fait ici :* lire le champ `exports` du manifeste demande de résoudre des sous-chemins, pour deux paquets cités par un seul exemple. L'échec est bruyant, donc rien ne passe en silence.

*Même angle mort* que celui déjà consigné pour `spec.test.ts`, qui ne lit pas non plus toutes les formes d'export.

*Origine :* revue 2 de la PR #27.

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

### La colonne « props propres » de DCJ-192 n'est pas servie

`StoryEntry.props` porte les props que la story passe vraiment au composant, bloc commun compris. C'est ce dont ont besoin deux des trois consommateurs cités par l'issue, la couverture de props et la recherche par prop.

Le troisième, la colonne « props propres » de la page composant, veut les seules props que la story ajoute au bloc commun. **Cette information n'est pas récupérable depuis la liste fusionnée** : l'intersection des listes d'un fichier ne rend pas le bloc commun, puisqu'une story peut reposer une prop qu'il déclare déjà.

*Pourquoi ce n'est pas fait ici :* c'est un second champ dans le contrat du manifeste, pour un écran qui vient d'une exploration d'interface et qui n'est pas construit. Le champ est additif, donc il s'ajoutera sans changer `MANIFEST_VERSION` le jour où l'écran existe.

*Origine :* lot 4, en repassant sur DCJ-192.

### Le code d'appel écrit `children` comme un attribut

`source` rend `<OrderSummary children={<span>Neuf</span>} />`. C'est du JSX valide et fidèle à ce que la story déclare, mais personne n'écrit `children` de cette façon à la main : la forme attendue est `<OrderSummary>{...}</OrderSummary>`.

*Pourquoi ce n'est pas fait ici :* le champ sert à lire et à copier, et les deux formes se copient. Le jour où un écran l'affiche pour de bon, c'est lui qui dira laquelle est lisible.

*Origine :* lot 4, à la lecture du manifeste produit sur la fixture.

### `MANIFEST_VERSION` reste à 1 alors qu'un champ requis s'ajoute

`StoryEntry.props` est un champ **requis**, pas additif, et la version du manifeste ne bouge pas. La section 4.2 dit que le rôle de `version` est de reconnaître un manifeste écrit par une autre version : avec ce lot, `1` désigne deux formes.

*Pourquoi ce n'est pas un défaut aujourd'hui :* aucun manifeste n'a jamais été écrit. Aucune commande n'appelle le producteur, aucun paquet n'est publié, donc il n'existe nulle part un fichier de version 1 à l'ancienne forme.

*La règle à partir de maintenant :* dès la première version publiée qui écrit un manifeste, ajouter un champ requis impose d'incrémenter `MANIFEST_VERSION`. Le raisonnement « champ additif, donc pas de changement de version » ne couvre que les champs optionnels.

*Origine :* revue de la PR #30.

### L'exhaustivité de `produced` n'est gardée que par le compilateur

`StoriesRead` a trois variantes et `produced` les traite dans un `switch`. Ajouter une quatrième variante sans la traiter donne `TS2366`, mesuré, parce que la fin d'une fonction à type de retour déclaré redevient atteignable.

*Ce qui n'est pas gardé :* rien n'empêche de remplacer le `switch` par une chaîne de ternaires, qui compile sans exiger l'exhaustivité. Les 81 garanties de mutation resteraient vertes et la protection disparaîtrait en silence.

*Pourquoi ce n'est pas fait ici :* le catalogue de mutations casse du code et lit le rouge d'un test ; il ne sait pas exprimer « ce changement doit produire une erreur de type ». Le garder demanderait un second mécanisme, du genre d'un fichier de type attendu en échec, pour une protection d'une seule fonction.

*Origine :* auto-review du lot 4.

### Arrêt explicite : la limite de la lecture statique d'un fichier de story

**Ce qui est arrêté.** La boucle de revue du lot 4, après cinq tours et huit constats. Les cinq derniers commits corrigent tous la même question, et le rythme ne ralentissait pas.

**La question, une fois pour toutes.** Un fichier de story est lu sans être exécuté, donc le lecteur rencontre des valeurs qu'il ne peut pas connaître. La règle est unique : **ce qui ne se lit pas sans exécuter le fichier est laissé de côté et signalé, jamais deviné.** Un nom faux entre dans un identifiant, une URL, une clé de baseline et un chiffre de couverture, et il ment sans se signaler ; un nom manquant se voit.

**Les sept formes trouvées**, dans l'ordre où elles sont apparues :

| Forme | Ce que le lecteur en fait |
| -- | -- |
| une clé de prop calculée | la prop est laissée de côté |
| une clé de story calculée | la story est écartée, et comptée |
| un spread dans un bloc de props | les noms apportés sont laissés de côté |
| un spread dans le bloc `stories` | la story apportée est comptée, et celles qui la précèdent sont écartées |
| un bloc `stories` non littéral, ou vide | aucune entrée, avec la raison |
| une définition non littérale, ou dont un spread suit la clé lue | aucune entrée, avec la raison |
| une clé écrite deux fois | la dernière gagne, comme à l'exécution |

**Ce qui reste non éprouvé.** Rien ne garantit qu'il n'existe pas une huitième forme. Un `Object.assign`, une définition construite par un appel, une clé issue d'un `as const` importé : chacune rendrait une valeur indécidable par un chemin que ce lecteur ne regarde pas.

**Pourquoi arrêter quand même.** Depuis la revue 5, la réponse est structurelle et non plus au cas par cas. `StoriesRead` porte le « je ne sais pas » dans le type, `produced` est le seul endroit qui décide, et une variante nouvelle non traitée ne compile pas. Les trois derniers constats n'étaient pas des trous dans cette structure : c'étaient des endroits où une règle déjà écrite n'était pas encore appliquée. Une huitième forme se corrigera donc en une ligne, et le compilateur refusera de l'ignorer.

**Point de contrôle.** À la première utilisation de Crypte sur un projet réel, relire cette table contre ce que ce projet écrit vraiment. C'est un usage qui apportera la huitième forme, pas une relecture de plus.

*Origine :* lot 4, arrêt décidé après la revue 5 de la PR #30.

### La portée du verrou de l'empreinte est plus étroite que le mécanisme

L'empreinte commitée de la fixture est le seul instance du régime de verrouillage dans le dépôt, et la fixture exerce peu : quatre entrées, deux composants, `options` et `details` vides partout, `status` limité à `none` et `stable`, un seul export nommé.

*Conséquence :* une modification du producteur qui ne toucherait que `options` ou `details` ne ferait bouger ni ce fichier ni l'intégration continue, alors que ces deux champs sont repliés dans le condensé. Les tests unitaires de `fingerprint.test.ts` les couvrent, eux, mais pas le verrou.

*Pourquoi ce n'est pas élargi ici :* `details` est écrit vide par décision arbitrée, tant qu'aucun adaptateur ne fait l'inférence, et `options` demande un plugin installé pour être typé. Élargir la fixture maintenant lui ferait porter des valeurs qu'aucun projet réel n'écrirait encore.

*Ce qui l'élargira tout seul :* le lot 5 et l'adaptateur, qui remplissent `details`, puis le premier plugin, qui remplit `options`.

*Origine :* revue de la PR #31.

### Le contrôle de mutation reste à six minutes en intégration continue

`DCJ-216` visait moins de trois minutes. Chronométré : 4 min 10 s pour 90 garanties avant, **2 min 21 s pour 92 après**, soit 1,8 fois moins en local. En intégration continue, mesuré sur le job entier : **12 min 2 avant, 5 min 45 après**. L'objectif de trois minutes n'est donc pas atteint.

*Où passe le temps qui reste :* la plupart des garanties passent par la voie rapide, à 0,9 s chacune, dont environ 0,7 s de démarrage de vitest. Ce démarrage est un plancher : quatre-vingt-douze lancements en coûtent plus d'une minute quoi qu'on fasse du reste. S'y ajoutent 24 s de contrôle positif, qui lance chaque cible seule.

*Ce qui le lèverait :* muter en mémoire, un seul processus vitest rejouant la suite après chaque écriture, au lieu d'un processus par garantie. C'est un autre mécanisme, pas un réglage de celui-ci.

*Pourquoi s'arrêter là :* le gain de 1,8 est acquis et le coût par garantie ajoutée passe de 3,7 s à 0,9 s, donc le catalogue peut tripler avant de retrouver le temps d'avant. Le délai du job reste à 30 min, qui couvre largement.

*Origine :* mesures de DCJ-216.

### Les cas d'écran rougissent au premier lancement après une installation

`packages/cli/test/screen.test.ts` démarre un serveur puis ouvre Chromium. Un `beforeAll` demande l'entrée de la preview avant d'ouvrir le navigateur, ce qui force Vite à transformer et à optimiser : sans ce préchauffage, le premier rendu attendait cette optimisation et les cas rougissaient pour une raison qui n'était pas la leur.

*Ce qui reste :* après un `vp install` qui relie Playwright, ou un changement de configuration du projet témoin, le premier lancement peut encore dépasser la patience des cas. Le second passe. Vu deux fois au lot 5a.

*Pourquoi ce n'est pas traité ici :* la cause est un travail réel du serveur, pas une course, donc la réponse est d'attendre plus longtemps, ce qui rallonge la suite pour tout le monde. Le préchauffage couvre le cas courant.

*Ce qui le trancherait :* mesurer combien de temps prend cette première optimisation, et décider entre un délai plus long au premier cas et un préchauffage qui va jusqu'au premier rendu.

*Origine :* lot 5a.

### Un fichier de story gardé mais cassé à l'exécution abat encore la preview

L'entrée n'importe plus que les fichiers qui ont produit une entrée, donc un fichier que le lecteur a écarté ne la fait plus échouer. Mais un fichier **gardé** dont une dépendance manque à l'exécution reste importé statiquement : son échec survient au chargement, donc avant `createPreviewChannel`, donc le shell n'obtient jamais `ready` et ne peut rien afficher.

*Pourquoi ce n'est pas fait ici :* le corriger demande d'importer chaque module à la demande, donc de rendre `render` asynchrone dans `PreviewHandlers`, ce qui touche le contrat du canal et la mesure de durée qu'il porte.

*Ce qui l'atténue :* le cas demande un fichier que le lecteur analyse sans erreur et que le navigateur refuse de charger, ce qui est plus rare que les fichiers écartés, eux désormais exclus.

*Origine :* revue de la PR #33.

### La lecture des portées de `crypte.config.ts` est partielle, et on s'arrête là

`adapterSource` refuse un nom que le fichier déclare, parce qu'un tel nom repart dans l'expression émise sans rien qui le déclare : `ReferenceError` au chargement, donc avant l'ouverture du canal, donc un cadre vide sans rien à dire. Pour trancher, il lit les noms que le fichier déclare et retire ceux que l'expression porte elle-même.

*Ce que ça revient à faire :* un résolveur de portées écrit à la main sur la grammaire JS/TS. Les formes de **déclaration** sont couvertes par une lecture de la forme, voir plus bas ; ce sont les formes de **liaison locale** qui restent partielles, et les énumérer toutes est le travail d'un résolveur complet.

*Les deux sens ne coûtent pas la même chose, et c'est ce qui décide.* Un **faux accepté** émet un nom pendant et rend un cadre vide sans message, ce que ce contrôle existe pour éviter. Un **faux refusé** écarte une configuration valide avec un message explicite, que l'auteur contourne en important la valeur.

*Ce qui reste ouvert est du second côté, et seulement de celui-là :* une liaison de boucle (`for (const opts of list)`), un bloc imbriqué dans un corps de fonction, le nom d'une expression de classe. Chacun refuse une configuration valide, aucun n'en laisse passer une cassée.

*Le premier côté n'est plus une énumération, à deux niveaux.* Le code a d'abord nommé les types de nœuds qui déclarent, puis les formes de motif qui lient : `VariableDeclaration`, puis `FunctionDeclaration` et `ClassDeclaration`, puis `TSEnumDeclaration`, puis `TSModuleDeclaration`, puis `TSImportEqualsDeclaration`, puis le nom qualifié de `namespace runtime.deep`. Une par revue, chacune acceptée tant qu'elle n'était pas nommée. Les deux listes sont remplacées par une lecture de la forme : une déclaration porte son nom dans `id` ou dans `declarations`, et une liaison porte les siens dans les identifiants de sa forme, valeurs par défaut exceptées.

*Attention : la tolérance n'est pas la même dans les deux sens où cette lecture sert.* Pour `declared`, un nom de trop refuse une configuration valide avec un message, donc c'est le côté bénin. Pour les noms qu'une fonction de l'expression porte elle-même, un nom de trop est pris pour local, donc son import ne part pas, donc le nom part pendant : c'est le côté grave. Il n'y a donc pas de direction sûre à choisir, et ce qui n'est pas une liaison est écarté plutôt que toléré.

*Une seule sur-lecture subsiste, et elle est confinée :* `namespace runtime.deep` fait lire `runtime` et `deep`, dont un seul est lié. Un nom qualifié ne peut pas apparaître en position de paramètre, donc cette sur-lecture ne touche que `declared`.

*Ce raisonnement a été pris à l'envers une fois :* l'argument « lire un nom de trop est le côté sûr » a servi à laisser une clé calculée de motif se lire comme une liaison, ce qui avalait l'import qu'elle nommait.

*Un troisième endroit portait la même erreur :* la lecture des noms référencés s'arrêtait sur un identifiant sans regarder ce qui y pend. Un décorateur de paramètre, `constructor(@field() x)`, restait donc dans l'expression sans que son import parte. Un identifiant est maintenant nommé puis traversé.

*Ce qui rouvrirait :* un nœud qui lie un nom sans le porter dans `id` ni dans `declarations`, ou une forme d'`id` dont le nom lié n'est pas un identifiant de sa propre forme. Ou assez de faux refus rapportés pour que le message cesse de suffire.

*Ce qui a déjà rouvert, trois fois :* la première version de cette entrée rangeait le `var` remonté du côté bénin, mesuré du côté grave. La deuxième déclarait le premier côté fermé alors que `import x = require(…)` passait. La troisième l'a fermé au niveau des nœuds, et il s'est rouvert un cran plus bas, sur les formes de motif. Les trois fois, la liste était l'erreur, pas la ligne manquante.

*Origine :* revues 2 à 5 de la PR #33, quatre tours ayant chacun rendu un axe d'entrée de plus.

### `project.test.ts > échoue sans le résolveur` rougit par intermittence

Quatre occurrences dans la même session : trois sous `pnpm run mutations`, sur l'une de ses trois barrières, et **une sous un `vp test` ordinaire**. Chaque fois, la même commande relancée passe. `screen.test.ts` a rougi une fois de la même façon.

*Ce que la mesure a écarté :* la charge du contrôle de mutation n'est pas nécessaire, puisque le rouge est apparu sans lui. Le fichier lancé seul passe, et six passes complètes d'affilée passent également, donc la fréquence est de l'ordre de un sur sept sans être reproductible à la demande.

*Ce qui n'est pas établi :* la cause. Le cas est un contrôle négatif qui démarre un second serveur Vite sur **la même racine** que le cas précédent, donc sur le même cache de dépendances ; c'est un candidat, pas une cause, et rien ne l'a isolé.

*Ce que ça coûte :* ces deux contrôles servent de barrière avant de pousser. Un rouge qui ne se reproduit pas apprend à relancer plutôt qu'à lire, ce qui est l'inverse de ce qu'on leur demande.

*Ce qui a été fait ici :* les deux messages du contrôle qui disaient « ça échoue » sans dire quoi nomment maintenant la commande fautive et affichent sa sortie. C'était le vrai coût : deux diagnostics à l'aveugle avant d'avoir cette information.

*Ce qui le trancherait :* boucler sur ce seul fichier jusqu'au rouge en capturant l'erreur, puis rejouer avec une racine propre par serveur pour voir si le rouge suit le cache.

*Origine :* lot 5a, quatre occurrences mesurées.

### Deux points laissés ouverts à la sortie du brouillon du lot 5a

**Le saut de `typeAnnotation` dans la collecte des noms liés n'est gardé par rien.** `serve.ts` en porte deux : celui de la lecture des noms référencés est catalogué, celui de la lecture des liaisons ne l'est pas. Retirer le second laisse la suite verte, parce que le premier écarte déjà l'identifiant avant qu'il compte.

*Pourquoi ce n'est pas corrigé ici :* la ligne n'est pas morte, elle est redondante avec l'autre. Elle redevient seule si la lecture des noms référencés change, et c'est précisément le jour où personne ne s'en apercevra. La garder sans garantie est un pari assumé ; la retirer aussi.

*Ce qui le trancherait :* trouver une forme où une annotation atteint la lecture des liaisons sans passer par l'autre. Rien n'en a produit sur cette pull request.

**L'installation de Chromium en CI coûte 95 Mo par exécution et par version de Node.** Elle n'est pas mise en cache, et son chemin `node_modules/playwright/cli.js` suppose le hissage à la racine du dépôt.

*Pourquoi ce n'est pas traité ici :* le mode d'échec du chemin est un rouge bruyant et immédiat, pas un silence. Le coût est réel mais il tient dans le budget de 20 minutes du job, mesuré à 9 min 11 sur Node 24.

*Ce qui le lèverait :* `actions/cache` sur `~/.cache/ms-playwright`, clé sur la version de Playwright du catalogue.

*Origine :* revue 12 de la PR #33.

### Les copies de projet des cas de rechargement touchent trois outils

`packages/cli/test/screen.test.ts` et `hot.test.ts` copient un projet dans l'espace de travail, parce que hors du dépôt `crypte.config.ts` ne résout plus `@crypte/cli`. Cette copie est visible par trois outils qui ne l'attendent pas.

*pnpm.* `apps/*` en fait un paquet de l'espace de travail, donc un `pnpm install` lancé pendant qu'une copie existe l'inscrit dans le fichier de verrouillage. Mesuré : 28 lignes ajoutées, et le contrôle de mutation refusant de partir sur un arbre sale. Fermé par `!apps/tmp-demo-*` dans `pnpm-workspace.yaml`.

*Le parcours de fichiers de `mutations.test.mjs`.* Une copie effacée pendant sa descente faisait échouer l'import du fichier entier, par intermittence. Fermé par un élagage explicite en descendant.

*Git.* Les copies sont ignorées, donc `git status --porcelain` ne les montre pas : un contrôle qui vérifie la propreté de l'arbre ne les verra jamais, et une copie oubliée survit sans que rien ne le dise.

*Ce qui reste :* rien ne garantit qu'une copie soit retirée si un cas meurt entre la copie et son `afterAll`. Le coût est un dossier de 5 Mo et, désormais, aucun effet sur le verrouillage.

*Ce qui le lèverait :* une copie par exécution dans un dossier unique nettoyé au démarrage de la suite, plutôt qu'à la fin de chaque fichier.

*Origine :* lot 5b.
