# Crypte contracts

> Version 1.21, reference document. A project brief points here instead of restating these shapes.
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

**Three guiding rules.**

Crypte never reads a project's `vite.config`. It reads standard, framework-neutral formats, plus what the project declares to it.

This document does not try to cover every case. It covers what real use has shown, and lets the rest arrive through bug reports. A mechanism added just in case creates a use you can no longer take back; a mechanism added after a real need breaks nothing.

**What a project already writes is read, never declared a second time. Stories are the exception, and section 2 exists because of it.** Which state of a component is worth showing is a judgement no reading of the code produces: nobody can work out that the interesting case is the order without a reference. So stories are written by hand, and they are the only thing that is.

Everything else already exists somewhere in the project, and asking for it again would create a second source of truth that drifts from the first. Tokens are the case that shows it: they live in the style sheet, so there is no token format to learn and no token file to keep in step. The project says **where**, in one line it already had, and the reading is a plugin's business. Prop details, the call code, the component a story points at: same rule, all read.

That is also the difference this project is built on. The tools it is measured against hold a description of a design system that someone maintains by hand; this one holds what the code says, and goes stale only when the code does.

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

The command reports five problems:

- **Orphan story**: the component it points at is gone. Its path reads from the project root.
- **Unreadable story file**: a file meant as a story that gave none. It is a warning and never fails the command, since it can be a correct form the reader does not follow. While one exists, the components with no story are not listed, since nobody knows which one it covers. A file that gave part of its stories is not one.
- **Unreadable component file**: a component a story points at does not parse, named with the line and column of the error. Its props fall back to none, which moves the fingerprint, and `crypte dev` records that state. A warning, like the unreadable story file; the fingerprint decides the exit code.
- **Component with no story**: an exported component has no story. This one is a warning and never fails the command.
- **Stale fingerprint**: `.crypte/fingerprint.json` is missing, or differs from what the stories give today (4.6). It fails the command, so a CI running `crypte check` refuses a branch that did not update it.

The component-with-no-story check only looks at exports **identified as components**: a capitalised name that returns an element. Utility functions exported from a component file, such as `stepFromProgress` in `ProgressLoader.tsx`, are never reported. Nor is a component the project already declares as a frame, in the `wrap` of its configuration or of a story file (2.5): it is context, not a component missing its page.

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
| `@crypte/ui` | the components the shell, plugins and the site draw in common; Vue as its only peer, and nothing in the core or the CLI imports it | no, unless building on Crypte's look |

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

**Those plugins run in the CLI's Vite, not in the project's.** The project's `vite.config` is never read, and Vite itself is the CLI's dependency. A plugin written for another major of Vite still loads, and may warn or break: section 8 carries that gap.

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

**Rule: those props are not extracted.** The platform documents them, and nobody reads them in a props table.

**The criterion is being written by hand, and `className` is only its commonest case.** Inference sees syntax and not types, so `ComponentProps<'span'>` cannot be opened: making a name appear would be inventing one, which 4.2 forbids for `props` in as many words. What comes out is what the file names, so `function Tag({ className, onClick, ...rest }: ComponentProps<'span'>)` surfaces those two and nothing else, and a component taking `props` whole surfaces nothing at all.

`className` is nearly always there because a component that wants it has to name it to use it. A pass-through prop the file never names is documented by the platform, which is what the rule above says.

One rule, no extra field, and no collapsible group in the shell.

### 3.5 Known limits of inference

Some shapes cannot be resolved by reading syntax alone, and fall back to an explicit declaration.

CVA is read when the file holds it: for `VariantProps<typeof badgeVariants>`, written on the parameter, behind a local alias or in an interface's `extends`, with `const badgeVariants = cva(base, { variants })` in the same file, each variant becomes an `enum` whose options are its keys, and `defaultVariants` gives its default unless the component's own pattern writes one. A `badgeVariants` imported from another file, a variant keyed `true`/`false` (a boolean to CVA), or a numeric or computed key stays `unknown`, and its options go in `details.options`.

A component inside a wrapper is read through it: `memo(…)` and `forwardRef(…)`, bare or on any namespace, and `Object.assign(Root, { … })`, nested or around a name declared in the same file, including behind `export default`. `forwardRef<Ref, Props>` gives the props type when the parameter carries none. Any other call, `styled(…)` or a project's own `withTheme(…)`, gives no props: what it passes on cannot be read without running it.

In a generic component such as `Select<T>`, a prop typed `T` itself stays `unknown`, and one typed `T[]` is an `array` whose items say nothing: `T` is only known at each call site. Reopened if a plugin needs those props typed, which would take a type checker.

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
- `propsUnread` says why inference read nothing of an entry's **component**: its file could not be found or read, does not parse, does not declare the component in a form the reader follows, or types its props parameter with nothing it can follow. Absent, an empty `details` means a component with no props, which is the one thing it cannot tell apart otherwise. A component whose props are named by a destructuring but typed elsewhere is not unread: each such prop says `unknown` on its own. What the story file writes in `details` still completes it (3.2).

All three are optional, so a manifest written before them stays valid and the version does not move.

