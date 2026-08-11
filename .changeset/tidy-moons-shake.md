---
'@crypte/core': patch
'@crypte/react': patch
---

Ajoute le canal `postMessage` entre le shell et la preview, et le montage React.

`@crypte/core/ui` expose `createShellChannel`, `@crypte/core/preview` expose `createPreviewChannel`, et `@crypte/react` expose `createAdapter` pour monter un composant dans la preview. Le shell ne manipule que des messages sérialisables et ne charge aucun framework de rendu.

Le montage est synchrone : une erreur du composant remonte par le message `error`, et la durée transmise mesure le rendu lui-même.

Le canal n'accepte et n'émet que des messages de la même origine, dans les deux sens.
