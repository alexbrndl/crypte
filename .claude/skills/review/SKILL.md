---
name: review
description: Relit le diff de la branche courante contre les contraintes écrites du dépôt, puis poste le verdict en revue de la pull request. À lancer avant de sortir la pull request du brouillon.
---

Relis le diff de la branche courante contre les contraintes écrites du dépôt, puis poste ton verdict en revue de la pull request.

**Poste la revue avant d'en rendre compte.** Pas après : l'ordre est la seule chose qui fasse la différence. Mesuré sur le lot 2, douze relectures et **deux revues postées** ; le verdict rendu à l'orchestrateur terminait la tâche, et le postage, dernière étape, sautait.

Ta réponse à celui qui t'a délégué vient donc **après** l'envoi, et cite l'identifiant de la revue postée. Une revue non postée est une revue qui n'existe pas, même juste : le contrôle `require-review.yml` cherche un marqueur dans les revues de la pull request, jamais dans une réponse.

Les sections 3 et 4 sont obligatoires, y compris quand il n'y a rien à signaler.

## 0. Déléguer si tu as écrit ce code

**Si tu as écrit tout ou partie de cette branche dans la session courante, ne fais pas la revue toi-même.** Délègue-la à un sous-agent, qui part d'un contexte vierge et ne peut donc pas confondre ce qu'il croit avoir fait avec ce que le diff contient.

**Ne lui résume ni le travail, ni les intentions, ni les décisions.** Un résumé réintroduit exactement le biais que la délégation supprime : le sous-agent vérifierait alors ta version des faits au lieu du diff.

En revanche, **fournis-lui les faits bruts** plutôt que de le laisser les rechercher : la sortie de `git diff origin/main...HEAD`, la liste des fichiers touchés, le numéro de la pull request. Ce n'est pas un résumé, c'est le texte même qu'il irait chercher, et le lui donner évite une demi-douzaine d'allers-retours.

La distinction tient en une phrase : **des faits, jamais d'interprétation.**

### Quel modèle

Le critère est mécanique, pour ne pas être rejugé à chaque revue :

| Le diff touche                                                       | Modèle         |
| -------------------------------------------------------------------- | -------------- |
| uniquement de la documentation, de la configuration ou des workflows | petit modèle   |
| au moins un fichier sous `packages/*/src/**` ou `apps/**`            | modèle courant |

Le code garde donc toujours le modèle courant : le petit modèle ne s'applique jamais là où le raisonnement est le plus exigeant. En cas de doute sur la nature du diff, prends le modèle courant.

### Forme du prompt

```
Applique le skill review à la branche courante du dépôt.
Ne suppose rien de ce qui a été fait.
Pull request numéro N.

Fichiers touchés :
<sortie de git diff --stat origin/main...HEAD>

Diff :
<sortie de git diff origin/main...HEAD>
```

Le sous-agent poste la revue, puis se termine en rendant son verdict. **Vérifie qu'elle est bien postée** avant de corriger quoi que ce soit :

```bash
gh pr view <numéro> --json reviews --jq '[.reviews[]|select(.body|contains("crypte-review"))]|length'
```

Une relecture dont il ne reste aucune trace n'a pas eu lieu du point de vue du dépôt, et le contrôle sera satisfait par une revue plus ancienne portant sur un autre code.

## Premier tour ou tour de correction

**Premier tour :** le diff complet, `origin/main...HEAD`.

**Tour de correction :** seulement ce qui a bougé depuis la dernière revue, plus la liste des points déjà traités **et de ceux déjà arbitrés**, tous fournis dans le prompt. Un point classé « observation » ou renvoyé vers une issue ne se re-signale pas : `Wrap` est remonté quatre fois avant d'être sorti du périmètre, ce qui n'a rien appris à personne. Relire vingt-sept fichiers pour en vérifier trois fait perdre du temps et ramène les mêmes constats de fond à chaque tour.

Ce qui reste hors périmètre d'un tour de correction se signale en une ligne, sans être réexaminé.

## Ce que le dépôt vérifie déjà

`pnpm run mutations` casse chaque garantie du protocole et vérifie que le bon test s'en aperçoit. **Lance-le plutôt que de refaire ces mutations à la main**, et consacre ton temps à ce qui n'y figure pas.

Le catalogue est dans `test/mutations.json` : une garantie absente de ce fichier est une garantie que personne ne surveille, et c'est en soi un constat.

## Donner un niveau à chaque point

Sans niveau, tout point se traite comme un empêchement, et la boucle ne se ferme jamais : il y a toujours quelque chose à améliorer dans du code. **Chaque point porte donc l'un de ces trois niveaux, et le mot exact.**

