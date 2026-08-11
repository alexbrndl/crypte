# Architecture du dépôt

> Décrit l'état du dépôt aujourd'hui, pas ce qui est prévu. Les contrats du produit (format de story, manifeste, protocole du canal, contrat de plugin) sont dans `spec-contrats.md` et ne sont pas répétés ici.

Le dépôt est un monorepo. Il contient trois paquets publiables sous le scope `@crypte` et la chaîne d'outillage qui les vérifie et les construit. À ce stade, **aucune fonctionnalité produit n'est implémentée** : ce qui existe est le squelette, la chaîne de build et les garde-fous.

---

## 1. Ce que contient le dépôt

### Fichiers racine

**`package.json`**
Paquet privé, jamais publié. Il déclare les espaces de travail (`packages/*`, `apps/*`) et les scripts d'entrée : `check`, `test`, `pack`, `ready`, plus `prepare` qui installe le hook de pré-commit à l'installation des dépendances (section 7). Il porte aussi `vite-plus` en `devDependencies`, sans quoi les fichiers de configuration ne peuvent pas importer `defineConfig`.
*Sans lui :* aucune commande ne trouve les paquets, le monorepo n'existe pas.

**`pnpm-workspace.yaml`**
Déclare les mêmes espaces de travail pour pnpm, plus le catalogue de versions partagées. Le catalogue épingle `typescript` sur une version exacte et `@types/node` sur une plage. Les paquets y font référence avec `"typescript": "catalog:"` au lieu d'écrire un numéro chacun de leur côté.
*Sans lui :* pnpm ignore le champ `workspaces` du `package.json` et traite le dépôt comme un paquet unique. Les dépendances entre paquets locaux ne se résolvent plus, et les versions divergent paquet par paquet.

**`vite.config.ts`**
Configuration unique de l'outillage, à la racine. Cinq blocs : `run` (cache des tâches), `lint`, `fmt`, `test`, `staged`. Le bloc `lint` active `typeAware` et `typeCheck` : sans eux, **aucune vérification de types ne tourne**, ni en local ni en intégration continue. Le bloc `fmt` fixe les conventions d'écriture et exclut `docs/**` et `README.md` du reformatage automatique, pour que les documents de référence ne soient pas réécrits par l'outil.
*Sans lui :* chaque commande retombe sur ses valeurs par défaut. Le formatage réécrirait la documentation, et les règles de style ne seraient plus partagées.

