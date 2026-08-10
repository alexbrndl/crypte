---
name: review
description: Relit le diff de la branche courante contre les contraintes écrites du dépôt, puis poste le verdict en commentaire de la pull request. À lancer avant de fusionner.
---

Relis le diff de la branche courante contre les contraintes écrites du dépôt, puis poste ton verdict en commentaire de la pull request.

## 1. Lire, ne pas se souvenir

Commence par lire réellement les fichiers, même si tu viens de les écrire dans cette session :

```bash
git fetch origin main
git diff origin/main...HEAD
```

Un résumé de mémoire ne vaut rien ici : ce qui est recherché, ce sont les écarts entre ce que tu crois avoir fait et ce que le diff contient.

Lis ensuite `CLAUDE.md` et, si le diff touche au format de story, au manifeste, au protocole ou aux plugins, `docs/spec-contrats.md`.

## 2. Vérifier contre les contraintes, pas contre le goût

**Ce qui est recherché**, dans cet ordre :

1. **Les quatre contraintes structurelles de `CLAUDE.md`.** Une dépendance interne embarquée en copie, un composant placé dans `core/ui` sans qu'un plugin réel le demande, un import de `vite-plus` dans du code publié, une entrée de `core` qui en tire une autre.
2. **Les contrats de `docs/spec-contrats.md`**, s'ils sont concernés. Ils font foi et ne se rediscutent pas ici.
3. **Les contradictions internes.** Une décision consignée dans la documentation et prise à l'envers dans le code, un mécanisme rendu inopérant par un autre changement, un test qui ne peut plus échouer.
4. **La règle de documentation.** Le diff ajoute-t-il une pièce mobile, un workflow, un script, une configuration qui encode une décision, un test dont l'assertion n'est pas évidente ? Si oui, `docs/architecture.md` doit être mis à jour dans le même diff, avec les trois questions dont la troisième, « ce qui casse si on l'enlève ».

**Ce qui n'est pas recherché.** Le style, le nommage, le formatage, la structure des fichiers : `vp check` s'en occupe déjà. Les arbitrages non plus, publier maintenant ou plus tard, telle bibliothèque plutôt qu'une autre : ce sont des décisions humaines, pas des écarts.

**Si tu n'as rien trouvé, dis-le en une ligne.** Une revue qui invente des remarques pour se justifier est pire qu'une revue vide : elle apprend à ne plus lire les suivantes.

## 3. Poster le verdict

Le commentaire doit commencer par ce marqueur exact, seul sur sa première ligne :

```
<!-- crypte-review -->
```

C'est lui, et lui seul, que cherche le workflow `require-review.yml`. Sans lui, la revue ne compte pas.

Structure du commentaire :

- le marqueur
- un titre `## Revue`
- **Verdict** : `rien à signaler` ou `N point(s)`
- pour chaque point : le fichier et la ligne, la contrainte enfreinte citée nommément, et ce qui casse concrètement

Poste avec :

```bash
gh pr comment <numéro> --body-file <fichier>
```

Écris le corps dans un fichier temporaire plutôt qu'en ligne : le texte contient du markdown et des retours à la ligne qui passent mal en argument.

## Portée de l'exercice

Le relecteur est ici l'auteur, ce qui vaut moins qu'un regard neuf. Deux conséquences : relis le diff plutôt que ta mémoire, et préfère lancer cette revue dans une session distincte de celle qui a écrit le code.

Cette revue attrape les écarts par rapport à des règles écrites. Elle n'attrape pas ce qui n'est écrit nulle part.