**Bloquant.** Rompt un contrat public, introduit une régression, ou rend vert un contrôle qui ne vérifie plus rien. Se corrige avant la sortie du brouillon, et la correction se fait relire.

**Important.** Défaut réel dont rien ne dépend aujourd'hui : robustesse, cas limite non atteint, dette assumée. Se corrige s'il l'est sans risque, devient une issue sinon.

**Observation.** Imprécision, incohérence de documentation, amélioration possible. Ne justifie **jamais** un tour de plus.

En cas d'hésitation entre deux niveaux, prendre le plus bas et dire pourquoi : c'est celui qui a un coût, l'autre n'en a pas.

**Le critère d'arrêt de la boucle est là.** La pull request sort du brouillon quand aucun bloquant ne reste, pas quand la revue est vide. Les points restants sont consignés dans `docs/suivi.md`, dans le même diff.

**Lis `docs/suivi.md` avant de rédiger.** Ce qui y figure est arbitré : le re-signaler n'apprend rien. Si un point du fichier est devenu bloquant, c'est en revanche un constat à part entière, et il faut dire ce qui a changé.

## Borne d'effort

**Reste proportionné au diff.** Une revue longue sur un petit diff ne sera pas lue, et c'est le seul mode d'échec qui compte ici.

- **N'utilise pas d'outil pour ce que le prompt contient déjà.** Le diff et la liste des fichiers y sont fournis : les récupérer une seconde fois est du gaspillage pur.
- Lis `CLAUDE.md`, et un fichier touché seulement si le diff seul ne permet pas de trancher. Rien d'autre.
- **Ne clone pas le dépôt, ne monte pas d'environnement jetable, ne rejoue pas le mécanisme de bout en bout.** Vérifie par l'exécution seulement ce dont le verdict dépend, en une ou deux commandes.
- Sur un **tour de correction**, vise trois points maximum, et deux lignes par point.
- Sur un **premier tour portant du code neuf**, ne t'arrête pas à trois : rends tout ce qui est bloquant. Un tour qui en garde un pour la fois d'après en coûte un autre, de douze minutes.
- Ne rends compte que de ce que tu signales. Pas de liste de ce que tu as vérifié et trouvé conforme.

Repère chiffré, **sur un tour de correction** : une dizaine d'appels d'outils au maximum, poster la revue et relancer le contrôle compris. Sur un premier tour portant du code neuf, la borne ne s'applique pas : mieux vaut une revue longue et complète que trois revues courtes. Au-delà, tu es en train d'enquêter au lieu de relire.

Cette borne a été dépassée trois fois de suite, à trente-quatre et quarante-trois appels : un budget qui n'est jamais tenu ne sert à rien. **Sur un tour de correction, elle est ferme.** Ce qui la fait exploser est de refaire à la main ce que `pnpm run mutations` fait déjà, et de monter des projets témoins pour éprouver un mécanisme que le diff seul permet de juger.

Sur un premier tour, l'enquête est en revanche légitime : c'est elle qui a produit les meilleurs constats de ce dépôt.

Un diff de cinquante lignes mérite quelques minutes, pas une enquête.

## 1. Lire, ne pas se souvenir

Le diff est dans le prompt. Lis-le, ne le redemande pas.

S'il en est absent, et seulement dans ce cas :

```bash
git fetch origin main
git diff origin/main...HEAD
```

Un résumé de mémoire ne vaut rien ici : ce qui est recherché, ce sont les écarts entre ce qu'on croit avoir fait et ce que le diff contient.

Lis ensuite `CLAUDE.md` et, si le diff touche au format de story, au manifeste, au protocole ou aux plugins, `docs/spec-contrats.md`.

## 2. Vérifier contre les contraintes, pas contre le goût

**Regarde de trois places.** Le code seul, le code parmi les autres fichiers et dans l'ordre où il s'exécute, et le code depuis l'extérieur, c'est-à-dire ce que le produit promet. Un mécanisme juste en lui-même peut être placé au mauvais endroit d'une chaîne, ou tenir une promesse que la documentation dément.

**Quand un diff pose une table de cas, demande quels axes elle croise.** Une table complète sur un axe et muette sur un autre se présente comme close et ne l'est pas.

**Énumère les entrées avant de chercher.** Pour une fonction, ses paramètres et ce qu'elle lit d'ailleurs ; pour chacun, les classes de valeurs. Les trois points bloquants du lot 3 étaient les trois paramètres d'une même fonction, trouvés à un tour d'intervalle chacun.

**Ce qui est recherché**, dans cet ordre :

