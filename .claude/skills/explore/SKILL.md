---
name: explore
description: Découvre ce qu'un composant fait des entrées qu'on n'a pas prévues, avant de demander une revue. À lancer après /changeset et avant /review.
---

Explore le comportement du code que tu viens d'écrire, pour découvrir ce qu'une revue trouverait sinon à ta place.

**La division du travail est celle-ci : l'exploration découvre, la revue confirme.** Le lot 3 l'a faite à l'envers, neuf tours et trois points bloquants, tous trouvés par la revue et aucun en amont. Les trois étaient les trois paramètres d'une même fonction, découverts un par tour.

## 0. Ce que ce skill n'est pas

**Ce n'est pas une relecture de ton diff.** Vérifier que ce que tu as écrit est bien écrit ne trouve jamais ce que tu n'as pas écrit. C'est exactement ce qui a échoué pendant huit tours.

**Ce n'est pas une revue.** Rien n'est délégué à un sous-agent, rien n'est posté sur la pull request. Tu explores toi-même, avec ton contexte, parce que c'est ton travail. Le regard vierge est le rôle de `/review`, après.

## 1. Inventorier les entrées

**Le périmètre est le diff entier**, pas seulement ce qui paraît neuf. Le code écrit au tour précédent, en corrigeant une revue, n'a jamais été exploré : c'est du code neuf. Trois constats d'un tour du lot 3 portaient exactement là-dessus, sur des garanties écrites la veille et gardées par rien.

Pour chaque fonction publique que le diff ajoute ou modifie, écris **toutes** ses entrées :

- ses paramètres,
- ce qu'elle lit du système de fichiers,
- ce qu'elle lit de la configuration ou de l'environnement,
- ce que son appelant lui passe implicitement, l'ordre dans une chaîne par exemple.

**Une structure reçue est un axe par champ.** Une fonction qui prend un objet de configuration n'a pas une entrée mais autant qu'il a de champs, chacun avec ses classes de valeurs, absent compris. Valider deux champs sur six laisse quatre axes ouverts : les quatre autres ont fini en erreur brute, sans nommer ni le fichier ni le champ.

Cette liste est le point de bascule. Un axe absent ici produira un point bloquant plus tard : `resolveId(source, importer, options)` a coûté trois tours parce que seul le premier paramètre avait été inventorié.

## 2. Écrire les classes de valeurs

Pour chaque entrée, les classes de valeurs possibles. **Pas celles auxquelles tu penses : celles qui existent**, y compris les dégénérées.

Un identifiant de module, par exemple, peut être nu, relatif, absolu, porté par un protocole, virtuel, suffixé d'une requête, ou vide. Un chemin peut être absolu, relatif, inexistant, ou désigner un fichier là où un dossier est attendu.

Quand une classe est finie, dis-le et montre-le : un motif TypeScript porte au plus un joker, donc ses formes se comptent. Un espace fini se ferme ; un espace ouvert se borne et se documente.

## 3. Croiser, et rendre le tableau

Croise les axes et **écris le tableau**. C'est lui qui rend visible la colonne manquante, pas le raisonnement.

Chaque case a soit un cas de test, soit une raison écrite de ne pas en avoir. Une case laissée sans mention est une case oubliée.

**Croiser, ce n'est pas énumérer chaque axe à part.** Un cas qui éprouve un axe avec la valeur la plus simple des autres ne dit rien du croisement. Un test vérifiait qu'un fichier de configuration sans chemins était bien surveillé, sur un projet qui n'en contenait qu'un ; le cas réel, deux fichiers dont le premier est muet, échappait entièrement. Quand deux axes se rencontrent dans le code, ils se rencontrent dans le tableau.

## 4. Éprouver, pas relire

Chaque case se tranche par exécution, sur un projet jetable, jamais par lecture. Ce qui compte est le comportement observé.

Les tests qui lisent la **forme** d'un résultat ne prouvent rien : un alias `{ find: '@' }` a passé un tour entier en étant parfaitement inerte. Éprouve ce que le produit assemble, pas la pièce isolée : monter un serveur à la main plutôt que passer par la configuration réelle a masqué une régression un tour de plus.

## 5. Muter chaque garantie annoncée

Pour chaque garantie que le code, un commentaire ou la documentation annonce : casse-la et vérifie qu'un test rougit.

`pnpm run mutations` couvre celles du catalogue. Pour les autres, fais-le à la main. Une garantie qu'aucune mutation ne fait tomber n'est pas tenue, elle est seulement écrite.

## 6. Rendre compte

En fin d'exploration, trois listes :

- **Corrigé** : ce que l'exploration a trouvé et que tu as réparé.
- **Consigné** : ce qui reste, dans `docs/suivi.md`, avec sa mesure.
- **Non couvert** : les cases sans cas, avec la raison.

Puis seulement, `/review`.

## Borne d'effort

Proportionne à la surface neuve. Un diff qui ne touche que de la documentation ou de la configuration n'a rien à explorer : dis-le en une ligne et arrête-toi.

Un composant neuf avec plusieurs entrées mérite en revanche le temps qu'il faut. Une exploration d'une heure qui évite quatre tours de revue en fait gagner trois.
