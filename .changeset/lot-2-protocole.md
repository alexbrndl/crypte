---
'@crypte/core': patch
---

Complète `@crypte/core/protocol` avec les types du format de story, du manifeste et du canal.

`StoryDefinition`, `Story`, `Wrap`, `EntryMeta` et `ControlOverride` décrivent ce qu'un fichier de stories peut déclarer. `Manifest`, `StoryEntry` et `ArgType` décrivent ce que le CLI produit et ce que le shell consomme.

Ajoute `storyId` et `normalizeSegment`, qui dérivent l'identifiant d'une entrée depuis son chemin et son nom. Cet identifiant sert d'URL et de clé de baseline : il est stable, en minuscules et sans accents.

`PluginStoryOptions` et `PluginControlSettings` sont des points d'extension vides : un plugin les remplit depuis son propre paquet, sans modification du noyau. Sans le plugin installé, ses réglages sont refusés à la compilation.

Le protocole n'a aucune dépendance et ne touche pas au DOM.
