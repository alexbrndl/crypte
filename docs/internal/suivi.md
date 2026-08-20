# Suivi

Ce qu'une revue a vu, qu'on a choisi de ne pas corriger tout de suite, et pourquoi.

Une pull request sort du brouillon quand plus aucun point **bloquant** ne reste. Le reste vient ici plutôt que de retenir le lot : sans cet endroit, la seule issue est de tout corriger, et la boucle de revue ne se ferme jamais.

**Ce fichier est lu par la revue.** Un point qui y figure est arbitré : le re-signaler n'apprend rien à personne. `Wrap` est remonté quatre fois avant qu'on le sorte du périmètre.

Une ligne disparaît quand le point est traité, pas avant. Les niveaux sont définis dans `.claude/skills/review/SKILL.md`.

---

## Important

### La preview n'implémente ni `update-overrides` ni `set-globals`

La section 5.2 de la spécification déclare trois messages du shell vers la preview. Un seul a un effet : `render`. Les deux autres sont reçus et ignorés.

*Ce que ça donne :* un test fixe l'état d'aujourd'hui, à savoir que la preview n'agit que sur `render`. Implémenter les deux messages restants demandera donc de mettre à jour cette entrée, ce qui est voulu : elle dit ce que le code fait, pas ce qu'il devrait faire.

*Pourquoi ce n'est pas fait ici :* `update-overrides` suppose un panneau qui édite des valeurs, `set-globals` un thème ou une locale à appliquer. Ni l'un ni l'autre n'existe avant le lot 8.

*Origine :* revue de la PR #21, devenue `DCJ-214` à la convergence.

### `Wrap` reste assignable depuis une fonction quand le composant en est une

Le retrait de la branche fonction de l'union ne suffit pas côté React, où un composant *est* une fonction : `wrap: (story) => …` compile toujours. La section 2.5 en fait donc une règle, toute fonction reçue est instanciée comme composant, et le comportement devient prévisible plutôt qu'ambigu.

*Ce qui reste ouvert :* aucun diagnostic n'avertit celui qui écrit cette forme en attendant l'ancien comportement. Un marqueur sur les composants, ou une vérification à l'exécution dans l'adaptateur, le permettrait.

*Le risque a changé de nature au lot 5d.* La raison consignée ici était que « l'adaptateur n'existe pas encore ». Il existe, et il instancie chaque entrée : `wrap: (story) => …` ne reste donc plus sans effet, il **rend faux**. La fonction est montée comme composant, reçoit `children` et les props de l'entrée, et ne rend jamais la story qu'elle croyait envelopper.

*Pourquoi ce n'est toujours pas fait :* distinguer un composant d'une fonction quelconque n'a pas de réponse fiable en React, où un composant est une fonction. La section 2.5 en a fait une règle plutôt qu'une vérification, et un rendu faux se voit à l'écran là où un silence ne se voyait pas.

*Origine :* revue de la PR #16, requalifiée à la revue du lot 5d.

### `has-review` ne regarde pas la date de la revue

Le contrôle est satisfait dès qu'une revue portant le marqueur existe, quelle que soit son ancienneté. Sur la PR #15, deux revues ont suffi pendant douze tours, y compris à la fin, alors qu'elles portaient sur un état du code vieux de plusieurs heures.

*Ce qui a été fait :* le contrôle affiche désormais la date de la revue la plus récente et celle du dernier commit, et pose un avertissement quand la première précède la seconde.

*Pourquoi il n'échoue pas :* l'exiger contredirait la règle qui permet de corriger un point non bloquant sans relancer de tour. Les deux corrections de ce diff, celles du skill et de ce workflow, invalideraient elles-mêmes la revue qui les a motivées. Trancher demande de choisir entre les deux règles, ce qui est une décision et non une correction.

*Origine :* constaté en passant la PR #16 en prêt.

### Clos : `viteConfigOf` ne fixait pas de dossier de cache

La configuration produite laissait Vite écrire dans `<projet>/node_modules/.vite`, le même dossier que le `vite dev` du projet : deux serveurs aux plugins et aux entrées différents y auraient écrit le même `_metadata.json`.

