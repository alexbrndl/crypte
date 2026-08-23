# Crypte contracts

> Version 1.3, reference document. A project brief points here instead of restating these shapes.
>
> Section 8 lists what is built today. Everything else in this document is a contract, not a claim about the code.

---

## 0. Scope

This document covers the four surfaces that are expensive to change once the project ships:

1. The **story format**, the public API developers write by hand.
2. The **manifest**, the contract between the CLI and the core.
3. The **channel protocol**, the contract between the shell and the preview.
4. The **plugin contract**, the contract for every plugin to come.

Everything else belongs to a project brief and can change freely.

**Two guiding rules.**

Crypte never reads a project's `vite.config`. It reads standard, framework-neutral formats, plus what the project declares to it.

This document does not try to cover every case. It covers what real use has shown, and lets the rest arrive through bug reports. A mechanism added just in case creates a use you can no longer take back; a mechanism added after a real need breaks nothing.

---

## 1. File conventions

### 1.1 Where stories live

Stories live in their own folder at the root of the project. Its tree mirrors the component tree.

```
src/components/checkout/OrderSummary.tsx
stories/checkout/OrderSummary.ts
```

A story file carries **the exact name of its component**. The sidebar tree comes from the path relative to the stories root. No title is ever declared.

**A story is written in the language of its project.** Four extensions are read: `.ts`, `.tsx`, `.js` and `.jsx`. A TypeScript project writes `.ts`, and a project with no TypeScript writes `.js`, the same way it writes its components.

The `x` form carries JSX. A structured `children` prop forces it, which is common on composed components such as `Tabs` or `Card`. Everything else fits in the plain form.

### 1.2 `crypte check`

The command reports two problems:

- **Orphan story**: the component it points at is gone.
- **Component with no story**: an exported component has no story. This one is a warning and never fails the command.

The second check only looks at exports **identified as components**: a capitalised name that returns an element. Utility functions exported from a component file, such as `stepFromProgress` in `ProgressLoader.tsx`, are never reported.

**When in doubt, report nothing.** A false warning costs more than a miss: it teaches people to ignore the command.

### 1.3 Fixtures

Large props, such as business objects or translation dictionaries, do not belong in story files. They live in shared fixtures and get imported, exactly as application code does.

```ts
import { planPro } from '@/fixtures/plans'
```

Crypte imposes no location and no naming rule. Fixtures are ordinary modules, resolved through the project's own path aliases.

### 1.4 Packages

Everything is scoped under `@crypte`. A user installs two packages:

```bash
npm i -D @crypte/cli @crypte/react
```

| Package | Role | Installed by the user |
| --- | --- | --- |
| `@crypte/cli` | the `crypte` binary, `defineConfig` | yes |
| `@crypte/react` | adapter, `defineStories`, `story` | yes, the one for their framework |
| `@crypte/core` | the core, an internal dependency | no, never imported directly |
| `@crypte/<plugin>` | plugins, one at a time | on demand |

The package name and the command name are independent: `@crypte/cli` declares a binary called `crypte`, and the user types `crypte dev`.

**`defineStories` and `story` come from the adapter, not from a neutral package.** The adapter knows the framework, so prop types are inferred more precisely. A Vue project imports them from its own adapter, and nothing else changes.

### 1.5 Project configuration

A `crypte.config.ts` file at the root:

```ts
import { defineConfig } from '@crypte/cli'
import react from '@crypte/react'
import controls from '@crypte/controls'
import { ThemeProvider } from './src/lib/theme'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles/app.css',
  adapter: react(),
  wrap: ThemeProvider,
  plugins: [controls()],
  vite: { plugins: [] },
})
```

| Key | Role | Required |
| --- | --- | --- |
| `stories` | root of the story files | yes |
| `adapter` | framework adapter | yes |
| `css` | style sheet loaded in the preview | no |
| `wrap` | global wrapper, applied to every story | no |
| `plugins` | Crypte plugins to enable | no |
| `vite` | Vite plugins the project declares | no |

Two keys are required, and an error names the one that is missing.

`vite.plugins` exists for the cases where a framework needs an extra transform, such as Nuxt auto-imports. The project declares it. Crypte never guesses it.

**Path aliases are read on their own**, from `compilerOptions.paths`. Nothing is declared in `crypte.config.ts`.

- `tsconfig.json` is read first, then `jsconfig.json`. The first file that declares paths wins.
- `extends` is followed, and each level is read where it is written, so a path stays relative to the file that declares it.
- A missing `extends` target is common, for example `./.nuxt/tsconfig.json` before `nuxt prepare`. Crypte warns and carries on. Aliases are an improvement, not a condition to start.
- Every file it looked at is watched, including one with no paths. Adding paths to it must trigger a reload.

Path aliases apply to JavaScript and TypeScript alike. They do not apply inside style sheets: an `@import '@/vars.css'` does not resolve today.

---

## 2. Story format

### 2.1 The shape