None is ever fatal. A file being written must not cost the catalogue, and half a story is worth more than an empty screen.

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
  propsUnread?: string
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

**`MANIFEST_VERSION` does not move when a nature is added.** The reserved `type` field is precisely what that reserve was for, and nothing required moved on `StoryEntry`, so a reader that only knows stories skips what it does not recognise instead of failing. The rule that does force a bump is adding a required field once a version that writes manifests is published.

**That rule is prose, and no test holds it.** A baseline exists — `manifest-shape.test.ts` pins the fixture's manifest field by field, so a field appearing, going or being renamed is seen there. What no case does is **tie that to the version**: it pins `version: 1` beside the rest and never relates the two.

Tying them is what cannot be done yet, and the reason is the rule's own condition. The rule asks for a bump once a published version writes manifests; nothing is published, so adding a required field is free, and a case demanding a bump would fail correct work.

The first publication is what turns it on. From then the published shape is the baseline, and a case can require that a required field appearing without `MANIFEST_VERSION` moving is a failure. Until then this paragraph is the guard, and it is a weak one.

`props` and `source` are read from the story file, not declared in it. `props` lists the names the story passes to the component, from the shared block and its own, sorted, with no value attached: a prop set to a function is still a prop the story exercises, and prop coverage counts it. `source` rebuilds the call from the text the user wrote, so an expression the CLI cannot evaluate still reads the way they typed it.

**`source` is meant to be copied**, so it must parse and render what the story renders. Two rules follow.

`children` goes between the tags rather than into an attribute: `<Badge>New</Badge>`, never `<Badge children="New" />`. Both render, only one is what anyone writes. An element goes as it was written, parentheses around it removed. A string goes bare **only when JSX gives the same string back**: not when it carries a brace, an angle bracket, an `&`, a line terminator, or edge whitespace, and not when it is empty. Everything else keeps its braces. The rule is one-way on purpose — a string refused is merely braced, which always renders right, where a string wrongly accepted is a snippet that lies.

An attribute answers the same question differently: a brace and an angle bracket are ordinary inside quotes, a double quote is not, and neither is an `&`, a line terminator, a backslash or a control character. A JSX attribute literal unescapes nothing, so a backslash written for JavaScript would arrive doubled. Those take braces too, and between the tags the same characters need no help since the text is emitted as it is.

With no `children`, the tag stays self-closing — and so it does when a spread may replace the value, since 4.2 forbids showing what the run does not have.

**A prop spread with `...` is in neither field**, and neither is a key computed at runtime. Their names cannot be read without running the file, and guessing them would put wrong names in a coverage figure.

**A story key computed at runtime produces no entry at all.** A story name is a URL, a baseline key and the anchor of a comment, so a wrong one costs more than a missing one. The CLI reports what it dropped.

**A tokens entry is a family, not one token.** `path` and `name` place it in the tree the same way a story's do, and `tokens` is keyed by token name, so the value carries no `name` of its own. That is the same shape as `details` inside a story entry, and it is what keeps a catalogue of three hundred tokens from becoming three hundred entries.

**Every token is read per theme.** A single-theme project holds one key. Storing one value and adding themes later would change the shape of every token, which is a break; a project with one theme costs one extra key today.

**A theme missing from a token means the source says nothing there**, not that the value is the default one. A token written only under a dark selector carries `dark` and no `default`, and a reader drawing the default theme has nothing to draw for it, which is the truth. Inventing a value would be worse than showing none.

**`themes` holds at least one key, and that is the producer's guarantee rather than the type's.** A `Record` cannot be typed non-empty without making it painful to build, so this is the same arrangement as serialisation in 4.5: the type says what the shape is, and whoever writes the manifest is answerable for the rest. An empty `alias` is out for the same reason, since a chain that led nowhere is what an absent `alias` already says.

**A value is always a string, whatever its kind.** A `number` token carries `"1.5"`, a `dimension` carries `"4px"`. The kind says how to read it; the field says what was written. Parsing on the reader's side is one line, and a union of string and number would put that choice in every reader instead.

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

**`id` is unique across the whole manifest, not per nature.** Since 4.2 carries more than one kind of entry, a story and a `tokens` entry share one namespace, and two entries never hold the same `id` whatever their `type`. One namespace rather than one per nature, because the `id` is a URL and an anchor: a reader that has to know the nature before it can resolve one has to be told the nature first, which no URL carries.

Who holds it, in the order collisions happen:

| Collision | What happens |
| --- | --- |
| two stories | the catalogue cannot be built. Neither can be made to give way: both come from the author's own files |
| a contribution on a story's `id` | the contribution is refused and said, named by plugin. 6.3 has the rule and why the story wins |
| a contribution on another contribution's `id` | the same refusal. First contributed, first kept |

**What the first row means depends on when it happens.** At start-up, `crypte dev` stops: there is no catalogue to fall back on. While the server runs, it keeps the last good one and says why, because two stories briefly sharing a name is an ordinary state halfway through a rename, and a server that stops on it is worse than a tree that waits. Neither is silent.

