---
'@crypte/core': patch
---

Complète `@crypte/core/protocol` avec les types du format de story, du manifeste et du canal.

`StoryDefinition`, `Story`, `Wrap`, `EntryMeta` et `ControlOverride` décrivent ce qu'un fichier de stories peut déclarer. `Manifest`, `StoryEntry` et `ArgType` décrivent ce que le CLI produit et ce que le shell consomme.

Ajoute `storyId` et `normalizeSegment`, qui dérivent l'identifiant d'une entrée depuis son chemin et son nom. Cet identifiant sert d'URL et de clé de baseline : il est stable, en minuscules et sans accents.

Le champ qui complète l'inférence s'appelle `details`, du même nom des deux côtés : dans un fichier de stories et dans le manifeste. Il est complémentaire par nature, on n'y écrit que ce que l'inférence n'a pas trouvé.

`PluginPropDetails` et `PluginStoryOptions` sont des points d'extension vides : un plugin les remplit depuis son propre paquet, sans modification du noyau. Les bornes d'un curseur et le réglage `control` en relèvent, et sans le plugin installé, les écrire est une erreur de compilation.

Le protocole n'a aucune dépendance et ne touche pas au DOM.
