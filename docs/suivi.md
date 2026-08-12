# Suivi

Ce qu'une revue a vu, qu'on a choisi de ne pas corriger tout de suite, et pourquoi.

Une pull request sort du brouillon quand plus aucun point **bloquant** ne reste. Le reste vient ici plutôt que de retenir le lot : sans cet endroit, la seule issue est de tout corriger, et la boucle de revue ne se ferme jamais.

**Ce fichier est lu par la revue.** Un point qui y figure est arbitré : le re-signaler n'apprend rien à personne. `Wrap` est remonté quatre fois avant qu'on le sorte du périmètre.

Une ligne disparaît quand le point est traité, pas avant. Les niveaux sont définis dans `.claude/skills/review/SKILL.md`.

---

## Important

### Le canal n'a aucun test d'exécution

`createShellChannel` et `createPreviewChannel` ne sont exercés par aucun test. Le filtrage sur `event.origin` et `event.source`, le refus de `'*'` dans `postMessage`, les réponses `ready`, `rendered` et `error` : rien n'est gardé.

*Mesuré :* remplacer `origin` par `'*'` dans `reply` laisse les 76 tests verts, alors que le commentaire juste au-dessus en fait la raison de sûreté du canal.

*Pourquoi ce n'est pas fait ici :* il faut un environnement DOM et deux fenêtres simulées, donc une configuration de test que le dépôt n'a pas encore. C'est un lot en soi.

*Origine :* revue 12 du lot 2.

---

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

## Observations

### Le contrôle de la spécification lit moins de formes que celui du barrel

`spec.test.ts` reconnaît `export interface|type|const|function`, quand `index.test.ts` couvre aussi `export declare`, `class`, `enum`, `let`, `var`, `async function` et les blocs `export { X }` sans `from`.

*Conséquence :* un type déclaré puis exporté séparément échappe au contrôle, et la partie normative peut l'ignorer en silence.

*Origine :* revue 12 du lot 2.

### `sideEffects: false` n'est ni documenté ni gardé

Le champ est ajouté au manifeste publié pour qu'un bundler consommateur puisse élaguer l'import que rolldown conserve dans `preview`. Il est exact aujourd'hui, les trois entrées ne déclarant que des constantes et des fonctions.

*Conséquence :* le jour où un module du protocole acquiert un effet de bord au chargement, les bundlers des consommateurs le supprimeront sans avertissement.

*Origine :* revue 12 du lot 2.