### 4.4 Fields carried without reading them

`meta` and `options` travel from the story file to the manifest untouched. The core does not interpret them; plugins do. A plugin can therefore add its own keys to `options` with no change to the core.

**`details` is the exception, and 3.2 is why.** What the file writes completes what inference read, per prop and field by field, so what reaches the manifest is the merge and not either half. The fields the core does not know, a plugin's `min` for one, still travel untouched through it.

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

The fingerprint is not a smaller manifest and nothing reads it to render. It exists so that Git holds the history of a catalogue: per **story** entry, the identifier, the component as `file#export`, the status, the sorted prop names, and one digest folding everything else. The digest reads `source` with its attributes sorted, so reordering props in a story file, which changes nothing rendered, leaves the fingerprint alone. That is enough to say what changed between two versions, and small enough to commit on every build. Measured on 500 stories: the full manifest is 706 KB raw and 83 KB gzipped, the fingerprint 131 KB and 9 KB, which is 268 bytes per story.

**Story entries only, and that is a boundary rather than an oversight.** Every field above is a story's: a component reference, a status, prop names. A `tokens` family changing therefore leaves the committed fingerprint untouched, so this file answers "what changed in the component catalogue", not "what changed in the manifest". Whether a token set deserves its own committed history is a separate question, and the first producer is what will settle it.

**A missing or stale fingerprint is never fatal to a build.** It is a record, so the build writes it and moves on. Telling a project that its record is behind is the job of `crypte check`, which fails on it (1.2). The two are compared as data, so reformatting the file is not a change.

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
  | MessagesOf<PluginShellMessages>
```

`render` mounts the entry that was asked for, with the shell's overrides applied on top of the story's props by 2.3's merge, shallow and prop by prop. A preview drops any message it does not know.

**`update-overrides` and `set-globals` were here and are now in reserve**, section 7. Neither had a consumer, and `render` already carries overrides: what the first added was updating them *without remounting*. **`controls` settled it: nothing is remounted.** Measured in a browser, the node the React adapter rendered survives an edit, since the adapter renders again on the root it keeps.

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

> **Provisional.** This section is the only one that is not frozen. See 6.5.

### 6.1 Shape

A plugin is an object with a name and three optional surfaces.

```ts
interface CryptePlugin {
  name: string
  shell?: string
  preview?: string
  node?: NodeHooks
}
```

| Surface | Runs in | Role |
| --- | --- | --- |
| `shell` | shell | panel, toolbar button |
| `preview` | iframe | lifecycle around a render |
| `node` | CLI | entries for the manifest, 6.3 |

**The object is built in Node, so a browser surface is a module, named by its file URL.** The plugin works the URL out itself, and the CLI serves the file to the page that runs it:

```ts
export default function controls(): CryptePlugin {
  return {
    name: 'controls',
    shell: new URL('./shell.mjs', import.meta.url).href,
    preview: new URL('./preview.mjs', import.meta.url).href,
  }
}
```

The shell module exports a `ShellContribution` by default, the preview module a `PreviewHooks`. The configuration itself never reaches the browser: running it there would carry the `node` surface along, and `node:fs` with it.

**A preview module goes through the project's Vite**, like a story file, so it imports what it needs. **A shell module is served as is, never compiled**, since the shell is prebuilt. Its one bare import is `vue`, which the shell provides through an import map, so every panel runs on the shell's own Vue. That Vue carries its template compiler: a module written by hand may use `template` rather than `h()`. A plugin declares `vue` as a peer dependency and keeps it out of its bundle: a panel running on a second copy never redraws its own state, and nothing warns.

**A surface that points nowhere is refused, with its reason**, the way 6.3 refuses a contribution: a pointer that is not a `file:` URL, or one that leads to no file. So are the browser surfaces of a plugin with no `name`, or with a name an earlier plugin already has: the shell keys a panel by its plugin's name. A module that throws on import costs nothing else. The shell names it, or a shell module whose default export is neither an object nor a function, and shows the other panels; the preview renders its stories and names the module in the frame's console.

**A `ShellContribution` is a Vue component, which the shell mounts in a frame**, one per plugin, in the order `plugins` declares them. It receives the story on display as its `entry` prop, a `StoryEntry` or `null`. A panel with nothing to say about that story emits `inapplicable` with its reason, and the frame folds to one line holding it: no empty panel, no greyed one.

```ts
import { watchEffect } from 'vue'

export default {
  props: ['entry'],
  emits: ['inapplicable'],
  setup(props, { emit }) {
    watchEffect(() => {
      if (!props.entry?.meta?.status) emit('inapplicable', 'no status declared')
    })
  },
  template: '<p>status: {{ entry?.meta?.status }}</p>',
}
```

**It is said story by story, never once.** The frame forgets it whenever it receives a new `entry`, another story or the same one read again after an edit, so a panel that does not say it again is open. A reason that is not a non-empty string is ignored.

**A panel that edits the story emits `overrides`**, the values to render it with, primitives only (5.1). The shell sends them in `render`, keeps them while that story stays on display, a preview that says `ready` again included, and drops them when another story is shown. `@crypte/controls` is the panel that does.

**Only the module is loaded.** A style sheet built beside it never reaches the page, so a panel styles itself inline.

**Whether a panel is open is the shell's to remember**, under the plugin's name, never the plugin's. A panel that throws shows the error in its frame, and is mounted again at its next `entry`.

`NodeHooks` is specified in 6.3. The core declares `ShellContribution` opaque, the way it declares an adapter opaque: it knows no Vue, and cannot name a component.

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
  css?: string
}

type ContributedEntry = Exclude<ManifestEntry, StoryEntry>

const CONTRIBUTABLE = ['tokens'] as const
```