```ts
import { defineStories, story } from '@crypte/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import OrderSummary from '@/components/checkout/OrderSummary'

export default defineStories(OrderSummary, {
  wrap: TooltipProvider,
  props: {
    bannerLabel: 'Your order is confirmed',
    title: 'Full plan and two modules',
    benefits: ['Full history', 'Verified data', 'Claims'],
  },
  stories: {
    'Default': {},
    'With reference': { reference: 'REF-4821-KD' },
    'From a listing': { sourceLabel: 'marketplace.example.com/l/123' },
  },
})
```

The component comes first. Every type is inferred from it: no type alias, no `satisfies`, no type import.

### 2.2 The smallest case

When every prop is optional:

```ts
export default defineStories(Badge)
```

A single story named `Default` is generated. Otherwise:

```ts
export default defineStories(Badge, {
  stories: { 'Default': { children: 'New' } },
})
```

### 2.3 Signature

```ts
function defineStories<C>(
  component: C,
  definition?: StoryDefinition<PropsOf<C>, AnyComponent>,
): StoryModule<C>
```

`AnyComponent`, `PropsOf` and `StoryModule` belong to the adapter, not to the core. `AnyComponent` is the framework's component type, and it must not be the type of the story's own component: a wrapper has no reason to accept its props, and `wrap: TooltipProvider` would stop compiling on `defineStories(Badge, …)`.

```ts
interface StoryDefinition<P, C> {
  props?: Partial<P>
  stories?: Record<string, Partial<P> | Story<P>>
  wrap?: Wrap<C>
  details?: Partial<Record<keyof P, PropDetails>>
  meta?: StoryMeta
}
```

**`props`** carries what every story shares. Each story then declares only what differs. The merge is shallow, prop by prop.

One consequence to know: two mutually exclusive props need an explicit reset. On `ProgressLoader`, a story that moves from `itemLabel` to `criteria` writes `itemLabel: null`. That is what a shallow merge does, and making it smarter would add magic.

**Story keys are free strings.** Accents, spaces and capitals are allowed. What you write is what you see.

Props can hold any JavaScript value, functions and elements included. **The preview imports the story module directly**, so nothing here is ever serialised. See section 4.1.

### 2.4 The `story()` helper

A story sometimes needs options next to its props: a forced width, an interaction, a plugin setting. The helper keeps them apart.

```ts
story(props, options)
```

```ts
'Collapsed on mobile': story({ reference: 'REF-4821' }, { responsive: 'mobile' }),
```

```ts
interface Story<P> {
  props: Partial<P>
  options?: StoryOptions
}
```

The second argument is typed by the plugins you have installed, which is what gives autocompletion. **With no plugin installed, no option key is accepted at all**, so the example above needs the plugin that declares `responsive`. The common case has no options and never uses this helper.

The same thing can be written by hand, since the union accepts either shape:

```ts
'Collapsed on mobile': { props: { reference: 'REF-4821' }, options: { responsive: 'mobile' } },
```

**The two shapes are told apart by their keys**, which is the only thing that separates them: an object declaring `props`, and at most `options`, is a `Story`. A component whose props are exactly `props`, or `props` and `options`, is therefore read the wrong way. Renaming one of them is the way out, and no other reading is possible without running the file.

### 2.5 `wrap`

`wrap` rebuilds the context an isolated component is missing. **It stacks components, and nothing else.** Three shapes:

```ts
wrap: TooltipProvider
wrap: [ThemeProvider, TooltipProvider]
wrap: [[ThemeProvider, { mode: 'dark' }], TooltipProvider]
```

```ts
type Wrap<C> = C | readonly WrapEntry<C>[]
type WrapEntry<C> = C | readonly [C, Record<string, unknown>]
```

In the array shape, **the first entry is the outermost**.

All three are declarative, so they are portable: a Vue adapter reads them without a single character changing in the file.

**There is no function shape.** In React a component *is* a function, so `wrap: TooltipProvider` and `wrap: (story) => …` would be the same type, and the adapter could not tell whether to instantiate what it gets or hand it an element that is already rendered. A computed value goes through props, where it is evaluated when the story file loads:

```ts
wrap: [[Foo, { bar: compute() }]]
```

Wrapping a bit of markup therefore needs a component rather than an anonymous function. That is one extra line, and every adapter can read it.

**Any function passed to `wrap` is instantiated as a component.** Types cannot enforce this, since a React component is itself a function. It is a rule, and it makes the adapter predictable: writing `wrap: (story) => …` and expecting the rendered element gives a wrong render, not an ambiguity.

The global `wrap` from `crypte.config.ts` wraps the file's `wrap`, which wraps the component.

`wrap` nests, and does nothing else. Anything about lifecycle or watching props goes through a plugin's `preview` hooks, in section 6.

### 2.6 `meta`

Component metadata, meant for design-system use:

```ts
interface StoryMeta {
  status?: 'draft' | 'stable' | 'deprecated'
  owner?: string
  figma?: string
  description?: string
}
```

