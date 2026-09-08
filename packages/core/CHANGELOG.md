# @crypte/core

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

- [#15](https://github.com/alexbrndl/crypte/pull/15) [`b483bcd`](https://github.com/alexbrndl/crypte/commit/b483bcd493747393900864556e3a45ad3e2637b2) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Complète `@crypte/core/protocol` avec les types du format de story, du manifeste et du canal.

  `StoryDefinition`, `Story`, `Wrap`, `StoryMeta` et `PropDetails` décrivent ce qu'un fichier de stories peut déclarer. `Manifest`, `StoryEntry` et `ResolvedPropDetails` décrivent ce que le CLI produit et ce que le shell consomme.

  Ajoute `storyId` et `normalizeSegment`, qui dérivent l'identifiant d'une entrée depuis son chemin et son nom. Cet identifiant sert d'URL et de clé de baseline : il est stable, en minuscules, sans accents latins, et conserve les écritures non latines.

  Le champ qui complète l'inférence s'appelle `details`, du même nom des deux côtés : dans un fichier de stories et dans le manifeste. Il est complémentaire par nature, on n'y écrit que ce que l'inférence n'a pas trouvé.

  **Rupture du protocole du canal.** Le message générique `{ type: 'plugin', plugin, payload }` disparaît de `ShellMessage` et de `PreviewMessage`, remplacé par des points d'extension déclarés.

  Quatre points d'extension vides, tous de la même forme : `PluginPropDetails`, `PluginStoryOptions`, `PluginShellMessages` et `PluginPreviewMessages`. Un plugin les remplit depuis son propre paquet, par augmentation de module, sans modification du noyau. Tant qu'aucun plugin ne l'a déclaré, écrire une borne de curseur, une option ou un message est une erreur de compilation.

  **Rupture du protocole du canal.** Le message `ready` annonce `protocolVersion`. Le champ s'appelait `manifestVersion` alors qu'il transportait déjà la version du protocole, et le manifeste a maintenant la sienne.

  Les types d'une prop vivent dans `prop.ts` : `PropDetails` pour ce qu'on écrit, `ResolvedPropDetails` pour ce que le manifeste porte. Ils ne diffèrent que par l'obligation de `type` et `required`, ce qui ne se voit qu'en les mettant côte à côte.

  Le protocole n'a aucune dépendance et ne touche pas au DOM.

- [#51](https://github.com/alexbrndl/crypte/pull/51) [`7706d65`](https://github.com/alexbrndl/crypte/commit/7706d65f8c53682fc9a81a73ea5aa2b7c7cf0c0d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin can contribute entries to the manifest.

  `CryptePlugin` is a real type in the protocol now, where it was `unknown` in the CLI's config. `@crypte/cli` re-exports it rather than declaring its own: the contract spans three surfaces, so it does not belong to one consumer.

  `NodeHooks` carries one hook, `entries`, because one use demands it. It takes a context holding the project root and returns entries. Stories are not among them: they come from story files, and a plugin injecting one would bypass discovery.

  **Hooks are synchronous, and they run after the stories in the order `plugins` declares.** No `order` field, which every plugin would set to zero. Being last means a contribution landing on an identifier a story already owns is the one that gives way.

  **Nothing a plugin does is fatal, and nothing is silent.** A hook that throws, returns something other than entries, hands over an entry that is not one, lands on a taken identifier, or produces a value JSON would rewrite has that contribution refused, and `crypte dev` prints which plugin it came from and why. A broken plugin costs a panel, never the server.

  **The shape of every entry is checked at run time, not only in the types.** `ContributedEntry` holds while a plugin is compiled, and a plugin is installed compiled: nothing in a published package stops it from handing over `type: 'story'`, which would enter the manifest and the committed fingerprint. `CONTRIBUTABLE` is that same set at run time.

  Section 4.5 stops being free here: everything else the CLI writes is read from source text and serialisable by construction, so a contributed entry is the first input it checks rather than trusts. Anything JSON would not give back as it was is refused, named and located: a function, a `Date`, `NaN`, an infinity, an `undefined` value, a genuine cycle. Two references to one object are not a cycle, and are kept.

  `UIContribution` and `PreviewHooks` stay opaque. Neither has a caller yet.

- [#30](https://github.com/alexbrndl/crypte/pull/30) [`dae631c`](https://github.com/alexbrndl/crypte/commit/dae631c63c6d436fbd4b5be98bcccf50032edab5) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Crypte discovers stories and writes a manifest.

  The CLI walks the story folder, reads each file without running it, and writes `.crypte/manifest.json`. It reads four extensions, `.ts`, `.tsx`, `.js` and `.jsx`, so a project with no TypeScript writes its stories the way it writes its components.

  Each story yields the sidebar path, its stable identifier, the file its component lives in, and the call code rebuilt from the text the author wrote. The component is resolved through the project's own path aliases, so `@/components/Badge` is written down as `src/components/Badge.jsx`. A file that fails to parse is reported and skipped, never fatal. Two stories that land on the same identifier stop the build and are named.

  `StoryEntry` carries a new required field, `props`: the prop names the story passes to the component, from the shared block and its own, sorted. `MANIFEST_VERSION` stays at `1`, because no manifest has ever been written: no command calls the producer, and nothing is published. From the first release that writes one, a required field means a new version.

- [#50](https://github.com/alexbrndl/crypte/pull/50) [`eb3f6f0`](https://github.com/alexbrndl/crypte/commit/eb3f6f05732f157be551cb0dc4c4a58a1e0ebd42) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The manifest carries a second nature of entry, `tokens`.

  `ManifestEntry` is now `StoryEntry | TokensEntry` instead of an alias for the first. One tokens entry holds a family rather than a single token: `path` and `name` place it in the tree the way a story's do, and `tokens` is keyed by token name.

  Every token is read per theme, and `themes` is required, so a project with one theme holds one key rather than a second shape existing. `value` is always the resolved literal and `alias` is the chain that led to it, so drawing a swatch never depends on resolving anything.

  No file format is part of this: CSS variables, DTCG and Tailwind belong to `@crypte/tokens`. The core carries the shape, a plugin carries the reading, the same split as props and `@crypte/docs`.

  `MANIFEST_VERSION` stays at `1`. `"tokens"` was already a reserved value of a `type` field, which is what the reserve was for, and nothing required moved on `StoryEntry`.

  Readers of a manifest now narrow on `type` before reading a story's fields, and the shell shows the natures it understands rather than everything the file holds. Nothing changes for a project whose manifest holds only stories, which is every project today.

- [#52](https://github.com/alexbrndl/crypte/pull/52) [`b7d239a`](https://github.com/alexbrndl/crypte/commit/b7d239aa2ce8c20821141d9fd9b1cb669d8d872d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/tokens`, the first plugin, and the one that proves section 6.3 against something real.

  It reads CSS custom properties from the style sheet the project declared and contributes one manifest entry per **family**, a family being the first segment of a name: `--color-brand-primary` lands in `color` under the key `brand-primary`.

  **Two theme sources, and no guessing beyond them.** An unqualified `:root` writes into a theme named `default`, since nothing says the unqualified values are the light ones. `[data-theme="x"]` writes into `x`. A `@media (prefers-color-scheme: dark)` block is lifted out with its braces balanced and read as `dark` — read naively, its inner `:root` would be taken for a second helping of the default theme and would overwrite it without a word. A `.dark` class is not read: nothing declared it as a theme.

  **A `var()` chain is walked to the literal it ends on.** `value` holds that literal so a swatch renders from it alone, and `alias` holds the names walked, from the token towards the literal. A chain that leads nowhere keeps its own text, and a cycle stops.

  **Kinds come from the value, never from the name.** `color`, `dimension`, `number`, and `unknown` for the rest. `fontFamily` and `fontWeight` need the property a variable is used on, which a variable does not carry, so they stay `unknown` rather than being guessed.

  **It finds nothing, it produces nothing.** No empty section, no "no tokens detected". It is meant for the default preset, so it runs on projects that never asked for it.

  Two changes come with it. `NodeContext` now carries the declared `css`, because a plugin reading style sheets had no other way to know which file was meant and guessing a path is what the contract forbids. And section 4.2 says a token's `value` is a string whatever its kind, so a `number` carries `"1.5"`.

  The guide gains a **Design tokens** section, and its example is run by a test like every other one on that page. Section 0 of the contracts gains a third guiding rule, which the first plugin is what made worth stating: what a project already writes is read, never declared a second time, and stories are the one exception.

- [#16](https://github.com/alexbrndl/crypte/pull/16) [`0e287ee`](https://github.com/alexbrndl/crypte/commit/0e287ee1639ea9c423e19851aaeb839c1582a800) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `wrap` n'accepte plus que des composants : un composant seul, un tableau de composants, ou un couple composant et props. La forme fonction `(story) => …` est retirée.

  Pour React un composant est une fonction, donc les deux formes étaient indistinguables et un adaptateur ne pouvait pas savoir s'il devait instancier ce qu'il reçoit ou lui passer l'élément déjà rendu. Les trois formes restantes sont déclaratives, donc interprétables par tous les adaptateurs.

  Une valeur calculée passe par les props, où elle est évaluée au chargement du fichier de stories : `wrap: [[Foo, { bar: compute() }]]`.

### Patch Changes

- [#40](https://github.com/alexbrndl/crypte/pull/40) [`68ecfc0`](https://github.com/alexbrndl/crypte/commit/68ecfc0a4b56878093958401120d96c7c6145d3b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell says what the catalogue could not read.

  A story file is read without being run, so what cannot be read without running it is set aside. Until now only the terminal said so, which is not where somebody looks for a story they cannot find: a file whose story key is computed lost that story silently, and a props table with a spread in it presented itself as complete.

  The manifest carries both halves. `Manifest.skipped` names a file, with the reason, and the shell counts what the file did give by matching it against the entries: "1 story lue, il en manque" rather than a flat "ignored", which would be false of a file that gave three stories out of four. `StoryEntry.partial` names one entry whose record is incomplete, quoting what the file wrote, since the missing prop names are precisely what cannot be read.

  Both fields are optional, so a manifest written before them stays valid and its version does not move. Neither is ever fatal: a file being written must not cost the catalogue.

  Six losses were silent and are now said: a spread in the definition deciding the shared props block or `meta`, what a props block itself could not give up, a props block that is a reference rather than written inline, and a `meta` or `options` holding a value this reader cannot read. The last two took the status out of the manifest and out of the fingerprint without a word.

  The terminal keeps naming every file that gave no story, as it did before. The manifest holds only what is certain to be a story, because a permanent banner above the preview for a legitimate neighbouring file teaches the reader to ignore it: a `defineStories` call that no default export carries, a file that does not parse, and a file that produced stories and produces none any more. A file that stops producing keeps saying so until it produces again, and stops once it is deleted or renamed, since that is deliberate.

  `import { defineStories as define }` now works: an aliased story used to produce nothing and say nothing.

- [#12](https://github.com/alexbrndl/crypte/pull/12) [`004c342`](https://github.com/alexbrndl/crypte/commit/004c3427ce3580377c2a5a228056c3b2a5a91379) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Ajoute le canal `postMessage` entre le shell et la preview, et le montage React.

  `@crypte/core/ui` expose `createShellChannel`, `@crypte/core/preview` expose `createPreviewChannel`, et `@crypte/react` expose `createAdapter` pour monter un composant dans la preview. Le shell ne manipule que des messages sérialisables et ne charge aucun framework de rendu.

  Le montage est synchrone : une erreur du composant remonte par le message `error`, et la durée transmise mesure le rendu lui-même.

  Le canal n'accepte et n'émet que des messages de la même origine, dans les deux sens.