**A hook is a plain function, not a method.** Its context arrives as an argument, so it never reads `this`.

**Stories are excluded from what a plugin may contribute.** They come from story files, and a plugin injecting one would bypass discovery and the reporting that goes with it.

**`CONTRIBUTABLE` is the same set at run time, and it is not a duplicate.** `ContributedEntry` holds at compile time, and a plugin is installed compiled: nothing in a published package stops it from handing over `type: 'story'`, which would then enter the manifest and, through the story readers, the committed fingerprint. The producer checks the shape of every entry it is handed before reading anything else from it: an object, a non-empty `id`, and a nature on this list.

**Adding a nature to the manifest means adding it here too.** `Exclude` widens on its own and the list does not, so the two are held together by a type test rather than by good intentions: `packages/core/test/plugin.test-d.ts` stops compiling when they diverge. Without it, a new nature compiled and was then refused at run time with « is not a nature a plugin may contribute ».

**The context carries what the project declared, and nothing a plugin could work out itself.** The root, and the style sheet of 1.5 when there is one: a plugin that reads CSS has no other way to know which file is meant, and guessing a path is what section 0 forbids. The producer runs before any server exists, so there is no Vite resolution to hand over: no plugin, no `exports` field, the same limit 8 records for `component.file`. A plugin's own settings come from its factory, not from here.

**Hooks are synchronous.** Everything the CLI reads today it reads synchronously, and the catalogue is rebuilt from a watcher callback where two overlapping rebuilds would be a new race. A plugin reads its files the way the story reader reads story files.

**They run in the order `plugins` declares them**, and after the stories. Nothing carries an `order` field, which every plugin would set to zero. Being last means a contribution that lands on an identifier a story already owns is the one that gives way: a story comes from the author's own file, a contributed entry does not.

**Nothing here is fatal, and nothing here is silent.** A hook that throws, that returns something other than entries, that hands over an entry which is not one, that lands on a taken identifier, or that produces a value which would not survive JSON, has that contribution refused with its reason. The catalogue keeps everything it already read, and the CLI says what it refused and which plugin it came from. A plugin is not the author's text, so it must not be able to stop a dev server.

**This is where 4.5 stops being free.** Everything else the CLI writes is read from source text and serialisable by construction. An entry built by a plugin is the first input that is not, so the CLI checks it rather than letting `JSON.stringify` drop a function without a word.

**Anything JSON would not give back as it was is refused**, named and located: a function, a `Date` or any non-plain value, `NaN` and the infinities which come back as `null`, an `undefined` value, and a genuine cycle. Two references to one object are not a cycle, and are kept.

**Refusing is a third answer, and 4.5 does not offer it.** Its two remedies, leaving out and rewriting, both assume the value is the CLI's to repair; a plugin's entry is not, and rewriting somebody else's data without a word is worse than refusing it. Dropping was tried here and taken back: **no nature a plugin may contribute has an optional property today**, held by a type test in `packages/core/test/plugin.test-d.ts`, so dropping a key whose value is `undefined` silently wrote an entry that no longer satisfied 4.2. A loud refusal naming the key costs the plugin author one line; a silent drop costs a reader a field that should have been there.

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
- A write API for `crypte serve`, such as comments or editing. Postponed.

**Out of reserve since 21 August 2026, and now planned:**

- The `tokens` entry. The type belongs to the protocol, the reading belongs to `@crypte/tokens`: the line is producing data against displaying it, the same one prop extraction already follows. It is also the first plugin that writes to the manifest, so it is what exercises `NodeHooks` before that contract is frozen. Tracked in DCJ-232 and DCJ-233.
- The `page` entry, **in two stages**. Stage one is markdown files in the repository, discovered the way stories are and rendered next to components, with no server at all. Stage two is the same files edited by designers and returned as a pull request, which needs `crypte serve`. Confusing the two is what made `page` look expensive and far away. Tracked in DCJ-250, DCJ-251 and DCJ-257.

The field carrying both already exists, so neither is a manifest break. The reason they left reserve is not internal: the documentation tools this project is measured against all ship a token manager, and all sell guidelines as the thing neither Figma nor a component workshop exposes.

**Held in reserve, to add when a real case asks for it:**