*Clos par le lot 5b*, qui a fait tourner le serveur pour de vrai et a donc pu trancher l'emplacement : `node_modules/.crypte`, dans les `node_modules` du projet. Deux cas de `project.test.ts` le gardent, dont un négatif qui refuse `.vite`.

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
| le contrôle de mutation, retiré au lot 5b | deux relances vertes |
| `vp run -r pack`, code 2 | « Build complete » affiché, trois relances à zéro |
| un test, juste avant un commit | treize lancements verts |
| un test de `post-review`, dans la foulée d'un `vp check --fix` | quatre lancements verts sur un fichier identique au fichier rouge |

*Ce qui a été fait :* donner un dossier de cache propre à chaque serveur de test, la seule cause plausible qui ait été mesurée, à savoir qu'ils partageaient `node_modules/.vite`. Les trois autres occurrences sont postérieures.

*Ce qui reste :* aucune cause démontrée pour ces cinq-là. Les quatre premières surviennent autour d'un commit ou d'un enchaînement de commandes, ce qui suggère une course avec le cache de tâches, mais rien ne l'établit. Deux des outils cités n'existent plus, donc deux de ces occurrences ne se reproduiront pas.

*Une occurrence de la même famille a fini par avoir une cause*, et elle n'était pas dans l'environnement : le rouge intermittent de `project.test.ts` venait de son assertion, pas d'une course. C'est le premier endroit à regarder devant un rouge qui ne se reproduit pas.

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

### Clos : le contrôle de la spécification lisait moins de formes que celui du barrel

`spec.test.ts` ne reconnaissait que `export interface|type|const|function`, quand `index.test.ts` couvrait aussi `export declare`, `class`, `enum`, `let`, `var`, `async function` et les blocs `export { X }` sans `from`. Un type déclaré puis exporté séparément échappait donc au contrôle, et la partie normative pouvait l'ignorer en silence.

*Clos par* le **même code** que le contrôle des réexports, `packages/core/test/exported-names.ts`, et non par une copie du motif : les deux copies du premier essai avaient déjà divergé, et la plus stricte abandonnait en silence les entrées qu'elle ne reconnaissait pas, ce qui est le défaut que cette entrée décrit.

*Mesuré :* un `export declare const` ajouté à un module du protocole fait maintenant rougir le contrôle, ce que l'ancien motif laissait passer.

*Ce que la mesure ne couvre pas :* la lecture des blocs `export { X }` locaux. Les cinq modules que ce contrôle lit n'en portent aucun aujourd'hui, donc cette moitié du code n'y est exercée par rien. Elle l'est du côté du barrel, où les mêmes fonctions servent pour de bon, et c'est la raison de les partager plutôt que de les recopier.

### Un fichier publié déplacé hors de `src/` n'exige aucune note

L'API des fichiers d'une pull request rend un renommage sous son seul nouveau nom, et `filesOf` ne garde pas `previous_filename`. Déplacer `packages/core/src/id.ts` vers `packages/core/scripts/` retire donc une porte d'entrée publique sans qu'aucune note soit exigée.

*Pourquoi ce n'est pas fait ici :* le cas demande de lire un troisième champ et de le croiser avec le même motif, pour une situation qu'aucun lot n'a produite. En pratique, un fichier de `src/` sorti de là force à toucher le barrel, qui est dans `src/`.

*Origine :* revue de la PR #19.

### Le câblage réel de `publish` n'est pas exécuté par les tests

`publish` est éprouvé avec un lanceur injecté : son appel `gh` réel ne s'exécute jamais en test.

*Ce qui a été fermé :* le même trou sur `changedFiles`. Sa commande, `git diff --name-only origin/main...HEAD`, tourne maintenant pour de vrai sur un dépôt jetable monté par le cas, avec une référence `origin/main` posée par `update-ref` plutôt qu'un dépôt nu. Mesuré : remplacer `--name-only` par `--names-only` fait rougir le cas.

*Pourquoi `publish` reste dehors :* il faudrait une pull request réelle, donc un jeton et un dépôt distant. Ce qui l'atteste malgré tout est l'usage : la commande a tourné à chaque publication de revue, quatre fois sur la seule PR #34.

*Ce qui le lèverait :* un faux `gh` sur le `PATH` du sous-processus, qui enregistre ses arguments. Le patron existe désormais, il a servi pour `changedFiles`.

### Clos : `post-review` ne vérifiait que le fichier d'un point, pas sa ligne

