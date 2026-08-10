---
'@crypte/core': patch
'@crypte/react': patch
---

Ajoute le canal `postMessage` entre le shell et la preview, et le montage React.

`@crypte/core/ui` expose `createShellChannel`, `@crypte/core/preview` expose `createPreviewChannel`, et `@crypte/react` expose `createAdapter` pour monter un composant dans la preview. Le shell ne manipule que des messages sérialisables et ne charge aucun framework de rendu.
