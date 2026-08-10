# Architecture du dépôt

> Décrit l'état du dépôt aujourd'hui, pas ce qui est prévu. Les contrats du produit (format de story, manifeste, protocole du canal, contrat de plugin) sont dans `spec-contrats.md` et ne sont pas répétés ici.

Le dépôt est un monorepo. Il contient trois paquets publiables sous le scope `@crypte` et la chaîne d'outillage qui les vérifie et les construit. À ce stade, **aucune fonctionnalité produit n'est implémentée** : ce qui existe est le squelette, la chaîne de build et les garde-fous.

---

## 1. Ce que contient le dépôt

### Fichiers racine

**`package.json`**
Paquet privé, jamais publié. Il déclare les espaces de travail (`packages/*`, `apps/*`) et les quatre scripts d'entrée : `check`, `test`, `pack`, `ready`. Il porte aussi `vite-plus` en `devDependencies`, sans quoi les fichiers de configuration ne peuvent pas importer `defineConfig`.
*Sans lui :* aucune commande ne trouve les paquets, le monorepo n'existe pas.

**`pnpm-workspace.yaml`**
Déclare les mêmes espaces de travail pour pnpm, plus le catalogue de versions partagées. Le catalogue épingle `typescript` sur une version exacte et `@types/node` sur une plage. Les paquets y font référence avec `"typescript": "catalog:"` au lieu d'écrire un numéro chacun de leur côté.
*Sans lui :* pnpm ignore le champ `workspaces` du `package.json` et traite le dépôt comme un paquet unique. Les dépendances entre paquets locaux ne se résolvent plus, et les versions divergent paquet par paquet.

**`vite.config.ts`**
Configuration unique de l'outillage, à la racine. Cinq blocs : `run` (cache des tâches), `lint`, `fmt`, `test`, `staged`. Le bloc `fmt` fixe les conventions d'écriture et exclut `docs/**` et `README.md` du reformatage automatique, pour que les documents de référence ne soient pas réécrits par l'outil.
*Sans lui :* chaque commande retombe sur ses valeurs par défaut. Le formatage réécrirait la documentation, et les règles de style ne seraient plus partagées.