- `update-overrides`, which would change a mounted entry's props without remounting it. `render` already does, measured with `controls` (5.2). Reopened by an adapter that remounts on every `render`, or a component that loses its state across an edit.
- `set-globals`, which would apply a theme or a locale to the preview. No consumer, and no shape a case has demonstrated.
- A `render` escape hatch on a story, to make a controlled component truly interactive. Left out of v1 for lack of a demonstrated case, see 2.7. Adding it later breaks nothing; shipping it now would create a use we could not take back.
- Documenting pass-through DOM attributes, see 3.4.
- Path aliases inside style sheets, see 1.5.

---

## 8. What is built today

This document is a contract. This section is the only place that says what exists, so that a reader never has to guess.

| Section | State |
| --- | --- |
| 1.1, story files | discovered and read, in the four extensions. The tree, the identifiers and the call code come out of them |
| 1.2, `crypte check` | built, all five problems. The component with no story is looked for in the folders the stories already point at, since no components root is declared anywhere |
| 1.5, project configuration | the config is read, and the declared style sheet is loaded by the preview |
| 1.5, path aliases | built |
| 2 and 3, the types | built, and `defineStories` and `story` with them. Inference reads what a component file declares, and 3.2's merge completes it from the story file |
| 4, the manifest | built, and written by `crypte dev` at start-up, on every restart of the configuration and on every rebuild, so the file follows what is served. Of the two natures of entry it can carry, only `story` is produced |
| 4.6, the fingerprint | built, and written by `crypte dev` whenever the catalogue served changes it: at start-up, on a restart of the configuration, and on a story change. So `crypte check` does not fail after a session, and trying a `stories` path then reverting rewrites the same bytes |
| 5, the channel | built and exercised on both sides |
| 6, plugin contract | the `node` surface is built, called by the producer, and used by `@crypte/tokens`. The `shell` and `preview` modules are loaded, and the shell mounts each shell module in a frame that folds when the panel is `inapplicable` and remembers whether it is open. `@crypte/controls` edits a story's props through `overrides`, and the demonstration's `hello` and `status` plugins use the rest. **Provisional**: 6.5 asks for `controls` and `a11y`, and only the first exists |

**`dev`, `check` and `init` are built.** The dev server reads the project, writes both files, and serves two pages: the shell prebuilt inside the CLI, and a preview compiled in the project by the CLI's own Vite, with the plugins the project declares in `vite.plugins`. A story renders, switching story works, and a story that throws shows its error instead of an empty frame. `crypte init` writes the configuration of 1.5 into a project that already has its components, and has no section of its own because the file it writes is 1.5 itself.

Seven known gaps between this document and the code:

- **The preview is compiled by the CLI's Vite, and nothing checks the project's plugins against it.** A project on another major keeps its own Vite for its build, and its `vite.plugins` run in the CLI's anyway. Measured on a project on Vite 6: its React plugin warned about deprecated options and every story rendered. Resolving the project's own Vite instead would be a rework, not a fix.
- A path alias cannot replace an installed package. `"vue": ["shims/vue.js"]` has no effect while `vue` is installed, because the resolver runs after Vite's own. TypeScript would return the replacement file.
- **Inference reads what a file declares, never what a type it cannot resolve holds.** A type alias, an interface and a `cva(…)` call declared in the component file are followed. An imported type, a generic, a DOM part of an intersection, and an `extends` clause other than `VariantProps` of a local `cva` each leave only what the component file writes by hand, which for a DOM pass-through is the names in its destructuring pattern. Enumerating the rest needs the type checker, and inventing names is what 4.2 forbids.
- **`ShellContribution` and `PreviewHooks` are declared opaque by the core**, though 6.2 specifies the second one in full. The shell mounts a shell module's export as a component without checking more than that it is an object or a function, and no preview runs a lifecycle hook. Typing a surface before its first real consumer would buy nothing and could not be taken back.
- The serialisation of 4.5 is guaranteed on **contributed** entries and merely true of the others. A plugin's entry is checked and refused with what offends named; everything the CLI reads itself comes from source text and is serialisable by construction, so nothing exercises the guarantee there.
- **A `tokens` entry is written and nothing displays one.** `@crypte/tokens` contributes families read from a project's CSS custom properties, and the demonstration carries four. No screen shows them: the shell keeps out of its tree what it cannot draw, so they travel in the manifest and stop there. The page that draws them belongs to the shell's own project.
- `component.file` is resolved without Vite. The producer runs before any server exists, so it applies the project's `paths` and tries the usual extensions, with no plugin and no `exports` field. A component reached through a plugin keeps the identifier the story wrote. `crypte check` calls such an entry an orphan only when the project could have reached it itself, that is a relative path or an alias it declares; anything else it leaves alone.

---

## 9. Version log

**v1.21.** `controls` edits a story's props, and the manifest says when a component's props could not be read (4.1, 6.1).

| Before | After |
| --- | --- |
| an empty `details` could mean no props or props nobody could read | `propsUnread` gives the reason for the second |
| a panel could not change the story | it emits `overrides`, which the shell sends in `render` |
| `update-overrides` waited for `controls` to settle whether an edit remounts | measured, it does not, and the reserve says what would reopen it |

**v1.20.** The shell hosts the panels of the plugins (6.1).

