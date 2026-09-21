# Instructions pour les agents

Lire `docs/contracts.md` avant toute question de format, de manifeste, de protocole ou de plugin. Pour tout le reste, **le code et ses commentaires font foi** : il n'y a pas de document de conception.

**`docs/contracts.md` est un guide, pas une loi.** Il a été écrit au début, avant que le code existe, et la construction a corrigé plusieurs de ses affirmations. Quand le document et le code divergent, **c'est le code qui a raison et le document qui se corrige**, dans le même diff. `packages/core/test/spec.test.ts` tient déjà ce sens-là : il exige que le document décrive ce que le protocole expose, jamais l'inverse.

Le détail du processus vit dans les skills, `/explore`, `/review` et `/changeset`, qui se chargent quand on en a besoin. Ce fichier-ci est lu à chaque session : il ne porte que ce qui doit être vrai tout le temps.

---

## Les quatre contraintes structurelles

Elles ne se rediscutent pas dans une issue. Chacune protège d'une panne précise, et trois d'entre elles se corrigent mal une fois le code écrit.

**Deux ont un test, deux n'en ont pas.** La 3 et la 4 sont tenues par `packages/core/test/isolation.test.ts` et `test/publishing.test.mjs`. La 1 et la 2 tiennent aujourd'hui, mais par habitude : personne n'est prévenu si elles tombent.

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
L'outillage n'apparaît que dans les scripts `package.json` et les fichiers `vite.config.ts`.
_Sinon :_ une rupture de l'outillage, encore en version pré-1.0, se corrige dans du code publié aux utilisateurs plutôt que dans des scripts.

---

## Règles de travail

**Relire l'issue avant d'ouvrir la branche.** Elle a peut-être été écrite avant plusieurs lots, et rien ne surveille le tracker. Vérifier qu'elle ne cite aucun nom que le code ne porte plus, aucun chiffre qu'une mesure a corrigé, et aucun critère de fin qu'un autre lot a rendu impossible. Ce qui est périmé se corrige **dans l'issue**.

**Branches.** Toujours le nom exact fourni par le tracker : c'est ce qui lie la branche, la pull request et l'issue.

**Commits.** Conventional commits, en anglais, à l'impératif.

**Pull requests : brouillon, revue, puis ouverture.** Dans cet ordre, sans exception, **sauf pour un diff de prose seule**.

```bash
gh pr create --draft --title "…"    # 1. jamais directement ouverte
/changeset                           # 2. note de version, ou rien à déclarer
/explore                             # 3. découvrir, avant de faire confirmer
/review                              # 4. délègue à un sous-agent
                                     # 5. corriger les points remontés
gh pr ready <numéro>                 # 6. une fois les points traités
```

**La seule exception, et elle est mécanique.** Un diff dont tous les fichiers sont des `.md`, aucun n'étant `docs/contracts.md`, un `CLAUDE.md` ni quoi que ce soit sous `.claude/`, saute les étapes 3 et 4. `require-review.yml` le constate tout seul.

Ces trois formes ne sont pas de la prose malgré leur extension : la première est la spécification, les deux autres portent ces règles-ci, donc une erreur dedans se propage à toutes les sessions suivantes.

Le classement vit dans `test/review-check.mjs` et non dans le workflow, pour que `test/review-check.test.mjs` puisse vérifier ce qu'il refuse. Le mode d'échec est une exemption qui s'élargit en silence.

_Pourquoi cette exception existe :_ deux revues d'affilée ont rendu un verdict vide sur de la documentation. Une revue qui ne trouve rien apprend à ne plus lire les suivantes.

**Le statut du tracker suit le travail, pas la fin du travail.** En ouvrant la branche, **In Progress** ; en sortant du brouillon, **Review Tech** ; à la fusion, **Done**.

**Une décision de conception qui arrive en cours de pull request devient une issue.** Renommer un champ, réorganiser des fichiers, ajouter un mécanisme d'extension : chacune crée une surface qu'aucune revue n'a vue. Ouvrir l'issue, la lier, continuer.