`status` drives a badge in the sidebar and filtering. `owner` is displayed, and will later route comments. `figma` is a link in the docs panel. `description` completes the component's JSDoc.

Every field is optional. The core reads none of them: they travel to the manifest and plugins consume them.

### 2.7 Controlled components

A controlled component, `selected` with `onSelect` or `value` with `onChange`, is not interactive in a story. Nobody holds the state.

**That is the intended behaviour, not a limit to work around.** A design-system workshop documents states, not journeys. `Selected` and `Unselected` are two stories, each with its own visual baseline, each reachable by a link. Interactivity belongs to the `interactions` plugin, which plays a scenario.

Testing the format on five real components produced no case where this answer was not enough. If one appears, it will be handled then. See section 7.

---

## 3. Prop details

### 3.1 Two sources

1. **Inference at build time.** The CLI reads the TypeScript props interface and the JSDoc next to it. On a well typed component this is enough almost every time.
2. **Explicit declaration.** The `details` field of a story file.

### 3.2 Merge rule

**Details merge per prop, and field by field.** An explicit declaration replaces only the fields it names. Every other field still comes from inference.

```ts
details: {
  price: { min: 0, max: 500, step: 10 },
}
```

Here `price` keeps the type, the JSDoc description, the required flag and the default value that inference found. Only the bounds are added.

The field is called `details` because it **completes**: you write what inference could not find, never the whole description of a prop.

### 3.3 The shape of a prop's details

```ts
type PropKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'object'
  | 'array'
  | 'function'
  | 'node'
  | 'unknown'

// what you write in `details`
interface PropDetails extends PluginPropDetails {
  type?: PropKind
  required?: boolean
  default?: unknown
  description?: string
  options?: unknown[]
}

// what the manifest carries, once inference has run
interface ResolvedPropDetails extends PropDetails {
  type: PropKind
  required: boolean
}
```

There is no `name` field: `details` is keyed by prop name, so a name inside the value would repeat the key.

**The core describes only what holds without any plugin:** what a prop is, whether it is required, its default, its description, its possible values. All of that serves documentation, which exists with no plugin installed.

`PluginPropDetails` is an empty extension point. A plugin adds its own fields from its own package, through module augmentation, and no line of the core changes:

```ts
interface PluginPropDetails {}
```

```ts
declare module '@crypte/core/protocol' {
  interface PluginPropDetails {
    min?: number
    max?: number
    step?: number
    control?: ControlSpec | false // ControlSpec belongs to the plugin, not to the core
  }
}
```

Slider bounds and the `control` setting, which removes a prop from the editing panel without removing it from the documentation, belong to the `controls` plugin. **They mean nothing without it**, so the core does not know them. With the plugin absent, writing them is a compile error, which is what we want: nobody would read them.

**An empty extension point is not enough to get that refusal.** TypeScript does not report excess properties against a type that has no property at all, so any object satisfies an empty interface. `PropDetails` escapes this because it inherits core fields and is therefore never empty. `StoryOptions`, made of nothing but the extension point, has to ask for it:

```ts
interface PluginStoryOptions {}

type StoryOptions = [keyof PluginStoryOptions] extends [never]
  ? Record<string, never>
  : PluginStoryOptions
```

No key is accepted while the extension point is empty, and the usual excess-property check comes back as soon as a plugin fills it.

When inference fails, on a project with no `tsconfig` or on a type too complex to read, the kind falls back to `unknown` and the prop stays documented. **A failed inference must never stop a story from rendering.**

### 3.4 Pass-through DOM props

A component typed `React.ComponentProps<"span">` or similar inherits several hundred DOM attributes. Every shadcn component does.

**Rule: those props are not extracted.** Only `className` is, because it is used everywhere. The platform documents the rest, and nobody reads them in a props table.

One rule, no extra field, and no collapsible group in the shell.

### 3.5 Known limits of inference

Some shapes cannot be resolved by reading syntax alone, and fall back to an explicit declaration.

The common one is CVA: `VariantProps<typeof badgeVariants>` is derived from a function call at runtime. Resolving it would need a full type checker, which Oxc is not. Those options go in `details.options`.

---

## 4. Manifest

### 4.1 Role

Written by the CLI, read by the shell.

**The manifest is not what renders.** The preview imports story modules directly, since they belong to its own Vite bundle. It therefore holds the real props, functions and elements included, and none of that crosses the channel.

The manifest feeds the shell: navigation tree, search, props table, controls panel. It holds serialisable data only. A prop that cannot be serialised is not in it; `details` is enough to say that it exists and what it is.

**What the reader set aside travels with it.** A story file is read without being run, so what cannot be read without running it is set aside and said, never guessed. Both halves of that rule are in the manifest:

- `skipped` names a **file**, once per reason, when the file gave no story or gave only part of them. It is a file and not an entry because a story that was set aside has no entry to hang a message on. A reader that wants the count compares `file` with the `storyFile` of the entries: the two are the same project-relative path.

  It holds only what is **certain to be a story**: a `defineStories` call no default export carries, a file that does not parse, and a file that produced stories and produces none any more. A file that gave no story without naming `defineStories` is a helper, a wrapper or a type file as far as anybody can tell, so the CLI names it in its own output and the manifest leaves it out. Reading intent from the shape of the default export was measured to have a counterexample per branch.