| Before | After |
| --- | --- |
| `ShellContribution` waited for its first consumer | it is a Vue component receiving the story on display as `entry`, which may emit `inapplicable` with a reason |
| two plugins could share a name | the browser surfaces of the second are refused, and so are those of a plugin with no name |

**v1.19.** A plugin's browser surfaces load, in the shell and in the frame (6.1).

| Before | After |
| --- | --- |
| `shell` and `preview` held the surface itself, which nothing could carry from Node to the browser | they hold the file URL of a module, which the CLI serves |
| the table gave `node` a build step and a command | it gives the manifest entries of 6.3, its one capability |

**v1.18.** Props inference reads a component through `memo`, `forwardRef` and `Object.assign`, and takes the props type of `forwardRef<Ref, Props>`. A generic component's type parameters are written down as a limit (3.5).

**v1.17.** `crypte check` names a component file that does not parse, and a syntax error in a story or component file carries its line and column. A component that failed to parse only showed as a stale fingerprint, and not at all once `crypte dev` had recorded it.

**v1.16.** `crypte check` names an unreadable story file, which it used to blame on the component.

| Before | After |
| --- | --- |
| a story file that did not parse made its component read "has no story" | the file is named with its reason, as a warning; components with no story are not listed meanwhile |
| an orphan's path was the one the story wrote, relative to it | it reads from the project root |

**v1.15.** Reordering props no longer moves the fingerprint, which was its one measured noise.

| Before | After |
| --- | --- |
| reordering a block of props changed `source`, hence the digest | the digest compares `source` with its attributes sorted, and `source` itself keeps the author's order |

**v1.14.** The Vite that compiles the preview is named, which the document had wrong.

| Before | After |
| --- | --- |
| section 8 said the preview is compiled by the project's own Vite | it is compiled by the CLI's, with the plugins the project declares, and 1.5 says so |
| nothing said what a plugin written for another major of Vite does | section 8 carries it as a gap |

**v1.13.** The fingerprint follows the catalogue served, restarts included.

| Before | After |
| --- | --- |
| a restart of the configuration left the fingerprint as it was | it rewrites it, so keeping a new `stories` path no longer makes `crypte check` fail while `crypte dev` runs |

**v1.12.** `crypte check` reads the fingerprint, which 4.6 gave it the job of and section 8 listed as a gap.

| Before | After |
| --- | --- |
| a missing or stale fingerprint went unnoticed | it is 1.2's third problem, and it fails the command |
| section 8 listed seven gaps | six |
| `crypte dev` wrote the fingerprint at start-up only | it rewrites it when a story change alters it |

**v1.11.** `crypte check` reads the frames a project declares, which were both of its warnings on the demonstration.

| Before | After |
| --- | --- |
| a component named in a `wrap` was reported as having no story | it is not: the configuration and each story file's `wrap` are read, and a value handed to a wrapper still counts as a component |

**v1.10.** The shell side named `shell`, which is where it runs, before a component package makes `ui` mean something else.

| Before | After |
| --- | --- |
| the core's shell entry was `@crypte/core/ui` | it is `@crypte/core/shell`, beside `preview` and `protocol` |
| a plugin contributed `ui?: UIContribution` | it contributes `shell?: ShellContribution`, still opaque until DCJ-194 |

**v1.9.** A prop typed by an alias of the same file, which is how a union is written once it serves twice.

| Before | After |
| --- | --- |
| `rank: Rank`, with `type Rank = 'gold' \| 'silver'` above, gave `unknown` | it gives the enum the union written in place gives; an imported alias stays `unknown` |
| section 8 listed intersections and `extends` as never read | it names what is followed in the file; an `extends` is read only for `VariantProps` of a local `cva` |

**v1.8.** CVA options read from the file, which is what a shadcn kit needs to show anything.

| Before | After |
| --- | --- |
| 3.5 said CVA needed a full type checker | `VariantProps<typeof x>` with `x = cva(…)` in the same file gives one `enum` per variant, its keys as options and `defaultVariants` as default |
| section 7 left reading CVA to the `docs` plugin | inference does it, and an imported `x` still falls back to `details.options` |

**v1.7.** `children` in the call code, which is what a field meant to be copied owes its reader.

| Before | After |
| --- | --- |
| `source` wrote `children` as an attribute | it goes between the tags, and 4.2 says what each form gives |
| the field said only that it rebuilds the call | it says the call is meant to be **copied**, which is what decides the form |

**v1.6.** Two shell messages out of the protocol, which is what a contract with no consumer costs.

| Before | After |
| --- | --- |
| `update-overrides` and `set-globals` were normative and ignored | they are in section 7's reserve, with what would bring them back |
| section 8 listed them as the first known gap | it lists six gaps, and this one is closed by the document moving rather than the code |
| the channel promised more than the preview did | `ShellMessage` carries what has an effect, plus what a plugin declares |

**v1.5.** Prop inference, which is what turned `details` from a field with a contract into a field with content.