**`tsconfig.base.json`**
Porte la sévérité TypeScript, partagée par tous les paquets : `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, et surtout `moduleResolution: "bundler"`.
*Sans lui :* chaque paquet redéfinirait sa propre sévérité et elles divergeraient. Sans `moduleResolution: "bundler"` en particulier, les sous-chemins d'exports comme `@crypte/core/protocol` ne se résolvent pas correctement.

**`tsconfig.json`**
Ne contient aucun fichier, seulement des références vers les trois paquets. C'est le point d'entrée de la vérification de types sur l'ensemble du dépôt.
*Sans lui :* la vérification de types doit être lancée paquet par paquet.

**`.github/workflows/ci.yml`**
Trois jobs : `check` en matrice Node 22 et 24, `dependency-review` sur les pull requests, et `ci-passed` qui agrège les deux. Toutes les actions sont épinglées par empreinte de commit et non par étiquette mobile.
L'ordre des étapes de `check` est significatif : `install`, `pack`, `check`, `test`, `git diff --exit-code`.
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

**`.github/workflows/require-review.yml`**
Vérifie qu'une revue a été postée sur la pull request. Il ne produit aucune revue lui-même, voir la section 6.
*Sans lui :* une pull request peut être fusionnée sans qu'aucune relecture n'ait eu lieu, et rien ne le rappelle.

**`.claude/skills/review/SKILL.md`**
Le prompt de revue, lancé en local par `/review`.
*Sans lui :* le contrôle ci-dessus ne peut jamais être satisfait.

**`.vite-hooks/pre-commit`**
Le hook de pré-commit, versionné, qui lance `vp staged`. Voir la section 7.
*Sans lui :* le bloc `staged` de `vite.config.ts` n'est jamais appelé, et un fichier mal formaté part en commit.

**`.gitignore`**
Exclut notamment `dist/` et `.vite/`. Les artefacts de construction ne sont pas versionnés, ils sont reconstruits par `vp pack`.

### `packages/core` : `@crypte/core`

Le noyau. Trois entrées indépendantes, chacune produisant son propre bundle et ses propres types :

| Entrée | Contenu aujourd'hui |
|---|---|
| `src/protocol/` | La version du protocole et les types des messages échangés entre le shell et la preview |
| `src/ui/` | `createShellChannel`, le côté shell du canal |
| `src/preview/` | `createPreviewChannel`, le côté iframe du canal |

Chaque entrée exporte aussi une constante marqueur, utilisée par le test d'isolation.

**Aucune des trois n'importe de framework de rendu**, et une règle de lint l'interdit sur tout `core/src`. Voir la section 10.

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

`apps/shell` est l'application d'interface, **privée et jamais publiée** : sa sortie compilée sera embarquée dans `@crypte/cli`.

Elle sert deux pages depuis un même serveur Vite : `index.html` monte le shell en Vue, `preview.html` monte la preview en React. Les deux ne communiquent que par le canal.

Elle contient aussi `Badge.tsx`, un composant codé en dur. Il n'y a aucune découverte de fichiers : c'est le seul composant que la preview sait monter.

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

**En résumé :** les étapes 1, 7, 8 et 9 fonctionnent, la 2 est partielle, les étapes 3 à 6 n'existent pas. Le canal complet est éprouvé de bout en bout, mais sur un composant codé en dur : rien ne découvre encore de fichier ni ne produit de manifeste.

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

Cette garantie explique en partie l'ordre des étapes de l'intégration continue : la construction doit précéder les tests. Dans l'ordre inverse, le test lirait des artefacts absents et signalerait une erreur d'exécution au lieu de vérifier quoi que ce soit.

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

---

## 6. La revue de pull request

**Le point contre-intuitif, et il se redemandera : la revue n'est pas produite par l'intégration continue.** Elle est produite en local, par l'agent, sous l'abonnement existant. La CI ne fait que vérifier qu'elle a eu lieu.

### Les deux pièces

**Le prompt** vit dans `.claude/skills/review/SKILL.md` et se lance avec `/review` depuis la racine du dépôt. Cet emplacement est la convention de l'outil : un dossier par skill, contenant un `SKILL.md` avec un en-tête `name` et `description`. Versionné dans le dépôt, il suit les branches et s'améliore au fil des lots.

Il relit le diff de la branche contre `origin/main`, le confronte à `CLAUDE.md` et aux contrats de `docs/spec-contrats.md`, puis poste son verdict en commentaire de la pull request.

**Le contrôle** est `.github/workflows/require-review.yml`. Il liste les commentaires et les revues de la pull request, cherche le marqueur, et échoue s'il ne le trouve pas.

### Le flux

```
gh pr create --draft    →    /review    →    gh pr ready
```

Le brouillon d'abord, pour qu'une pull request non relue ne puisse pas être fusionnée par réflexe. Puis la revue, **déléguée à un sous-agent** au contexte vierge : celui qui vient d'écrire le code se souvient de ses intentions et vérifierait sa propre version des faits plutôt que le diff. Le prompt de délégation est volontairement minimal et ne résume jamais le travail, sans quoi le biais revient par la porte du prompt.

*Ce qui casse si on l'enlève :* la revue est produite par la session qui a écrit le code. Elle valide alors ce qu'elle croit avoir fait, et les écarts entre l'intention et le diff, précisément ce qu'on cherche, deviennent invisibles.

### Ce que reçoit le sous-agent, et sur quel modèle

**Le prompt fournit les faits, jamais l'interprétation.** Le diff complet, la liste des fichiers touchés et le numéro de la pull request sont collés dans le prompt ; le travail effectué, les intentions et les décisions n'y figurent jamais.

La distinction est fine mais tient à peu de chose : fournir le diff n'est pas le résumer. C'est le même texte que le sous-agent irait chercher lui-même, et le lui donner supprime une demi-douzaine d'allers-retours. Résumer le travail, en revanche, lui ferait vérifier la version des faits de l'auteur au lieu du diff.

**Le modèle est choisi mécaniquement**, pour ne pas être rejugé à chaque fois :

| Le diff touche | Modèle |
| -- | -- |
| documentation, configuration, workflows uniquement | petit modèle |
| au moins un fichier sous `packages/*/src/**` ou `apps/**` | modèle courant |

Le code garde toujours le modèle courant. C'est ce qui rend la règle sûre : le petit modèle ne s'applique jamais là où le raisonnement est le plus exigeant.

*Pourquoi :* le coût ne venait pas des points remontés mais du chemin, le sous-agent redécouvrant le dépôt à chaque fois.

| Dispositif | Modèle | Tokens | Durée | Appels d'outils |
| -- | -- | -- | -- | -- |
| Aucune borne | courant | 96 k | 12 min | 35 |
| Borne d'effort | courant | 62 k | 4 min | 17 |
| Borne, contexte fourni | petit | 43 k | 77 s | 7 |

Comparaison indicative et non toutes choses égales : les diffs relus n'étaient pas identiques. L'ordre de grandeur, lui, est net.

*Un piège rencontré en chemin :* au premier essai sur un petit modèle, la revue a été rendue à l'appelant au lieu d'être publiée, en deux appels d'outils. Le verdict était juste, le contrôle est resté rouge, et les chiffres semblaient excellents parce que le travail n'avait pas été fait. D'où la phrase en tête du skill : une revue non postée est une revue qui n'existe pas. Le nombre d'appels d'outils est un bon indicateur, publier et relancer en coûtent au moins deux à eux seuls.

*Ce qui casse si on l'enlève :* rien de visible, et c'est le piège. La revue continue de fonctionner, simplement elle coûte plusieurs fois son prix, et un mécanisme trop cher finit par être contourné.

*Garde-fou :* si une revue sur de la documentation rate un point qu'une relecture humaine attrape, revenir au modèle courant partout. Une revue économique qui ne trouve rien est le pire des deux mondes, puisqu'on croit avoir été relu.

### Les points sont résolvables, et bloquants

La revue est postée en tant que revue avec des commentaires **ancrés sur des lignes**, et non en commentaire simple : seul un commentaire de revue peut être marqué comme résolu. Chaque point devient une conversation à clore explicitement.

Le ruleset de la branche par défaut active `required_review_thread_resolution`, donc la fusion est refusée tant qu'une conversation reste ouverte.

*Ce qui casse si on l'enlève :* les remarques restent des commentaires qu'on peut faire défiler. Rien ne distingue un point traité d'un point ignoré, et la revue redevient une case cochée.

Conséquence à connaître pour le prompt : un point laissé dans le corps de la revue, sans ancrage sur une ligne, n'est pas résolvable et ne bloque donc rien. D'où la consigne d'ancrer chaque point sur un fichier du diff.

### Le marqueur

```
<!-- crypte-review -->
```

Première ligne du commentaire. Invisible au rendu, cherché tel quel par le workflow. Le changer d'un côté sans l'autre casse le lien silencieusement : le contrôle échouerait sur des pull requests pourtant relues.

### Ce que ça fait, pourquoi, ce qui casse

**Ce que ça fait.** Un rappel bloquant. On ne peut pas fusionner en ayant oublié de relire.

**Pourquoi ce découpage plutôt qu'une action de revue.** Une action qui appelle une API de modèle demande une clé, facturée à chaque poussée. Ici le coût est couvert par l'abonnement, et le prompt vit dans le dépôt, donc versionné et améliorable. Le compromis assumé : ce n'est pas automatique.

**Ce qui casse si on l'enlève.** Le mécanisme repose entièrement sur la discipline de lancer `/review`. Sans le contrôle, cette discipline tient quelques semaines puis s'efface, et on croit être relu alors qu'on ne l'est plus.

### Deux détails d'implémentation qui ont une raison

**Le contrôle ne s'exécute pas tant que la pull request est en brouillon.** Le flux impose le brouillon avant la revue : contrôler à ce moment-là, c'est échouer à coup sûr, puisque la revue n'existe pas encore. Le workflow envoyait donc une notification d'échec à chaque ouverture, pour une situation parfaitement normale. Le type d'événement `ready_for_review` déclenche le contrôle au moment où la réponse peut être oui.

*Ce qui casse si on l'enlève :* rien de fonctionnel, mais chaque ouverture de pull request produit un échec et sa notification. Un contrôle qui échoue systématiquement finit ignoré, y compris le jour où il a raison.

**Le contrôle doit être relancé après la revue.** Poster un commentaire ne déclenche aucun workflow : `require-review.yml` ne réagit qu'à l'ouverture d'une pull request et aux nouvelles poussées. Après `/review`, il faut donc relancer l'exécution, ou pousser un commit. Le skill se termine sur cette étape, sans quoi le contrôle resterait en échec alors que la revue existe.

**Le comptage passe par `jq` en aval plutôt que par `--jq`.** Combiné à `--paginate`, l'option `--jq` de `gh` applique le filtre à chaque page et renvoie une ligne par page, ce qui casse l'addition dès qu'une pull request dépasse trente commentaires : le job échoue alors sur une erreur d'arithmétique, et bloque une pull request pourtant relue. `--slurp` agrège les pages mais n'accepte pas `--jq`, d'où le passage par `jq`.

**Le workflow n'imprime jamais le corps des commentaires**, seulement leur nombre. Un texte produit par un agent peut contenir des commandes de workflow, `::error::` ou `::add-mask::`, qui manipuleraient la sortie de l'exécution si elles étaient affichées. En ne faisant sortir que des nombres, la question ne se pose pas.

**Le workflow est séparé de `ci.yml`.** L'intégrer aux dépendances de `ci-passed` le rendrait immédiatement bloquant, puisque `ci-passed` est le contrôle exigé par les règles de la branche. Le contrôle de revue est délibérément non bloquant au départ : on juge son utilité sur trois ou quatre lots avant de l'exiger.

### Ce que la revue attrape, et ce qu'elle n'attrape pas

**Attrapé :** les écarts par rapport à des règles écrites. Une dépendance interne embarquée en copie, une décision documentée puis prise à l'envers, un ordre d'étapes qui rend un test inopérant.

**Non attrapé :** les arbitrages. Publier maintenant ou plus tard, versions synchronisées ou indépendantes, quelle bibliothèque choisir. Aucune revue ne pose ces questions.

Deux limites à garder en tête. Le relecteur est l'auteur, ce qui vaut moins qu'un regard neuf, d'où la consigne de relire le diff plutôt que sa mémoire. Et une revue qui commente à chaque poussée finit survolée : si les commentaires deviennent du remplissage, resserrer le prompt plutôt que laisser courir.

---

## 7. Le hook de pré-commit

### Les trois pièces

**`.vite-hooks/pre-commit`** contient une seule ligne, `vp staged`. Ce fichier est **versionné** : il fait partie du dépôt comme n'importe quel script.

**`vp config`**, déclenché par le script `prepare` du `package.json`, installe le répartiteur sous `.vite-hooks/_` et pointe `core.hooksPath` dessus. Ce répartiteur s'auto-ignore et n'est jamais commité. Comme `prepare` s'exécute à l'installation des dépendances, un clone frais suivi de `vp install` obtient le hook sans aucune étape manuelle.

**Le bloc `staged` de `vite.config.ts`** dit quoi lancer sur quels fichiers. Son motif couvre les extensions que le formateur traite réellement, markdown, YAML et JSON compris.

### Ce que ça fait, pourquoi, ce qui casse

**Ce que ça fait.** Avant chaque commit, les fichiers indexés passent par `vp check --fix`. Un fichier mal formaté est corrigé sur place plutôt que de partir tel quel.

**Pourquoi.** Le bloc `staged` existait depuis le début, mais rien ne l'appelait : la configuration était là, le déclencheur absent. Un fichier markdown mal formaté est parti en commit, l'intégration continue est passée au rouge, et un commit de rattrapage a suivi.

**Ce qui casse si on l'enlève.** Rien qui échappe à l'intégration continue. On perd seulement la correction immédiate, et les allers-retours reviennent.

### Le motif couvre le markdown, et ce n'est pas un détail

Le fichier qui avait cassé était un `.md`, absent du motif d'origine. Un hook installé mais dont le motif ignore l'extension fautive aurait laissé passer exactement le même incident, en donnant l'impression d'être protégé.

Vérification faite avant d'écrire ce motif : le formateur traite bien `.md`, `.yml`, `.json` et `.ts`. Élargir la liste sans cette vérification aurait produit une règle inopérante.

### La barrière est l'intégration continue, pas le hook

**Le hook est un confort, jamais une garantie.** Le répartiteur qu'installe `vp config` n'est pas versionné, et rien ne signale son absence : sur une machine où `prepare` n'a pas tourné, où `VP_GIT_HOOKS=0` est positionné, ou lors d'un commit passé avec `--no-verify`, le hook n'existe tout simplement pas. Le commit part sans le moindre avertissement.

C'est le même mode de défaillance que le test qui passe faute d'artefacts à lire, ou que le contrôle exigé qui n'est jamais rapporté : un mécanisme qui peut être absent sans le dire ne protège rien.

**Donc l'étape `vp check` de l'intégration continue reste la seule garantie, et ne doit jamais être allégée au motif que le hook existe.** Si l'une des deux doit sauter un jour, c'est le hook.

### Vitesse

Le hook est mesuré, parce qu'un hook lent finit contourné avec `--no-verify`, et qu'un hook contourné est pire qu'absent : on croit être protégé.

| Cas | Durée |
|---|---|
| Aucun fichier ne correspond au motif | 0,4 s |
| Un fichier, rien à corriger | 1,7 s |
| Plusieurs fichiers, rien à corriger | 1,8 s |
| `git commit` complet, une correction appliquée | 2,2 s |

Le coût est presque entièrement fixe : dès qu'un fichier correspond au motif, on paie environ 1,7 s, quel que soit leur nombre. Il vient de la mise de côté de l'état non indexé avant de lancer les vérifications, pas du formatage lui-même.

Le critère retenu : au-delà de deux secondes environ sur un commit ordinaire, **on retire le hook plutôt que de le subir**. L'intégration continue, elle, ne bouge pas. Les mesures ci-dessus sont à la limite de ce seuil, sans marge.

### Ce que le hook ne couvre pas

`docs/**` et `README.md` sont exclus du formatage, donc le hook ne les vérifie pas non plus, même si leur extension figure dans le motif. C'est cohérent et voulu : ces documents ne sont pas du code. Un markdown mal formaté y passe donc en commit sans être corrigé, et l'intégration continue ne le signalera pas davantage.

Sont couverts : `CLAUDE.md`, `CONTRIBUTING.md`, les sources des paquets, les fichiers de configuration et les workflows.

**La vérification de types du hook est partielle par nature.** Elle ne porte que sur les fichiers indexés, alors que les types sont une propriété du programme entier : modifier un fichier indexé peut casser un fichier non indexé, que le hook ne regarde pas. Il peut donc passer au vert sur des types qui ne compilent pas à l'échelle du projet. La vérification complète est celle de l'intégration continue, qui travaille sur l'ensemble du dépôt.

### Repli si le coût grandit

Écrit ici pour ne pas être réinventé, non implémenté aujourd'hui.

Si le hook devient trop lent, la sortie n'est **pas** de le retirer mais de le déplacer en `pre-push`. Les pull requests sont fusionnées en squash, donc les commits intermédiaires sont écrasés et leur propreté individuelle ne vaut rien : seul ce qui atteint la branche par défaut compte. Un `pre-push` paie une fois par poussée au lieu d'une fois par commit, ce qui compte d'autant plus que le coût est presque entièrement fixe.

Contrepartie à connaître : quand un `pre-push` déclenche une correction, les commits existent déjà. Il faut alors un commit de rattrapage, ou un amend suivi d'une nouvelle poussée. C'est plus salissant qu'une correction appliquée avant que le commit n'existe.

---

## 8. Titre des pull requests et méthode de fusion

**Ce que ça fait.** Les pull requests ne peuvent être fusionnées qu'en squash, et leur titre suit le format des messages de commit.

**Pourquoi.** En squash, les commits d'une branche sont écrasés en un seul, et **c'est le titre de la pull request qui devient son message**. L'historique de la branche par défaut n'est donc pas fait de messages de commit mais de titres de pull requests. Les autoriser à être approximatifs revient à écrire l'historique du projet au hasard.

C'est pourquoi le ruleset de la branche par défaut fixe `allowed_merge_methods` à `["squash"]`, seule valeur autorisée depuis cette section. Sans cette restriction, une fusion en commit de fusion conserverait les commits intermédiaires et le titre ne déterminerait plus rien.

Ce réglage vit dans les paramètres du dépôt et **n'est pas versionné** : cette section en est la seule trace écrite. Un retour aux trois méthodes ne se comparerait à rien sans elle.

**Ce qui casse si on l'enlève.** Rien immédiatement, et c'est le problème : l'historique se dégrade commit par commit, sans qu'aucun contrôle ne le signale, jusqu'à ne plus être lisible pour retrouver quand un comportement est apparu.

### Sans rapport avec les numéros de version

À ne pas confondre : le format des titres et des commits **ne détermine pas les versions**. Aucun mécanisme de versionnage n'existe encore dans le dépôt, et celui qui sera retenu reposera sur des notes déposées explicitement, pas sur l'historique Git.

La précision compte parce que l'inverse paraît évident, et qu'une version antérieure de `CONTRIBUTING.md` l'affirmait à tort. Un titre soigné sert la lecture de l'historique, rien de plus.

---

## 9. Versionnage

**Aucune publication npm n'existe encore.** Ce qui suit décrit uniquement la mécanique qui calcule les numéros et rédige les changelogs.

### Le principe, contre-intuitif au premier abord

L'outil **ne devine rien**. Il ne lit ni le diff ni les messages de commit. C'est l'auteur d'une pull request qui dépose un fichier dans `.changeset/` déclarant le niveau de version et le texte destiné au changelog.

Le cycle a deux temps :

1. Chaque pull request dépose sa note. **Fusionner une pull request ne change aucun numéro.**
2. Une pull request « Version Packages », ouverte et tenue à jour automatiquement par `.github/workflows/version.yml`, accumule les notes. La fusionner applique les montées de version et écrit les changelogs.

Cette seconde pull request **ne demande aucune action** : elle se met à jour seule et attend. Le seul geste est de la fusionner quand on veut une nouvelle version.

**Ses contrôles doivent être approuvés à la main.** GitHub n'exécute pas les workflows déclenchés par son propre jeton, pour éviter les boucles : les vérifications de la pull request de version restent en `action_required`, donc `ci-passed` n'est jamais rapporté et la fusion est bloquée. Approuver depuis l'onglet Actions, ou par `gh api -X POST repos/<dépôt>/actions/runs/<id>/approve`.

*Pourquoi ne pas contourner :* la parade courante est un jeton personnel à la place du jeton du workflow, ce qui ferait ouvrir la pull request en son propre nom. Écarté pour ne pas stocker un secret à longue durée de vie sur un dépôt public, pour une friction d'un geste qui n'arrive qu'au moment de publier. Repère : les quatre pull requests du lot 0 auraient produit une seule montée de version, pas quatre.

### Versions synchronisées

`.changeset/config.json` déclare `"fixed": [["@crypte/*"]]`. Les trois paquets portent donc toujours le même numéro et montent ensemble, **même celui qui n'a pas changé**.

*Pourquoi :* le noyau, le CLI et l'adaptateur partagent un protocole qui peut casser. Même numéro veut dire compatible. Sans cela, il faudrait publier et maintenir des plages de compatibilité entre eux.

*Ce qui casse si on l'enlève :* un utilisateur ne peut plus savoir si telle version du CLI va avec telle version de l'adaptateur, et le protocole devient une source de pannes silencieuses.

Vérifié à l'installation : un changeset ne déclarant que `@crypte/cli` fait bien passer les trois paquets de `0.0.0` à `0.0.1`. Le glob est accepté.

### Convention pendant la phase 0.x

| Nature du changement | Niveau |
| -- | -- |
| Rupture d'un contrat ou d'une API publique | `minor` |
| Tout le reste | `patch` |
| Stabilisation de l'API, décidée explicitement | `major`, donnera `1.0.0` |

*Pourquoi :* le niveau demandé est appliqué littéralement, `semver.inc('0.1.0', 'major')` retourne `1.0.0`. Rien ne traite les versions inférieures à 1.0.0 différemment, hormis un avertissement en mode interactif.

*Ce qui casse si on l'enlève :* la première rupture du protocole déclare l'API stable par accident, et une version majeure ne se reprend pas.

### Le générateur de changelog

`.changeset/config.json` utilise `@changesets/changelog-github`, qui remplace l'identifiant de commit brut par un lien vers la pull request, le commit et l'auteur.

*Il exige un jeton GitHub*, y compris pour une génération locale : il interroge l'API pour retrouver la pull request associée à un commit. En intégration continue le workflow le fournit ; à la main, il faut passer `GITHUB_TOKEN`, par exemple avec `GITHUB_TOKEN=$(gh auth token)`.

*Le remerciement à l'auteur est conservé faute de mieux.* L'option `template` permettrait de le retirer, mais elle est marquée expérimentale et n'existe qu'à partir de la version 1.0.0, publiée trop récemment pour passer la politique de fraîcheur des dépendances. Retirer une mention cosmétique ne justifie pas une dépendance fraîche et une API instable. À revoir quand `template` sera stabilisé.

### Le skill `/changeset`

Dans `.claude/skills/changeset/`, lancé avant `/review`. Il décide d'abord **s'il y a quelque chose à déclarer** : une note ne se dépose que si le diff change ce que reçoit l'utilisateur d'un paquet publié.

*Ce qui casse si on l'enlève :* rien mécaniquement, mais un changelog rempli de « mise à jour de la documentation » ne se lit plus, et le mécanisme perd son seul intérêt.

### Deux points d'intégration

**La pull request de version est exemptée du contrôle de revue.** Elle est ouverte par un robot depuis une branche `changeset-release/*`, où personne ne peut lancer `/review`. Sans cette exemption, elle serait bloquée définitivement le jour où le contrôle deviendra exigé.

L'exemption porte sur le préfixe de branche et non sur une étiquette : le nom de branche est produit par l'outil, donc toujours présent, là où une étiquette dépend d'une pose manuelle.

**Le workflow de version demande des droits d'écriture**, contrairement à l'intégration continue qui est en lecture seule. Ouvrir une pull request l'exige. Le réglage « Allow GitHub Actions to create and approve pull requests » doit par ailleurs être actif dans les paramètres du dépôt, sans quoi l'action échoue à créer la pull request.

**Le format des changelogs générés est compatible avec le formateur**, vérifié à l'installation : `vp check` accepte les fichiers produits sans modification. Aucune exclusion n'a donc été ajoutée.

---

## 10. La frontière entre le shell et la preview

C'est la contrainte que le projet paie le plus cher s'il la perd, et la seule qui ne se rattrape pas à coût raisonnable.

### Comment elle est tenue

**Le shell et la preview ne se parlent que par `postMessage`.** Le shell envoie `render`, la preview répond `rendered` ou `error`. Aucune référence à un composant, à une instance ou à un arbre de rendu ne traverse : uniquement des données sérialisables.

Trois paquets, trois rôles :

| Emplacement | Rôle | Connaît React |
| -- | -- | -- |
| `core/protocol` | types des messages | non |
| `core/ui` | côté shell du canal | non |
| `core/preview` | côté iframe du canal | non |
| `packages/react` | monte le composant | oui, c'est son travail |

### La règle de lint

`vite.config.ts` déclare, via `lint.overrides`, un `no-restricted-imports` sur `packages/core/src/**`, interdisant `react`, `react-dom` et `react/*`.

La règle couvre **tout le noyau**, `preview` compris. Une première version ne visait que `ui` et `protocol`, alors que `preview` est l'entrée la plus proche du code de montage, donc la plus exposée à un import ajouté par commodité.

*Pourquoi :* la frontière est une propriété qu'on ne voit pas en lisant un fichier. Elle se perd par un import ajouté sans y penser, dans un fichier qui semble anodin, et rien ne le signale avant que le noyau ne soit devenu dépendant d'un framework.

*Ce qui casse si on l'enlève :* le noyau peut se lier à React sans que personne ne s'en aperçoive, et l'adaptateur Vue devient impossible sans réécrire le noyau. C'est le risque qui a fait passer ce lot en premier.

**La règle est ciblée, pas globale** : `packages/react` importe React librement, c'est sa raison d'être. Vérifié dans les deux sens, un import de React dans `core/ui` échoue, le même import dans `packages/react` passe.

### La preuve par les artefacts

La règle de lint dit ce qui est interdit. Le build montre ce qui est réellement produit :

| Bundle | Poids | Occurrences de `react` |
| -- | -- | -- |
| shell | 59 Ko | **0** |
| preview | 186 Ko | 57 |

Le shell ne charge pas React, et ce n'est pas une intention mais un fait mesurable sur les fichiers construits.

### Deux détails du canal qui ont une raison

**Le montage est rendu synchrone.** L'adaptateur enveloppe le rendu React dans `flushSync`. Sans cela, React rend la main avant d'avoir commité : une erreur du composant échapperait au `try/catch` de la preview, le message `error` ne partirait jamais, et `durationMs` mesurerait l'ordonnancement plutôt que le rendu. L'écart est visible, 1,7 ms avant correction contre 6,2 ms après, sur le même composant.

**Les deux côtés vérifient l'origine.** Les messages sont émis vers `window.location.origin` et non `'*'`, et chaque écouteur rejette ce qui ne vient pas de l'origine attendue et de la fenêtre attendue. Shell et preview étant servis par le même serveur, la contrainte ne coûte rien.

*Ce qui casse si on l'enlève :* avec `'*'`, toute page ayant ouvert la preview en iframe reçoit les messages et peut lui en envoyer. Sur un outil de développement qui rend du code arbitraire, c'est une porte ouverte gratuite.

---

## 11. La vérification de types

**Ce que ça fait.** Le bloc `lint` de `vite.config.ts` active `options.typeAware` et `options.typeCheck`. `vp check` vérifie alors les types en plus du formatage et du lint, en local comme en intégration continue.

**Pourquoi.** Sans ces deux options, `vp check` ne fait que formater et linter. Le projet était en TypeScript strict, avec `noUncheckedIndexedAccess` et `verbatimModuleSyntax`, et **rien ne vérifiait quoi que ce soit**. Une ligne aussi grossière que `export const x: string = 42` passait `vp check`, passait `vp pack`, et aurait passé la CI.

**Ce qui casse si on l'enlève.** Le `tsconfig` strict devient décoratif. C'est le mode de défaillance le plus coûteux du projet : un mécanisme qui a l'air d'exister, que personne ne pense à vérifier, et qui ne s'exécute jamais.

### Ce que l'activation a révélé

Quinze erreurs, jusque-là invisibles, dont trois familles :

- **Types DOM absents.** `packages/core` manipule `window`, `MessageEvent` et `HTMLIFrameElement` sans que `lib` ne déclare `DOM`. Corrigé dans les `tsconfig` des paquets concernés, pas à la racine : le CLI n'a pas de DOM.
- **`vitest` non déclaré.** Les fichiers de test l'importaient sans qu'il soit une dépendance de `packages/core`. Il venait de l'outillage, donc par accident.
- **Deux instances de Vite.** `apps/shell` résolvait un `vite` différent de celui de ses plugins, ce qui produisait des types `Plugin` incomparables et une erreur de profondeur de comparaison. Résolu en déclarant `vite` dans l'application, et en important son `defineConfig` depuis `vite` plutôt que `vite-plus`, l'application n'utilisant aucun bloc Vite+.

Le coût est négligeable, la vérification complète prend environ trois dixièmes de seconde.

### Les composants Vue passent par un second compilateur

`vp check` ne lit pas les composants monofichiers : pour lui, un `.vue` est un module opaque, déclaré comme tel dans `apps/shell/src/env.d.ts`. Leur contenu est vérifié par **`vue-tsc`**, branché sur le script `typecheck` de `apps/shell` et lancé en intégration continue juste après `vp check`.

*Pourquoi un outil de plus :* `vue-tsc` vérifie le bloc `script`, mais surtout le **template**, ce qu'aucun autre contrôle ne fait. Une liaison vers une variable inexistante, `{{ statuss }}`, ou un gestionnaire vers une fonction absente, `@click="rendre"`, ne se voit ni au lint, ni au build, ni aux tests. Le composant se rend, silencieusement faux.

*Ce qui casse si on l'enlève :* toute la logique du shell repose alors sur la relecture. Le coût croît avec la taille du shell, qui est appelé à devenir la plus grosse surface du projet.

### TypeScript est épinglé en 6.0.3, pas en 7

La 7 est pourtant la version courante publiée. Le problème n'est pas sa stabilité de compilateur mais celle de son **API programmatique**, dont dépendent les outils tiers : `vue-tsc` y charge un chemin que la 7 n'expose plus, et échoue au démarrage.

La 6.0.3 est la dernière lignée écrite en JavaScript, stable et supportée par l'écosystème. Elle vérifie l'ensemble du dépôt, `.vue` compris.

*Réserve connue, et elle ne se contourne pas :* `vp pack` génère les déclarations de types avec **son propre TypeScript 7**, embarqué par Vite+ et hors de notre contrôle.

```
typescript@7.0.2
└─┬ @voidzero-dev/vite-plus-core@0.2.8
```

Deux compilateurs cohabitent donc : la 6 vérifie, la 7 émet les types publiés. Les deux fonctionnent, mais leur comportement n'est pas garanti identique. Quitter cette situation demanderait d'abandonner `vp pack`, ce qui coûterait plus cher que le risque.

*Condition de réouverture :* quand `vue-tsc` fonctionnera avec TypeScript 7, repasser le catalogue en 7 et supprimer cette section.

### Le contrôle qui surveille cette condition

`.github/workflows/ts7-readiness.yml` s'exécute le premier de chaque mois. Il monte un projet jetable avec `vue-tsc` et `typescript@7`, y place un composant Vue contenant une erreur de type volontaire, et **ouvre une issue si l'erreur est détectée**.

*Pourquoi :* une note « à revoir un jour » dans un document ne réveille personne. Ici, le jour où l'amont corrige, une issue arrive sans que quiconque ait eu à suivre les publications de `vue-tsc`.

*Pourquoi une erreur volontaire plutôt qu'un simple lancement :* un outil qui démarre sans rien détecter passerait pour fonctionnel tout en ne servant à rien. Le contrôle vérifie qu'il fait son travail, pas qu'il s'exécute.

**Le contrôle positif tourne à chaque exécution**, il n'a pas été fait une fois en local. Le job lance d'abord la même sonde sous TypeScript 6, où l'erreur *doit* être détectée, et **échoue bruyamment si elle ne l'est plus**.

C'est ce qui distingue les deux sens de `ready=false` : « la contrainte tient toujours » et « la sonde ne mesure plus rien » produiraient sinon le même run vert et le même silence. Une sonde qui répondrait toujours non serait indiscernable d'une sonde correcte.

L'étape de mesure vérifie aussi que la version installée commence bien par `7`. Afficher une version n'est pas la vérifier : `npm install` réconcilie l'arbre laissé par le contrôle positif, et sans cette assertion la mesure pourrait porter sur TypeScript 6 tout en ouvrant une issue annonçant que la 7 fonctionne.

**Une faille demeure, et elle ne se referme pas ici.** GitHub désactive un workflow planifié après soixante jours sans activité dans le dépôt. Un projet en attente d'un correctif amont est précisément dans ce cas : plus de run, donc plus de vert, plus de rouge et plus d'issue. Le contrôle s'éteint sans le dire.

Rien dans le workflow ne peut l'empêcher. Deux atténuations partielles : `workflow_dispatch` permet de le relancer à la main, et un dépôt sur lequel on travaille reste actif. Mais si le projet dort plus de deux mois, **considérer que ce contrôle est éteint** et le relancer manuellement avant de s'y fier.

### Ce qui n'est pas éprouvé

Ce workflow a été relu deux fois et testé en local dans l'ordre exact de ses étapes, mais **il n'a jamais tourné en conditions réelles**. Trois choses restent non vérifiées jusqu'à sa première exécution : le comportement de `gh issue create` avec le jeton du workflow, le garde contre l'ouverture répétée d'issues, et l'installation de la chaîne sur l'image du runner.

C'est un arrêt assumé, pas un oubli. La raison : la vérification par relecture y donne un rendement décroissant, alors qu'une seule exécution réelle tranchera. Et l'enjeu est faible, si le contrôle meurt, le dépôt reste sur TypeScript 6, c'est-à-dire son état actuel et fonctionnel.

*Ce qui casse si on l'enlève :* le dépôt reste sur TypeScript 6 indéfiniment, sans que personne ne sache que la raison a disparu.

### La construction doit précéder la vérification

Les paquets exposent leurs types depuis `dist/`. Tant que rien n'est construit, `@crypte/core/protocol` et `@crypte/react` sont introuvables pour le compilateur, et la vérification de types échoue sur des modules pourtant présents.

C'est pourquoi `vp run -r pack` passe **avant** `vp check` dans l'intégration continue, et non après comme initialement. Le piège est sournois : en local, `dist/` existe déjà d'une exécution précédente, donc tout passe. L'échec n'apparaît que sur une machine vierge.

*Ce qui casse si on inverse :* la vérification de types échoue en intégration continue sur cinq modules introuvables, sans que rien ne soit cassé dans le code.

Une autre voie existerait, faire pointer les `exports` vers les sources en développement et vers `dist/` à la publication, via `publishConfig`. Plus souple, mais plus de configuration ; à reconsidérer si l'ordre devient gênant.
