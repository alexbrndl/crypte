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
gh pr ready <numéro>                 # 4. seulement une fois les points traités
```

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

**Causes.** Ne jamais attribuer une cause sans l'avoir isolée par une mesure. Une explication cohérente avec les chiffres observés n'est pas une cause démontrée.

C'est la même erreur qu'un test qui passe pour la mauvaise raison : une observation compatible avec l'hypothèse, prise pour une confirmation. Avant d'écrire « c'est à cause de X », change X seul et vérifie que le chiffre bouge. Vérifie aussi que la mesure mesure bien quelque chose : un chronomètre sur un traitement qui n'a rien traité donne un résultat parfaitement stable et parfaitement faux.

---

## Règle de documentation

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
