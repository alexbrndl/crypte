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
- **`adapter`** is the adapter for your framework.

Everything else is optional: `css` for the style sheet the preview loads, `wrap` for a wrapper around every story, `plugins`, and `vite.plugins` for a transform your framework needs.

If one of the two required keys is missing, Crypte says which one:

```
crypte.config.ts must declare `stories`, the root of the story files.
```

**Crypte never reads your `vite.config`.** Whatever it needs, you declare. That is what lets it run on a project without taking over its build.

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
- **A missing `extends` target is not fatal.** It happens on a fresh clone, or before `nuxt prepare`. Crypte warns and carries on without the aliases.
- **An alias cannot replace an installed package.** `"vue": ["shims/vue.js"]` has no effect while `vue` is installed, because Crypte resolves after Vite does. TypeScript would return your file here; Crypte returns the package.

Aliases do not apply inside style sheets. An `@import '@/vars.css'` does not resolve yet.

## Write a story

Not yet. The story format is settled, in section 2 of [`contracts.md`](contracts.md), but `defineStories` ships with an adapter and no adapter exports it today.

## Run it

Not yet. `crypte dev` is what will start the server, and it is not built.
