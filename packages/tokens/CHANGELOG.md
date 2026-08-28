# @crypte/tokens

## 0.1.0

### Minor Changes

- [#52](https://github.com/alexbrndl/crypte/pull/52) [`b7d239a`](https://github.com/alexbrndl/crypte/commit/b7d239aa2ce8c20821141d9fd9b1cb669d8d872d) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/tokens`, the first plugin, and the one that proves section 6.3 against something real.

  It reads CSS custom properties from the style sheet the project declared and contributes one manifest entry per **family**, a family being the first segment of a name: `--color-brand-primary` lands in `color` under the key `brand-primary`.

  **Two theme sources, and no guessing beyond them.** An unqualified `:root` writes into a theme named `default`, since nothing says the unqualified values are the light ones. `[data-theme="x"]` writes into `x`. A `@media (prefers-color-scheme: dark)` block is lifted out with its braces balanced and read as `dark` — read naively, its inner `:root` would be taken for a second helping of the default theme and would overwrite it without a word. A `.dark` class is not read: nothing declared it as a theme.

  **A `var()` chain is walked to the literal it ends on.** `value` holds that literal so a swatch renders from it alone, and `alias` holds the names walked, from the token towards the literal. A chain that leads nowhere keeps its own text, and a cycle stops.

  **Kinds come from the value, never from the name.** `color`, `dimension`, `number`, and `unknown` for the rest. `fontFamily` and `fontWeight` need the property a variable is used on, which a variable does not carry, so they stay `unknown` rather than being guessed.

  **It finds nothing, it produces nothing.** No empty section, no "no tokens detected". It is meant for the default preset, so it runs on projects that never asked for it.

  Two changes come with it. `NodeContext` now carries the declared `css`, because a plugin reading style sheets had no other way to know which file was meant and guessing a path is what the contract forbids. And section 4.2 says a token's `value` is a string whatever its kind, so a `number` carries `"1.5"`.

  The guide gains a **Design tokens** section, and its example is run by a test like every other one on that page. Section 0 of the contracts gains a third guiding rule, which the first plugin is what made worth stating: what a project already writes is read, never declared a second time, and stories are the one exception.

### Patch Changes

- Updated dependencies [[`67036f8`](https://github.com/alexbrndl/crypte/commit/67036f8209eefb60a9b8849861cf4ebe8ac00e5b), [`e14e06b`](https://github.com/alexbrndl/crypte/commit/e14e06beb162bf1dd9384e1c9074dc3d5c496794), [`b483bcd`](https://github.com/alexbrndl/crypte/commit/b483bcd493747393900864556e3a45ad3e2637b2), [`7706d65`](https://github.com/alexbrndl/crypte/commit/7706d65f8c53682fc9a81a73ea5aa2b7c7cf0c0d), [`68ecfc0`](https://github.com/alexbrndl/crypte/commit/68ecfc0a4b56878093958401120d96c7c6145d3b), [`dae631c`](https://github.com/alexbrndl/crypte/commit/dae631c63c6d436fbd4b5be98bcccf50032edab5), [`004c342`](https://github.com/alexbrndl/crypte/commit/004c3427ce3580377c2a5a228056c3b2a5a91379), [`eb3f6f0`](https://github.com/alexbrndl/crypte/commit/eb3f6f05732f157be551cb0dc4c4a58a1e0ebd42), [`b7d239a`](https://github.com/alexbrndl/crypte/commit/b7d239aa2ce8c20821141d9fd9b1cb669d8d872d), [`0e287ee`](https://github.com/alexbrndl/crypte/commit/0e287ee1639ea9c423e19851aaeb839c1582a800)]:
  - @crypte/core@0.1.0