- `partial` names one **entry** whose record is incomplete: the story is there and renders, but a spread or a computed key kept props out of its table. Its text quotes what the file wrote, since the missing names are precisely what cannot be read.

Both are optional, so a manifest written before them stays valid and the version does not move.

Neither is ever fatal. A file being written must not cost the catalogue, and half a story is worth more than an empty screen.

### 4.2 Typed entries

```ts
interface Manifest {
  version: number
  entries: ManifestEntry[]
  skipped?: SkippedFile[]
}

interface SkippedFile {
  file: string
  reason: string
}

type ManifestEntry = StoryEntry | TokensEntry

interface StoryEntry {
  type: 'story'
  id: string
  path: string[]
  name: string
  component: ComponentRef
  storyFile: string
  options: Record<string, unknown>
  details: Record<string, ResolvedPropDetails>
  props: string[]
  source: string
  meta?: StoryMeta
  partial?: string
}

interface ComponentRef {
  name: string
  file: string
  export: string
}

interface TokensEntry {
  type: 'tokens'
  id: string
  path: string[]
  name: string
  tokens: Record<string, TokenValue>
}

interface TokenValue {
  type: TokenKind
  description?: string
  themes: Record<string, TokenInTheme>
}

interface TokenInTheme {
  value: string
  alias?: string[]
}

type TokenKind = 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'number' | 'unknown'

const MANIFEST_VERSION = 1
```

`version` is a plain number rather than the literal type of `MANIFEST_VERSION`. Its job is to spot a manifest written by another version, and a frozen type would make that comparison impossible.

Every entry carries a `type`. **Two values are implemented: `"story"` and `"tokens"`.** `"page"` is reserved for design-system work and must not be implemented now. The reserve costs one field today and saves a migration later.

**`MANIFEST_VERSION` does not move when a nature is added.** The reserved `type` field is precisely what that reserve was for, and nothing required moved on `StoryEntry`, so a reader that only knows stories skips what it does not recognise instead of failing. The rule that does force a bump, adding a required field once a version that writes manifests is published, is in `docs/internal/suivi.md`.

`props` and `source` are read from the story file, not declared in it. `props` lists the names the story passes to the component, from the shared block and its own, sorted, with no value attached: a prop set to a function is still a prop the story exercises, and prop coverage counts it. `source` rebuilds the call from the text the user wrote, so an expression the CLI cannot evaluate still reads the way they typed it.

**A prop spread with `...` is in neither field**, and neither is a key computed at runtime. Their names cannot be read without running the file, and guessing them would put wrong names in a coverage figure.

**A story key computed at runtime produces no entry at all.** A story name is a URL, a baseline key and the anchor of a comment, so a wrong one costs more than a missing one. The CLI reports what it dropped.

**A tokens entry is a family, not one token.** `path` and `name` place it in the tree the same way a story's do, and `tokens` is keyed by token name, so the value carries no `name` of its own. That is the same shape as `details` inside a story entry, and it is what keeps a catalogue of three hundred tokens from becoming three hundred entries.

**Every token is read per theme.** A single-theme project holds one key. Storing one value and adding themes later would change the shape of every token, which is a break; a project with one theme costs one extra key today.

**`themes` holds at least one key, and that is the producer's guarantee rather than the type's.** A `Record` cannot be typed non-empty without making it painful to build, so this is the same arrangement as serialisation in 4.5: the type says what the shape is, and whoever writes the manifest is answerable for the rest. An empty `alias` is out for the same reason, since a chain that led nowhere is what an absent `alias` already says.

**`value` is always the literal, and `alias` is the chain that led to it.** A real token points at another token, sometimes through several hops. Whoever draws a swatch reads `value` alone and never resolves anything; whoever explains a token walks `alias`, ordered from the token towards the literal. A token that holds a literal itself has no `alias`.

**The core carries the shape, a plugin carries the reading.** No file format is part of this contract: CSS variables, DTCG, Tailwind and everything after them live in `@crypte/tokens`. Same split as props, where the core defines `ResolvedPropDetails` and `@crypte/docs` only draws a table from it.

```json
{
  "version": 1,
  "entries": [
    {
      "type": "story",
      "id": "checkout/ordersummary--with-reference",
      "path": ["checkout", "OrderSummary"],
      "name": "With reference",
      "component": {
        "name": "OrderSummary",
        "file": "src/components/checkout/OrderSummary.tsx",
        "export": "default"
      },
      "storyFile": "stories/checkout/OrderSummary.ts",
      "options": {},
      "details": {},
      "props": ["benefits", "reference", "title"],
      "source": "<OrderSummary title=\"Full plan\" benefits={['Full history']} reference=\"REF-4821\" />",
      "meta": { "status": "stable" }
    },
    {
      "type": "tokens",
      "id": "color--brand",
      "path": ["Color"],
      "name": "Brand",
      "tokens": {
        "primary": {
          "type": "color",
          "themes": {
            "light": { "value": "#4fe0a0" },
            "dark": { "value": "#1f5fd6" }
          }
        },
        "button-background": {
          "type": "color",
          "description": "Filled buttons only.",
          "themes": {
            "light": { "value": "#4fe0a0", "alias": ["color-brand-primary"] },
            "dark": { "value": "#1f5fd6", "alias": ["color-brand-primary"] }
          }
        }
      }
    }
  ]
}
```

