---
'@crypte/tokens': minor
'@crypte/core': minor
'@crypte/cli': minor
---

`@crypte/tokens`, the first plugin, and the one that proves section 6.3 against something real.

It reads CSS custom properties from the style sheet the project declared and contributes one manifest entry per **family**, a family being the first segment of a name: `--color-brand-primary` lands in `color` under the key `brand-primary`.

**Two theme sources, and no guessing beyond them.** An unqualified `:root` writes into a theme named `default`, since nothing says the unqualified values are the light ones. `[data-theme="x"]` writes into `x`. A `@media (prefers-color-scheme: dark)` block is lifted out with its braces balanced and read as `dark` — read naively, its inner `:root` would be taken for a second helping of the default theme and would overwrite it without a word. A `.dark` class is not read: nothing declared it as a theme.

**A `var()` chain is walked to the literal it ends on.** `value` holds that literal so a swatch renders from it alone, and `alias` holds the names walked, from the token towards the literal. A chain that leads nowhere keeps its own text, and a cycle stops.

**Kinds come from the value, never from the name.** `color`, `dimension`, `number`, and `unknown` for the rest. `fontFamily` and `fontWeight` need the property a variable is used on, which a variable does not carry, so they stay `unknown` rather than being guessed.

**It finds nothing, it produces nothing.** No empty section, no "no tokens detected". It is meant for the default preset, so it runs on projects that never asked for it.

Two changes come with it. `NodeContext` now carries the declared `css`, because a plugin reading style sheets had no other way to know which file was meant and guessing a path is what the contract forbids. And section 4.2 says a token's `value` is a string whatever its kind, so a `number` carries `"1.5"`.
