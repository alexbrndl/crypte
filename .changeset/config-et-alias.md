---
'@crypte/cli': minor
---

`@crypte/cli` expose `defineConfig` et sait lire la configuration d'un projet.

`crypte.config.ts` déclare la racine des stories, l'adaptateur, et facultativement une entrée CSS, une enveloppe globale, des plugins Crypte et des plugins Vite. Deux champs seulement sont obligatoires, et un message nomme celui qui manque.

Les alias de chemins sont lus depuis `tsconfig.json` ou `jsconfig.json`, sans aucune déclaration. Ils s'appliquent à tous les fichiers, y compris `.js` et `.jsx` : un projet React écrit en JavaScript résout ses imports comme un projet TypeScript.

Le `vite.config` du projet n'est jamais lu. Ce qu'il impose se déclare dans `vite.plugins`.
