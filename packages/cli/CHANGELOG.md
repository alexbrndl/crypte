# @crypte/cli

## 0.1.0

### Minor Changes

- [#37](https://github.com/alexbrndl/crypte/pull/37) [`67036f8`](https://github.com/alexbrndl/crypte/commit/67036f8209eefb60a9b8849861cf4ebe8ac00e5b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Stories render inside the wrappers they declare.

  Section 2.5 of the contracts says the config's `wrap` wraps the file's, which wraps the component. Until now `wrap` was read, typed, validated, and then thrown away: a story declaring a `ThemeProvider` rendered without its context, with nothing said.

  All three forms work: one component, an array of components, and an array whose entries carry their own props. In the array form the first entry is the outermost.

  `Adapter.mount` takes the flattened list as an optional fourth argument, so an adapter written against the previous shape keeps compiling, and a story with no wrapper mounts with no extra element in its tree.

  **A relative import in `crypte.config.ts` now travels correctly.** The generated preview entry is a virtual module, so `./src/components/Frame` used to resolve against its own path and fail to load. Config imports are rewritten root-absolute, like story imports already were, and one that points outside the project is refused by name. An adapter imported relatively hit the same wall before this release.

- [#17](https://github.com/alexbrndl/crypte/pull/17) [`14bc59b`](https://github.com/alexbrndl/crypte/commit/14bc59b0384410eb0e1d3e49f8ba79f20443bb69) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/cli` expose `defineConfig` et sait lire la configuration d'un projet.

  `crypte.config.ts` déclare la racine des stories, l'adaptateur, et facultativement une entrée CSS, une enveloppe globale, des plugins Crypte et des plugins Vite. Deux champs seulement sont obligatoires, et un message nomme celui qui manque.

  Les alias de chemins sont lus depuis `tsconfig.json` ou `jsconfig.json`, sans aucune déclaration. Ils s'appliquent à tous les fichiers, y compris `.js` et `.jsx` : un projet React écrit en JavaScript résout ses imports comme un projet TypeScript.

  Le `vite.config` du projet n'est jamais lu. Ce qu'il impose se déclare dans `vite.plugins`.

- [#33](https://github.com/alexbrndl/crypte/pull/33) [`e14e06b`](https://github.com/alexbrndl/crypte/commit/e14e06beb162bf1dd9384e1c9074dc3d5c496794) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` starts a server, and a story renders.

  The command reads the project, writes the manifest and its fingerprint, then serves two pages. The shell ships prebuilt inside the CLI and knows no framework: it reads the catalogue and talks over the channel. The preview is compiled by the project's own Vite, because it imports the adapter you installed and your story modules, so it belongs to your bundle and not to ours.

  `@crypte/react` gains `defineStories` and `story`, the two functions a story file calls, with the types that infer a component's props. A story file needs no type alias and no `satisfies`.

  **A story that throws shows its error** instead of an empty frame: the name, the message and the stack, in place of the preview. The React adapter now passes `onUncaughtError` to its root, without which React 19 reports a failing component as an unhandled error and hands control back as if it had rendered.

  What a story file could not be read from is printed at start-up, one line per file. Nothing reloads yet: editing a component still needs a restart.

- [#34](https://github.com/alexbrndl/crypte/pull/34) [`eade648`](https://github.com/alexbrndl/crypte/commit/eade6486233bac07ff22c7d97e62e0d06f8efec8) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Editing keeps the story you are looking at.

  `crypte dev` now follows the files. Editing a component or a story's props refreshes the preview in place, without reloading the frame and without losing your selection. Adding a story file makes it appear in the tree, removing one makes it disappear, and neither needs a restart.

  Renaming a story changes its identifier, so the selection falls back to the same rank in the same file, which on a rename is the story you just renamed. If its file is gone, nothing is selected rather than something you never opened.

  **What a rebuild cannot read, it says.** A story file the reader stops reading used to vanish from the tree with no line anywhere, and a rebuild that failed was swallowed whole. Both are printed now, once each, and a failed rebuild keeps the last good catalogue rather than stopping the server.

  The preview server also gets its own dependency cache, `node_modules/.crypte`, so it no longer shares `node_modules/.vite` with the project's own `vite dev`.

  Changing `crypte.config.ts` still needs a restart, and now prints a line saying so.

- [#31](https://github.com/alexbrndl/crypte/pull/31) [`373b497`](https://github.com/alexbrndl/crypte/commit/373b497868d53e0ae8ab61807b39958ea94e0190) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Crypte writes a reduced fingerprint of its catalogue, next to the manifest.

  The manifest is a build artefact and Git ignores it. The fingerprint is committed, and it is what gives a catalogue a history: per entry, the identifier, the component as `file#export`, the status, the sorted prop names, and one digest folding everything else. Section 4.6 of the contracts says which of the two files is the truth, and it is the manifest.

  The digest sorts its keys at every depth, so writing the same fields in another order changes nothing. A story with no `meta` gets the status `none`, so adding `status: 'draft'` shows up as the change it is. The prop names come from the entry's own `props`, not from the component's declared surface: a story that changes which props it sets now moves the fingerprint even when its component does not.

  Measured on the shape the writer actually produces, indentation included: 706 KB raw for 500 stories, and 268 bytes per story for the fingerprint.

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

### Patch Changes

- [#36](https://github.com/alexbrndl/crypte/pull/36) [`009eea8`](https://github.com/alexbrndl/crypte/commit/009eea88c4cccc52ad50a075d3cfefc83c60632f) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Nothing changes for users of the packages. The story reader's `produced` gains an explicit exhaustiveness guard, so a fourth kind of read stops compiling wherever the branching moves.

  Measured before adding it: rewriting that `switch` as a ternary chain and adding a fourth kind left `vp check` and all 36 reader cases green, so the protection came from the declared return type alone and was lost in silence.

- [#26](https://github.com/alexbrndl/crypte/pull/26) [`264e477`](https://github.com/alexbrndl/crypte/commit/264e47751f91d027f18cfcb686e33026f57ac31f) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The messages Crypte prints are now in English.

  A missing `crypte.config.ts`, a configuration that declares no `stories` or no `adapter`, a `tsconfig.json` that cannot be read, a path that is not an array: each of these now reads in English. The wording changed, the conditions did not, and every message still names the file and the field at fault.

  The diagnostic a plugin author gets when a message declares a non-literal `type` reads in English too.

- [#41](https://github.com/alexbrndl/crypte/pull/41) [`943a44c`](https://github.com/alexbrndl/crypte/commit/943a44ce053c65e96a05736cc715dfc44f137adb) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Editing `crypte.config.ts` no longer asks for a restart.

  `crypte dev` used to print `crypte.config.ts changed, restart \`crypte dev\``and do nothing more. It now rebuilds the whole server, which is what reading that file means: our configuration is read outside Vite, and the serve plugin captures the project, so the aliases, the CSS entry, the adapter and the user's own plugins all come from there.`server.restart()` of Vite reads Vite's configuration, not ours.

  The new server is built before the old one closes, so a half-written configuration leaves the running server alone and says so, the same rule the catalogue's rebuild already follows. Closing last also hands the port over with nothing in between, so the browser reconnects on its own: the preview reloads, says it is ready, and the shell re-reads its catalogue at that moment.

  A change is recognised by the content of the watched files rather than by the event, since one save fires several and an editor touches the date of files it has not changed. Restarts are queued, so none is dropped and a duplicate is a no-op.

- [#38](https://github.com/alexbrndl/crypte/pull/38) [`db7d408`](https://github.com/alexbrndl/crypte/commit/db7d40862ad70c2f7623221b8336357f06adfb00) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The preview survives a dependency the optimiser discovers mid-load.

  `crypte dev` now pre-bundles the packages `crypte.config.ts` imports, read from the same imports as the adapter and the global `wrap`. A linked workspace package used to be served as a graph module, so the dependency URLs it carried outlived a re-optimisation: the browser ended up assembling four generations of bundles at once, reported it as a missing export named `t`, and the preview stayed blank until a manual reload.

  Measured on the demo, where the failure is now reproducible on demand: a first visit with no warm-up, so the optimiser discovers the linked package's own dependencies while the page loads. Triggered on a settled page, the same re-optimisation never broke anything, because Vite reloads the frame and the preview comes back on its own.

  Reading that list also fixed four configurations `crypte dev` refused by mistake, each of them plain JavaScript. A named class or function expression (`adapter: new (class Frame {})()`), a static block, and a class member no longer look like a name the configuration builds itself when the file happens to declare that name too. A type-only import no longer travels into the optimiser's list either, where Vite has no package to pre-bundle and said so on every start.

  Nothing changes for a project that already declared its adapter in place, which is every project: the list is read from the imports the configuration already carries.

- [#40](https://github.com/alexbrndl/crypte/pull/40) [`68ecfc0`](https://github.com/alexbrndl/crypte/commit/68ecfc0a4b56878093958401120d96c7c6145d3b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell says what the catalogue could not read.

  A story file is read without being run, so what cannot be read without running it is set aside. Until now only the terminal said so, which is not where somebody looks for a story they cannot find: a file whose story key is computed lost that story silently, and a props table with a spread in it presented itself as complete.

  The manifest carries both halves. `Manifest.skipped` names a file, with the reason, and the shell counts what the file did give by matching it against the entries: "1 story lue, il en manque" rather than a flat "ignored", which would be false of a file that gave three stories out of four. `StoryEntry.partial` names one entry whose record is incomplete, quoting what the file wrote, since the missing prop names are precisely what cannot be read.

  Both fields are optional, so a manifest written before them stays valid and its version does not move. Neither is ever fatal: a file being written must not cost the catalogue.

  Six losses were silent and are now said: a spread in the definition deciding the shared props block or `meta`, what a props block itself could not give up, a props block that is a reference rather than written inline, and a `meta` or `options` holding a value this reader cannot read. The last two took the status out of the manifest and out of the fingerprint without a word.

  The terminal keeps naming every file that gave no story, as it did before. The manifest holds only what is certain to be a story, because a permanent banner above the preview for a legitimate neighbouring file teaches the reader to ignore it: a `defineStories` call that no default export carries, a file that does not parse, and a file that produced stories and produces none any more. A file that stops producing keeps saying so until it produces again, and stops once it is deleted or renamed, since that is deliberate.

  `import { defineStories as define }` now works: an aliased story used to produce nothing and say nothing.

- [#39](https://github.com/alexbrndl/crypte/pull/39) [`193ecdc`](https://github.com/alexbrndl/crypte/commit/193ecdcb3c2be6848da6045612ae00509fa906e7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A configuration written in TypeScript no longer leaves the preview blank.

  The generated preview entry copies the expression `crypte.config.ts` gives to `adapter` and to `wrap`, so it carried the author's TypeScript into the browser: `adapter: createAdapter() as Adapter` reached it verbatim and died on a `SyntaxError` before the preview channel opened, which meant no `ready` and an empty frame with nothing on screen to say why.

  `crypte dev` now compiles the entry before serving it. Measured on the demo with an assertion, a `satisfies` and a type argument, each of which was enough on its own to empty the frame.

  Renaming the virtual module to `.ts` was measured and does not work: Vite does not transform a virtual module by its extension, so the entry is compiled by the plugin itself. The public path stays `/@crypte/preview.js`, which is what it serves.

  Compiling the entry also makes TypeScript declarations run inside that expression, so the imports they name now travel with it: a parameter property and an enum member used to leave the entry reading a name it never imported. A namespace and a decorator stay unsupported, measured: the configuration loader refuses both.

- Updated dependencies [[`67036f8`](https://github.com/alexbrndl/crypte/commit/67036f8209eefb60a9b8849861cf4ebe8ac00e5b), [`e14e06b`](https://github.com/alexbrndl/crypte/commit/e14e06beb162bf1dd9384e1c9074dc3d5c496794), [`b483bcd`](https://github.com/alexbrndl/crypte/commit/b483bcd493747393900864556e3a45ad3e2637b2), [`7706d65`](https://github.com/alexbrndl/crypte/commit/7706d65f8c53682fc9a81a73ea5aa2b7c7cf0c0d), [`68ecfc0`](https://github.com/alexbrndl/crypte/commit/68ecfc0a4b56878093958401120d96c7c6145d3b), [`dae631c`](https://github.com/alexbrndl/crypte/commit/dae631c63c6d436fbd4b5be98bcccf50032edab5), [`004c342`](https://github.com/alexbrndl/crypte/commit/004c3427ce3580377c2a5a228056c3b2a5a91379), [`eb3f6f0`](https://github.com/alexbrndl/crypte/commit/eb3f6f05732f157be551cb0dc4c4a58a1e0ebd42), [`b7d239a`](https://github.com/alexbrndl/crypte/commit/b7d239aa2ce8c20821141d9fd9b1cb669d8d872d), [`0e287ee`](https://github.com/alexbrndl/crypte/commit/0e287ee1639ea9c423e19851aaeb839c1582a800)]:
  - @crypte/core@0.1.0