L'API exige que `line` tombe dans une portion du diff, pas seulement dans un fichier qu'il touche, et elle refuse l'appel **entier** en 422 pour un seul point mal placé. Le script ne vérifiait que le fichier.

*L'entrée annonçait « un lot en soi ».* Ce n'en était plus un : le calcul a été écrit deux fois à la main pendant le lot 5b, pour valider les ancres avant de poster. Il vit maintenant dans `hunksOf`, `inHunk` et `hunksByFile`, une quinzaine de lignes.

*Deux choix, chacun tiré d'une mesure.* `+c` sans `,d` vaut une ligne et non zéro, sinon la plage serait vide et un point juste se ferait refuser. Et un fichier dont les portions ne se lisent pas laisse passer : mieux vaut laisser l'API trancher que refuser un verdict juste, comme `changedFiles` le fait déjà pour le fichier.

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

### Clos, en partie : l'exhaustivité de `produced`

`produced` traite les trois variantes de `StoriesRead` dans un `switch`, et la protection venait du seul type de retour déclaré. Mesuré : réécrire ce `switch` en chaîne de ternaires **et** ajouter une quatrième variante laissait `vp check` et les 36 cas au vert.

*Clos par* une garde explicite, `const unhandled: never = read` dans le `default`, qui lève ensuite plutôt que de rendre `read` : la branche est inatteignable, mais un `as` peut passer outre, et rendre `read` ferait atterrir la panne loin de sa cause. Mesuré : une quatrième variante ne compile plus.

*Ce qui reste, et c'est assumé :* la garde ne survit pas à sa propre suppression. Un test ne peut pas la remplacer, `produced` et `StoriesRead` n'étant pas exportés, et les ouvrir pour un test créerait un usage qu'on ne peut plus reprendre. Ce que la garde change est qu'une protection perdue devient une ligne retirée dans un diff.

*Ce que `expectTypeOf` n'a pas eu à faire ici :* les trois garanties de type que le contrôle de mutation portait sont déjà attrapées par `vp check`, mesuré en affaiblissant `Wrap` et `Manifest.version`.

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

### Clos : une réoptimisation des dépendances tuait la preview

`The requested module '/node_modules/.crypte/deps/react-dom.js?v=…' does not provide an export named 't'`, et `#root` vide pour toujours, rechargement compris.

*Reproduit à la demande*, ce que quatre occurrences n'avaient pas permis, et le déclencheur est plus simple que ce que j'avais d'abord écrit : **ne pas préchauffer**. La première visite d'une copie fraîche suffit, l'optimiseur découvrant les dépendances du paquet lié pendant que la page charge.

*Une première version de cette entrée annonçait un autre déclencheur*, une story tirant une dépendance neuve pendant le chargement. C'était faux, et mesuré comme tel : le dossier des dépendances optimisées ne contenait pas le paquet de cette story quand l'assertion passait, donc le cas passait sans avoir rien déclenché. La leçon est celle du chronomètre : un cas navigateur qui rend en 1,2 s n'a pas fait ce qu'il annonce.

*Déclenchée sur une page posée*, la même réoptimisation ne casse rien : Vite recharge l'iframe et la preview repart seule, mesuré. C'est donc bien une course avec le chargement.

*La cause, mesurée.* Le navigateur assemblait **quatre générations** de paquets : `react.js` et `react-dom.js` en `d376bc5b`, `react-dom_client.js` en `0e03fc0a`, le morceau de runtime partagé en `a85cec4f`, `react-dom_server.js` en `2734d89d`, alors que le disque portait `a4c9ac7f`. L'export `t` manquant est un paquet d'une génération qui interroge le runtime d'une autre.

*Qui gardait l'empreinte périmée :* le paquet de l'espace de travail lié dans `node_modules`. Resservi par le serveur **après** la panne, l'adaptateur portait encore deux empreintes mortes. Un paquet lié est le cas intermédiaire : il est dans `node_modules` par son chemin, donc Vite ne l'invalide pas comme un module du projet, et il n'est pas pré-empaqueté, donc ses URL réécrites survivent à la réoptimisation.