### 4.3 Stable identifiers

```ts
function normalizeSegment(value: string): string
function storyId(path: readonly string[], name: string): string
```

`normalizeSegment` lowercases its input, drops latin accents, then **replaces** every run of characters that is not a letter, a digit or a mark with a single `-`. Leading and trailing dashes are removed. So `With reference` gives `with-reference`, not `withreference`.

`storyId` normalises each path segment, drops the empty ones, joins them with `/`, and joins that prefix to the normalised name with `--`. When one of the two sides is empty, the separator is dropped with it: a story at the root gives just its name.

**Marks are kept**, and that is what separates `Всё` from `Все`: the same signs that carry a latin accent build whole letters elsewhere. Removing accents only on a latin base is the rule, not an implementation detail.

**The result is not ASCII.** Non-latin scripts are kept, otherwise two distinct Russian or Japanese stories would collapse onto one identifier: `storyId(['Button'], 'Активная')` gives `button--активная`. Whoever puts it in a URL must encode it, and whoever makes it a baseline filename must check that the file system accepts it. The result is composed in NFC, so two identifiers that look the same are the same byte for byte.

**This is stable data, not an implementation detail.** It is a URL, a baseline key for `visual-tests`, and the anchor of a comment. Renaming a story changes its `id` and breaks its baseline. That is accepted, and it must be documented to the user rather than worked around.

### 4.4 Fields carried without reading them

`meta`, `options` and `details` travel from the story file to the manifest untouched. The core does not interpret them; plugins do. A plugin can therefore add its own keys to `options` with no change to the core.

### 4.5 Serialisation

The manifest is written as JSON and read back as is. **Everything it holds must survive that round trip**: no function, no class instance, no `Date`, no `undefined` as a value.

Types do not enforce this. `default`, `options`, and the contents of an entry's `options`, are typed `unknown`, because nothing can know in advance what a component or a plugin puts there. A function would compile, then vanish on write with no error at all, since `JSON.stringify` drops silently what it cannot represent.

**So the CLI has to guarantee what it writes**, by leaving out or rewriting whatever is not serialisable. The likely case is a prop whose default value is a callback.

### 4.6 Two files, and which one is the truth

The CLI writes two files side by side in `.crypte/`.

| File | Committed | Role |
| --- | --- | --- |
| `manifest.json` | no | what the shell reads |
| `fingerprint.json` | yes | what a build produced, kept in the repository's history |

**The manifest is the truth.** It is regenerated from the story files on every build, so when the two disagree it is the fingerprint that is out of date, never the other way round.

The fingerprint is not a smaller manifest and nothing reads it to render. It exists so that Git holds the history of a catalogue: per **story** entry, the identifier, the component as `file#export`, the status, the sorted prop names, and one digest folding everything else. That is enough to say what changed between two versions, and small enough to commit on every build. The reasoning and the measurements are in [`decisions.md`](decisions.md).

**Story entries only, and that is a boundary rather than an oversight.** Every field above is a story's: a component reference, a status, prop names. A `tokens` family changing therefore leaves the committed fingerprint untouched, so this file answers "what changed in the component catalogue", not "what changed in the manifest". Whether a token set deserves its own committed history is a separate question, `decisions.md` predating it by ten days, and the first producer is what will settle it.

**A missing or stale fingerprint is never fatal to a build.** It is a record, so the build writes it and moves on. Telling a project that its record is behind is the job of `crypte check`.

---

## 5. Channel protocol

### 5.1 Principle

The shell and the preview talk through `postMessage` only, with JSON-serialisable messages. **The shell structurally cannot reach React, Vue, or the component instance.**

That constraint is what keeps the core framework-neutral. One exception here would undo the whole architecture.

```ts
const PROTOCOL_VERSION = 1
type Overrides = Record<string, unknown>
```

The preview announces `PROTOCOL_VERSION` in its `ready` message. It is separate from `MANIFEST_VERSION`: the catalogue format and the message format move on their own.

**It is 1, and the work that wrote this chapter is that version 1.** The counter moves at the first breaking change *after* publication, when a preview and a shell of different versions can actually meet.

The channel never carries a story's props. It carries the id of the entry to render, and the **overrides** coming from controls. An override is always a primitive edited in a panel, so it is always serialisable.

Each direction has its own type: `ShellMessage` goes to the iframe, `PreviewMessage` comes back.

### 5.2 Shell to preview

