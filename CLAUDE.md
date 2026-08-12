# Instructions pour les agents

Lire `docs/architecture.md` avant toute modification de structure, et `docs/spec-contrats.md` avant toute question de format, de manifeste, de protocole ou de plugin.

---

## Les quatre contraintes structurelles

Elles ne se rediscutent pas dans une issue. Chacune protège d'une panne précise, et trois d'entre elles se corrigent mal une fois le code écrit.

**1. `@crypte/core` n'est jamais embarqué en copie.**
Il est une `dependency` déclarée de `@crypte/cli` et de `@crypte/react`, jamais recopié dans leurs bundles.
_Sinon :_ deux instances du même module tournent en parallèle, le canal et les registres se dédoublent en silence, et le symptôme observé n'a aucun rapport visible avec sa cause.

**2. `apps/shell` reste séparé de `packages/core`.**
Une application et une bibliothèque n'ont ni le même mode de construction ni le même cycle de vie.
_Sinon :_ un paquet publié doit produire deux sorties incompatibles au même endroit, et l'utilisateur télécharge une application alors qu'il voulait une bibliothèque.

**3. L'isolation des trois entrées de `core` est vérifiée par un test.**
Importer `@crypte/core/protocol` ne doit rien charger de `ui` ni de `preview`. Cette étanchéité vient du graphe d'imports, pas de l'outil de construction, et elle tombe sans avertissement.
_Sinon :_ toute la promesse « deux paquets installés au lieu de cinq » s'effondre, et un consommateur qui ne voulait que des types charge tout le reste.

**4. Aucun code publié n'importe `vite-plus`.**
L'outillage n'apparaît que dans les scripts `package.json` et les fichiers `vite.config.ts`. Aucun fichier de `packages/` ne l'importe.
_Sinon :_ une rupture de l'outillage, encore en version pré-1.0, se corrige dans du code publié aux utilisateurs plutôt que dans des scripts.

---

## Règles de travail

**Branches.** Toujours utiliser le nom de branche exact fourni par le tracker. C'est ce qui lie automatiquement la branche, la pull request et l'issue.

**Commits.** Conventional commits, en anglais, à l'impératif.

**Pull requests : brouillon, revue, puis ouverture.** Dans cet ordre, sans exception.

```bash
gh pr create --draft --title "…"    # 1. jamais directement ouverte
/changeset                           # 2. note de version, ou rien à déclarer
/review                              # 3. délègue à un sous-agent
                                     # 4. corriger les points remontés
/review                              # 5. si les corrections touchent du code
gh pr ready <numéro>                 # 6. une fois les points traités
```

**Auto-review : avant de lancer une revue, relis-toi.** Pas une liste à cocher, qui devient mécanique et ne voit que ce qu'elle nomme : une lecture de ton propre diff comme s'il venait d'un autre, en partant de ce que tu viens de faire et de ce que tu sais du dépôt.

Trois questions ouvrent à peu près tout :

- Qu'ai-je **affirmé** sans l'avoir vérifié ? Un commentaire, un message de commit, une phrase de documentation, une réponse donnée plus haut.
- Qu'est-ce qui **passerait au vert** si je cassais ce que ça surveille ?
- Qu'ai-je **changé après** ma dernière vérification ? Un formateur, une correction tardive, une restauration de fichier.

**Un doute se tranche par une commande, pas par la relecture.** C'est la différence entre les cinq faiblesses trouvées de cette façon et les vingt-huit trouvées par la revue : les premières ont été mesurées, les secondes crues.

Et ce qui reste non corrigé se dit, plutôt que d'attendre que la revue le trouve.

**Une décision de conception qui arrive en cours de pull request devient une issue.** Renommer un champ, réorganiser des fichiers, ajouter un mécanisme d'extension : chacune crée une surface qu'aucune revue n'a vue, donc un tour de plus.

Le lot 2 a démarré sur les types du protocole et a absorbé cinq chantiers, d'où neuf revues. `Wrap` en est remonté quatre fois avant d'être sorti du périmètre, et `Manifest.version` a reçu deux avis opposés de deux revues successives, avec deux changements de code à la clé.

Le réflexe : ouvrir l'issue, la lier à la pull request en cours, continuer.