*Clos par* le pré-empaquetage des paquets que `crypte.config.ts` importe, tirés des mêmes imports que l'adaptateur et le `wrap`. `packages/cli/test/reopt.test.ts` reproduit la course : mesuré, il rougit sans le correctif avec l'erreur exacte, et passe avec. Le `retry` de `screen.test.ts` est retiré, et le projet navigateur passe dix cas trois fois d'affilée.

*Ce qui reste :* un paquet lié qu'une story importe sans que la configuration le nomme ne serait pas pré-empaqueté. Aucun usage ne le démontre, et le remède serait le même, une entrée de plus dans `include`.

*Un alias du projet est écarté de cette liste*, et il a fallu le mesurer : `@/adapters/mine` se lit comme un nom nu, donc il partait à l'optimiseur, qui n'a aucun paquet à pré-empaqueter derrière. Le tri se fait par le `capture` du résolveur, pas par une règle sur `@`.

*Un import de types aussi*, trouvé à la revue : `referenced` sautait `typeAnnotation` mais pas `typeArguments`, donc `createAdapter<P>()` emportait `import type { P } from '@acme/types'` dans la liste, et Vite écrivait `Failed to resolve dependency` à chaque démarrage. Mesuré : bruyant, jamais fatal.

*Les deux causes sont nécessaires, mesuré.* Avec le retrait du cache hérité rétabli mais sans le pré-empaquetage, le cas reste **rouge** : le cache hérité et la découverte tardive du paquet lié sont deux mécanismes distincts qui produisent la même erreur.

### Ouvert : un cas de veille tombe rarement sous la charge

`hot.test.ts > reconstruit sur une racine derrière un lien symbolique` a rougi **une fois sur six** lancements complets de la suite, le 19 août 2026. Seul, le fichier passe en 1,38 s.

*Ce que ça fait :* le cas démarre un serveur sur une racine derrière un lien symbolique, écrit une story, et attend que la veille la voie, avec le `expect.poll` de 10 s de la configuration.

*Cause non isolée*, donc non attribuée : sous la charge des 38 fichiers, la veille sur un chemin lié peut dépasser le délai, mais rien ne le démontre. La graine du lancement rouge n'a pas été conservée, ce qui aurait permis de le rejouer, et c'est la leçon immédiate.

*À la prochaine occurrence :* garder la graine, la rejouer par `--sequence.seed`, et regarder si le cas dépasse le délai ou reçoit un événement pour un autre chemin. S'il devient fréquent, il rejoint le projet `écran`, qui existe pour les cas que la charge dérange.

### Clos : l'entrée de preview était servie sans être compilée (`DCJ-224`)

`PREVIEW_ENTRY` vaut `/@crypte/preview.js`, donc Vite la transforme comme du JavaScript et l'expression que `crypte.config.ts` donne à `adapter` y est recopiée telle quelle.

*Mesuré* contre un serveur qui écoute : `GET /@crypte/preview.js` rend 200 avec `const __crypte_adapter = { name: 'fixture' } as Kind`. Dans un navigateur, c'est un `SyntaxError` avant `createPreviewChannel`, donc pas de `ready` et un cadre vide.

*Ce que ça interdit :* toute syntaxe purement TypeScript dans cette expression, `as`, `satisfies`, une énumération, un `namespace`, une propriété de paramètre, un `createAdapter<P>()`. Le tri des positions de type reste utile pour autant, parce qu'un `import type` parti dans `optimizeDeps.include` fait échouer le **démarrage du serveur**, avant tout navigateur.

*Trouvé au tour 5 de la PR #38*, hors périmètre de `DCJ-221`.

*Clos par* `transformWithOxc` dans le hook `load`, du même outil que le `parseSync` que le lecteur de configuration utilise déjà.

*La piste que l'issue annonçait était fausse, et la mesure l'a dit avant le code :* renommer le module virtuel en `.ts` ne change rien, Vite ne transforme pas un module virtuel par son extension. Le chemin public reste donc `/@crypte/preview.js`, ce qui est exact puisque ce qui part est du JavaScript, et la section 4.1 de `contracts.md` n'a pas bougé.

*Arrêté au tour 5 :* les huit noms de déclaration ajoutés aux tours 3 et 4 sont retirés. Chacun couvrait une forme que l'entrée ne peut pas servir, et chacun a ouvert une fuite, dont deux bloquants. La liste des nœuds à valeur tient aux cinq expressions, ce que l'usage démontre.

