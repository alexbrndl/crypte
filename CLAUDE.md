# Instructions pour les agents

Lire `docs/internal/architecture.md` avant toute modification de structure, et `docs/contracts.md` avant toute question de format, de manifeste, de protocole ou de plugin.

Le détail du processus vit dans les skills, `/explore`, `/review` et `/changeset`, qui se chargent quand on en a besoin. Ce fichier-ci est lu à chaque session : il ne porte que ce qui doit être vrai tout le temps.

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

**La seule exception, et elle est mécanique.** Un diff dont tous les fichiers sont des `.md`, aucun n'étant `docs/contracts.md`, `docs/decisions.md`, un `CLAUDE.md` ni quoi que ce soit sous `.claude/`, saute les étapes 3 et 4. `require-review.yml` le constate tout seul.

Ces quatre formes ne sont pas de la prose malgré leur extension : les deux premières font foi, les deux dernières portent ces règles-ci, donc une erreur dedans se propage à toutes les sessions suivantes.

Le classement vit dans `test/review-check.mjs` et non dans le workflow, pour que `test/review-check.test.mjs` puisse vérifier ce qu'il refuse. Le mode d'échec est une exemption qui s'élargit en silence.

_Pourquoi cette exception existe :_ deux revues d'affilée ont rendu un verdict vide sur de la documentation. Une revue qui ne trouve rien apprend à ne plus lire les suivantes.

**Le statut du tracker suit le travail, pas la fin du travail.** En ouvrant la branche, **In Progress** ; en sortant du brouillon, **Review Tech** ; à la fusion, **Done**.

**Une décision de conception qui arrive en cours de pull request devient une issue.** Renommer un champ, réorganiser des fichiers, ajouter un mécanisme d'extension : chacune crée une surface qu'aucune revue n'a vue. Ouvrir l'issue, la lier, continuer.

**Une décision se note quand elle est prise**, dans `docs/decisions.md`, avant la fin de la session. Ce qu'on fait, ce qu'on écarte, pourquoi, et **ce qui la rouvrirait**. Le dernier champ est celui qui manque partout ailleurs.

**Ce qui reste non corrigé après une revue devient une issue**, avec ce qui a été mesuré et pourquoi ce n'est pas fait ici.

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

**Causes.** Ne jamais attribuer une cause sans l'avoir isolée par une mesure. Avant d'écrire « c'est à cause de X », changer X seul et vérifier que le chiffre bouge. Vérifier aussi que la mesure mesure quelque chose : un chronomètre sur un traitement qui n'a rien traité donne un résultat parfaitement stable et parfaitement faux.

**Un doute se tranche par une commande, pas par la relecture.**

---

## Documentation

**Une ligne, ou rien.** Un en-tête de module tient en une ligne, un commentaire aussi. Ce qui ne tient pas va dans `docs/internal/architecture.md`, et le commentaire y renvoie d'un mot.

Écrire **le fait, pas le raisonnement.** `« button-- pour tout nom cyrillique »` se comprend, `« la normalisation restreinte à l'alphabet latin provoquait une perte de segments »` ne se comprend pas. Quand l'explication ne passe pas en une ligne, se demander d'abord si le problème n'est pas le nom ou le code.

**Pas de documentation pour du code qui se lit tout seul.** Documenter tout produit de la documentation que personne ne lit, donc aucune documentation.

**`docs/internal/architecture.md` ne se met à jour que si l'oublier casserait quelque chose.** Un mécanisme dont on peut oublier la raison, et qu'on supprimerait alors par erreur, y va avec ce qui casse si on l'enlève. Le reste, non.

**Ordre d'un fichier.** Le type principal en premier, ses pièces ensuite, le point d'extension en dernier. Sauf pour un fichier de réexports : un groupe par module, un commentaire d'une ligne par groupe, et dans un groupe les noms suivent l'ordre de leur fichier source, pas l'alphabet.

**Tests.** Tout contrat public a un test qui vérifie qu'il accepte ce que la spécification décrit **et qu'il refuse le reste**. La seconde moitié est celle qui compte : un test sans cas négatif passerait à l'identique sur un type qui n'exige rien.

Les tests vivent dans `test/`, jamais à côté de la source.

---

## Conventions de code

TypeScript strict, jamais de `any`. Commentaires réservés aux décisions non évidentes, pas à la paraphrase du code.

Le formatage et le lint sont appliqués par `vp check --fix`. Ne pas reformater à la main. `docs/**` et `README.md` en sont exclus.
