---
name: changeset
description: Dépose la note de version d'une pull request dans .changeset/, ou constate qu'il n'y a rien à déclarer. À lancer avant /explore.
---

Dépose la note de version de la branche courante, ou constate qu'il n'y a rien à déclarer.

## 1. Décider s'il y a quelque chose à déclarer

Lis le diff :

```bash
git fetch origin main
git diff --stat origin/main...HEAD
```

**Une note se dépose uniquement si le diff change ce que reçoit l'utilisateur d'un paquet publié.** Quatre chemins, et c'est le même critère que celui du contrôle `require-changeset` :

- `packages/*/src/**`
- `packages/*/package.json`
- `packages/*/tsconfig.json` et `packages/*/vite.config.ts`, qui décident du contenu de `dist/`

Les trois derniers comptent **en entier**, sans regarder quel champ a bougé. Distinguer `exports` de `scripts` demanderait de rapprocher deux versions du fichier pour un gain faible : une note de trop coûte quatre lignes, une note manquée publie une version fausse.

Ce critère est exécutable, dans `test/changeset-check.mjs`. **Si tu hésites, lance-le** plutôt que de trancher à la lecture : `node test/changeset-check.mjs <numéro>`. Le divorce entre ce texte et ce code est exactement ce qui a produit un point bloquant sur la pull request qui a introduit le contrôle.

**Rien à déclarer**, et c'est le cas le plus fréquent : documentation, intégration continue, outillage, tests, `packages/*/test/**`, `apps/**` qui n'est jamais publié.

Dans ce cas, dis-le en une ligne et arrête-toi. Ne dépose pas de fichier. Un changelog rempli de « mise à jour de la documentation » ne se lit plus, et le mécanisme perd son intérêt.

## 2. Choisir le niveau

**Commence par chercher la rupture, ne conclus pas au niveau.** Trois questions, et une seule réponse positive suffit :

- Un nom exporté a-t-il disparu, changé de forme, ou reçu un champ obligatoire ?
- Une valeur jusqu'ici admise cesse-t-elle de l'être ?
- Un message, un format de fichier ou un protocole change-t-il de forme ?

Une pull request du lot 2 a déposé un `patch` alors qu'elle retirait un message du canal et renommait un champ d'un autre : le tableau ci-dessous était là, la question ne s'était pas posée.

Le projet est en `0.x`. La convention diffère de celle d'après `1.0.0`, et s'en écarter enverrait le projet en `1.0.0` par accident :

| Nature du changement                                    | Niveau                                     |
| ------------------------------------------------------- | ------------------------------------------ |
| Rupture d'un contrat ou d'une API publique              | `minor`                                    |
| Tout le reste : ajout, correction, amélioration interne | `patch`                                    |
| Stabilisation de l'API                                  | `major`, **jamais sans demande explicite** |

`major` produit `1.0.0` et déclare l'API stable. C'est une décision humaine, pas un choix de rédaction.

## 3. Écrire la note

Un fichier dans `.changeset/`, au nom libre, deux paquets s'il le faut :

```markdown
---
'@crypte/cli': patch
---

Ajoute la commande `crypte check`.
```

Le mode `fixed` fait monter les trois paquets `@crypte` ensemble : déclare seulement celui que tu modifies réellement, les autres suivront.

**Le texte devient la ligne du changelog**, lue par quelqu'un qui ne connaît ni la branche ni l'issue. Écris ce que le changement fait pour lui, pas ce que tu as fait.

```
Ajoute la commande `crypte check`.        utile
Les alias sont désormais lus depuis jsconfig.json.   utile
fix stuff                                 inutile
Corrige le retour de la PR 42             inutile, la référence ne survit pas
```

Une ou deux phrases. Le détail vit dans la pull request.

## 4. Ce qui se passe ensuite

Rien immédiatement. Le fichier est commité avec la pull request, et **aucun numéro ne bouge à la fusion**.

Les notes s'accumulent, une pull request « Version Packages » les rassemble automatiquement, et c'est sa fusion qui applique les montées de version. Tu n'as rien à faire de plus.