*Le couplage est tenu par un cas*, ajouté au tour 6 : un test affirme que `PREVIEW_ENTRY` finit en `.js`. Sans lui, le remède de `DCJ-224` réactiverait la fuite en silence, puisque les déclarations sont hors de `VALUED` **parce que** l'entrée est servie en JavaScript.

*À ne pas rouvrir sans une forme mesurée à l'appui :* la redondance des deux filtres n'est surveillée par aucun test, chacun couvrant seul toutes les formes connues. Mesuré au tour 6, et c'est zéro cas rouge des deux côtés, non dix comme une version de `architecture.md` l'a annoncé : le chiffre datait du tour 3, avant que `TYPED` existe. Ce qui tient la redondance est le commentaire du code. Un test qui affirmerait la présence d'une ligne serait le contrôle du contrôle retiré du projet.

*Leçon du tour 6, et elle vaut au-delà de ce tri :* un chiffre mesuré vieillit. Celui-là est resté vrai deux commits, puis a désigné une pièce devenue redondante, et il aurait fait supprimer le garde à qui l'aurait cru. Un chiffre recopié d'un tour à l'autre se remesure ou se retire.

### Le cache de dépendances ne se copie pas avec un projet

`packages/cli/test/screen.test.ts` et `reopt.test.ts` copient le projet de démonstration, `node_modules` compris, et retirent ensuite `node_modules/.crypte`.

**Ce retrait a été perdu, et la panne est revenue.** `7cc83f4` l'avait ajouté en citant cette erreur ; `7483a9c`, la réécriture en fixtures du lot 5b, l'a supprimé sans le voir. `DCJ-221` a été ouverte le jour même pour l'erreur que ce retrait corrigeait. C'est le mode de défaillance que la règle des pièces mobiles vise, et cette entrée portait déjà son « ce qui casse si on l'enlève ».

*Ce que ça a appris :* une ligne de mise en place se perd dans une réécriture, et sa raison ne vit que dans un commentaire que la réécriture emporte aussi. `reopt.test.ts` **affirme** maintenant la condition, `expect(existsSync(…deps)).toBe(false)`, plutôt que de la supposer : une supposition disparaît en silence, une assertion rougit.

*Pourquoi.* Ce dossier est le cache de dépendances optimisées que le serveur de crypte écrit depuis le lot 5b. Hérité par une copie, il décrit des fichiers que cette copie n'a pas écrits : le navigateur recevait `The requested module '/node_modules/.crypte/deps/react-dom.js' does not provide an export named 't'` et la preview restait vide.

*Ce que ça explique.* Tous les rouges intermittents de ce fichier sous le contrôle de mutation, attribués d'abord à la charge puis à des délais trop courts. Les deux étaient faux : la cause dépendait de l'état du cache de la démonstration au moment de la copie, donc elle allait et venait sans rapport avec la charge.

*Ce qui l'a nommée.* Un `#root` vide se lisait « expected '' to contain … », ce qui ne désigne rien. Les cas rendent maintenant l'état visible avec les erreurs de la page, et la cause est apparue à la première occurrence suivante.

*Ce qui casse si on l'enlève :* la copie repart d'un cache qui ne lui appartient pas, et les cas navigateur rougissent une fois sur trois sans dire pourquoi.

*Origine :* lot 5b, quatre occurrences avant d'être nommée.

### Clos : `project.test.ts > échoue sans le résolveur` rougissait par intermittence

Quatre occurrences au lot 5a, dont une sous un `vp test` ordinaire, chaque fois vertes à la relance. Le soupçon portait sur le cache de dépendances partagé par deux serveurs sur la même racine, sans qu'aucune mesure ne l'isole.

*La cause est établie, et ce n'était pas le cache.* `entry.jsx` porte **deux** imports aliasés, `@/components/Badge` et `@/assets`, et l'assertion nommait lequel devait échouer. Vite signale celui qu'il rencontre en premier, et cet ordre n'est pas stable : la CI du lot 5b l'a fait rougir sur Node 24 pendant que Node 22 passait.

*Clos par* un motif qui ne nomme plus l'import, seulement l'échec de résolution d'un chemin aliasé. Le cas reste un contrôle négatif, il ne dépend plus de l'ordre.