**Tout code exécutable ajouté après une revue n'a, par définition, pas été relu.** Corriger un point remonté, mais aussi ajouter une fonctionnalité en cours de route ou répondre à une demande arrivée après coup : dans les trois cas, du code part vers la branche par défaut sans qu'aucun regard ne s'y soit posé.

Relancer une revue sur ces changements seuls. S'en passer s'ils ne touchent que de la documentation ou de la configuration déjà éprouvée par l'intégration continue.

La formulation compte : une première version de cette règle ne parlait que des « corrections », et laissait donc passer un workflow entier ajouté après la troisième revue du lot 1.

Ce n'est pas une précaution théorique : la seconde revue du lot 1 a trouvé que le correctif d'un point de la première laissait passer `react-dom/client`, c'est-à-dire exactement l'import que la règle corrigée existait pour bloquer.

**Quand s'arrêter.** La boucle se termine quand **aucun point bloquant** ne reste, pas quand la revue est vide. Un dépôt vivant produit toujours des points, donc attendre le silence garantit une boucle sans fin : le lot 2 a pris onze tours de cette façon, dont les trois derniers sur des outils ajoutés en cours de route.

Les niveaux sont définis dans le skill `/review`. Ce qui reste, important ou observation, va dans `docs/suivi.md` **dans le même diff**, avec ce qui a été mesuré et pourquoi ce n'est pas fait ici.

Un fichier plutôt qu'une issue : la trace reste dans le dépôt, elle suit le code, et la revue la lit, donc un point arbitré cesse de revenir à chaque tour.

Corriger un point non bloquant est permis, mais alors sans relancer de tour pour lui seul : il part avec le prochain lot de corrections ou avec l'issue.

**Arrêt explicite.** Certains fichiers ne convergent pas : un workflow planifié ne s'exécute pas avant des semaines, aucun test local ne reproduit son environnement, et son mode d'échec est le silence. Chaque relecture y trouve légitimement quelque chose sans qu'aucune ne puisse conclure.

Dans ce cas, arrêter est permis, à trois conditions : **le dire**, écrire **ce qui reste non éprouvé**, et poser **un point de contrôle daté** ailleurs que dans une conversation. Un arrêt assumé et consigné vaut mieux qu'une boucle abandonnée en silence. Ce qui reste interdit, c'est de s'arrêter parce qu'on est fatigué de relire.

Le brouillon empêche de fusionner par réflexe une pull request non relue. La revue est **déléguée à un sous-agent**, qui part d'un contexte vierge : celui qui vient d'écrire le code ne peut pas relire son propre travail sans se souvenir de ce qu'il voulait faire, et vérifierait ses intentions plutôt que le diff. Le prompt de délégation reste minimal et ne résume jamais le travail effectué.

Chaque point de revue est ancré sur une ligne, donc résolvable. La fusion reste bloquée tant qu'une conversation est ouverte.

**Titre de pull request : conventional commit, comme un message de commit.** En anglais, à l'impératif, avec le même préfixe (`feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`).

Ce n'est pas cosmétique : la fusion se fait en squash, donc **le titre de la pull request devient le message du commit sur `main`**. C'est lui qui reste, pas les messages des commits intermédiaires, qui sont écrasés.

Écris donc le titre pour quelqu'un qui lira `git log` dans un an, sans le contexte de l'issue.

```
feat: add story discovery          plutôt que   Lot 4
fix: resolve aliases from jsconfig  plutôt que   correction du bug
```

**Publication npm.** Jamais sans demande explicite. Un nom de paquet publié ne se reprend plus après 72 heures.

**Placement d'un composant.** Par défaut dans `apps/shell`. On ne le promeut vers `core/ui` que lorsqu'un plugin réel en a besoin, jamais par anticipation : `core/ui` est une API publique qu'on ne peut plus retirer une fois publiée.

**Périmètre.** Ne couvrir que ce qui est démontré par l'usage. Un mécanisme ajouté par précaution crée un usage qu'on ne peut plus reprendre.

**Annuler une modification de test.** Ne jamais utiliser `git checkout` pour défaire une ligne ajoutée le temps d'un essai : la commande restaure la version indexée et emporte tout le travail non commité du même fichier. Copier le fichier avant l'essai, ou retirer la ligne ajoutée.

