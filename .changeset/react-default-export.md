---
'@crypte/react': minor
---

`@crypte/react` exporte l'adaptateur par défaut : `adapter: react()` remplace `adapter: createAdapter()`, et le nom se choisit à l'import, ce qui laisse un projet nommer aussi `@vitejs/plugin-react` comme il veut. `createAdapter` reste, sous un nom fixe.

Toute fonction reçue par `wrap` est instanciée comme un composant, la règle de la section 2.5 que le typage ne peut pas imposer : en React un composant est une fonction, donc `wrap: (story) => …` obtient un rendu faux plutôt qu'une ambiguïté.

Aucun plugin Vite n'est fourni ni ajouté : Vite transforme le JSX lui-même, et `@vitejs/plugin-react` n'a d'intérêt que pour ce qui passe par Babel, React Compiler par exemple, que le projet déclare alors dans `vite.plugins`.