*Ce que ça a appris :* trois hypothèses avaient été formées sur l'environnement, aucune sur l'assertion. Un rouge qui suit la plateforme désigne d'abord ce que le test affirme.

### Deux points laissés ouverts à la sortie du brouillon du lot 5a

**Le saut de `typeAnnotation` dans la collecte des noms liés n'est gardé par rien.** `serve.ts` en porte deux : celui de la lecture des noms référencés est catalogué, celui de la lecture des liaisons ne l'est pas. Retirer le second laisse la suite verte, parce que le premier écarte déjà l'identifiant avant qu'il compte.

*Pourquoi ce n'est pas corrigé ici :* la ligne n'est pas morte, elle est redondante avec l'autre. Elle redevient seule si la lecture des noms référencés change, et c'est précisément le jour où personne ne s'en apercevra. La garder sans garantie est un pari assumé ; la retirer aussi.

*Ce qui le trancherait :* trouver une forme où une annotation atteint la lecture des liaisons sans passer par l'autre. Rien n'en a produit sur cette pull request.

**L'installation de Chromium en CI coûte 95 Mo par exécution et par version de Node.** Elle n'est pas mise en cache, et son chemin `node_modules/playwright/cli.js` suppose le hissage à la racine du dépôt.

*Le cache est posé*, sur `~/.cache/ms-playwright`, avec une clé sur la version du catalogue. `--with-deps` reste lancé même sur une touche : les paquets système apt ne vivent pas dans ce dossier.

*Mesuré, et ça sépare les deux moitiés de l'étape.* À vide, l'installation a coûté 3 min 26 sur un runner et **19 min 50 sur l'autre**, tuée par le budget. Avec la touche : restauration de 282 Mo en **2 s**, étape réduite à **1 min 19**, ce qui ne reste que l'apt, et job entier à **2 min 4**. Le téléchargement était donc la moitié coûteuse, et la variable.

*`--with-deps` ne tourne plus que sur un manque de cache.* Deux fois il a mangé le budget entier du job, tué à 20 min et 20 min 17 sans une ligne d'erreur, une fois sur chaque version de Node, alors que le job d'à côté passait en 1 min 9 avec la même touche de cache. Ce qui traîne est l'`apt`, pas le téléchargement.

*Ce qui justifie de le sauter sur une touche :* sur les lancements rapides, `apt` n'avait **rien** à installer, donc l'image de GitHub porte déjà les bibliothèques de Chromium. Sur un manque il tourne toujours, avec une borne de 8 minutes à l'étape : un échec qui nomme l'étape vaut mieux qu'une annulation du job qui ne nomme rien.

*Ce qui reste :* si une image future retire une de ces bibliothèques, un lancement avec cache réussi lancera un Chromium qui ne démarre pas. Le mode d'échec est bruyant et immédiat, et le lancement suivant sans cache réinstallera les paquets.

*Ce qui reste :* le chemin `node_modules/playwright/cli.js` suppose toujours le hissage à la racine. Son mode d'échec est un rouge bruyant et immédiat, pas un silence.

*Ce que ça a coûté avant d'être posé :* le budget du job, ramené de 20 à 10 minutes au retrait du contrôle de mutation sur une mesure de moins de 2 min prise navigateur déjà présent. Le job s'est fait tuer à 10 min 17 sur cette installation, sans aucune ligne d'erreur, ce qui est le mode d'échec le plus désagréable. **Un chiffre de budget se change en relisant ce que le registre en dit** : celui-ci annonçait 9 min 11.

*Ce qui le lèverait :* `actions/cache` sur `~/.cache/ms-playwright`, clé sur la version de Playwright du catalogue.

*Origine :* revue 12 de la PR #33.

### Les copies de projet des cas de rechargement touchent trois outils

`packages/cli/test/screen.test.ts` et `hot.test.ts` copient un projet dans l'espace de travail, parce que hors du dépôt `crypte.config.ts` ne résout plus `@crypte/cli`. Cette copie est visible par trois outils qui ne l'attendent pas.

*pnpm.* `apps/*` en fait un paquet de l'espace de travail, donc un `pnpm install` lancé pendant qu'une copie existe l'inscrit dans le fichier de verrouillage. Mesuré : 28 lignes ajoutées, et un contrôle refusant de partir sur un arbre sale. Fermé par `!apps/tmp-demo-*` dans `pnpm-workspace.yaml`.