```ts
type ShellMessage =
  | { type: 'render'; id: string; overrides: Overrides }
  | { type: 'update-overrides'; id: string; overrides: Overrides }
  | { type: 'set-globals'; globals: Record<string, unknown> }
  | MessagesOf<PluginShellMessages>
```

`render` mounts the entry that was asked for. `update-overrides` updates it without remounting. `set-globals` applies global settings such as a theme or a locale.

**Only `render` has an effect today.** The other two are received and ignored. See section 8.

### 5.3 Preview to shell

```ts
type PreviewMessage =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'rendered'; id: string; durationMs: number }
  | { type: 'error'; id: string; message: string; stack?: string }
  | MessagesOf<PluginPreviewMessages>
```

`ready` says the preview is up. `rendered` reports a finished render and how long it took. `error` reports a render that threw, and the shell shows it without falling over.

### 5.4 Rules

- Every payload must survive a JSON round trip. No function, no class instance, no DOM node. `postMessage` enforces this by cloning: a function throws at send time.
- Both sides send to an exact origin, never `'*'`, and both drop a message that comes from another origin or another window.
- A render error comes back as `error` and must never take the shell down.
- A plugin declares its messages from its own package, the same way it declares options and prop details:

```ts
interface PluginShellMessages {}
interface PluginPreviewMessages {}
```

```ts
declare module '@crypte/core/protocol' {
  interface PluginShellMessages {
    controls: PluginMessage<{ type: 'controls:open'; open: boolean }>
  }
}
```

While no plugin has declared anything, the union does not grow, and writing an unknown message is a compile error.

```ts
type PluginMessage<T extends { type: LiteralOnly<T['type']> }> = T
```

`PluginMessage` puts the constraint on its parameter, so a malformed message fails **on the line where it is declared**, with the reason in plain text. Two gaps remain: a plugin is free not to use it, and `skipLibCheck`, which is widespread, hides errors coming from a `.d.ts`. The protocol therefore filters on its own side: a value whose `type` field is missing or is not a literal is dropped from the union instead of joining it. Otherwise it would stop `message.type` from discriminating anything at all for the consumer.

---

## 6. Plugin contract

> **Provisional.** This section is the only one that is not frozen. See 6.4.

### 6.1 Shape

A plugin is an object with a name and three optional surfaces.

```ts
interface CryptePlugin {
  name: string
  ui?: UIContribution
  preview?: PreviewHooks
  node?: NodeHooks
}
```

| Surface | Runs in | Role |
| --- | --- | --- |
| `ui` | shell | panel, toolbar button |
| `preview` | iframe | lifecycle around a render |
| `node` | CLI | build step, command |

`NodeHooks` is specified in 6.3. `UIContribution` is not: it is written with the first plugin that draws a panel, tracked in DCJ-194, and until then the core declares it opaque, the way it declares an adapter opaque.

**`PreviewHooks` is specified in 6.2 and the core declares it opaque too.** The shapes below are what it will be; no preview calls them yet, and nothing would be gained by typing a surface with no caller. Section 8 carries that gap.

### 6.2 The golden rule

**A `preview` hook never touches framework internals.** It gets lifecycle events and access to the iframe DOM, never a React tree or a Vue instance.

```ts
interface PreviewHooks {
  beforeMount?(ctx: PreviewContext): void
  afterMount?(ctx: PreviewContext): void
  onPropsChange?(ctx: PreviewContext): void
  beforeUnmount?(ctx: PreviewContext): void
}

interface PreviewContext {
  id: string
  props: Record<string, unknown>
  options: Record<string, unknown>
  root: HTMLElement
  send(payload: unknown): void
}
```

Without this rule every plugin would be rewritten for every framework, which would cancel the whole point of the architecture.

Anything that needs a framework context, such as `ThemeProvider` or `QueryClientProvider`, belongs to `wrap`, not to a plugin.

### 6.3 `node` contributes entries to the manifest

One capability, because one use demands it: a plugin adds entries the CLI could not have read from a story file. `@crypte/tokens` is what proves it.

```ts
interface NodeHooks {
  entries?: (ctx: NodeContext) => ContributedEntry[]
}

interface NodeContext {
  root: string
}

type ContributedEntry = Exclude<ManifestEntry, StoryEntry>
```

**A hook is a plain function, not a method.** Its context arrives as an argument, so it never reads `this`.

**Stories are excluded from what a plugin may contribute.** They come from story files, and a plugin injecting one would bypass discovery and the reporting that goes with it. `Exclude` rather than a list of natures, so a nature added to the manifest widens this on its own.

**The context carries the project root and nothing else.** The producer runs before any server exists, so there is no Vite resolution to hand over: no plugin, no `exports` field, the same limit 8 records for `component.file`. A plugin's own settings come from its factory, not from here.

**Hooks are synchronous.** Everything the CLI reads today it reads synchronously, and the catalogue is rebuilt from a watcher callback where two overlapping rebuilds would be a new race. A plugin reads its files the way the story reader reads story files.