**Vérifier avant de commiter.** `vp check | grep 'pass:|error:' && git commit` ne protège de rien : `grep` réussit aussi quand il trouve `error:`. Enchaîner sur le code de sortie de `vp check` seul, sans filtre entre les deux.

**Causes.** Ne jamais attribuer une cause sans l'avoir isolée par une mesure. Une explication cohérente avec les chiffres observés n'est pas une cause démontrée.

C'est la même erreur qu'un test qui passe pour la mauvaise raison : une observation compatible avec l'hypothèse, prise pour une confirmation. Avant d'écrire « c'est à cause de X », change X seul et vérifie que le chiffre bouge. Vérifie aussi que la mesure mesure bien quelque chose : un chronomètre sur un traitement qui n'a rien traité donne un résultat parfaitement stable et parfaitement faux.

---

## Règles de documentation

**Une ligne, ou rien.** Un en-tête de module tient en une ligne, un commentaire aussi. Deux au maximum, et c'est déjà un signe.

Ce qui ne tient pas en une ligne va dans `docs/architecture.md`, et le commentaire y renvoie d'un mot. Le fichier reste lisible, l'explication reste écrite quelque part.

Écrire **le fait, pas le raisonnement.** Un exemple concret vaut mieux qu'une justification : `« button-- pour tout nom cyrillique »` se comprend, `« la normalisation restreinte à l'alphabet latin provoquait une perte de segments »` ne se comprend pas.

Et quand l'explication ne passe pas en une ligne, se demander d'abord si le problème n'est pas le nom ou le code. Un commentaire long est souvent un mauvais nom qui se rattrape.

`docs/arborescence.md` tient la même information en une ligne par fichier, pour qui cherche où se trouve quoi sans ouvrir les fichiers. Le mettre à jour quand un fichier apparaît ou disparaît.

**Ordre d'un fichier.** Le type principal en premier, ses pièces ensuite, le point d'extension en dernier. Les types sont résolus au niveau du module : un type peut en mentionner un autre déclaré plus bas, donc l'ordre ne sert que la lecture.

Sauf pour un fichier de réexports, qui n'a pas de type principal : un groupe par module, et un commentaire d'une ligne par groupe. Sans lui, l'ordre des groupes n'est plus lisible et le même module se retrouve cité trois fois.

Dans un groupe, les noms suivent l'ordre de leur fichier source, pas l'alphabet : les deux fichiers se lisent alors en parallèle. Le lint ne trie pas, vérifié. Seule exception forcée, une valeur exportée se déclare dans un bloc séparé des types.

**Tests.** Tout contrat public a un test qui vérifie qu'il accepte ce que la spécification décrit **et qu'il refuse le reste**. La seconde moitié est celle qui compte : un test sans cas négatif passerait à l'identique sur un type qui n'exige rien.

Les tests vivent dans `test/`, jamais à côté de la source. Règle unique, sans jugement à porter au cas par cas.

## Pièces mobiles

Toute pull request qui ajoute une **pièce mobile** met à jour `docs/architecture.md`.

Une pièce mobile est un workflow, un script, une configuration qui encode une décision, ou un test dont l'assertion n'est pas évidente.

Trois questions à renseigner :

1. Ce que ça fait
2. Pourquoi ça existe
3. **Ce qui casse si on l'enlève**

La troisième est celle qui compte. Elle empêche de supprimer un mécanisme dont on a oublié la raison, ce qui est le mode de défaillance le plus probable sur un projet à un seul mainteneur.

À l'inverse, **pas de documentation pour du code qui se lit tout seul.** Documenter tout produit de la documentation que personne ne lit, donc aucune documentation.

---

## Conventions de code

TypeScript strict, jamais de `any`. Pas de point-virgule en fin de ligne, guillemets simples. Commentaires réservés aux décisions non évidentes, pas à la paraphrase du code.

Le formatage et le lint sont appliqués par `vp check --fix`. Ne pas reformater à la main.

`docs/**` et `README.md` sont exclus du formatage automatique : ce sont des documents de référence, pas du code.