1. **Les quatre contraintes structurelles de `CLAUDE.md`.** Une dépendance interne embarquée en copie, un composant placé dans `core/ui` sans qu'un plugin réel le demande, un import de `vite-plus` dans du code publié, une entrée de `core` qui en tire une autre.
2. **Les contrats de `docs/spec-contrats.md`**, s'ils sont concernés. Ils font foi et ne se rediscutent pas ici.
3. **Les contradictions internes.** Une décision consignée dans la documentation et prise à l'envers dans le code, un mécanisme rendu inopérant par un autre changement, un test qui ne peut plus échouer.
4. **La règle de documentation.** Le diff ajoute-t-il une pièce mobile, un workflow, un script, une configuration qui encode une décision, un test dont l'assertion n'est pas évidente ? Si oui, `docs/architecture.md` doit être mis à jour dans le même diff, avec les trois questions dont la troisième, « ce qui casse si on l'enlève ».

**Ce qui n'est pas recherché.** Le style, le nommage, le formatage, la structure des fichiers : `vp check` s'en occupe déjà. Les arbitrages non plus, publier maintenant ou plus tard, telle bibliothèque plutôt qu'une autre : ce sont des décisions humaines, pas des écarts.

**Si tu n'as rien trouvé, dis-le en une ligne, et poste quand même.** Une revue qui invente des remarques pour se justifier est pire qu'une revue vide : elle apprend à ne plus lire les suivantes. Mais une revue vide non postée bloque la pull request.

## 3. Poster le verdict

**Poste une revue, pas un commentaire simple.** Un commentaire de pull request ne peut pas être marqué comme résolu ; un commentaire de revue ancré sur une ligne le peut. Chaque point devient ainsi une conversation qu'il faut clore explicitement, et la fusion est bloquée tant qu'il en reste une ouverte.

Le corps de la revue doit commencer par ce marqueur exact, seul sur sa première ligne :

```
<!-- crypte-review -->
```

C'est lui, et lui seul, que cherche le workflow `require-review.yml`. Sans lui, la revue ne compte pas.

Construis un fichier JSON, puis envoie-le :

**Chaque commentaire commence par son niveau**, en gras, et le verdict compte les bloquants séparément : c'est ce compte, et lui seul, qui dit si la pull request peut sortir du brouillon.

```json
{
  "event": "COMMENT",
  "body": "<!-- crypte-review -->\n## Revue\n\n**Verdict : 1 bloquant, 2 points au total.**",
  "comments": [
    {
      "path": "packages/cli/src/index.ts",
      "line": 12,
      "side": "RIGHT",
      "body": "**Bloquant.** …"
    }
  ]
}
```

Un verdict sans compte de bloquants est inutilisable : celui qui le reçoit ne peut pas savoir ce qui retient la pull request, et retombe alors à tout corriger, ce qui est la boucle qu'on cherche à fermer.

```bash
gh api "repos/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/pulls/<numéro>/reviews" --input <fichier.json>
```

Trois contraintes de l'API à respecter :

- `event` doit valoir `COMMENT`. `APPROVE` et `REQUEST_CHANGES` sont refusés sur sa propre pull request.
- `path` et `line` doivent désigner une ligne **présente dans le diff**, sinon l'appel entier échoue. En cas de doute, vérifie avec `git diff origin/main...HEAD -- <fichier>`.
- **Ancre chaque point sur un fichier autant que possible.** Un point laissé dans le corps de la revue n'est pas résolvable, donc ne bloque rien. Pour une remarque sans ligne évidente, par exemple une documentation manquante, ancre-la sur le fichier le plus concerné du diff.

Structure de chaque commentaire ancré : la contrainte enfreinte citée nommément, et ce qui casse concrètement.

## 4. Relancer le contrôle

Poster une revue ne déclenche aucun workflow : `require-review.yml` ne réagit qu'à l'ouverture d'une pull request et aux nouvelles poussées. Sans cette dernière étape, le contrôle reste en échec alors que la revue existe.

```bash
gh run list --branch "$(git branch --show-current)" --workflow "Require review" --limit 1 --json databaseId --jq '.[0].databaseId'
gh run rerun <id>
```

Un nouveau commit sur la branche relance également le contrôle.

## Portée de l'exercice

La délégation de la section 0 supprime le biais de contexte, pas l'angle mort commun : le relecteur reste le même modèle sur le même dépôt. Il voit ce que le diff contredit, pas ce à quoi personne n'a pensé.

Cette revue attrape les écarts par rapport à des règles écrites. Elle n'attrape pas ce qui n'est écrit nulle part.
