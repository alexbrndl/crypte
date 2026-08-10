---
name: review
description: Relit le diff de la branche courante contre les contraintes écrites du dépôt, puis poste le verdict en revue de la pull request. À lancer avant de sortir la pull request du brouillon.
---

Relis le diff de la branche courante contre les contraintes écrites du dépôt, puis poste ton verdict en revue de la pull request.

## 0. Déléguer si tu as écrit ce code

**Si tu as écrit tout ou partie de cette branche dans la session courante, ne fais pas la revue toi-même.** Délègue-la à un sous-agent, qui part d'un contexte vierge et ne peut donc pas confondre ce qu'il croit avoir fait avec ce que le diff contient.

Le prompt de délégation doit rester **minimal** :

> Applique le skill `review` à la branche courante du dépôt. Ne suppose rien de ce qui a été fait.

**Ne lui résume ni le travail, ni les intentions, ni les décisions.** Un résumé réintroduit exactement le biais que la délégation supprime : le sous-agent vérifierait alors ta version des faits au lieu du diff.

Le sous-agent produit et poste la revue, puis se termine. Tu ne reprends la main qu'ensuite, pour corriger les points remontés.

## 1. Lire, ne pas se souvenir

Commence par lire réellement les fichiers :

```bash
git fetch origin main
git diff origin/main...HEAD
```

Un résumé de mémoire ne vaut rien ici : ce qui est recherché, ce sont les écarts entre ce qu'on croit avoir fait et ce que le diff contient.

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

**Poste une revue, pas un commentaire simple.** Un commentaire de pull request ne peut pas être marqué comme résolu ; un commentaire de revue ancré sur une ligne le peut. Chaque point devient ainsi une conversation qu'il faut clore explicitement, et la fusion est bloquée tant qu'il en reste une ouverte.

Le corps de la revue doit commencer par ce marqueur exact, seul sur sa première ligne :

```
<!-- crypte-review -->
```

C'est lui, et lui seul, que cherche le workflow `require-review.yml`. Sans lui, la revue ne compte pas.

Construis un fichier JSON, puis envoie-le :

```json
{
  "event": "COMMENT",
  "body": "<!-- crypte-review -->\n## Revue\n\n**Verdict : 2 points.**",
  "comments": [{ "path": "packages/cli/src/index.ts", "line": 12, "side": "RIGHT", "body": "…" }]
}
```

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

Le relecteur est ici l'auteur, ce qui vaut moins qu'un regard neuf. Deux conséquences : relis le diff plutôt que ta mémoire, et préfère lancer cette revue dans une session distincte de celle qui a écrit le code.

Cette revue attrape les écarts par rapport à des règles écrites. Elle n'attrape pas ce qui n'est écrit nulle part.
