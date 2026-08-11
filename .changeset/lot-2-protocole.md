---
'@crypte/core': minor
---

Complète `@crypte/core/protocol` avec les types du format de story, du manifeste et du canal.

`StoryDefinition`, `Story`, `Wrap`, `StoryMeta` et `PropDetails` décrivent ce qu'un fichier de stories peut déclarer. `Manifest`, `StoryEntry` et `ResolvedPropDetails` décrivent ce que le CLI produit et ce que le shell consomme.

Ajoute `storyId` et `normalizeSegment`, qui dérivent l'identifiant d'une entrée depuis son chemin et son nom. Cet identifiant sert d'URL et de clé de baseline : il est stable, en minuscules, sans accents latins, et conserve les écritures non latines.

Le champ qui complète l'inférence s'appelle `details`, du même nom des deux côtés : dans un fichier de stories et dans le manifeste. Il est complémentaire par nature, on n'y écrit que ce que l'inférence n'a pas trouvé.

**Rupture du protocole du canal.** Le message générique `{ type: 'plugin', plugin, payload }` disparaît de `ShellMessage` et de `PreviewMessage`, remplacé par des points d'extension déclarés.

Quatre points d'extension vides, tous de la même forme : `PluginPropDetails`, `PluginStoryOptions`, `PluginShellMessages` et `PluginPreviewMessages`. Un plugin les remplit depuis son propre paquet, par augmentation de module, sans modification du noyau. Tant qu'aucun plugin ne l'a déclaré, écrire une borne de curseur, une option ou un message est une erreur de compilation.

**Rupture du protocole du canal.** Le message `ready` annonce `protocolVersion`. Le champ s'appelait `manifestVersion` alors qu'il transportait déjà la version du protocole, et le manifeste a maintenant la sienne.

Les types d'une prop vivent dans `prop.ts` : `PropDetails` pour ce qu'on écrit, `ResolvedPropDetails` pour ce que le manifeste porte. Ils ne diffèrent que par l'obligation de `type` et `required`, ce qui ne se voit qu'en les mettant côte à côte.

Le protocole n'a aucune dépendance et ne touche pas au DOM.