**`tsconfig.base.json`**
Porte la sévérité TypeScript, partagée par tous les paquets : `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, et surtout `moduleResolution: "bundler"`.
*Sans lui :* chaque paquet redéfinirait sa propre sévérité et elles divergeraient. Sans `moduleResolution: "bundler"` en particulier, les sous-chemins d'exports comme `@crypte/core/protocol` ne se résolvent pas correctement.

**`tsconfig.json`**
Ne contient aucun fichier, seulement des références vers les trois paquets. C'est le point d'entrée de la vérification de types sur l'ensemble du dépôt.
*Sans lui :* la vérification de types doit être lancée paquet par paquet.

**`.github/workflows/ci.yml`**
Trois jobs : `check` en matrice Node 22 et 24, `dependency-review` sur les pull requests, et `ci-passed` qui agrège les deux. Toutes les actions sont épinglées par empreinte de commit et non par étiquette mobile.
L'ordre des étapes de `check` est significatif : `install`, `check`, `pack`, `test`, `git diff --exit-code`.
*Sans lui :* rien n'est vérifié automatiquement. Et si l'ordre change, voir la section 4 : le test d'isolation devient silencieux.

**`.github/dependabot.yml`**
Surveille uniquement les actions GitHub, pour que les empreintes épinglées du workflow ne se périment pas en silence.
*Sans lui :* les actions restent figées sur des versions qui vieillissent sans que personne ne le voie, y compris en cas de correctif de sécurité.

**`CLAUDE.md`**
Les contraintes structurelles et les règles de travail, à destination des agents. Elles y sont écrites une fois plutôt que répétées à chaque session.
*Sans lui :* les contraintes vivent dans la mémoire de conversations passées, et se perdent.

**`CONTRIBUTING.md`**
Installation, vérification, conventions de commit et de pull request, pour un contributeur extérieur. Générique et sans référence à un outil de suivi privé.
*Sans lui :* un contributeur découvre les conventions par le refus de son intégration continue.

**`.gitignore`**
Exclut notamment `dist/` et `.vite/`. Les artefacts de construction ne sont pas versionnés, ils sont reconstruits par `vp pack`.

### `packages/core` : `@crypte/core`

Le noyau. Trois entrées indépendantes, chacune produisant son propre bundle et ses propres types :

| Entrée | Contenu aujourd'hui |
|---|---|
| `src/protocol/` | La version du protocole et les types des messages échangés entre le shell et la preview |
| `src/ui/` | Un marqueur seulement |
| `src/preview/` | Un marqueur seulement |

`protocol` est le seul à contenir du code utile. Les deux autres n'exportent qu'une constante servant au test d'isolation.

Ce paquet n'a **aucune dépendance d'exécution**. Vue y figure en dépendance de pair optionnelle, en prévision des primitives d'interface.

*Sans lui :* les deux autres paquets n'ont plus de vocabulaire commun. Le CLI et l'adaptateur ne peuvent plus se parler.

### `packages/cli` : `@crypte/cli`

Le paquet installé par l'utilisateur. Il déclare le binaire `crypte`. Le nom du paquet et celui de la commande sont volontairement différents.

Aujourd'hui, le binaire affiche la version du protocole et un message indiquant qu'aucune commande n'est implémentée. Il n'y a ni `dev`, ni `init`, ni `check`.

Son fichier d'entrée porte un shebang. La chaîne de construction le préserve et pose le bit exécutable sur le fichier produit.

*Sans lui :* il n'y a aucun point d'entrée utilisateur.

### `packages/react` : `@crypte/react`

L'adaptateur de framework. Aujourd'hui il n'exporte que son nom et la version du protocole qu'il relaie.

React et React DOM y sont déclarés en dépendances de pair, jamais en dépendances directes. C'est ce qui garantit qu'une seule copie de React est chargée : celle du projet de l'utilisateur.

*Sans lui :* rien ne sait monter un composant.

### `apps/`

**Ce dossier n'existe pas encore.** Il est déclaré dans les espaces de travail, mais aucune application n'y a été créée.

Il accueillera `apps/shell`, l'application d'interface, qui n'est pas un paquet publié : sa sortie compilée sera embarquée dans `@crypte/cli`. C'est aujourd'hui la pièce manquante la plus visible, et rien de ce qui est décrit en section 2 ne peut fonctionner sans elle.

### `docs/`

Documents de référence. `spec-contrats.md` fait foi pour les quatre contrats du produit. Ces fichiers sont exclus du formatage automatique.

---

## 2. Parcours d'une commande

Voici ce qui devrait se passer quand un utilisateur tape `crypte dev`, et où en est chaque étape.

**1. Résolution du binaire.** `crypte` est résolu depuis les binaires installés du projet, vers le fichier d'entrée de `@crypte/cli`, exécuté par Node grâce à son shebang.
→ *Existe.* C'est la seule étape complète du parcours.

**2. Lecture de la commande.** Le point d'entrée examine les arguments et route vers la commande demandée.
→ *Partiel.* Le routage existe mais ne connaît que `--version`. `dev` n'est pas reconnu.

**3. Chargement de la configuration du projet.** Le CLI lit le fichier de configuration à la racine du projet utilisateur pour connaître la racine des stories, l'adaptateur, l'entrée CSS et les enveloppes globales. Il lit aussi les alias de chemins depuis le `tsconfig.json` ou le `jsconfig.json` du projet.
→ *N'existe pas.*

**4. Découverte des stories et manifeste.** Le CLI parcourt la racine des stories, analyse chaque fichier statiquement, et produit un manifeste : l'arbre de navigation, les identifiants, les types de props.
→ *N'existe pas.* La forme du manifeste est spécifiée, rien ne le produit.

**5. Démarrage du serveur.** Le CLI lance un serveur de développement qui sert deux choses : l'application d'interface et une page de preview isolée dans une iframe.
→ *N'existe pas.* L'application d'interface elle-même n'existe pas.

**6. Le shell affiche l'arbre.** L'interface lit le manifeste et construit sa navigation.
→ *N'existe pas.*

**7. L'utilisateur choisit une story.** Le shell envoie un message `render` à la preview, avec l'identifiant de l'entrée et les éventuelles surcharges. Le shell ne transmet jamais les props elles-mêmes.
→ *Types définis, mécanisme absent.* Les formes des messages sont déclarées dans `protocol`, mais rien ne les émet ni ne les reçoit.

**8. La preview monte le composant.** La preview importe directement le module de story, ce qui lui donne les vraies valeurs, y compris les fonctions et les éléments. Elle passe la main à l'adaptateur, qui monte le composant dans le DOM de l'iframe.
→ *N'existe pas.* L'adaptateur ne sait pas encore monter.

**9. Retour au shell.** La preview répond `rendered`, ou `error` si le rendu a échoué, auquel cas le shell affiche l'erreur sans tomber.
→ *Types définis, mécanisme absent.*

**En résumé :** sur les neuf étapes, une fonctionne, une est partielle, sept n'existent pas. Ce qui est acquis aujourd'hui est la structure qui permet de les écrire sans se contredire.

---

## 3. Quatre contraintes structurelles

Ces règles ne sont pas des préférences. Chacune protège d'une panne précise, et trois d'entre elles sont difficiles à corriger une fois le code écrit.

### Le noyau n'est pas embarqué dans les paquets qui en dépendent

`@crypte/core` est une dépendance déclarée du CLI et de l'adaptateur, pas un code recopié dans chacun d'eux. Il est installé une fois et partagé.

*Si on l'embarque :* le CLI et l'adaptateur chargent chacun leur copie du même module. Tout ce qui porte un état au niveau du module se dédouble en silence, et le symptôme observé n'a aucun rapport visible avec sa cause. C'est le même problème qu'une double copie de React, un étage plus bas et plus difficile à diagnostiquer.

### L'application d'interface est séparée du noyau

Une bibliothèque et une application n'ont ni le même mode de construction, ni le même cycle de vie. Le noyau exporte des primitives, l'application les assemble.

*Si on les fusionne :* un paquet publié doit produire deux sorties incompatibles dans le même dossier, et l'utilisateur se retrouve à télécharger une application alors qu'il voulait une bibliothèque.

### Les trois entrées du noyau restent étanches

Importer `@crypte/core/protocol` ne doit rien charger de `ui` ni de `preview`. C'est ce qui permet de n'avoir qu'un paquet là où il en faudrait trois.

Cette étanchéité ne vient pas de l'outil de construction, elle vient du graphe des imports, et elle tombe sans le moindre avertissement le jour où un fichier commun apparaît. Elle est donc **vérifiée par un test**, pas par la relecture.

*Si on la retire :* le paquet reste fonctionnel mais grossit, et un consommateur qui ne voulait que les types du protocole charge tout le reste.

### Aucun code publié n'importe l'outillage

`vite-plus` n'apparaît que dans les scripts et les fichiers de configuration. Aucun fichier de `packages/` ne l'importe.

L'outillage est en version pré-1.0 et des ruptures sont attendues. La règle garantit qu'une rupture se corrige dans des scripts et des fichiers de configuration, jamais dans du code publié aux utilisateurs.

*Si on la retire :* une montée de version de l'outillage devient une version majeure des paquets publiés.

---

## 4. Les tests

Deux fichiers, tous deux dans `packages/core`.

**`src/protocol/index.test.ts`**
Vérifie que la version du protocole est bien exposée. Le test est trivial et c'est voulu : il sert à prouver que la chaîne de test fonctionne réellement, plutôt que de laisser la commande passer au vert faute de test à exécuter.

**`test/isolation.test.ts`**
Vérifie l'étanchéité décrite en section 3, en lisant le bundle construit et non les sources. Il porte trois garanties :

1. Le bundle de `protocol` ne contient aucun marqueur provenant de `ui` ou de `preview`.
2. Le bundle de `protocol` ne comporte aucun import relatif, donc ne dépend d'aucun morceau partagé. **C'est l'assertion qui garde réellement**, la première ne suffit pas : quand une fuite est introduite, l'outil produit un morceau séparé et un import plutôt que de recopier le code, si bien que le marqueur reste absent du bundle et que la première assertion passe malgré la fuite.
3. Le test échoue explicitement si les artefacts sont absents, plutôt que de passer au vert sans rien avoir vérifié.

Cette dernière garantie explique l'ordre des étapes de l'intégration continue : la construction doit précéder les tests. Dans l'ordre inverse, le test lirait des artefacts absents et signalerait une erreur d'exécution au lieu de vérifier quoi que ce soit.

La fraîcheur des artefacts n'est volontairement pas vérifiée par comparaison de dates. Le cache de tâches restaure les fichiers construits avec leurs dates d'origine, ce qui provoquerait des échecs sur un état pourtant correct. Elle repose sur deux mécanismes plus fiables : le cache s'invalide quand les sources changent, et l'intégration continue construit avant de tester.

---

## 5. Décisions encodées dans la configuration

Ces réglages ont l'air anodins et ne le sont pas. Chacun a été mis là pour une raison précise, et chacun est le genre de ligne qu'on supprime en croyant nettoyer.

Le format est le même pour tous : ce que ça fait, pourquoi ça existe, ce qui casse si on l'enlève.

### `ci-passed`, le job agrégateur

**Ce que ça fait.** Un job qui dépend de tous les autres, s'exécute avec `if: always()`, et échoue si l'un d'eux a échoué ou a été annulé. Un job ignoré compte comme un succès, ce qui est voulu : `dependency-review` ne tourne que sur les pull requests.

**Pourquoi.** C'est le seul contrôle exigé par les règles de la branche par défaut. Sans lui, il faut exiger les jobs un par un, `check (22)` et `check (24)`, ce qui grave la composition de la matrice dans un réglage stocké hors du dépôt.

**Ce qui casse si on l'enlève.** Le jour où `engines` remonte à Node 24 et que 22 quitte la matrice, le contrôle `check (22)` n'est plus jamais rapporté. La pull request reste bloquée indéfiniment, en attente d'un contrôle qui ne viendra pas, et sans message expliquant pourquoi. Avec l'agrégateur, la matrice peut changer librement.

La condition utilise `contains(needs.*.result, 'failure')` et non une liste de jobs écrite à la main. Une liste se désynchronise le jour où l'on ajoute un job sans penser à l'y inscrire, et l'agrégat passe au vert en ignorant ce job : le même piège qu'un test qui passe pour la mauvaise raison.

### `concurrency` avec `cancel-in-progress`

**Ce que ça fait.** Deux poussées rapprochées sur la même référence n'exécutent que la dernière, la précédente est annulée.

**Pourquoi.** Vérifier deux fois de suite un état intermédiaire ne renseigne sur rien.

**Ce qui casse si on l'enlève.** Rien de fonctionnel, seulement du temps de calcul et de l'attente.

Règle à retenir si un autre workflow apparaît : `cancel-in-progress: true` pour ce qui vérifie, `false` pour ce qui modifie un état. On n'annule jamais une publication en cours.

### `fail-fast: false` sur la matrice

**Ce que ça fait.** Un échec sur Node 22 n'annule pas le job Node 24.

**Pourquoi.** La matrice existe pour dire si une rupture touche une version ou les deux.

**Ce qui casse si on l'enlève.** La matrice ne renseigne plus. Un échec sur la première version annule la seconde, et on ignore si le problème est spécifique à une version, ce qui est précisément la question posée.

### `permissions: contents: read`

**Ce que ça fait.** Réduit le jeton fourni aux jobs à la lecture du dépôt.

**Pourquoi.** Sans déclaration explicite, le jeton par défaut peut être bien plus large que nécessaire.

**Ce qui casse si on l'enlève.** Rien visiblement, et c'est le problème : une action compromise ou une dépendance malveillante disposerait de droits d'écriture sur un dépôt public.

### `timeout-minutes: 10`

**Ce que ça fait.** Interrompt un job qui dépasse dix minutes.

**Pourquoi.** La chaîne complète prend moins d'une minute. Dix minutes laissent une marge confortable.

**Ce qui casse si on l'enlève.** Un job bloqué, sur une attente réseau par exemple, tourne jusqu'à la limite par défaut de six heures avant d'être tué, en consommant du quota et en retardant le retour.

### `workflow_dispatch`

**Ce que ça fait.** Permet de relancer le workflow à la main depuis l'interface.

**Pourquoi.** Un échec dû à un incident extérieur ne devrait pas exiger un nouveau commit.

**Ce qui casse si on l'enlève.** Débloquer une pull request demande de pousser un commit vide, qui pollue l'historique pour une raison qui n'a rien à voir avec le code.

### `dependency-review` sur les pull requests

**Ce que ça fait.** Refuse une pull request qui introduit une dépendance portant une vulnérabilité connue.

**Pourquoi.** Gratuit sur un dépôt public, et c'est le moment le moins cher pour attraper le problème.

**Ce qui casse si on l'enlève.** Une dépendance vulnérable entre sans que rien ne le signale, et on l'apprend plus tard par une alerte, une fois le code déjà en place.

### Dependabot limité aux actions GitHub

**Ce que ça fait.** Surveille `github-actions`, et rien d'autre.

**Pourquoi.** Les empreintes de commit épinglées dans le workflow ne se périment pas bruyamment : sans surveillance, elles vieillissent en silence.

**Ce qui casse si on l'enlève.** Les actions restent figées, correctifs de sécurité compris.

**Pourquoi npm n'y est pas.** Dependabot ne gère pas correctement cette configuration précise. Trois défauts ouverts dans `dependabot-core` : pnpm 11 n'est pas supporté (#14794), et le protocole `catalog` produit un lockfile incorrect (#14339, #12244). Notre lockfile vient de pnpm 11 et notre catalog épingle TypeScript, donc les trois nous concernent. À reconsidérer quand ils seront clos, pas avant : un lockfile corrompu par une mise à jour automatique coûte plus cher que des dépendances qui vieillissent doucement.

### `exports` désactivé sur `@crypte/cli`

**Ce que ça fait.** La génération automatique du champ `exports` est active sur `core` et `react`, désactivée sur `cli`, où `bin` est écrit à la main.

**Pourquoi.** Avec la génération active, l'outil réécrit aussi `bin` en dérivant son nom de celui du paquet. `@crypte/cli` devenait `{ "cli": ... }`, donc la commande installée s'appelait `cli` et non `crypte`.

**Ce qui casse si on l'enlève.** La commande de l'utilisateur change de nom au prochain `vp pack`, en contradiction avec la section 1.4 de la spécification, et rien ne le signale : le paquet se construit sans erreur.

### TypeScript épinglé sur une version exacte

**Ce que ça fait.** Le catalog déclare `typescript: 7.0.2`, pas une plage.

**Pourquoi.** TypeScript 7 n'a pas encore d'API stable, et l'outil de construction émet un avertissement à chaque génération de types. C'est cette même version qui portera plus tard l'extraction des types de props.

**Ce qui casse si on l'enlève.** Une version corrective change silencieusement le comportement de la génération de types, sur une API annoncée comme expérimentale, et la régression apparaît chez les consommateurs des paquets plutôt qu'ici.

### `devEngines` écrit par l'outillage

**Ce que ça fait.** Le `package.json` racine contient un bloc `devEngines.packageManager` qui épingle le gestionnaire de paquets.

**Pourquoi.** Il n'a pas été écrit à la main : `vp install` l'ajoute lui-même. On le laisse en place volontairement.

**Ce qui casse si on l'enlève.** Rien, jusqu'au prochain `vp install` qui le réécrit à l'identique. Le retirer produit une modification non commitée qui fait échouer le contrôle `git diff --exit-code` de l'intégration continue, pour un fichier que personne n'a modifié.