| Before | After |
| --- | --- |
| `details` was written empty | it carries what a component file declares: kind, required, default, description, and the options of a literal union |
| 3.2's merge rule was written and unimplemented | what a story file writes completes inference per prop and field by field, and 4.4 no longer claims `details` travels untouched |
| nothing said what an unresolvable type gave | only what the file writes by hand, which is the names in its destructuring pattern; enumerating a type needs the checker |
| 3.4 promised `className` without reservation | it names the criterion, being written by hand, of which `className` is the commonest case; a component taking `props` whole surfaces nothing |

**v1.4.** The first plugin, which is what turned 6.3 from a written contract into a measured one.

| Before | After |
| --- | --- |
| `NodeContext` carried only the root | it carries the declared style sheet too, since a plugin reading CSS could otherwise only guess which file was meant |
| nothing said what a numeric token's `value` held | it is a string like every other value, and the kind says how to read it |
| section 6 was written against no consumer | `@crypte/tokens` is written against its `node` surface, which is what turned 6.3 from prose into something measured. It is not one of the two plugins 6.5 waits for, both of which use `shell` |
| section 0 held two guiding rules | it holds three: what a project already writes is read and not declared again, and stories are the one exception. Writing the first plugin is what made the asymmetry worth stating |

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

`update-overrides` and `set-globals` were in the protocol with no effect. v1.6 moved them to section 7: nothing consumed them, and the document was ahead of a need rather than of the code.

**v0.9 and earlier.** Nine versions, below, in French. Each one carries the reasoning that led to it, and an approximate translation would lose that thread, so it was kept rather than translated.

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

### Le détail des versions d'avant la v1.0

**v0.9.** `wrap` n'empile que des composants.

| Avant | Après |
|---|---|
| quatre formes, dont `(story) => …` | trois formes, toutes déclaratives |

**Pourquoi.** Pour React, un composant est une fonction. `wrap: TooltipProvider` et `wrap: (story) => …` étaient donc le même type, et l'adaptateur du lot suivant aurait dû deviner lequel des deux il tenait, en se trompant une fois sur deux. Ni le typage ni un `typeof` à l'exécution ne les séparent.

La forme fonction était par ailleurs la seule à ne pas être portable, ce que la section 2.5 disait déjà, et aucun usage ne la réclamait : elle venait d'un outil qui la nomme décorateur, pas d'un besoin rencontré ici.

**Ce qu'elle servait, et qui subsiste.** Passer une valeur calculée, par les props de la forme tableau. Ce qu'elle seule permettait, un balisage jeté à la volée, demande maintenant un petit composant.

Si un usage réel la réclame, elle reviendra sous une clé distincte qui dira sa non-portabilité, et l'ajouter coûtera alors ce qu'il aurait coûté aujourd'hui.

Aucune migration à prévoir, rien n'est publié.

**v0.8.** Deux corrections à la v0.7.

| Avant | Après |
|---|---|
| sections 5.2 à 5.4 décrivant le message `plugin` | les points d'extension du canal, comme le reste |
| `Manifest.version: typeof MANIFEST_VERSION` | `number` |

**La partie normative suivait le code d'une version en retard.** Le journal de la v0.7 actait le remplacement du message `plugin`, mais les tableaux du chapitre 5, qui font foi, le décrivaient encore. Qui implémentait le shell depuis ce chapitre écrivait un message que le protocole ne connaît plus.

**Figer la version du manifeste supprimait ce à quoi elle sert.** Le champ existe pour reconnaître un manifeste écrit par une autre version. Lié au littéral courant, la comparaison `manifest.version !== MANIFEST_VERSION` devenait statiquement toujours fausse, et un manifeste v1 relu après passage à v2 n'était typable qu'au prix d'un cast qui affirme le contraire de son contenu.

Aucune migration à prévoir, rien n'est publié.

**v0.7.** Le dossier `protocol` suit trois règles, sans exception.

1. Le nom simple va au côté qu'un humain écrit, le côté produit porte un qualificatif.
2. Tout point d'extension est une interface vide préfixée `Plugin`, augmentée par module.
3. Les imports vont dans un seul sens.

| Avant | Après |
|---|---|
| `PropDetails` (manifeste), `PropDetailsInput` (écrit) | `PropDetails` (écrit), `ResolvedPropDetails` (manifeste) |
| les deux dans `manifest.ts` et `story.ts`, qui s'importaient en rond | `prop.ts`, importé par les deux |
| `EntryMeta` | `StoryMeta` |
| `{ type: 'plugin', plugin, payload }` | `PluginShellMessages`, `PluginPreviewMessages` |
| `PropDetails.name` | retiré, `details` est indexé par nom de prop |
| `Manifest.version: number` | `typeof MANIFEST_VERSION` |

**Le nom.** `PropDetails` désignait ce que le CLI produit, d'où le suffixe `Input` sur ce qu'on écrit, et une dérivation à contresens du flux. Pour savoir ce qu'on pouvait mettre dans `details`, il fallait ouvrir trois fichiers et finir sur une interface vide, d'où l'impression que ces champs venaient tous des plugins. Ils viennent du noyau, sauf quatre.