**Une décision se note quand elle est prise, à côté du code qu'elle décide.** Ce qu'on fait, pourquoi, et **ce qui la rouvrirait**. Le dernier champ est celui qui manque partout ailleurs. Une décision qui ne se rattache à aucun fichier n'a pas besoin d'être écrite.

**Ce qui reste non corrigé après une revue devient une issue**, avec ce qui a été mesuré et pourquoi ce n'est pas fait ici. **Sauf une observation**, qui se corrige dans le même passage ou se tait : trois issues sont nées de cette lecture-là pour des broutilles de deux lignes, et c'est la seule catégorie que la vérification fabrique elle-même.

**Titre de pull request : conventional commit.** La fusion se fait en squash, donc **le titre devient le message du commit sur `main`**. L'écrire pour quelqu'un qui lira `git log` dans un an, sans le contexte de l'issue.

```
feat: add story discovery          plutôt que   Lot 4
fix: resolve aliases from jsconfig  plutôt que   correction du bug
```

**Publication npm.** Jamais sans demande explicite. Un nom de paquet publié ne se reprend plus après 72 heures.

**Placement d'un composant.** Par défaut dans `apps/shell`. On ne le promeut vers `core/ui` que lorsqu'un plugin réel en a besoin, jamais par anticipation : `core/ui` est une API publique qu'on ne peut plus retirer une fois publiée.

**Périmètre.** Ne couvrir que ce qui est démontré par l'usage. Un mécanisme ajouté par précaution crée un usage qu'on ne peut plus reprendre.

---

## Les pièges qui ont déjà coûté

**Annuler une modification de test.** Ne jamais utiliser `git checkout` pour défaire une ligne ajoutée le temps d'un essai : la commande restaure la version indexée et emporte tout le travail non commité du même fichier. Copier le fichier avant l'essai, ou retirer la ligne ajoutée.

**Lire la sortie avant de commiter.** Le hook lance le formatage, pas les tests : un `Tests 1 failed` passe donc au commit sans que rien ne s'y oppose.

**Vérifier avant de commiter.** `vp check | grep 'pass:|error:' && git commit` ne protège de rien : `grep` réussit aussi quand il trouve `error:`. Enchaîner sur le code de sortie de `vp check` seul.

**Un sous-agent tué laisse sa sonde dans l'arbre.** Un workflow arrêté en cours, plafond de dépense ou interruption, ne défait rien : `if (wanted.has(file))` est resté `if (true)` dans `dev.ts`, et le cas rouge a été mis sur le compte des éditions du moment, avec copie du dépôt et vidage de cache avant qu'un `git diff` ne le montre. Après tout arrêt de workflow, lire `git diff` et écarter toute ligne modifiée qui n'est pas un commentaire.

**`git add -A` pendant qu'un sous-agent travaille.** Les sondes qu'il pose dans l'arbre entrent dans l'index sans un mot : un commit de quatre fichiers en a emporté huit, dont une mutation de `App.vue` et un fichier de cas jetable. Tant qu'un workflow tourne, commiter par chemins explicites, et relire `git show --name-status` après.

**Causes.** Ne jamais attribuer une cause sans l'avoir isolée par une mesure. Avant d'écrire « c'est à cause de X », changer X seul et vérifier que le chiffre bouge. Vérifier aussi que la mesure mesure quelque chose : un chronomètre sur un traitement qui n'a rien traité donne un résultat parfaitement stable et parfaitement faux.

**Un motif `git ls-files` qui ne rend rien.** `git ls-files 'packages/*/src'` rend **zéro fichier** : le `*` d'un pathspec git ne traverse pas le séparateur. Un garde écrit comme ça surveille le vide et passe au vert pour cette seule raison. Lister le dossier parent et filtrer.

