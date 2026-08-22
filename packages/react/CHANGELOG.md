# @crypte/react

## 0.1.0

### Minor Changes

- [#37](https://github.com/alexbrndl/crypte/pull/37) [`67036f8`](https://github.com/alexbrndl/crypte/commit/67036f8209eefb60a9b8849861cf4ebe8ac00e5b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Stories render inside the wrappers they declare.

  Section 2.5 of the contracts says the config's `wrap` wraps the file's, which wraps the component. Until now `wrap` was read, typed, validated, and then thrown away: a story declaring a `ThemeProvider` rendered without its context, with nothing said.

  All three forms work: one component, an array of components, and an array whose entries carry their own props. In the array form the first entry is the outermost.

  `Adapter.mount` takes the flattened list as an optional fourth argument, so an adapter written against the previous shape keeps compiling, and a story with no wrapper mounts with no extra element in its tree.

  **A relative import in `crypte.config.ts` now travels correctly.** The generated preview entry is a virtual module, so `./src/components/Frame` used to resolve against its own path and fail to load. Config imports are rewritten root-absolute, like story imports already were, and one that points outside the project is refused by name. An adapter imported relatively hit the same wall before this release.

- [#33](https://github.com/alexbrndl/crypte/pull/33) [`e14e06b`](https://github.com/alexbrndl/crypte/commit/e14e06beb162bf1dd9384e1c9074dc3d5c496794) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` starts a server, and a story renders.

  The command reads the project, writes the manifest and its fingerprint, then serves two pages. The shell ships prebuilt inside the CLI and knows no framework: it reads the catalogue and talks over the channel. The preview is compiled by the project's own Vite, because it imports the adapter you installed and your story modules, so it belongs to your bundle and not to ours.

  `@crypte/react` gains `defineStories` and `story`, the two functions a story file calls, with the types that infer a component's props. A story file needs no type alias and no `satisfies`.

  **A story that throws shows its error** instead of an empty frame: the name, the message and the stack, in place of the preview. The React adapter now passes `onUncaughtError` to its root, without which React 19 reports a failing component as an unhandled error and hands control back as if it had rendered.

  What a story file could not be read from is printed at start-up, one line per file. Nothing reloads yet: editing a component still needs a restart.

- [#43](https://github.com/alexbrndl/crypte/pull/43) [`83beccd`](https://github.com/alexbrndl/crypte/commit/83beccd3d5b84e4f6aeb019285049f7a21cd6562) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/react` exporte l'adaptateur par défaut : `adapter: react()` remplace `adapter: createAdapter()`, et le nom se choisit à l'import, ce qui laisse un projet nommer aussi `@vitejs/plugin-react` comme il veut. `createAdapter` reste, sous un nom fixe.

  Toute fonction reçue par `wrap` est instanciée comme un composant, la règle de la section 2.5 que le typage ne peut pas imposer : en React un composant est une fonction, donc `wrap: (story) => …` obtient un rendu faux plutôt qu'une ambiguïté.

  Aucun plugin Vite n'est fourni ni ajouté : Vite transforme le JSX lui-même, et `@vitejs/plugin-react` n'a d'intérêt que pour ce qui passe par Babel, React Compiler par exemple, que le projet déclare alors dans `vite.plugins`.

### Patch Changes

- [#12](https://github.com/alexbrndl/crypte/pull/12) [`004c342`](https://github.com/alexbrndl/crypte/commit/004c3427ce3580377c2a5a228056c3b2a5a91379) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Ajoute le canal `postMessage` entre le shell et la preview, et le montage React.

  `@crypte/core/ui` expose `createShellChannel`, `@crypte/core/preview` expose `createPreviewChannel`, et `@crypte/react` expose `createAdapter` pour monter un composant dans la preview. Le shell ne manipule que des messages sérialisables et ne charge aucun framework de rendu.

  Le montage est synchrone : une erreur du composant remonte par le message `error`, et la durée transmise mesure le rendu lui-même.

  Le canal n'accepte et n'émet que des messages de la même origine, dans les deux sens.

- Updated dependencies [[`67036f8`](https://github.com/alexbrndl/crypte/commit/67036f8209eefb60a9b8849861cf4ebe8ac00e5b), [`e14e06b`](https://github.com/alexbrndl/crypte/commit/e14e06beb162bf1dd9384e1c9074dc3d5c496794), [`b483bcd`](https://github.com/alexbrndl/crypte/commit/b483bcd493747393900864556e3a45ad3e2637b2), [`68ecfc0`](https://github.com/alexbrndl/crypte/commit/68ecfc0a4b56878093958401120d96c7c6145d3b), [`dae631c`](https://github.com/alexbrndl/crypte/commit/dae631c63c6d436fbd4b5be98bcccf50032edab5), [`004c342`](https://github.com/alexbrndl/crypte/commit/004c3427ce3580377c2a5a228056c3b2a5a91379), [`0e287ee`](https://github.com/alexbrndl/crypte/commit/0e287ee1639ea9c423e19851aaeb839c1582a800)]:
  - @crypte/core@0.1.0