**They run in the order `plugins` declares them**, and after the stories. Nothing carries an `order` field, which every plugin would set to zero. Being last means a contribution that lands on an identifier a story already owns is the one that gives way: a story comes from the author's own file, a contributed entry does not.

**Nothing here is fatal, and nothing here is silent.** A hook that throws, that returns something other than entries, that lands on a taken identifier, or that produces a value which would not survive JSON, has that contribution refused with its reason. The catalogue keeps everything it already read, and the CLI says what it refused and which plugin it came from. A plugin is not the author's text, so it must not be able to stop a dev server.

**This is where 4.5 stops being free.** Everything else the CLI writes is read from source text and serialisable by construction. An entry built by a plugin is the first input that is not, so the CLI checks it and names what offends rather than letting `JSON.stringify` drop a function without a word.

### 6.4 `ctx.props` can be changed before mount

Inside `beforeMount`, a plugin may change `ctx.props`. That is the only moment props are mutable; everywhere else the context is read-only.

This exists for one demonstrated case: a function prop the story author did not declare. `PricingCard` expects `onSelect`, the story omits it, the component gets `undefined` and breaks on the first click. The `actions` plugin fills those props with logging functions inside `beforeMount`, using `details` to know which ones are functions.

The core knows nothing about this. With the `actions` plugin absent, the author declares the function themselves.

### 6.5 How this contract becomes stable

The contract counts as stable only once **two plugins with opposite needs** have used it:

- `controls`, which writes into the story.
- `a11y`, which only reads it.

Until both exist, this section changes without procedure. After that, any change is a break.

---

## 7. Out of scope

Left out on purpose. Some belong to a project brief, others wait for a demonstrated need.

**Belongs to a project brief:**

- How the sidebar, the search and the panels look and behave.
- Caching and start-up work.
- The storage format of `visual-tests` baselines.
- Reading CVA options automatically, in the `docs` plugin.
- A write API for `crypte serve`, such as comments or editing. Postponed.

**Out of reserve since 21 August 2026, and now planned:**

- The `tokens` entry. The type belongs to the protocol, the reading belongs to `@crypte/tokens`: the line is producing data against displaying it, the same one prop extraction already follows. It is also the first plugin that writes to the manifest, so it is what exercises `NodeHooks` before that contract is frozen. Tracked in DCJ-232 and DCJ-233.
- The `page` entry, **in two stages**. Stage one is markdown files in the repository, discovered the way stories are and rendered next to components, with no server at all. Stage two is the same files edited by designers and returned as a pull request, which needs `crypte serve`. Confusing the two is what made `page` look expensive and far away. Tracked in DCJ-250, DCJ-251 and DCJ-257.

The field carrying both already exists, so neither is a manifest break. The reason they left reserve is not internal: the documentation tools this project is measured against all ship a token manager, and all sell guidelines as the thing neither Figma nor a component workshop exposes.

**Held in reserve, to add when a real case asks for it:**

- A `render` escape hatch on a story, to make a controlled component truly interactive. Left out of v1 for lack of a demonstrated case, see 2.7. Adding it later breaks nothing; shipping it now would create a use we could not take back.
- Documenting pass-through DOM attributes, see 3.4.
- Path aliases inside style sheets, see 1.5.

---

## 8. What is built today

This document is a contract. This section is the only place that says what exists, so that a reader never has to guess.

| Section | State |
| --- | --- |
| 1.1, story files | discovered and read, in the four extensions. The tree, the identifiers and the call code come out of them |
| 1.5, project configuration | the config is read, and the declared style sheet is loaded by the preview |
| 1.5, path aliases | built |
| 2 and 3, the types | built, and `defineStories` and `story` with them. Inference is not: `details` is still written empty |
| 4, the manifest | built, and written by `crypte dev` at start-up and on every restart of the configuration. A story file added or broken changes what is served without rewriting the file. Of the two natures of entry it can carry, only `story` is produced |
| 4.6, the fingerprint | built, and written by `crypte dev` at start-up only: it is committed, so a restart leaves the working tree alone |
| 5, the channel | built and exercised on both sides |
| 6, plugin contract | the `node` surface is built and called by the producer. `ui` and `preview` are named and declared opaque. Provisional throughout |

**`crypte dev` is built, `crypte check` is not.** The dev server reads the project, writes both files, and serves two pages: the shell prebuilt inside the CLI, and a preview compiled by the project's own Vite. A story renders, switching story works, and a story that throws shows its error instead of an empty frame.

Seven known gaps between this document and the code:

- `update-overrides` and `set-globals` are part of the protocol and have no effect yet. The preview drops them.
- A path alias cannot replace an installed package. `"vue": ["shims/vue.js"]` has no effect while `vue` is installed, because the resolver runs after Vite's own. TypeScript would return the replacement file.
- `details` is written empty. Section 4.4 says it travels from the story file untouched, but the manifest carries the **resolved** form, whose `type` and `required` come from an adapter's inference and not from what the author wrote. `meta` and `options` do travel today.
- **`UIContribution` and `PreviewHooks` are declared opaque by the core**, though 6.2 specifies the second one in full. Neither has a caller: no shell panel comes from a plugin, and no preview runs a lifecycle hook. Typing a surface nobody calls would buy nothing and could not be taken back.
- The serialisation of 4.5 is guaranteed on **contributed** entries and merely true of the others. A plugin's entry is checked and refused with what offends named; everything the CLI reads itself comes from source text and is serialisable by construction, so nothing exercises the guarantee there.
- **A `tokens` entry can now be contributed and no plugin contributes one.** 4.2 describes `TokensEntry`, 6.3 describes the hook that carries it, and the producer calls that hook: what is missing is a plugin. Two readers skip such an entry because skipping is what they should do, the preview which renders one nature and the shell which keeps out of the tree what it cannot draw. The fingerprint skips it too, and 4.6 says why that is its scope. `@crypte/tokens` is what will write the first entry.
- `component.file` is resolved without Vite. The producer runs before any server exists, so it applies the project's `paths` and tries the usual extensions, with no plugin and no `exports` field. A component reached through a plugin keeps the identifier the story wrote.

---

## 9. Version log

**v1.3.** The `node` surface of a plugin, which is what a manifest entry coming from anywhere but a story file needs.

| Before | After |
| --- | --- |
| `CryptePlugin` was described here and `unknown` in the code | it is a real type in the protocol, and the CLI re-exports it rather than redeclaring it |
| `NodeHooks` was named and never specified | 6.3 specifies it: one hook, contributing entries, synchronous, plain functions |
| nothing said what a plugin could not contribute | stories, since they come from story files and a plugin injecting one would bypass discovery |
| nothing said what happened when a plugin misbehaved | nothing is fatal and nothing is silent: the contribution is refused with its reason, named by plugin |
| 4.5 was a promise nothing exercised | it is enforced on the one input that is not serialisable by construction |

**v1.2.** A second entry nature, `tokens`, which is what makes `ManifestEntry` a union rather than an alias.

| Before | After |
| --- | --- |
| `"tokens"` was a reserved `type` nobody could write | `TokensEntry` is specified, and one entry carries a family rather than a single token |
| nothing said whether a token had one value or several | `themes` is required, so a single-theme project holds one key instead of a second shape existing |
| nothing said what an alias was | `value` is always the literal and `alias` is the chain that led to it, so a swatch resolves nothing |
| every reader took `entry.storyFile` off any entry | they narrow on `type` first, the preview's generated module included, and `MANIFEST_VERSION` stays at 1 because the reserve was there for this |

**v1.1.** The manifest producer written, which is what turned three of these lines from a contract into a measurement.

| Before | After |
| --- | --- |
| stories were `.ts` or `.tsx` | four extensions, so a project with no TypeScript writes its stories the way it writes its components |
| an entry said what the component's props were, never what a story set | `props` carries the names each story passes, and prop coverage has something to count |
| `source` was a field with an example and no rule | it is rebuilt from the text the author wrote, and section 4.2 says what a spread does to it |

**v1.0.** The whole document read against the code for the first time, once the protocol, the CLI configuration and the channel were built. Rewritten in English.

| Before | After |
| --- | --- |
| a plugin had "three optional fields" | it has a required `name` and three optional surfaces |
| `UIContribution` and `NodeHooks` were used and never defined | they are named as not specified yet, and section 6 says it is provisional |
| the story options example compiled anywhere | it needs the plugin that declares the option, and the text says so |
| aliases were "read from `tsconfig.json` or `jsconfig.json`" | the order, `extends`, the warning and the watch list are stated |
| `PropDetails.type` was an inline union | it is `PropKind`, named once and reused |
| interfaces were described in prose tables | they are code blocks, which a test can check field by field |
| nothing said what was built | section 8 does, and it is the only section that talks about the code |

`update-overrides` and `set-globals` stay in the protocol, and the preview still ignores them. The code is what is late here, not the document. Tracked in DCJ-214.

**v0.9 and earlier.** Nine versions, in French, in `docs/internal/spec-journal.md`. Each one carries the reasoning that led to it, which is why it was kept rather than translated.

| Version | Change |
| --- | --- |
| v0.9 | `wrap` stacks components only |
| v0.8 | chapter 5 stopped describing the `plugin` message it no longer had, `Manifest.version` back to `number` |
| v0.7 | three naming rules for the `protocol` folder, `PropDetails` and `ResolvedPropDetails`, and the `plugin` message replaced by the two extension points |
| v0.6 | `ready` announces `protocolVersion`, `StoryOptions` refuses unknown keys |
| v0.5 | the core no longer knows any plugin, `details` replaces `argTypes` |
| v0.4 | package naming, the bare `crypte` name being refused by npm |
| v0.3 | the `$fn` marker, the `group` field and the `render` escape hatch removed |
| v0.2 | six fixes from testing the format on five real components |
| v0.1 | first version, four contracts |