**Du code mort ne part que si deux réfuteurs ont échoué à l'atteindre.** Un candidat est nommé par une mesure, jamais par une opinion. Deux agents essaient ensuite de l'atteindre par des angles opposés, l'un en remontant les appelants jusqu'à un vrai point d'entrée, l'autre en écrivant une sonde et en l'exécutant. Le candidat ne part que si les deux échouent, et **tout doute qu'ils admettent compte comme atteignable**. Une réfutation qui ne nomme aucune mesure ne vaut pas plus que la lecture qu'elle contredit.

Dans un fichier de test la règle s'inverse : le candidat est une assertion morte, les réfuteurs tentent de la faire rougir en cassant la garantie dans le source, et **une assertion qui vise le mauvais côté de sa paire se répare au lieu de se supprimer**.

**Un doute se tranche par une commande, pas par la relecture.**

---

## Documentation

**Tout va dans les commentaires.** Le code et ses commentaires doivent se suffire : il n'y a pas de document où renvoyer ce qui déborde. Un commentaire peut donc faire plusieurs lignes quand il le faut.

**Le plus court et le plus simple possible.** C'est la contrainte qui remplace la limite de longueur : chaque phrase gagne sa place, et celle qui peut sauter saute. Écrire pour quelqu'un qui découvre le fichier.

Écrire **le fait, pas le raisonnement.** `« button-- pour tout nom cyrillique »` se comprend, `« la normalisation restreinte à l'alphabet latin provoquait une perte de segments »` ne se comprend pas. Quand l'explication est longue, se demander d'abord si le problème n'est pas le nom ou le code.

**La langue se décide par public, pas par dossier.** Ce qu'un utilisateur ou un contributeur lit est en anglais : `README.md`, `CONTRIBUTING.md`, les contrats, le guide, les messages d'erreur du CLI et les commentaires du code publié, que `test/published-english.test.mjs` tient. Les notes de mainteneur sont en français : ce fichier, les skills, et les commentaires de l'outillage du dépôt.

**Pas de documentation pour du code qui se lit tout seul.** Documenter tout produit de la documentation que personne ne lit, donc aucune documentation.

**On n'écrit que ce dont l'oubli casserait quelque chose.** Un mécanisme dont on peut oublier la raison, et qu'on supprimerait alors par erreur, porte un commentaire disant ce qui casse si on l'enlève. Le reste, non.

**Ordre d'un fichier.** Le type principal en premier, ses pièces ensuite, le point d'extension en dernier. Sauf pour un fichier de réexports : un groupe par module, un commentaire d'une ligne par groupe, et dans un groupe les noms suivent l'ordre de leur fichier source, pas l'alphabet.

**Un contrôle vérifie d'abord qu'il a lu quelque chose.** Une compilation vide réussit, une extraction muette annonce que tout est conforme, un dossier absent pèse zéro octet. Chaque contrôle qui parcourt une liste vérifie qu'elle n'est pas vide, en premier cas du fichier, et chaque budget lève au lieu de rendre zéro. Un contrôle vert qui n'affirme plus rien est le mode d'échec le plus coûteux du dépôt, et il ne se voit pas en relisant le garde : chaque garde a une sonde qui casse la garantie et vérifie qu'il rougit.

La couverture ne prouve rien non plus : un test qui appelle sans rien affirmer couvre à 100 %. D'où les `toMatchInlineSnapshot`, qui fixent le message entier là où un `toContain` passait sur une phrase à moitié fausse.

**Tests.** Tout contrat public a un test qui vérifie qu'il accepte ce que la spécification décrit **et qu'il refuse le reste**. La seconde moitié est celle qui compte : un test sans cas négatif passerait à l'identique sur un type qui n'exige rien.

Les tests vivent dans un dossier `test/`, jamais dans `src/` : un par paquet, plus celui de la racine pour l'outillage du dépôt.

---

## Conventions de code

TypeScript strict, jamais de `any`. Commentaires réservés aux décisions non évidentes, pas à la paraphrase du code.

Le formatage et le lint sont appliqués par `vp check --fix`. Ne pas reformater à la main. `docs/**` et `README.md` en sont exclus.