*Git.* Les copies sont ignorées, donc `git status --porcelain` ne les montre pas : un contrôle qui vérifie la propreté de l'arbre ne les verra jamais, et une copie oubliée survit sans que rien ne le dise.

*Fermé.* `test/sweep-tmp.mjs`, un `globalSetup`, efface les copies au démarrage de la suite. Les fixtures démontent la leur même quand le cas lève ; ce que ce ramassage ajoute est le cas du processus tué, qui en avait laissé soixante-huit.

*Origine :* lot 5b.

### Le séparateur en fin de préfixe du surveillant n'est gardé par rien

`watchStories` compare le chemin d'un événement au dossier des stories, séparateur compris. Sans ce séparateur, un dossier voisin nommé `stories-old` passe le filtre.

*Ce que ça coûte alors :* une reconstruction du catalogue par sauvegarde dans ce dossier voisin. Rien de plus : `buildCatalogue` ne lit que le dossier des stories, donc le manifeste est identique, la forme aussi, et ni le shell ni la preview ne voient quoi que ce soit.

*Pourquoi il n'y a ni cas ni garantie :* la différence n'est pas observable de l'extérieur. Un premier cas a été écrit puis retiré, parce qu'il affirmait que le catalogue ne changeait pas, ce qui est vrai avec ou sans le séparateur : un test qui ne peut pas échouer.

*Ce qui le rendrait observable :* compter les reconstructions, donc exposer un compteur qui n'existe que pour les tests. Le coût du défaut ne le justifie pas.

*Origine :* exploration du lot 5b.

### Le compte rendu d'un rejeu à chaud n'est gardé qu'au niveau du canal

`createPreviewChannel` retient la dernière demande et rend un `again()` qui redessine **avec** son `rendered` ou son `error`. C'est ce qui ferme le point bloquant de la revue du lot 5b : dessiner depuis l'entrée générée laissait une édition ratée jeter dans le callback de mise à jour, sans rien remonter au shell.

*Ce qui le garde :* trois cas unitaires dans `packages/core/test/preview.test.ts`, et une garantie du catalogue qui remplace `draw(asked)` par un appel direct au gestionnaire.

*Ce qui ne le garde pas, et pourquoi c'est écrit ici :* un cas navigateur a été écrit, qui casse puis répare une story et regarde le panneau d'erreur s'ouvrir et se fermer sans clic. Éprouvé contre une version du canal privée de son compte rendu, **bundle reconstruit et vérifié**, il passe quand même. Il coûtait deux minutes de navigateur et ne distinguait rien : retiré.

*Ce qui n'est pas expliqué :* ce qui referme le panneau dans ce cas-là, puisque ni rechargement du cadre ni `rendered` ne sont en jeu. La question reste ouverte et vaut d'être reprise si un défaut de cette zone remonte.

*Ce que le rejeu ne couvre pas :* un composant. Fast Refresh de React en fait une frontière, donc la mise à jour s'y arrête et l'entrée générée n'est jamais rappelée.

*Origine :* revue 1 du lot 5b.

### Deux lancements de tests simultanés s'effacent leurs copies de projet

`test/sweep-tmp.mjs` efface `tmp-hot-*`, `tmp-dev-*` et `tmp-demo-*` au démarrage de la suite. Deux `vp test` lancés en parallèle, ou un `vp test` pendant qu'un autre tourne en veille, se prennent donc leurs copies pendant qu'ils les utilisent.

*Ce que ça donnerait :* des `ENOENT` intermittents dans le lancement le plus ancien, sans rapport apparent avec le cas qui rougit.

*Pourquoi ce n'est pas traité :* ce n'est pas arrivé, et le dépôt a un seul mainteneur. Le périmètre du dépôt est ce que l'usage démontre.

*Ce qui le lèverait :* n'effacer que les copies dont la date de modification dépasse l'heure, ou nommer chaque copie par le pid du processus et n'effacer que celles des autres.

*Origine :* exploration du lot 5b.

### Rien n'empêche de baisser un seuil de couverture

`test/coverage-thresholds.json` porte les quatre seuils, et le contrôle `coverage` les applique. Les baisser suffit à faire passer une régression de couverture, et rien ne le signale.

