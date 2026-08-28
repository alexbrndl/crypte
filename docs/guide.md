# Guide

How to set Crypte up on a project.

> **Nothing runs yet.** `crypte dev` and `crypte check` are not built, and no package is published. This page describes what the CLI already reads, so that the configuration you write now is the one it will use. Section 8 of [`contracts.md`](contracts.md) lists what exists.
>
> Every example on this page is run by a test. If one of them stopped being true, that test would fail.

## Configure a project

Crypte reads one file at the root of your project, `crypte.config.ts`.

<!-- checked: config -->

```ts
import { defineConfig } from '@crypte/cli'
import react from '@crypte/react'

export default defineConfig({
  stories: 'stories',
  adapter: react(),
  css: 'src/styles/app.css',
})
```

Two keys are required.

- **`stories`** is the folder your story files live in, relative to the project root.
- **`adapter`** is the adapter for your framework. `@crypte/react` exports it as its default, so the name is yours to choose at the import: a project that also declares `@vitejs/plugin-react` names one of the two as it likes. `createAdapter` is the same thing under a fixed name.

Everything else is optional: `css` for the style sheet the preview loads, `wrap` for a wrapper around every story, `plugins`, and `vite.plugins` for a transform your framework needs. React needs none: Vite transforms the JSX itself, and `@vitejs/plugin-react` only earns its place when you want something from Babel, React Compiler for instance.

If one of the two required keys is missing, Crypte says which one:

```
crypte.config.ts must declare `stories`, the root of the story files.
```

**Crypte never reads your `vite.config`.** Whatever it needs, you declare. That is what lets it run on a project without taking over its build.

## Design tokens

The `tokens` plugin reads your CSS custom properties and puts them in the manifest, one entry per family. You write no token file: they are the ones already in your style sheet.

<!-- checked: tokens -->

```ts
import { defineConfig } from '@crypte/cli'
import react from '@crypte/react'
import tokens from '@crypte/tokens'

export default defineConfig({
  stories: 'stories',
  adapter: react(),
  css: 'src/styles/app.css',
  plugins: [tokens({ files: ['src/styles/tokens.css'] })],
})
```

**Its settings go to the plugin, not to the config.** `plugins` carries objects Crypte passes along without opening them, so a plugin's options travel inside the one it belongs to. That is why there is no `tokens` key beside `css`: the core would then have to know what a token is, and would need one key per plugin you install.

**`files` is optional, and the default is the style sheet you declared as `css`.** It is the only file your project has named to Crypte, and guessing another path is what Crypte does not do. Give `files` when your tokens live somewhere else, or in more than one place — they are read in order, and a later file wins on a name declared twice.

**One case where you will need it:** the plugin does not follow `@import`. If `app.css` imports `tokens.css`, point `files` at `tokens.css` itself.

What it reads, and what it leaves alone:

- `:root` writes into a theme named `default`. Not `light`: nothing says your unqualified values are the light ones.
- `[data-theme="dark"]` writes into `dark`, and so does `@media (prefers-color-scheme: dark)`.
- A class such as `.dark` is **not** read. Nothing declared it a theme, and a wrong theme is worse than a missing one.
- `var(--other)` is followed to the literal it ends on, so what the manifest carries is a value, with the names walked beside it.
- Kinds come from the value: colours, dimensions and numbers are named, everything else is `unknown`.

**Finds nothing, produces nothing.** No empty section, no "no tokens detected".

## Path aliases

If your project uses aliases such as `@/components/Button`, Crypte picks them up on its own. You declare nothing.

<!-- checked: aliases -->

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

That file can be a `tsconfig.json` or a `jsconfig.json`. Crypte reads `tsconfig.json` first, then `jsconfig.json`, and takes the first one that declares paths. A JavaScript project therefore resolves its imports the same way a TypeScript one does.

Three things to know.

- **`extends` is followed**, and each level is read where it is written, so a path stays relative to the file that declares it.
- **A missing `extends` target is not fatal.** It happens on a fresh clone, or before `nuxt prepare`. Crypte moves on to the next file, and warns only if no file gave it any path at all.
- **An alias cannot replace an installed package.** `"vue": ["shims/vue.js"]` has no effect while `vue` is installed, because Crypte resolves after Vite does. TypeScript would return your file here; Crypte returns the package.

Aliases do not apply inside style sheets. An `@import '@/vars.css'` does not resolve yet.

## Write a story

Not yet. The story format is settled, in section 2 of [`contracts.md`](contracts.md), but `defineStories` ships with an adapter and no adapter exports it today.

## Run it

Not yet. `crypte dev` is what will start the server, and it is not built.
