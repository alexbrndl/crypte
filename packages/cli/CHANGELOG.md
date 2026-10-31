# @crypte/cli

## 1.0.0

### Minor Changes

- [#37](https://github.com/alexbrndl/crypte/pull/37) [`67036f8`](https://github.com/alexbrndl/crypte/commit/67036f8209eefb60a9b8849861cf4ebe8ac00e5b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Stories render inside the wrappers they declare.

  Section 2.5 of the contracts says the config's `wrap` wraps the file's, which wraps the component. Until now `wrap` was read, typed, validated, and then thrown away: a story declaring a `ThemeProvider` rendered without its context, with nothing said.

  All three forms work: one component, an array of components, and an array whose entries carry their own props. In the array form the first entry is the outermost.

  `Adapter.mount` takes the flattened list as an optional fourth argument, so an adapter written against the previous shape keeps compiling, and a story with no wrapper mounts with no extra element in its tree.

  **A relative import in `crypte.config.ts` now travels correctly.** The generated preview entry is a virtual module, so `./src/components/Frame` used to resolve against its own path and fail to load. Config imports are rewritten root-absolute, like story imports already were, and one that points outside the project is refused by name. An adapter imported relatively hit the same wall before this release.

- [#86](https://github.com/alexbrndl/crypte/pull/86) [`9f2ab0a`](https://github.com/alexbrndl/crypte/commit/9f2ab0a28d08f5d6754db23b9b77a013416eec88) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte check` now fails when `.crypte/fingerprint.json` is missing or behind the stories, so a CI running it refuses a branch that did not update the committed fingerprint. Run `crypte dev` and commit the file to fix it.

- [#71](https://github.com/alexbrndl/crypte/pull/71) [`b161683`](https://github.com/alexbrndl/crypte/commit/b161683f305aae85b1af9cba232e8e1a56466849) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The call code a manifest carries now writes `children` between the tags, `<Badge>New</Badge>` rather than `<Badge children="New" />`. Both render; only one is what anyone writes, and this field exists to be copied.

- [#17](https://github.com/alexbrndl/crypte/pull/17) [`14bc59b`](https://github.com/alexbrndl/crypte/commit/14bc59b0384410eb0e1d3e49f8ba79f20443bb69) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/cli` expose `defineConfig` et sait lire la configuration d'un projet.

  `crypte.config.ts` déclare la racine des stories, l'adaptateur, et facultativement une entrée CSS, une enveloppe globale, des plugins Crypte et des plugins Vite. Deux champs seulement sont obligatoires, et un message nomme celui qui manque.

  Les alias de chemins sont lus depuis `tsconfig.json` ou `jsconfig.json`, sans aucune déclaration. Ils s'appliquent à tous les fichiers, y compris `.js` et `.jsx` : un projet React écrit en JavaScript résout ses imports comme un projet TypeScript.

  Le `vite.config` du projet n'est jamais lu. Ce qu'il impose se déclare dans `vite.plugins`.

- [#219](https://github.com/alexbrndl/crypte/pull/219) [`7bec952`](https://github.com/alexbrndl/crypte/commit/7bec952f016a895b1f847ce218ba89757b4faa50) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A configuration with no `plugins` key now gets `controls`, `tokens` and `source`, exported as `defaultPlugins`. A `plugins` key still takes exactly what it lists: spread `defaultPlugins` to keep the preset beside your own plugins.

- [#33](https://github.com/alexbrndl/crypte/pull/33) [`e14e06b`](https://github.com/alexbrndl/crypte/commit/e14e06beb162bf1dd9384e1c9074dc3d5c496794) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` starts a server, and a story renders.

  The command reads the project, writes the manifest and its fingerprint, then serves two pages. The shell ships prebuilt inside the CLI and knows no framework: it reads the catalogue and talks over the channel. The preview is compiled in your project by the CLI's Vite, with the plugins you declare in `vite.plugins`, because it imports the adapter you installed and your story modules.

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

- [#196](https://github.com/alexbrndl/crypte/pull/196) [`fa6f08d`](https://github.com/alexbrndl/crypte/commit/fa6f08dc16a65ad9bb598dd0a14fa45dca87b458) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Markdown files in the story folder become pages, a third nature of manifest entry. `ManifestEntry` is now `StoryEntry | TokensEntry | PageEntry`.

  `Badge.md` next to `Badge.tsx` shows on that component's page; any other `.md` is a general page in the tree, placed by its path. The title is the first `# heading`, otherwise the file name. Raw HTML in a page shows as text, and only absolute http, https and mailto links are kept. A plugin cannot contribute a page.

  The shell's monospace font now covers weights 400 to 700 only, which keeps the shell under its download budget with the markdown renderer added.

- [#51](https://github.com/alexbrndl/crypte/pull/51) [`7706d65`](https://github.com/alexbrndl/crypte/commit/7706d65f8c53682fc9a81a73ea5aa2b7c7cf0c0d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin can contribute entries to the manifest.

  `CryptePlugin` is a real type in the protocol now, where it was `unknown` in the CLI's config. `@crypte/cli` re-exports it rather than declaring its own: the contract spans three surfaces, so it does not belong to one consumer.

  `NodeHooks` carries one hook, `entries`, because one use demands it. It takes a context holding the project root and returns entries. Stories are not among them: they come from story files, and a plugin injecting one would bypass discovery.

  **Hooks are synchronous, and they run after the stories in the order `plugins` declares.** No `order` field, which every plugin would set to zero. Being last means a contribution landing on an identifier a story already owns is the one that gives way.

  **Nothing a plugin does is fatal, and nothing is silent.** A hook that throws, returns something other than entries, hands over an entry that is not one, lands on a taken identifier, or produces a value JSON would rewrite has that contribution refused, and `crypte dev` prints which plugin it came from and why. A broken plugin costs a panel, never the server.

  **The shape of every entry is checked at run time, not only in the types.** `ContributedEntry` holds while a plugin is compiled, and a plugin is installed compiled: nothing in a published package stops it from handing over `type: 'story'`, which would enter the manifest and the committed fingerprint. `CONTRIBUTABLE` is that same set at run time.

  Section 4.5 stops being free here: everything else the CLI writes is read from source text and serialisable by construction, so a contributed entry is the first input it checks rather than trusts. Anything JSON would not give back as it was is refused, named and located: a function, a `Date`, `NaN`, an infinity, an `undefined` value, a genuine cycle. Two references to one object are not a cycle, and are kept.

  `ShellContribution` and `PreviewHooks` stay opaque. Neither has a caller yet.

- [#104](https://github.com/alexbrndl/crypte/pull/104) [`bf0159b`](https://github.com/alexbrndl/crypte/commit/bf0159b2e50b6533ecb46c6325376e8cf370ef60) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin's `shell` and `preview` are now the file URL of a module, `new URL('./shell.mjs', import.meta.url).href`, which `crypte dev` loads in the shell and in the preview. A shell module runs on the shell's own Vue: declare `vue` as a peer dependency and keep it out of the bundle.

- [#105](https://github.com/alexbrndl/crypte/pull/105) [`ec65c46`](https://github.com/alexbrndl/crypte/commit/ec65c4659f7d597a3ad6ab63f46a42b979fa9b3b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell mounts each plugin panel in a frame, in configuration order: the panel receives the story on display as `entry`, folds to one line when it emits `inapplicable` with a reason, and stays closed across reloads when closed. A plugin with a browser surface now needs a `name` no earlier plugin has.

- [#107](https://github.com/alexbrndl/crypte/pull/107) [`d3697e5`](https://github.com/alexbrndl/crypte/commit/d3697e5b043ddf6e883b2a043434c832cd59f2d8) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin's preview module now exports hooks, `afterMount` after each render and `onMessage` for what its panel sends, and plugin messages cross between the shell and the preview under the plugin's name. A preview module that exports anything else is refused and named in the shell. `beforeMount`, `onPropsChange` and `beforeUnmount` are no longer part of the contract.

- [#54](https://github.com/alexbrndl/crypte/pull/54) [`ac67946`](https://github.com/alexbrndl/crypte/commit/ac67946698239cb5f4076bfa387250ef388fac5e) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `details` carries what a component file declares about its props.

  It was written empty since the manifest existed. The CLI now reads the component with oxc, without running it, and fills the five fields of `ResolvedPropDetails`: the kind, whether the prop is required, its default, its JSDoc description, and the options of a literal union.

  **Two sources, in order.** The members of the props type when the file holds it, an inline literal or a named interface or alias. Failing that, the names in the parameter's destructuring pattern. A rest element names nothing, since what it holds lives only in the type it came from.

  **Section 3.2's merge rule works now.** What a story file writes in `details` completes inference per prop and field by field: a `min` written by hand keeps the type, the description and the required flag that inference found. A prop the file names and inference did not is kept, since the author is documenting what the reader could not see.

  **It reads what is written, and stops where the type checker would begin.** An imported props type, a generic, an intersection or an `extends` clause do not open: enumerating them needs the checker, and making a name appear that the file does not write is what the contract forbids for `props`. So a DOM pass-through surfaces the names in its own pattern, `className` for one, and nothing else. An unresolved reference is `unknown` rather than `object`, which would claim more than the file says.

  **Having a default and being able to write it down are two facts.** `{ tone = compute() }` makes a prop optional for whoever calls the component, and its value is dropped rather than written: the CLI guarantees what it writes, and a computed value does not survive JSON.

  Section 4.4 no longer says `details` travels untouched, since what reaches the manifest is the merge. `meta` and `options` still do.

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

- [#168](https://github.com/alexbrndl/crypte/pull/168) [`8ee0b85`](https://github.com/alexbrndl/crypte/commit/8ee0b853b24f270758e568bacb835b2c52755d34) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The committed fingerprint gains a `tokens` section, each token with the literal of each theme. Committed fingerprints are stale once: run `crypte dev` and commit `.crypte/fingerprint.json`. `/@crypte/changes.json` can start from a branch, a tag, a commit or a date, and adds the token changes; `/@crypte/versions.json` lists the default branch and the tags. `crypte dev` now watches the style sheet declared as `css`.

- [#200](https://github.com/alexbrndl/crypte/pull/200) [`5031cda`](https://github.com/alexbrndl/crypte/commit/5031cda464a4d6df24d9ba1f4e6019cbfa51fa4c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A Vue adapter, `@crypte/vue`: `adapter: vue()`, with `defineStories` and `story` typed from a Vue component's props. A Vue project adds `vue()` from `@vitejs/plugin-vue` to `vite.plugins`, as a React project adds `react()`.

  The adapter's type now lives in the core, `Adapter` from `@crypte/core/preview`, and `@crypte/cli` re-exports it: the `adapter` of `crypte.config.ts` must have `mount` and `unmount`, where any value was accepted before.

### Patch Changes

- [#110](https://github.com/alexbrndl/crypte/pull/110) [`95ce524`](https://github.com/alexbrndl/crypte/commit/95ce524e8fc63c0e989ea7b6e13e75335328907b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Adds `@crypte/a11y`, which analyses each render of a story with axe-core and lists its violations in a panel, by impact, with their rule and the selectors at fault. A panel can now unfold on the story on display by emitting `inapplicable` with `null`.

- [#222](https://github.com/alexbrndl/crypte/pull/222) [`39143c9`](https://github.com/alexbrndl/crypte/commit/39143c9eb87699e0b104efa59c805591f88c55b1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - New `@crypte/actions` plugin: it watches every function prop of a story, and a prop the story leaves out no longer breaks on the first click. It joins `defaultPlugins`. Preview modules get a `beforeMount` hook, the one moment a plugin may change a story's props, with their `details`.

- [#160](https://github.com/alexbrndl/crypte/pull/160) [`46bacb4`](https://github.com/alexbrndl/crypte/commit/46bacb40eda79639a545c2ff14febc57e3f5ac58) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell is laid out by view: an activity bar switches between stories, tokens and versions, each with its own sidebar, and holds the search and the theme. The version of Crypte moves to the status bar.

- [#115](https://github.com/alexbrndl/crypte/pull/115) [`13cacda`](https://github.com/alexbrndl/crypte/commit/13cacdab817633cd87b07b3e0a66f8b4484c6c46) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin factory passed without being called, `plugins: [controls]`, is refused with its reason instead of doing nothing. A preview hook left `undefined` no longer gets its whole module refused, and a plugin named `constructor` receives `null` until its preview module speaks.

- [#76](https://github.com/alexbrndl/crypte/pull/76) [`bd53bff`](https://github.com/alexbrndl/crypte/commit/bd53bff8ceb30309d35601393467a9e7c9ae128b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A story file that produces nothing keeps its banner in the shell when `crypte.config.ts` is saved. It used to disappear at the restart, while the file was still broken.

- [#79](https://github.com/alexbrndl/crypte/pull/79) [`3579ac9`](https://github.com/alexbrndl/crypte/commit/3579ac90b1e233e725487503af06abe93655eb6f) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A component that breaks while the dev server runs now shows its error in the shell, instead of the version from before the edit marked as rendered. Once it reloads, the error goes.

- [#78](https://github.com/alexbrndl/crypte/pull/78) [`5e9aba9`](https://github.com/alexbrndl/crypte/commit/5e9aba9c6d839f354465c4c520285d2854408d5a) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A story that renders, then breaks while the dev server runs, now shows its error in the shell. It used to keep showing the version from before the edit, marked as rendered, when the file threw at load or imported a module that does not exist.

- [#221](https://github.com/alexbrndl/crypte/pull/221) [`5bcdc1f`](https://github.com/alexbrndl/crypte/commit/5bcdc1f757a06181b3ead9c291fee393f498043f) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The workshop chooses the background behind a story from the canvas toolbar: dots, plain or a checkerboard that shows what is transparent, in the colours of each frame's theme.

- [#85](https://github.com/alexbrndl/crypte/pull/85) [`802609c`](https://github.com/alexbrndl/crypte/commit/802609c335aedff71a6d10f91882ad5ef9be9cd0) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte check` no longer warns about a component the project declares as a frame, in the `wrap` of its configuration or of a story file.

- [#97](https://github.com/alexbrndl/crypte/pull/97) [`e646a4a`](https://github.com/alexbrndl/crypte/commit/e646a4a2786dcbe943e8b26392cc512f023017e2) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte check` now names a story file that gave no story, with the reason, instead of reporting its component as having no story; it stays a warning. An orphan story's component path now reads from the project root.

- [#218](https://github.com/alexbrndl/crypte/pull/218) [`fe23353`](https://github.com/alexbrndl/crypte/commit/fe233539d6e4b29b708e5989602b86724eeedac9) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The package carries a description on npm: "A design system workshop that stays light."

- [#96](https://github.com/alexbrndl/crypte/pull/96) [`b0a718d`](https://github.com/alexbrndl/crypte/commit/b0a718d39d349a25988cdc2085e3b841e2a28348) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte --help` lists the commands and their argument, `--help` anywhere after a command prints it instead of being read as a folder, and an unknown command, an unknown option or an extra argument now fails with exit code 1 on stderr. `@crypte/core` no longer declares `vue` as an optional peer dependency, which none of its files uses.

- [#131](https://github.com/alexbrndl/crypte/pull/131) [`fa14aed`](https://github.com/alexbrndl/crypte/commit/fa14aed60ce2d7777e9dd27f7df2368ac268404d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell has a command palette, opened with ⌘K, or Ctrl+K outside macOS. Typing a name goes to a story, a component, a family of tokens or the changes mode. The shell's actions run from it too, each with its shortcut shown.

- [#177](https://github.com/alexbrndl/crypte/pull/177) [`aba52ac`](https://github.com/alexbrndl/crypte/commit/aba52ac7312452b80b32529919983b11a500a4df) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The light and dark comparison opens from an icon button beside the zoom and full screen, instead of a switch over the stage.

- [#65](https://github.com/alexbrndl/crypte/pull/65) [`9318f78`](https://github.com/alexbrndl/crypte/commit/9318f782b5dca8113e0acbe28376ad5eac826442) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` now watches the component files a story cites, so the manifest it serves carries the props they declare as you edit them. It used to take a change to the story file.

- [#164](https://github.com/alexbrndl/crypte/pull/164) [`a234608`](https://github.com/alexbrndl/crypte/commit/a2346086531d143ef6e510c664d084aa3e0e96d1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Each story's `component` lists the custom properties the component reads, in `tokens`, read from its file and the style sheets it imports. The fingerprint leaves the field out, so committed fingerprints stay valid.

- [#106](https://github.com/alexbrndl/crypte/pull/106) [`d93f415`](https://github.com/alexbrndl/crypte/commit/d93f41544ab83d13a951467d891e77c56d07506e) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Adds `@crypte/controls`, which edits a story's props live from the shell, one field per prop. A story entry now carries `propsUnread` when its component's props could not be read, so an empty `details` no longer hides that. Such an entry's fingerprint moves once: run `crypte dev` after upgrading, and `crypte check` passes again.

- [#205](https://github.com/alexbrndl/crypte/pull/205) [`882b0b1`](https://github.com/alexbrndl/crypte/commit/882b0b1b4b55457f153d8d5afb1a59ea894a171d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Add `crypte build`, which writes the workshop as a static folder, `crypte-static/`, served by any host and below any path. It also writes the fingerprint, so `crypte check` no longer needs a running server. `Select` now shows the current label of its chosen option.

- [#208](https://github.com/alexbrndl/crypte/pull/208) [`4a07fc1`](https://github.com/alexbrndl/crypte/commit/4a07fc1de145b1395a1092f46228db9d68cdc398) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Add `crypte mcp`, a Model Context Protocol server over stdio that gives a coding agent the components, a component's props and call code, the tokens, and what changed since a point of the history.

- [#81](https://github.com/alexbrndl/crypte/pull/81) [`782db76`](https://github.com/alexbrndl/crypte/commit/782db7697563e08dc91540c936436fa501df77ea) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Props typed `VariantProps<typeof x>` now come out as enums with their options and default, read from the `cva(…)` call when `x` is declared in the same file.

- [#190](https://github.com/alexbrndl/crypte/pull/190) [`8bd3b5b`](https://github.com/alexbrndl/crypte/commit/8bd3b5babf5e6f384e9fb96ec8cedf04d1ccd795) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view tells where a deprecated component is still used: the components of the folder that import it, each one to rework in its To do panel, counted on the statuses page. The date a component turned deprecated opens what changed since.

- [#198](https://github.com/alexbrndl/crypte/pull/198) [`9ce2254`](https://github.com/alexbrndl/crypte/commit/9ce225420b170d9e0fc4a8ab8d26969a00e7dfbc) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A component's docs page now carries three generated blocks, with nothing to write in its markdown: a live example of its first story, the table of its props, and the tokens it reads, coloured when they are colours.

- [#197](https://github.com/alexbrndl/crypte/pull/197) [`7e86d14`](https://github.com/alexbrndl/crypte/commit/7e86d140ede3d18101d904b19aea4c30b8171e2c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell has a docs view. Every component has a page there, with its status, owner, Figma link and stories, plus its markdown guidelines when it has some; general markdown pages sit beside them by path. A Links panel shows a page's stories, the tokens its component reads and the pages that cite it. In the stories tree a component's label now only folds it, and an eye at the end of its row opens its docs page. `Tree` takes a `trailing` slot, an action at the end of a row.

- [#102](https://github.com/alexbrndl/crypte/pull/102) [`55451aa`](https://github.com/alexbrndl/crypte/commit/55451aa586acee9e704017da81b4a3bfe851e2b2) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Syntax errors in story and component files give their line and column. `crypte check` names a component file that does not parse, and the preview names the story or reloading component that imports a name its module does not export.

- [#145](https://github.com/alexbrndl/crypte/pull/145) [`a3c29ba`](https://github.com/alexbrndl/crypte/commit/a3c29ba82f5ee2d6900031322d27b85e583648fd) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` adds `Field`, from the Figma file, and its `Select` becomes Reka's, a drawn list rather than the system menu. `@crypte/controls` draws each prop as a field, marks an edited one as overridden, and gives that one back to the story on its own.

- [#150](https://github.com/alexbrndl/crypte/pull/150) [`bb102a1`](https://github.com/alexbrndl/crypte/commit/bb102a133babb59bd5e3e3c2d4379122d3eaafd7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's panels and tables follow the spacing of their Figma components: a 12 px panel body, a 40 px panel head, 24 px table headers and 32 px rows.

- [#89](https://github.com/alexbrndl/crypte/pull/89) [`8a520a4`](https://github.com/alexbrndl/crypte/commit/8a520a415c264c3304a26945ffbc0c14f9639ca1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Reordering the props of a story no longer changes `.crypte/fingerprint.json`. Every committed fingerprint changes once with this version: run `crypte dev` and commit it.

- [#87](https://github.com/alexbrndl/crypte/pull/87) [`cbd3059`](https://github.com/alexbrndl/crypte/commit/cbd3059625e95397caaf65d625e3e1efaa068239) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` now rewrites `.crypte/fingerprint.json` when a change to `crypte.config.ts` alters the catalogue, so `crypte check` no longer fails after changing the `stories` path mid-session.

- [#187](https://github.com/alexbrndl/crypte/pull/187) [`28d6a6f`](https://github.com/alexbrndl/crypte/commit/28d6a6f1819178bd978ad870a2fe4dd15a6e5d95) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The Copy fix prompt buttons of the health view show the AI content generator icon.

- [#186](https://github.com/alexbrndl/crypte/pull/186) [`e69e1f7`](https://github.com/alexbrndl/crypte/commit/e69e1f792887f6e325a6f2ddc844ab848437031c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health prompt button reads Copy fix prompt, and its tooltip says to paste it to your coding agent, or that nothing is left to fix.

- [#161](https://github.com/alexbrndl/crypte/pull/161) [`c698068`](https://github.com/alexbrndl/crypte/commit/c698068db85265f278742e0414923cf7ea8ac2e8) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Below 1180 px the shell folds its panels behind a Panels button, which opens them over the canvas. With no story, the stories view guides to the first story file instead of showing an empty preview.

- [#113](https://github.com/alexbrndl/crypte/pull/113) [`5ef7c33`](https://github.com/alexbrndl/crypte/commit/5ef7c33dbed5530c1d1338c04d201790fc63b86b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The plugin contract is frozen. `PanelProps` and `PanelEvents` type what a panel receives and emits. A plugin key other than `name`, `shell`, `preview` and `node` is refused with its reason, and what was refused of a plugin is named in the shell as well as in the terminal.

- [#207](https://github.com/alexbrndl/crypte/pull/207) [`a29793c`](https://github.com/alexbrndl/crypte/commit/a29793c645bd038dd6f201047b77ae4641ba784e) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/core/protocol` exports the fingerprint's shape, `compareFingerprints` and `readFingerprint`. On a build, a commit or a date typed in the versions view is compared through GitHub when the repository is public there.

- [#179](https://github.com/alexbrndl/crypte/pull/179) [`79be41a`](https://github.com/alexbrndl/crypte/commit/79be41a5bbc4edd48053a4405e362b133d63df35) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view audits every story in light and in dark with the a11y plugin, on demand: an a11y gauge in the score, an accessibility page listing each violation by story and rule, and the elements at fault in the panel. The fields of the a11y results are now read by the shell, which names a story it cannot read rather than break.

- [#223](https://github.com/alexbrndl/crypte/pull/223) [`264f9f2`](https://github.com/alexbrndl/crypte/commit/264f9f2ab26e135b2b5eec1d3d5fbbbb40620d74) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view gains a coverage page: the props no story of a component gives, and the files of the application that import it, so a component nobody uses shows.

- [#251](https://github.com/alexbrndl/crypte/pull/251) [`5f53ace`](https://github.com/alexbrndl/crypte/commit/5f53acecaef2c9285da74d0015b07cd202de7f9e) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view opens on a dashboard: an overall score, the components and the tokens in two grids that focus each other on hover, and a list whose checked rows will make the fix prompt.

- [#254](https://github.com/alexbrndl/crypte/pull/254) [`75ed67c`](https://github.com/alexbrndl/crypte/commit/75ed67cdbb83c95a6755e9ea132938473d3f7ec8) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view counts every export a story describes as a component, even one that never returns an element, so a component that only throws shows its failing render.

- [#253](https://github.com/alexbrndl/crypte/pull/253) [`5141ba2`](https://github.com/alexbrndl/crypte/commit/5141ba2b2dced1a5453176370eaddc53a96ff500) Thanks [@alexbrndl](https://github.com/alexbrndl)! - In dark, the current text and the default badge take a lighter teal, which reaches the APCA contrast threshold.

- [#181](https://github.com/alexbrndl/crypte/pull/181) [`b2c31de`](https://github.com/alexbrndl/crypte/commit/b2c31de4cba94da68003cd6a683aaa7eb08793ec) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health entry of the activity bar fills its heart with the score, which its tooltip states, and the overview lists everything its badge counts. The To do and Links panels fold from their whole header. Tooltips sit on the raised surface with a hairline, in light and dark, rather than on the inverse one.

- [#255](https://github.com/alexbrndl/crypte/pull/255) [`a71b96a`](https://github.com/alexbrndl/crypte/commit/a71b96a8f76eb6256fa4997ed84f99707fb8b1fa) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view says what is still waiting: `~` in the columns no audit has judged yet, a partial score without the a11y plugin, and the audit not run yet in the status bar. A failed audit runs again from the toolbar, a component without a story offers its skeleton in the panel, and hovering stays fast with hundreds of components and tokens.

- [#252](https://github.com/alexbrndl/crypte/pull/252) [`00090eb`](https://github.com/alexbrndl/crypte/commit/00090eb9ad84f041da57b6c4c95f5396f95ae4ef) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view is now a single page: choosing a component, a token, the orphans or the ready components opens their detail in the side panel, and the toolbar copies the fix prompt of the checked rows. Old `?health=…` page addresses land on the dashboard.

- [#184](https://github.com/alexbrndl/crypte/pull/184) [`2c7f779`](https://github.com/alexbrndl/crypte/commit/2c7f77933e190258a216a96213c5351d609821cc) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view copies a prompt for your coding agent: everything still to fix, or what the chosen component, violation or render error needs from its panel. Each item names its files, the project frames of a stack, the elements at fault and the skeleton of a story to write.

- [#180](https://github.com/alexbrndl/crypte/pull/180) [`39f84a1`](https://github.com/alexbrndl/crypte/commit/39f84a12e6c252afc816d07a45bf5d2e04e8a53a) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view audits the stories by itself once the first one has rendered, with or without the a11y plugin, and counts what is left to do on its activity bar badge. A new page lists the stories that fail to render, with their error. Its right column splits into a To do panel, the actions of the chosen row, and a Links panel, its stories, component page, file and the tokens it reads. A component without a story says whether its Default story is enough or how many required props it needs.

- [#191](https://github.com/alexbrndl/crypte/pull/191) [`8b1ac75`](https://github.com/alexbrndl/crypte/commit/8b1ac7515ff2d7b1592e640d025f084779479c08) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health view names the tokens probably behind a contrast violation: those whose value in the theme of the violation is a colour axe measured, the most read first, each with the number of components reading it and a link to it.

- [#246](https://github.com/alexbrndl/crypte/pull/246) [`d04e80e`](https://github.com/alexbrndl/crypte/commit/d04e80eadd341c04a51b4b9b3ddefb5f1e1d5a99) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The health data names the custom properties each component reads, whether or not a story covers it.

- [#178](https://github.com/alexbrndl/crypte/pull/178) [`e059122`](https://github.com/alexbrndl/crypte/commit/e059122ea7276246d3e152b1d3b0cb250ec421d6) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A health view: declare `components` in `crypte.config.ts`, and the shell counts the components with a story, lists those without one with a story file to copy, and follows draft and deprecated statuses with the dates Git gives.

- [#158](https://github.com/alexbrndl/crypte/pull/158) [`b2bd31f`](https://github.com/alexbrndl/crypte/commit/b2bd31f9c006a5e0f9f3d289d0ee5bac0da878ef) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell draws its icons from the Hugeicons free set, the one the design system uses.

- [#236](https://github.com/alexbrndl/crypte/pull/236) [`c6866a2`](https://github.com/alexbrndl/crypte/commit/c6866a2c455a5b000dc4045e31be2c2883b1854d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Panels with nothing to say about the story now sit at the foot of the panels column, the free space above them.

- [#235](https://github.com/alexbrndl/crypte/pull/235) [`2e93736`](https://github.com/alexbrndl/crypte/commit/2e937365d4a94663e54b5f7f56eb74c08faa5c35) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A panel with nothing to say about the story now moves below the others, and comes back in its place when it has something to say again. The `a11y` panel stays folded while it waits for an analysis, so it no longer jumps up at every story.

- [#237](https://github.com/alexbrndl/crypte/pull/237) [`3b5c787`](https://github.com/alexbrndl/crypte/commit/3b5c787c4c2c980a2882de7ed0a418e75c68e583) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A panel with nothing to say about the story stays folded: its header is a plain title, its reason and its header buttons stay. `PanelSection` takes a `locked` prop for it.

- [#232](https://github.com/alexbrndl/crypte/pull/232) [`19649d5`](https://github.com/alexbrndl/crypte/commit/19649d5d1a97056a7e5dd44463248859fb891c67) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte init` says what to add to `.gitignore` and what to commit, and names the style sheet the application's entry imports, for the `css` line.

- [#101](https://github.com/alexbrndl/crypte/pull/101) [`8fbf9e8`](https://github.com/alexbrndl/crypte/commit/8fbf9e8482dfdc692b0cb5692a2288b087487e45) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The example story `crypte init` prints gives both import forms, named and default, and its import path is right when the story root is `src/stories`.

- [#139](https://github.com/alexbrndl/crypte/pull/139) [`4e9e9b4`](https://github.com/alexbrndl/crypte/commit/4e9e9b4709ffe0160d79f9365ee87c4392146003) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's fields, keys, buttons and tabs now have the sizes of their Figma components: their strokes no longer add to their size.

- [#67](https://github.com/alexbrndl/crypte/pull/67) [`9c96583`](https://github.com/alexbrndl/crypte/commit/9c96583be7dad0871098bb2d3c55ce1c0dd7591f) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A story file that throws when it is imported no longer takes the whole preview down. The failure is reported as that story's error, named in the shell, and every other story still renders.

- [#250](https://github.com/alexbrndl/crypte/pull/250) [`39374b4`](https://github.com/alexbrndl/crypte/commit/39374b48e05b08b294435251ef8be6ad3de75754) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's Geist fonts keep only Latin-1 and Latin Extended-A, with punctuation and symbols, 42 KB lighter; other characters fall back to the system font.

- [#99](https://github.com/alexbrndl/crypte/pull/99) [`04d7b83`](https://github.com/alexbrndl/crypte/commit/04d7b834f72201d257cd80d7a65f83e0dc3b7e60) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A component that fails to load, from a syntax error or a missing import, is now named in the shell with its file and line, as Vite reports it, instead of "Failed to fetch dynamically imported module" on the story file.

- [#82](https://github.com/alexbrndl/crypte/pull/82) [`8abbac8`](https://github.com/alexbrndl/crypte/commit/8abbac846ebda76e65dc0681da5f77a0bf178e5d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A prop typed by a type alias declared in the component file, such as `rank: Rank` with `type Rank = 'gold' | 'silver'`, now comes out as the enum its union describes.

- [#98](https://github.com/alexbrndl/crypte/pull/98) [`d682897`](https://github.com/alexbrndl/crypte/commit/d68289783a119abf3f0115e97a4ca3c6e3e8a6e7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` now rewrites `.crypte/manifest.json` when a story changes, so a tool reading the file sees the catalogue the shell shows instead of the one from start-up.

- [#72](https://github.com/alexbrndl/crypte/pull/72) [`30525ac`](https://github.com/alexbrndl/crypte/commit/30525acdf4fa4444dc703be37f7a79b5b705b17c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Adds the `crypte check` and `crypte init` commands. `check` reports a story whose component is gone, which fails the command, and an exported component with no story, which is a warning. `init` writes a `crypte.config.ts` into a project that already has its components.

- [#76](https://github.com/alexbrndl/crypte/pull/76) [`bd53bff`](https://github.com/alexbrndl/crypte/commit/bd53bff8ceb30309d35601393467a9e7c9ae128b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte.config.ts` is now read by one reader instead of two. A quoted key such as `'adapter': …` is accepted where it used to be refused, a key written twice keeps its last value as JavaScript does rather than its first, and a computed key is no longer mistaken for the field.

- [#183](https://github.com/alexbrndl/crypte/pull/183) [`ee1104d`](https://github.com/alexbrndl/crypte/commit/ee1104d2157adb178c59173b9e763be0584d5e9a) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Every element of the shell views is drawn once: the section headers, tables, badges, empty states and sidebar rows look the same in the stories, tokens, health and versions views. The selected row of a sidebar starts at the column edge, and the token families line up with the health pages.

- [#182](https://github.com/alexbrndl/crypte/pull/182) [`66f7ed2`](https://github.com/alexbrndl/crypte/commit/66f7ed2ce13543b0b2f589bd62c5284e05bfb31a) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The panels of the stories, tokens and health views share one header: the whole header folds the panel, and every panel remembers whether it is folded. The sidebar titles share one style, a failed audit says so in red, and the links of the health tables show their focus.

- [#151](https://github.com/alexbrndl/crypte/pull/151) [`b1fd211`](https://github.com/alexbrndl/crypte/commit/b1fd2116d87d68471b29fe1bfd8c5ff74af247a1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` depends on `reka-ui` rather than bundling it, and the shell builds its `vendor/ui.js` itself: the shell and `@crypte/ui` share one copy of Reka, 19 kB gzip lighter. The zoom menu says its keys at its foot instead of in a tooltip.

- [#233](https://github.com/alexbrndl/crypte/pull/233) [`3dd95cf`](https://github.com/alexbrndl/crypte/commit/3dd95cfdc46d7e4c03b2460b68c22ce9a04b28cf) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Each package carries a short README, what it is and how to install it, for its npm page.

- [#171](https://github.com/alexbrndl/crypte/pull/171) [`212b2ce`](https://github.com/alexbrndl/crypte/commit/212b2ce5ad58990908bc833b7fa6e951f50072de) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The command palette filters with `is:` and `type:`, completed with Tab, lists the places recently left when nothing is typed, and shows the npm command of a plugin to install. Each row now reads in three columns: where, what, and its shortcut, status or age.

- [#172](https://github.com/alexbrndl/crypte/pull/172) [`b4b77b8`](https://github.com/alexbrndl/crypte/commit/b4b77b841bc51b8b1737976abd140eddc96dd85b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The palette guides its filters: a word that begins a key offers that filter, and inside a filter only its values are listed. "Install a plugin…" shows the import and the call to add to the configuration. The shell starts on the system theme at every launch; the toggle no longer outlives the page.

- [#227](https://github.com/alexbrndl/crypte/pull/227) [`fcd175f`](https://github.com/alexbrndl/crypte/commit/fcd175f8103ef0026897c51bb4b5e0e7e03d223d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin panel puts its buttons in its header, beside "Reset all": `PanelProps.actions` is that slot's element, which a `<Teleport>` reaches. `source`, `actions` and `a11y` move theirs there.

- [#118](https://github.com/alexbrndl/crypte/pull/118) [`747533d`](https://github.com/alexbrndl/crypte/commit/747533de205bfea3626451c8afac78979c18c38d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A panel edit holding something other than primitives is refused and named with its plugin and prop, instead of leaving the preview blank. When several panels edit a story, their values are merged in the order of `plugins`, the later panel winning a prop both edit.

- [#148](https://github.com/alexbrndl/crypte/pull/148) [`3cb16c3`](https://github.com/alexbrndl/crypte/commit/3cb16c307fd7a4557eef5eb18c807dac74d901b0) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell hands a panel back what it edited, as its `overrides` prop, and shows a Reset all in the panel's head while there is any. `@crypte/controls` reads its values from that prop and drops its Back to the story button. `@crypte/ui` adds the `ghost` button.

- [#155](https://github.com/alexbrndl/crypte/pull/155) [`ae3f3ed`](https://github.com/alexbrndl/crypte/commit/ae3f3edea8cdfb68cf18d92567ac1c84055d05d7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A panel's fold button tells a screen reader which body it folds, and why the panel has nothing to say when it has not.

- [#174](https://github.com/alexbrndl/crypte/pull/174) [`f5db77a`](https://github.com/alexbrndl/crypte/commit/f5db77a77a223530413625281fd1955c52f63ce5) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The panel toggle fills its icon while the panel is open, in the neutral ink.

- [#175](https://github.com/alexbrndl/crypte/pull/175) [`606cfe2`](https://github.com/alexbrndl/crypte/commit/606cfe249578864d3286e3aa98567f3a895a5dc3) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The panel toggle works in full screen: the story opens there without panels, the toggle brings them back, and leaving full screen restores them as they were.

- [#116](https://github.com/alexbrndl/crypte/pull/116) [`986495e`](https://github.com/alexbrndl/crypte/commit/986495e058bd0b6f128d11c34877081422c4eaec) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The preview no longer waits for plugin modules before the first story: a module attaches when it arrives, and one that never does costs nothing. Panels receive `failed`, why the story on display could not be rendered, and `@crypte/a11y` folds on it instead of waiting. Anything a preview module exports by name beside its default export is refused with its reason.

- [#119](https://github.com/alexbrndl/crypte/pull/119) [`ce35b16`](https://github.com/alexbrndl/crypte/commit/ce35b16205e79c64541726eef048cd0afe583fd7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `PanelProps`, `PanelEvents`, `PreviewHooks` and `PreviewContext` are exported beside `CryptePlugin`, so a plugin written in a project types its panel and its hooks from `@crypte/cli`.

- [#192](https://github.com/alexbrndl/crypte/pull/192) [`bf812f0`](https://github.com/alexbrndl/crypte/commit/bf812f0f89de8c684f4088bf0607bb43c87f6443) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin may have a view of its own in the activity bar: `view: { label, icon }` on the plugin object, and the shell module's `view` export drawing its canvas, sidebar and panel. The item chosen in the view is kept in the address, `?view=<plugin>&item=<key>`. A label longer than 8 characters, an icon that is not a Hugeicons object, or a view without a shell module is refused with its reason.

- [#244](https://github.com/alexbrndl/crypte/pull/244) [`a5c4c86`](https://github.com/alexbrndl/crypte/commit/a5c4c86aac93260bc840d754bd6dc3f291c4392e) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `plugins` adds to the default plugins: `plugins: [a11y()]` keeps `controls`, `tokens`, `source` and `actions`, a plugin listed under one of their names replaces it in its place, and `defaultPlugins: false` keeps only what `plugins` lists.

- [#142](https://github.com/alexbrndl/crypte/pull/142) [`d2c3532`](https://github.com/alexbrndl/crypte/commit/d2c3532d4e5e3d90b819be72a93cb76b51e499cc) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` adds `Button`, `Input`, `Select` and `Checkbox`, drawn from the Figma file. The shell serves `@crypte/ui` through its import map next to `vue`, so a panel draws with the shell's own components. `@crypte/controls` and `@crypte/a11y` use them, and declare `@crypte/ui` as a peer dependency.

- [#215](https://github.com/alexbrndl/crypte/pull/215) [`014234e`](https://github.com/alexbrndl/crypte/commit/014234e089caf2babb995169b28b032f18944182) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell passes its language to the plugins: panels and view parts receive `locale`, `en` or `fr`, and a view's `label` may be one per language. `controls` and `a11y` draw their panels in French.

- [#176](https://github.com/alexbrndl/crypte/pull/176) [`eb3d22b`](https://github.com/alexbrndl/crypte/commit/eb3d22b6af730a1b55fe515f4a1a636569896ab9) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `render` carries an optional `theme`, which the preview sets as `data-theme` and `color-scheme` on its root before drawing. The preview follows the shell's theme, and the stage shows a story in light and in dark side by side.

- [#220](https://github.com/alexbrndl/crypte/pull/220) [`16ac965`](https://github.com/alexbrndl/crypte/commit/16ac96541b6867b71b54147740fa2f838caeb96e) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The workshop sets the width of the preview from the canvas toolbar, by device: full width, mobile (375 px), tablet (768 px), laptop (1024 px) or desktop (1440 px), so a story's media queries answer as on that screen.

- [#36](https://github.com/alexbrndl/crypte/pull/36) [`009eea8`](https://github.com/alexbrndl/crypte/commit/009eea88c4cccc52ad50a075d3cfefc83c60632f) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Nothing changes for users of the packages. The story reader's `produced` gains an explicit exhaustiveness guard, so a fourth kind of read stops compiling wherever the branching moves.

  Measured before adding it: rewriting that `switch` as a ternary chain and adding a fourth kind left `vp check` and all 36 reader cases green, so the protection came from the declared return type alone and was lost in silence.

- [#188](https://github.com/alexbrndl/crypte/pull/188) [`735d80d`](https://github.com/alexbrndl/crypte/commit/735d80d7759fe810ecdf627985bfc5411707bb72) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The To do panel of the health view shows Copy fix prompt in its header, where the story panels show Reset all.

- [#185](https://github.com/alexbrndl/crypte/pull/185) [`fd735c7`](https://github.com/alexbrndl/crypte/commit/fd735c73d18a2e91408432f763b98b7f6abbffec) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The button that copies the prompt of everything still to fix sits beside Copy link, in the toolbar of every health page, and is disabled when nothing remains.

- [#103](https://github.com/alexbrndl/crypte/pull/103) [`79bea9a`](https://github.com/alexbrndl/crypte/commit/79bea9a6abd8ba661a79e557c5e4ad909aec2160) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Props are inferred through `memo`, `forwardRef` and `Object.assign`, and from the props type of `forwardRef<Ref, Props>`, where the table used to come out empty.

- [#26](https://github.com/alexbrndl/crypte/pull/26) [`264e477`](https://github.com/alexbrndl/crypte/commit/264e47751f91d027f18cfcb686e33026f57ac31f) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The messages Crypte prints are now in English.

  A missing `crypte.config.ts`, a configuration that declares no `stories` or no `adapter`, a `tsconfig.json` that cannot be read, a path that is not an array: each of these now reads in English. The wording changed, the conditions did not, and every message still names the file and the field at fault.

  The diagnostic a plugin author gets when a message declares a non-literal `type` reads in English too.

- [#41](https://github.com/alexbrndl/crypte/pull/41) [`943a44c`](https://github.com/alexbrndl/crypte/commit/943a44ce053c65e96a05736cc715dfc44f137adb) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Editing `crypte.config.ts` no longer asks for a restart.

  `crypte dev` used to print `crypte.config.ts changed, restart \`crypte dev\``and do nothing more. It now rebuilds the whole server, which is what reading that file means: our configuration is read outside Vite, and the serve plugin captures the project, so the aliases, the CSS entry, the adapter and the user's own plugins all come from there.`server.restart()` of Vite reads Vite's configuration, not ours.

  The new server is built before the old one closes, so a half-written configuration leaves the running server alone and says so, the same rule the catalogue's rebuild already follows. Closing last also hands the port over with nothing in between, so the browser reconnects on its own: the preview reloads, says it is ready, and the shell re-reads its catalogue at that moment.

  A change is recognised by the content of the watched files rather than by the event, since one save fires several and an editor touches the date of files it has not changed. Restarts are queued, so none is dropped and a duplicate is a no-op.

- [#120](https://github.com/alexbrndl/crypte/pull/120) [`36a68e2`](https://github.com/alexbrndl/crypte/commit/36a68e210a378415256292a67f8b8afef8282e59) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A panel removed from the configuration takes its edits with it: they no longer stay in the render, nor come back when the plugin returns. While a preview module is still loading, a message no hook receives is reported as such, rather than as one that module would have taken.

- [#100](https://github.com/alexbrndl/crypte/pull/100) [`a9120f7`](https://github.com/alexbrndl/crypte/commit/a9120f79ebfc6d491ad716616fa8ee16fa9ddd2c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A story renamed during `crypte dev` renders its own props instead of the base props, a story missing from its loaded module is reported as an error rather than rendered, and the shell drops the error of a story whose file was deleted.

- [#144](https://github.com/alexbrndl/crypte/pull/144) [`8037625`](https://github.com/alexbrndl/crypte/commit/803762562dd0d2d440c0b98ae253bba5d1a79204) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `rendered` now carries `values`, the primitive props a story rendered with, overrides included, and a panel reads them as its `values` prop. `@crypte/controls` fills its fields with them, so a field shows what the component shows.

- [#38](https://github.com/alexbrndl/crypte/pull/38) [`db7d408`](https://github.com/alexbrndl/crypte/commit/db7d40862ad70c2f7623221b8336357f06adfb00) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The preview survives a dependency the optimiser discovers mid-load.

  `crypte dev` now pre-bundles the packages `crypte.config.ts` imports, read from the same imports as the adapter and the global `wrap`. A linked workspace package used to be served as a graph module, so the dependency URLs it carried outlived a re-optimisation: the browser ended up assembling four generations of bundles at once, reported it as a missing export named `t`, and the preview stayed blank until a manual reload.

  Measured on the demo, where the failure is now reproducible on demand: a first visit with no warm-up, so the optimiser discovers the linked package's own dependencies while the page loads. Triggered on a settled page, the same re-optimisation never broke anything, because Vite reloads the frame and the preview comes back on its own.

  Reading that list also fixed four configurations `crypte dev` refused by mistake, each of them plain JavaScript. A named class or function expression (`adapter: new (class Frame {})()`), a static block, and a class member no longer look like a name the configuration builds itself when the file happens to declare that name too. A type-only import no longer travels into the optimiser's list either, where Vite has no package to pre-bundle and said so on every start.

  Nothing changes for a project that already declared its adapter in place, which is every project: the list is read from the imports the configuration already carries.

- [#212](https://github.com/alexbrndl/crypte/pull/212) [`6c74c22`](https://github.com/alexbrndl/crypte/commit/6c74c220244fc3efedb5399144ec1878774b0c36) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Every package names its repository and its folder, which npm provenance requires.

- [#40](https://github.com/alexbrndl/crypte/pull/40) [`68ecfc0`](https://github.com/alexbrndl/crypte/commit/68ecfc0a4b56878093958401120d96c7c6145d3b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell says what the catalogue could not read.

  A story file is read without being run, so what cannot be read without running it is set aside. Until now only the terminal said so, which is not where somebody looks for a story they cannot find: a file whose story key is computed lost that story silently, and a props table with a spread in it presented itself as complete.

  The manifest carries both halves. `Manifest.skipped` names a file, with the reason, and the shell counts what the file did give by matching it against the entries: "1 story lue, il en manque" rather than a flat "ignored", which would be false of a file that gave three stories out of four. `StoryEntry.partial` names one entry whose record is incomplete, quoting what the file wrote, since the missing prop names are precisely what cannot be read.

  Both fields are optional, so a manifest written before them stays valid and its version does not move. Neither is ever fatal: a file being written must not cost the catalogue.

  Six losses were silent and are now said: a spread in the definition deciding the shared props block or `meta`, what a props block itself could not give up, a props block that is a reference rather than written inline, and a `meta` or `options` holding a value this reader cannot read. The last two took the status out of the manifest and out of the fingerprint without a word.

  The terminal keeps naming every file that gave no story, as it did before. The manifest holds only what is certain to be a story, because a permanent banner above the preview for a legitimate neighbouring file teaches the reader to ignore it: a `defineStories` call that no default export carries, a file that does not parse, and a file that produced stories and produces none any more. A file that stops producing keeps saying so until it produces again, and stops once it is deleted or renamed, since that is deliberate.

  `import { defineStories as define }` now works: an aliased story used to produce nothing and say nothing.

- [#136](https://github.com/alexbrndl/crypte/pull/136) [`1bfc48d`](https://github.com/alexbrndl/crypte/commit/1bfc48d429869083f9f36536131532dd3c5bc58d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The rest of the shell follows the Figma design: a toolbar above the canvas and the panels, with its breadcrumb and its shortcuts on its buttons, the panels in a column of their own with a folding band, a status bar across the window, and the component page, the tokens page, the changes mode and the command palette drawn from the file's components.

- [#128](https://github.com/alexbrndl/crypte/pull/128) [`c5e8d8a`](https://github.com/alexbrndl/crypte/commit/c5e8d8a673e299d04d96e097665dbc38adb7b67b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell shows what changed in the catalogue since the last commit: stories that appeared, disappeared, or whose props or status moved, read from the fingerprint Git holds. When Git cannot say, the mode says why.

- [#126](https://github.com/alexbrndl/crypte/pull/126) [`41c83dd`](https://github.com/alexbrndl/crypte/commit/41c83ddfe8c794cbcad568792f99bf3d470d2f28) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Each component has a page in the shell, opened from its label in the tree, from the breadcrumb above a story, or from its address: its status, owner, Figma link and files, and its stories with the props each one sets.

- [#138](https://github.com/alexbrndl/crypte/pull/138) [`99500a6`](https://github.com/alexbrndl/crypte/commit/99500a627d2828b7eebe0a91e98f4f156ace68bd) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's secondary text and keyboard hints now meet a 4.5:1 contrast ratio in light and dark, and the command palette's results are named for screen readers.

- [#217](https://github.com/alexbrndl/crypte/pull/217) [`9e95586`](https://github.com/alexbrndl/crypte/commit/9e95586f89b557fae00a366be121017d3d056be7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The workshop shows Crypte's icon in the browser tab.

- [#117](https://github.com/alexbrndl/crypte/pull/117) [`8ce7de5`](https://github.com/alexbrndl/crypte/commit/8ce7de5a0f4116a32286a53b221ea701be102d0d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell reads the list of plugins again whenever the preview says `ready`, so an edit of `crypte.config.ts` shows its panels and refusals without a manual reload, and a panel that did not change keeps its state. A message a panel sends while the preview reloads is now dropped and named in the console instead of lost without a trace.

- [#214](https://github.com/alexbrndl/crypte/pull/214) [`98bf38b`](https://github.com/alexbrndl/crypte/commit/98bf38b67352dcc4cca67eb3d5a565176bfdc602) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell speaks English and French: it follows the browser's language, and a switch at the foot of the activity bar keeps your choice.

- [#124](https://github.com/alexbrndl/crypte/pull/124) [`7d190b7`](https://github.com/alexbrndl/crypte/commit/7d190b7d135a5040dffc3f42331632ee4bf9e1db) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell and the `controls` and `a11y` panels speak English, like the CLI and its error messages. The preview no longer declares French: it declares no language, since it renders the project's components in the project's own.

- [#140](https://github.com/alexbrndl/crypte/pull/140) [`9a023c6`](https://github.com/alexbrndl/crypte/commit/9a023c6deff4b606159d2d4f8ddee63daffc2cd5) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell follows its latest layout: the workspace is a card, the preview fills the stage, the version sits beside the logo, and the status bar counts the plugins. The Previous and Next buttons, and their `[` and `]` shortcuts, are gone.

- [#226](https://github.com/alexbrndl/crypte/pull/226) [`29e28df`](https://github.com/alexbrndl/crypte/commit/29e28dfa719d74546ee2b423b09bb6a0cabb6e04) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The workshop's logo shows Crypte's full icon, the same file as its favicon.

- [#230](https://github.com/alexbrndl/crypte/pull/230) [`930e7ce`](https://github.com/alexbrndl/crypte/commit/930e7cee61d31a7b754fa748e7ccf902f0f8db69) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A plugin's `shell` module that is not a .js or .mjs file is refused at start-up, with the reason: the shell serves it as is, never compiled.

- [#135](https://github.com/alexbrndl/crypte/pull/135) [`5bab5e1`](https://github.com/alexbrndl/crypte/commit/5bab5e1a34d4c648cf9e8e80ff58b95bcf09c9cb) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's navigation column follows the Figma design: a field at the top opens the command palette, also on `/`, and the tree draws its nesting with guides and its selection with a marker. Filtering by status greys what does not match instead of hiding it, one status at a time.

- [#80](https://github.com/alexbrndl/crypte/pull/80) [`dbcc6f5`](https://github.com/alexbrndl/crypte/commit/dbcc6f5ef918cc299e47a95930fc7edaac83bebb) Thanks [@alexbrndl](https://github.com/alexbrndl)! - When a story file stops being readable and comes back, a syntax error then its repair, the shell returns to the story it was showing instead of staying on "the story shown has disappeared" with nothing selected.

- [#76](https://github.com/alexbrndl/crypte/pull/76) [`bd53bff`](https://github.com/alexbrndl/crypte/commit/bd53bff8ceb30309d35601393467a9e7c9ae128b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The dev server no longer builds the shell's page a second time: `sirv` already served it, and the branch that rebuilt it was never reached.

- [#129](https://github.com/alexbrndl/crypte/pull/129) [`d59921c`](https://github.com/alexbrndl/crypte/commit/d59921c7b053eaafceea9d7b10fa55d1e9f1d836) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell says what to do when the catalogue is empty, when `crypte.config.ts` could not be reread, or when an address names a story that was renamed. A story gets a toolbar to copy its link, step through its siblings and show it full screen, with the shortcuts `/`, `[`, `]`, `f` and Escape.

- [#127](https://github.com/alexbrndl/crypte/pull/127) [`4dc1ddc`](https://github.com/alexbrndl/crypte/commit/4dc1ddc7265e1f33bad4b984c3818ccc1b98b078) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell draws tokens families: each sits in the tree under its folders, and its page shows every token in every theme, with a swatch for colors and the alias chain behind each value.

- [#134](https://github.com/alexbrndl/crypte/pull/134) [`f7dce1a`](https://github.com/alexbrndl/crypte/commit/f7dce1a7022022ad2696d92aefbe21fc2fc9d5ab) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` ships the design tokens of the Figma file as CSS custom properties, light and dark, and `Alert` takes `color` as `warning` or `error`. The shell follows the system theme, and switches between light and dark with `t` or from the command palette, remembering the choice. It is set in Geist and Geist Mono.

- [#173](https://github.com/alexbrndl/crypte/pull/173) [`778d292`](https://github.com/alexbrndl/crypte/commit/778d292b0b4aaae3d296e9ce1992abb884668baf) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The activity bar names each view in a tooltip on its right, versions with its count of differences. The breadcrumb starts with the view. The right panel closes below 1180 px on every view, and a toolbar button shows or hides it at any width. `Tooltip` takes a `detail`, drawn after its content, and a `side`.

- [#125](https://github.com/alexbrndl/crypte/pull/125) [`b1d55aa`](https://github.com/alexbrndl/crypte/commit/b1d55aae6fa8d04dd907bdea43100f403330223b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell navigates a tree of folders, components and stories, with a search and a filter by status, and remembers what you fold. Its address names the story on display, so a pasted link opens the same story.

- [#141](https://github.com/alexbrndl/crypte/pull/141) [`4edba62`](https://github.com/alexbrndl/crypte/commit/4edba62b9d5fa1f49ee90000a53c648e1630323c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell zooms the story from 25 to 400 %, from its toolbar, the palette, or the `+`, `-` and `0` keys. The frame keeps its size.

- [#137](https://github.com/alexbrndl/crypte/pull/137) [`ca037d7`](https://github.com/alexbrndl/crypte/commit/ca037d7d0df46468586e116f886f860e1cfb6e9b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Internal reorganisation of the sources, with no change in behaviour or in the published files.

- [#146](https://github.com/alexbrndl/crypte/pull/146) [`e98bf99`](https://github.com/alexbrndl/crypte/commit/e98bf99f59ce136eb559cae16f8c9649ae4569dc) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The zoom becomes one button on the stage, top right, whose menu zooms in, out and back to actual size; the full screen button sits beside it, so it stays reachable in full screen. The status bar takes the background of its Figma frame.

- [#130](https://github.com/alexbrndl/crypte/pull/130) [`2e1a6bf`](https://github.com/alexbrndl/crypte/commit/2e1a6bfc5f161c0326b27736a52e5878ddfbb74b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's status bar shows what the shell weighs, how long the first story took to render after the page opened, and what each plugin loads in the browser, its dependencies included, all measured. The render time of each story leaves the status line.

- [#152](https://github.com/alexbrndl/crypte/pull/152) [`165e00a`](https://github.com/alexbrndl/crypte/commit/165e00aad256e9cd37adc0d395af3d6932446b1d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A story's `options` take the core's `layout`: `centered`, the default, `padded`, or `fullscreen` for a page or a bar. The preview centres a story unless it says otherwise, where it used to sit at the top left of the frame.

- [#77](https://github.com/alexbrndl/crypte/pull/77) [`7369c52`](https://github.com/alexbrndl/crypte/commit/7369c52ed9809bf3dd2b3d4aaca2141e818bf946) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Saving a story file no longer leaves a React root and a channel listener behind in the preview, nor writes a `createRoot` error to the browser console on every save.

- [#206](https://github.com/alexbrndl/crypte/pull/206) [`8ff6149`](https://github.com/alexbrndl/crypte/commit/8ff6149d83e76e710cb403092f14bb1bbacaad5c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` and `crypte build` give `index.json` and `iframe.html?id=` in the shape a built Storybook publishes, so zeroheight, Supernova and Knapsack can list and embed the stories.

- [#157](https://github.com/alexbrndl/crypte/pull/157) [`76981b0`](https://github.com/alexbrndl/crypte/commit/76981b04d3a1ab2872d59d17c5eb40443750f8f8) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Muted and subtle text and the light accent follow the design system: muted text is darker in light and lighter in dark, subtle text now reads at 4.5:1 on base and raised surfaces in both themes, and the light accent is a deeper teal. The shell's status bar loses its background.

- [#75](https://github.com/alexbrndl/crypte/pull/75) [`530de8c`](https://github.com/alexbrndl/crypte/commit/530de8c51389be8089f5a388e6ca9595f09fb320) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Internal tidy-up, with no change to what either package does: nine exports nothing imported are gone, and so are the fallbacks and guards no input could reach, thirty-two branch slots in all, each one measured unreachable before it was removed.

- [#167](https://github.com/alexbrndl/crypte/pull/167) [`c6c0316`](https://github.com/alexbrndl/crypte/commit/c6c03166b899c26428c61f9637163fc2f7151ec1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The tokens view gains a panel for the token selected: its value in each theme with the primitive it ends on, its CSS name, the tokens that alias it, and the components that read it, each leading to its page.

- [#170](https://github.com/alexbrndl/crypte/pull/170) [`176b98c`](https://github.com/alexbrndl/crypte/commit/176b98cbed554c24d40f115ec3ccb8126bbba67a) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The tokens view follows the mockup: a toolbar with the token's path, swatches framed by their selection, short names within each family, and a foldable panel. Tokens now keep the order of the style sheet instead of an alphabetical one.

- [#166](https://github.com/alexbrndl/crypte/pull/166) [`8a12527`](https://github.com/alexbrndl/crypte/commit/8a1252766d3039e1a1596624cce67496496bb6e8) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's tokens view lists categories (color, space, radius, typography, stroke, size, palette) and draws each as the design system does: swatches, scaled bars, type specimens, radius and stroke tiles. A token is selected under its own address, `?tokens=<category>&token=<name>`; an older `?id=` of a family opens its category.

- [#165](https://github.com/alexbrndl/crypte/pull/165) [`7112fdc`](https://github.com/alexbrndl/crypte/commit/7112fdc5ae0188a7067cef27d43b0eec82d373a5) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `Tooltip` takes a `keys` prop and draws the shortcut as an inverse keycap beside its content. Keycaps in buttons, the command palette and the zoom menu share the design system's subtle background.

- [#39](https://github.com/alexbrndl/crypte/pull/39) [`193ecdc`](https://github.com/alexbrndl/crypte/commit/193ecdcb3c2be6848da6045612ae00509fa906e7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A configuration written in TypeScript no longer leaves the preview blank.

  The generated preview entry copies the expression `crypte.config.ts` gives to `adapter` and to `wrap`, so it carried the author's TypeScript into the browser: `adapter: createAdapter() as Adapter` reached it verbatim and died on a `SyntaxError` before the preview channel opened, which meant no `ready` and an empty frame with nothing on screen to say why.

  `crypte dev` now compiles the entry before serving it. Measured on the demo with an assertion, a `satisfies` and a type argument, each of which was enough on its own to empty the frame.

  Renaming the virtual module to `.ts` was measured and does not work: Vite does not transform a virtual module by its extension, so the entry is compiled by the plugin itself. The public path stays `/@crypte/preview.js`, which is what it serves.

  Compiling the entry also makes TypeScript declarations run inside that expression, so the imports they name now travel with it: a parameter property and an enum member used to leave the entry reading a name it never imported. A namespace and a decorator stay unsupported, measured: the configuration loader refuses both.

- [#195](https://github.com/alexbrndl/crypte/pull/195) [`332cd16`](https://github.com/alexbrndl/crypte/commit/332cd161368bf0bf0b7bedb65841f1d53773f2f1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` carries the parts the shell builds its views with, so a plugin's view builds with them too and looks like the shell's: `ColumnTitle`, `SidebarLink`, `Tree` (a generic tree that folds, nodes `{ key, label, children?, count?, dimmed?, selectable?, kind? }`), `ViewCanvas`, `SectionHeader`, `Badge`, `CardTable`, `EmptyNote` and `PanelSection`.

- [#109](https://github.com/alexbrndl/crypte/pull/109) [`5db7f15`](https://github.com/alexbrndl/crypte/commit/5db7f153307a3ec9c448455cb2d417c96014852d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` no longer rebuilds the catalogue when a component file reports a change that left its content as it was, as macOS can report on a file nothing wrote to.

- [#169](https://github.com/alexbrndl/crypte/pull/169) [`826ac9b`](https://github.com/alexbrndl/crypte/commit/826ac9ba34375e0405a301c1c064385485b71a55) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell's versions view replaces the changes mode: the differences sit in the sidebar, signed + ~ −, tokens first, and the canvas details the one selected, a token's value before and after in each theme with the components that read it, or a story's props and status. The comparison starts from the last commit, the default branch, the last 7 or 30 days, a tag, or a commit or date typed in, and the address carries it.

- [#224](https://github.com/alexbrndl/crypte/pull/224) [`33d5e3b`](https://github.com/alexbrndl/crypte/commit/33d5e3be50a70da2c10ccec2ea75cb0983017c4c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - New `crypte visual` command: it renders each story of the static build in Chromium, through the Playwright the project installs, and compares it with its committed baseline in `.crypte/visual`. A story that differs is written to `crypte-visual/` and the command exits 1; `--update` writes the baselines.

- [#231](https://github.com/alexbrndl/crypte/pull/231) [`9ca4d26`](https://github.com/alexbrndl/crypte/commit/9ca4d26859f00b8b936eb09a0b559fd23048c7ae) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte visual` with no baseline at all says so in one line, rather than calling every story different.

- [#225](https://github.com/alexbrndl/crypte/pull/225) [`a404084`](https://github.com/alexbrndl/crypte/commit/a404084ed2ef695084d19bb77426e71c1fe99c19) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte visual` recognises a renamed story: it names the story the left-over baseline probably belonged to, and the `git mv` that keeps it.

- [#202](https://github.com/alexbrndl/crypte/pull/202) [`a633638`](https://github.com/alexbrndl/crypte/commit/a6336388b21178f5f3834cde2f7619be7e2e8c39) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A Vue project is recognised everywhere a React one is: `crypte check` reports a `.vue` component with no story, the health view counts `.vue` files and offers a Vue story skeleton, the empty stories guide writes a Vue story, and `crypte init` writes a Vue configuration with `vue()` in `vite.plugins`. A default export is now reported under its file's name rather than `default`.

- [#201](https://github.com/alexbrndl/crypte/pull/201) [`5e56e15`](https://github.com/alexbrndl/crypte/commit/5e56e15d10c33ba996cd49597fc57b69553c2f7c) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The props of a `.vue` component are read from its `<script setup>` block, or its `props` option: `defineProps<T>()` with a local type, `defineProps({ … })`, `withDefaults` and a destructured `defineProps`. The docs table and `controls` now show them, without the Vue compiler.

- [#203](https://github.com/alexbrndl/crypte/pull/203) [`2c1f78f`](https://github.com/alexbrndl/crypte/commit/2c1f78ff84fa46561a6eada1125220d7bb6a90c3) Thanks [@alexbrndl](https://github.com/alexbrndl)! - A `.vue` component's call code is written as a Vue template: strings as attributes escaped as HTML, every other value bound with `:prop`, and a text child in the default slot. It pastes into a Vue template and renders what the story renders.

- [#91](https://github.com/alexbrndl/crypte/pull/91) [`15eef82`](https://github.com/alexbrndl/crypte/commit/15eef827f7d84bddfe2a2a3863f6b276dd920f52) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte dev` says again that a component file cannot be watched when that file leaves the catalogue and comes back; it stayed silent the second time.

- [#239](https://github.com/alexbrndl/crypte/pull/239) [`e3a6dd7`](https://github.com/alexbrndl/crypte/commit/e3a6dd79f76beac2f79244931bafd7892b5910f7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte build` minifies the function names of the preview.

- [#209](https://github.com/alexbrndl/crypte/pull/209) [`f4e7f85`](https://github.com/alexbrndl/crypte/commit/f4e7f8535eba90a4b5ed41268236110b2f4c74b7) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `crypte init` writes `.claude/skills/write-stories/SKILL.md`, a skill that writes a component's stories from the places the application calls it, and adds it alone to a project already configured. The health view's prompt sends the agent to it instead of a skeleton.

- [#156](https://github.com/alexbrndl/crypte/pull/156) [`15692dc`](https://github.com/alexbrndl/crypte/commit/15692dcd4324780adf26bd55185cabb6456938a3) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The zoom menu opens on the level in use, no longer hides the rest of the shell from screen readers, and keeps its key hint out of the menu's items.

- [#149](https://github.com/alexbrndl/crypte/pull/149) [`30a1706`](https://github.com/alexbrndl/crypte/commit/30a170692453169c046a39ed1af94a872458913b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The zoom menu lists the whole scale, 25 to 400 %. The shell's hints become drawn tooltips, on hover and focus: `@crypte/ui` adds `Tooltip`, and `Field` shows a prop's description through it.

- [#147](https://github.com/alexbrndl/crypte/pull/147) [`91dcd79`](https://github.com/alexbrndl/crypte/commit/91dcd7901e80dfc64b18a861d67fe3eea3bf9eb1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The zoom menu offers values, 50 to 200 %, the current one checked; the keys still step from 25 to 400 %. The navigation column, the workspace and the status bar follow their Figma frame more closely, and the workspace keeps its card in full screen. `@crypte/ui` adds the `--space-0-25` token, 1 px.

- Updated dependencies [[`5c4ccad`](https://github.com/alexbrndl/crypte/commit/5c4ccad3298d53218f319fd5cd2c64a910b9fafa), [`39143c9`](https://github.com/alexbrndl/crypte/commit/39143c9eb87699e0b104efa59c805591f88c55b1), [`87b4740`](https://github.com/alexbrndl/crypte/commit/87b47408fcec4250d8a06bbada94546813ded6da), [`67036f8`](https://github.com/alexbrndl/crypte/commit/67036f8209eefb60a9b8849861cf4ebe8ac00e5b), [`13cacda`](https://github.com/alexbrndl/crypte/commit/13cacdab817633cd87b07b3e0a66f8b4484c6c46), [`b0a718d`](https://github.com/alexbrndl/crypte/commit/b0a718d39d349a25988cdc2085e3b841e2a28348), [`a234608`](https://github.com/alexbrndl/crypte/commit/a2346086531d143ef6e510c664d084aa3e0e96d1), [`d93f415`](https://github.com/alexbrndl/crypte/commit/d93f41544ab83d13a951467d891e77c56d07506e), [`ddb4f45`](https://github.com/alexbrndl/crypte/commit/ddb4f45a5dea300d852d1cacddc0e7d65758914f), [`0271aac`](https://github.com/alexbrndl/crypte/commit/0271aaccf07aac59919c2160178d05bf28a3b75c), [`e14e06b`](https://github.com/alexbrndl/crypte/commit/e14e06beb162bf1dd9384e1c9074dc3d5c496794), [`a3c29ba`](https://github.com/alexbrndl/crypte/commit/a3c29ba82f5ee2d6900031322d27b85e583648fd), [`5ef7c33`](https://github.com/alexbrndl/crypte/commit/5ef7c33dbed5530c1d1338c04d201790fc63b86b), [`a29793c`](https://github.com/alexbrndl/crypte/commit/a29793c645bd038dd6f201047b77ae4641ba784e), [`b483bcd`](https://github.com/alexbrndl/crypte/commit/b483bcd493747393900864556e3a45ad3e2637b2), [`fa6f08d`](https://github.com/alexbrndl/crypte/commit/fa6f08dc16a65ad9bb598dd0a14fa45dca87b458), [`7706d65`](https://github.com/alexbrndl/crypte/commit/7706d65f8c53682fc9a81a73ea5aa2b7c7cf0c0d), [`7bec952`](https://github.com/alexbrndl/crypte/commit/7bec952f016a895b1f847ce218ba89757b4faa50), [`a076311`](https://github.com/alexbrndl/crypte/commit/a076311250a9aca656a2df76368d9207a419bd3e), [`3dd95cf`](https://github.com/alexbrndl/crypte/commit/3dd95cfdc46d7e4c03b2460b68c22ce9a04b28cf), [`fcd175f`](https://github.com/alexbrndl/crypte/commit/fcd175f8103ef0026897c51bb4b5e0e7e03d223d), [`3cb16c3`](https://github.com/alexbrndl/crypte/commit/3cb16c307fd7a4557eef5eb18c807dac74d901b0), [`bf0159b`](https://github.com/alexbrndl/crypte/commit/bf0159b2e50b6533ecb46c6325376e8cf370ef60), [`986495e`](https://github.com/alexbrndl/crypte/commit/986495e058bd0b6f128d11c34877081422c4eaec), [`bf812f0`](https://github.com/alexbrndl/crypte/commit/bf812f0f89de8c684f4088bf0607bb43c87f6443), [`d2c3532`](https://github.com/alexbrndl/crypte/commit/d2c3532d4e5e3d90b819be72a93cb76b51e499cc), [`7ca1f54`](https://github.com/alexbrndl/crypte/commit/7ca1f5432b5276c0cfed636b4b47dba8319b2efb), [`014234e`](https://github.com/alexbrndl/crypte/commit/014234e089caf2babb995169b28b032f18944182), [`d3697e5`](https://github.com/alexbrndl/crypte/commit/d3697e5b043ddf6e883b2a043434c832cd59f2d8), [`8ff6149`](https://github.com/alexbrndl/crypte/commit/8ff6149d83e76e710cb403092f14bb1bbacaad5c), [`eb3d22b`](https://github.com/alexbrndl/crypte/commit/eb3d22b6af730a1b55fe515f4a1a636569896ab9), [`36a68e2`](https://github.com/alexbrndl/crypte/commit/36a68e210a378415256292a67f8b8afef8282e59), [`8037625`](https://github.com/alexbrndl/crypte/commit/803762562dd0d2d440c0b98ae253bba5d1a79204), [`6c74c22`](https://github.com/alexbrndl/crypte/commit/6c74c220244fc3efedb5399144ec1878774b0c36), [`68ecfc0`](https://github.com/alexbrndl/crypte/commit/68ecfc0a4b56878093958401120d96c7c6145d3b), [`7d190b7`](https://github.com/alexbrndl/crypte/commit/7d190b7d135a5040dffc3f42331632ee4bf9e1db), [`2b14e30`](https://github.com/alexbrndl/crypte/commit/2b14e30540ec60f5826ccfaf6fc6dc9a45683042), [`dae631c`](https://github.com/alexbrndl/crypte/commit/dae631c63c6d436fbd4b5be98bcccf50032edab5), [`165e00a`](https://github.com/alexbrndl/crypte/commit/165e00aad256e9cd37adc0d395af3d6932446b1d), [`530de8c`](https://github.com/alexbrndl/crypte/commit/530de8c51389be8089f5a388e6ca9595f09fb320), [`004c342`](https://github.com/alexbrndl/crypte/commit/004c3427ce3580377c2a5a228056c3b2a5a91379), [`eb3f6f0`](https://github.com/alexbrndl/crypte/commit/eb3f6f05732f157be551cb0dc4c4a58a1e0ebd42), [`a712906`](https://github.com/alexbrndl/crypte/commit/a7129065c7e3789d1f7cf521af44aaeebed66a98), [`b7d239a`](https://github.com/alexbrndl/crypte/commit/b7d239aa2ce8c20821141d9fd9b1cb669d8d872d), [`176b98c`](https://github.com/alexbrndl/crypte/commit/176b98cbed554c24d40f115ec3ccb8126bbba67a), [`5031cda`](https://github.com/alexbrndl/crypte/commit/5031cda464a4d6df24d9ba1f4e6019cbfa51fa4c), [`0e287ee`](https://github.com/alexbrndl/crypte/commit/0e287ee1639ea9c423e19851aaeb839c1582a800), [`30a1706`](https://github.com/alexbrndl/crypte/commit/30a170692453169c046a39ed1af94a872458913b)]:
  - @crypte/actions@1.0.0
  - @crypte/core@1.0.0
  - @crypte/tokens@1.0.0
  - @crypte/controls@1.0.0
  - @crypte/source@1.0.0