*Pourquoi ce n'est pas traité :* la règle écrite est que les seuils montent quand un lot les dépasse. Un mécanisme qui l'imposerait devrait garder un historique du chiffre, donc un troisième artefact à tenir frais, ce que le contrôle de mutation a déjà coûté une fois.

*Ce qui le rendrait visible sans machinerie :* le diff. Une baisse de seuil est une ligne dans un fichier de quatre lignes, et la revue la voit.

*Origine :* exploration du lot 5b.

### Un nom `__crypte_` dans la configuration du projet percuterait l'entrée

Tout ce que l'entrée générée déclare porte le préfixe `__crypte_`, ce qui la met hors d'atteinte des noms qu'un `crypte.config.ts` importe. La réciproque n'est pas gardée : un projet qui importerait lui-même un `__crypte_adapter` percuterait le préambule, et la preview ne chargerait pas du tout.

*Pourquoi ce n'est pas gardé :* aucun usage ne le démontre, et le préfixe est déjà l'endroit le plus improbable où un projet irait chercher un nom. Le mode d'échec est bruyant et immédiat, un `SyntaxError` au chargement.

*Ce qui le lèverait :* refuser un import dont le nom local commence par le préfixe, en le nommant. Treize cas éprouvent déjà l'inverse, donc le patron est là : le quatorzième est une ligne.

*Ce qui le rendrait nécessaire :* un plugin ou une convention qui pousserait les projets à employer ce préfixe.

*Origine :* revue 3 du lot 5d.

### Une enveloppe mal formée échoue à l'exécution, pas à la lecture

`wrapsOf` met à plat ce que le type déclare, et rien de plus. Mesuré sur deux formes que le type interdit mais qu'un `as` laisse passer :

* `[[Composant, 42]]` rend `props: 42`, que React refuse en levant.
* `[[[Composant]]]` rend un tableau comme composant, que React refuse aussi.

*Pourquoi ce n'est pas gardé :* le mode d'échec est bruyant et il arrive au bon endroit. La preview attrape l'erreur du rendu et l'envoie au shell avec l'identifiant de la story, qui l'affiche dans son panneau. Un contrôle de forme dans le noyau ajouterait du code pour transformer une erreur nommée en une autre.

*Ce qui le rouvrirait :* un message de React trop obscur pour désigner l'enveloppe fautive. Il faudrait alors nommer l'entrée, pas valider sa forme.

*Origine :* exploration du lot 5d.

### Clos : `App.vue` échappait à la mesure de couverture

Le fournisseur v8 ne sait pas parser un composant monofichier **brut**, et istanbul non plus : mesuré dans les deux sens. La cause n'était pas le fournisseur mais l'absence de test qui charge le fichier.

*Clos par `apps/shell/test/app.test.ts`*, treize cas qui montent le composant dans jsdom. Le plugin Vue le transforme, v8 le suit par sa carte de sources, et il paraît au rapport à **98,2 %** d'instructions et 88 % de branches. L'exclusion `**/*.vue` a été retirée.

### La ligne « preview prête » n'est jamais visible

Sur un message `ready`, `App.vue` écrit `preview prête, protocole v{n}` dans la ligne d'état, puis appelle `refresh()`, qui la remplace par le compte de stories dans le même tour. Le numéro de protocole n'est donc jamais montré à personne.

*Trouvé par* le premier test qui monte le composant : le cas attendait cette ligne et lisait « 3 stories ».

*Pourquoi ce n'est pas corrigé ici :* c'est un choix d'interface, pas un défaut de logique. Soit la ligne disparaît, soit elle survit à un rafraîchissement, et les deux demandent de décider ce que la ligne d'état raconte. Le test fixe le comportement actuel et cite cette entrée.

### Clos : le verdict `AILLEURS` du contrôle de mutation

`La simulation refuse une livraison hors origine` était rendue « vue par autre chose » par le contrôle complet, alors que la garantie était tenue, mesuré deux fois : `ui.test.ts` lancé seul sous mutation donnait un seul rouge, et c'était le gardien nommé.

*Clos par le retrait du contrôle.* Le dernier audit avant suppression a rendu **130 garanties sur 131 vues**, la seule exception étant celle-ci, un faux négatif de l'outil et non un trou de protection. Le cas reste gardé par `ui.test.ts`, et l'outil qui le diagnostiquait mal n'existe plus.