**Le point d'extension du canal.** Le message `plugin` n'exigeait rien : un plugin y envoyait n'importe quoi. Deux mécanismes d'extension pour le même besoin, dans le même dossier.

**Le champ `name`.** `details` est indexé par nom de prop, donc `name` dupliquait sa clé. C'est pour cette raison qu'on l'ôtait déjà côté écriture.

**Ce qui n'a pas changé, et pourquoi.** `StoryEntry.options` reste ouvert quand `details` est typé. Le motif écrit jusqu'ici était faux : ce n'est pas parce qu'un manifeste peut venir d'un projet aux autres plugins, ce qui vaudrait pour les deux, mais parce que `options` ne contient **que** des réglages de plugins, quand `details` porte `type` et `required`, que le shell lit.

Aucune migration à prévoir, rien n'est publié.

**v0.6.** Deux garanties qui n'étaient pas tenues.

| Avant | Après |
|---|---|
| `ready` annonce `manifestVersion` | `ready` annonce `protocolVersion` |
| `StoryOptions = PluginStoryOptions` | aiguillage qui n'admet aucune clé tant que le point d'extension est vide |

**Le nom du champ du message.** Il transportait déjà la version du protocole du canal, pas celle du manifeste, que la preview ne connaît d'ailleurs pas au moment où elle se déclare prête. Tant que les deux valaient 1, l'écart était invisible ; au premier changement de format du manifeste, le shell aurait affiché une version pour l'autre sans qu'aucun des deux côtés ne détecte l'incompatibilité.

**Le refus des clés inconnues.** La v0.5 annonçait qu'écrire une option sans le plugin qui la lit était une erreur de compilation. Ce n'était vrai que pour `PropDetails`, qui hérite de champs du noyau. Pour `StoryOptions`, fait du seul point d'extension, TypeScript ne contrôlait rien : une interface vide accepte n'importe quel objet. Voir la section 3.3 pour la forme retenue.

Aucune migration à prévoir, rien n'est publié.

**v0.5.** Le noyau ne connaît plus aucun plugin.

Deux changements, un de nom et un de structure.

| Avant | Après |
|---|---|
| champ `controls` d'un fichier de stories | champ `details` |
| champ `argTypes` du manifeste | champ `details` |
| `ArgType` | `PropDetails` |
| `ControlOverride` | `PropDetailsInput` |
| `ArgType.control`, `ControlSpec` | sortis du noyau, apportés par le plugin |

**Le nom.** `controls` et `argTypes` désignaient la même chose sous deux noms, l'un hérité du plugin qui la consomme, l'autre d'un vocabulaire extérieur. Or ce champ décrit des props, et il le fait **partiellement** : on n'y écrit que ce que l'inférence n'a pas trouvé. `details` dit les deux, et il est le même des deux côtés, à l'écriture comme dans le manifeste.

**La structure.** `control` et les bornes n'ont de sens qu'avec le plugin `controls` installé, et le noyau les déclarait pourtant. Un plugin devait donc modifier le noyau pour ajouter un réglage, ce que la section 4.4 interdit explicitement pour `options`. Ils passent par `PluginPropDetails`, un point d'extension vide que chaque plugin remplit depuis son propre paquet.

Conséquence voulue : sans le plugin, écrire une borne est une erreur de compilation. Personne ne la lirait.

Aucune migration à prévoir, rien n'est publié.

**v0.4.** Nommage des paquets.

Le nom nu `crypte` est refusé par npm : le filtre anti-typosquatting le juge trop proche de `crypto` et `bcrypt`. Le refus est définitif et vaut pour tout le monde. Le scope `@crypte` est en revanche acquis, et il portait déjà l'essentiel du projet.

| Avant | Après |
|---|---|
| `crypte` (binaire et API) | `@crypte/cli` (binaire et `defineConfig`) |
| `import … from 'crypte'` | `import … from '@crypte/react'` |

Section 1.4 ajoutée, sections suivantes renumérotées. Aucun contrat n'est modifié.

**v0.3.** Simplification, après réexamen des ajouts de la v0.2.

| Retiré | Raison |
|---|---|
| Marqueur `{ "$fn": … }` et substitution associée | Résolvait un problème inexistant : la preview importe les modules de stories, les props ne traversent pas le canal |
| Champ `group` sur `ArgType` | Un champ générique pour un seul usage. Les props DOM ne sont simplement pas extraites |
| Échappatoire `render` | Aucun cas démontré sur les cinq composants testés. Mise en réserve |

| Ajouté | Effet |
|---|---|
| `ctx.props` modifiable dans `beforeMount` | Une ligne au contrat de plugin, remplace le mécanisme retiré |
| Message `render` en `{ id, overrides }` | Décrit honnêtement ce qui circule |
| Section 4.1 clarifiée | Le manifeste alimente le shell, il n'est pas la source du rendu |

Bilan : deux sections supprimées, un champ supprimé, un concept supprimé du manifeste.

**v0.2.** Intégration des six corrections issues du test du format sur cinq composants d'un projet React réel. Trois d'entre elles sont retirées ou remplacées en v0.3.

**v0.1.** Version initiale, quatre contrats.
