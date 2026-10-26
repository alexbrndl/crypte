# Crypte contracts

> Version 1.54, reference document. A project brief points here instead of restating these shapes.
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

**A markdown file in the story folder is a page.** `Badge.md` beside `Badge.tsx` belongs to that story file's component and shows on that component's page. A `.md` with no story file of the same name, or beside one that gives no story, is a general page, placed by its path. Markdown only, no front matter: the title is the first `# heading` outside a code fence, otherwise the file name. With `stories: '.'` every `.md` of the project is a page, its README included.

**A story is written in the language of its project.** Four extensions are read: `.ts`, `.tsx`, `.js` and `.jsx`. A TypeScript project writes `.ts`, and a project with no TypeScript writes `.js`, the same way it writes its components.

The `x` form carries JSX. A structured `children` prop forces it, which is common on composed components such as `Tabs` or `Card`. Everything else fits in the plain form.

### 1.2 `crypte check`

The command reports five problems:

- **Orphan story**: the component it points at is gone. Its path reads from the project root.
- **Unreadable story file**: a file meant as a story that gave none. It is a warning and never fails the command, since it can be a correct form the reader does not follow. While one exists, the components with no story are not listed, since nobody knows which one it covers. A file that gave part of its stories is not one.
- **Unreadable component file**: a component a story points at does not parse, named with the line and column of the error. Its props fall back to none, which moves the fingerprint, and `crypte dev` records that state. A warning, like the unreadable story file; the fingerprint decides the exit code.
- **Component with no story**: an exported component has no story. This one is a warning and never fails the command.
- **Stale fingerprint**: `.crypte/fingerprint.json` is missing, or differs from what the stories give today (4.6). It fails the command, so a CI running `crypte check` refuses a branch that did not update it.

The component-with-no-story check only looks at exports **identified as components**: a capitalised name that returns an element, or a `.vue` file, which is one component, its default export. A default export is reported under its file's name. Utility functions exported from a component file, such as `stepFromProgress` in `ProgressLoader.tsx`, are never reported. Nor is a component the project already declares as a frame, in the `wrap` of its configuration or of a story file (2.5): it is context, not a component missing its page.

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
| `@crypte/vue` | the same three, for Vue | yes, the one for their framework |
| `@crypte/core` | the core, an internal dependency | no, never imported directly |
| `@crypte/<plugin>` | plugins, one at a time | on demand |
| `@crypte/ui` | the components the shell and the site draw in common, and the design tokens panels inherit (6.1); Vue as its only peer, and nothing in the core or the CLI imports it | no, unless building on Crypte's look |

The package name and the command name are independent: `@crypte/cli` declares a binary called `crypte`, and the user types `crypte dev`.

**A plugin written in the project imports its types from `@crypte/cli`**: `CryptePlugin`, `PanelProps`, `PanelEvents`, `PreviewHooks` and `PreviewContext`, the core's own. The project does not depend on the core, so it neither imports nor augments it: a plugin written there declares no story options (2.4), prop details (3.3) or messages (5.4). With npm, which hoists the core to the root of `node_modules`, such an augmentation compiles anyway, outside this contract. The limit stays until a project's plugin needs to declare one.

**`defineStories` and `story` come from the adapter, not from a neutral package.** The adapter knows the framework, so prop types are inferred more precisely. A Vue project imports them from `@crypte/vue`, and nothing else changes.

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
| `components` | root of the component files, which the health view counts | no |
| `wrap` | global wrapper, applied to every story | no |
| `plugins` | Crypte plugins to enable | no |
| `vite` | Vite plugins the project declares | no |

Two keys are required, and an error names the one that is missing.

**An adapter is typed by the core**, and `adapter` takes nothing else:

```ts
interface Adapter {
  mount(
    container: HTMLElement,
    component: unknown,
    props: Record<string, unknown>,
    wraps: readonly PreviewWrapper[],
  ): void
  unmount(): void
}
```

The preview calls `mount` on every render, with the wrappers of 2.5 that are not muted (5.2), outermost first, and sends what it throws as that story's error. `component` and the wrappers stay `unknown`: each adapter narrows them to its framework's components. Both adapters keep their root from one render to the next, so a component's state survives a props edit, and a switch to another story of the same component: an open dialog stays open. The preview unmounts only when hot reload replaces its module. `@crypte/vue` patches through Vue's `render` rather than an app, whose updates wait for the next tick: the story is on screen when `mount` returns. Each throws on a value that is not one of its framework's components, which would otherwise render nothing and be announced as rendered.

**An adapter brings no Vite plugin.** The project declares the one its framework needs in `vite.plugins`, `react()` or `vue()`, as it would in its own Vite config. `vue()` does run in Node when the configuration is evaluated, but that instance is dropped: the browser rebuilds the adapter from the configuration's text, so a plugin it returned would reach nothing. Reopened if a framework needs more than one plugin in an order a project cannot guess.

`components` is what the health view counts the components with a story against: every component a `.js`, `.jsx`, `.ts` or `.tsx` file under it exports, and every `.vue` file, at any depth, except under `node_modules`, `.git` and `dist`, in a `.d.ts`, or declared as a `wrap` (2.5), which is context rather than a component. Without it, the shell draws no stories gauge, since nothing says how many components there are.

`vite.plugins` exists for the cases where a framework needs an extra transform, such as Nuxt auto-imports. The project declares it. Crypte never guesses it, except the one plugin a framework cannot render without: `crypte init` writes `vue()` for a Vue project, since no `.vue` file compiles without it.

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

The second argument is typed by the core and the plugins you have installed, which is what gives autocompletion. **The core declares one key, `layout`**: where the story sits in the stage, `centered` by default, `padded` with a 16 px margin, or `fullscreen` on the whole frame, for a page or a bar. **Every other key comes from a plugin**, so the example above needs the plugin that declares `responsive`. The common case has no options and never uses this helper.

```ts
interface CoreStoryOptions {
  layout?: 'centered' | 'padded' | 'fullscreen'
}
```

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

`status` drives a filter in the sidebar, which greys the components that do not carry the chosen status. The component page shows the rest: `owner`, which will later route comments, `figma` as a link when it is an http or https address and as text otherwise, and `description`.

Every field is optional. The core reads none of them: they travel to the manifest, where the shell and plugins read them.

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

**An empty extension point is not enough to get that refusal.** TypeScript does not report excess properties against a type that has no property at all, so any object satisfies an empty interface. `PropDetails` escapes this because it inherits core fields and is therefore never empty. `StoryOptions` escapes it the same way, through the core's own `layout` (2.4):

```ts
interface PluginStoryOptions {}

type StoryOptions = CoreStoryOptions & PluginStoryOptions
```

With no plugin installed, `layout` is the one key accepted, and each plugin adds its own.

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

**A `.vue` file is read from its `<script setup>` block**, or its plain `<script>` without one, never through the Vue compiler. `defineProps<T>()` is read like a TypeScript parameter, a type literal or a local interface or alias, with its JSDoc. `defineProps({ … })`, an array of names, and the `props` option of `export default { … }` or `defineComponent({ … })` are read as values: a constructor gives its kind, `String as PropType<'a' | 'b'>` the type it names, `required` and a literal `default` their fields, `[String, Number]` `unknown`. `withDefaults` and a destructured `defineProps`, Vue 3.5's form, give the defaults. Each `defineModel` is a prop too, `modelValue` or the name it is given. A file with no `defineProps`, no `defineModel` and no `props` option takes none. An imported type, props held in a variable, a default export that is not an object literal, or a `<script src>` give no props and say so in `propsUnread`.

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

type ManifestEntry = StoryEntry | TokensEntry | PageEntry

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
  tokens?: string[]
}

interface TokensEntry {
  type: 'tokens'
  id: string
  path: string[]
  name: string
  tokens: Record<string, TokenValue>
}

interface PageEntry {
  type: 'page'
  id: string
  path: string[]
  name: string
  file: string
  body: string
  storyFile?: string
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

Every entry carries a `type`. **Three values are implemented: `"story"`, `"tokens"` and `"page"`.**

**`MANIFEST_VERSION` does not move when a nature is added.** The reserved `type` field is precisely what that reserve was for, and nothing required moved on `StoryEntry`, so a reader that only knows stories skips what it does not recognise instead of failing. The rule that does force a bump is adding a required field once a version that writes manifests is published.

**A test makes every change of shape visible; deciding between recording it and bumping stays a person's call.** `manifest-shape.v1.json`, beside the core's tests, records every type a manifest holds, its heritage and its fields with their types, and the unions that bound their values. A shape that differs from the file of the current `MANIFEST_VERSION` fails, whatever moved. Before the first publication the failure asks to record the new shape in that same file, since nothing published depends on it yet; after it, to bump `MANIFEST_VERSION` and record the new shape under the next number, unless an optional field or a new nature of entry was added and nothing else. **There is no JSON Schema**: the readers this format is for are written in JavaScript and read its types from `@crypte/core/protocol`, and a schema would be a second source to keep in step. Reopened by a reader that is not, or an editor that validates the file.

`props` and `source` are read from the story file, not declared in it. `props` lists the names the story passes to the component, from the shared block and its own, sorted, with no value attached: a prop set to a function is still a prop the story exercises, and prop coverage counts it. `source` rebuilds the call from the text the user wrote, so an expression the CLI cannot evaluate still reads the way they typed it.

**`source` is meant to be copied**, so it must parse and render what the story renders. Two rules follow.

`children` goes between the tags rather than into an attribute: `<Badge>New</Badge>`, never `<Badge children="New" />`. Both render, only one is what anyone writes. An element goes as it was written, parentheses around it removed. A string goes bare **only when JSX gives the same string back**: not when it carries a brace, an angle bracket, an `&`, a line terminator, or edge whitespace, and not when it is empty. Everything else keeps its braces. The rule is one-way on purpose — a string refused is merely braced, which always renders right, where a string wrongly accepted is a snippet that lies.

An attribute answers the same question differently: a brace and an angle bracket are ordinary inside quotes, a double quote is not, and neither is an `&`, a line terminator, a backslash or a control character. A JSX attribute literal unescapes nothing, so a backslash written for JavaScript would arrive doubled. Those take braces too, and between the tags the same characters need no help since the text is emitted as it is.

**A `.vue` component's `source` is written as a Vue template**, since that is where it is pasted. A string is a static attribute escaped as HTML, `&` and `"`, which the template decodes back to the same string. Every other value is bound, `:count="3"`, `true` included, since a bare attribute is `true` only for a prop declared `Boolean` and an empty string otherwise; a bound expression is escaped the same way. A text child goes in the default slot, bare when the template gives it back unchanged and interpolated, `{{ " bord " }}`, when it holds an angle bracket, an `&`, `{{`, a line break or another control character, edge whitespace or a run of spaces; inside an interpolation, `&` and a `}` before another are written as entities, which the template decodes. The choice follows the resolved file, so an import written without `.vue` gets a template too.

**JSX in a Vue story is copied as written, and a template does not read all of it.** An element child goes as the story wrote it: a fragment does not compile, and `size={3}` inside it passes the string `"{3}"`. A prop whose value is an element is bound as is and does not compile either. Slots beyond plain text wait for a Vue story that passes content, which would reopen this.

With no `children`, the tag stays self-closing — and so it does when a spread may replace the value, since 4.2 forbids showing what the run does not have.

**A prop spread with `...` is in neither field**, and neither is a key computed at runtime. Their names cannot be read without running the file, and guessing them would put wrong names in a coverage figure.

**A story key computed at runtime produces no entry at all.** A story name is a URL, a baseline key and the anchor of a comment, so a wrong one costs more than a missing one. The CLI reports what it dropped.

**`component.tokens` names the custom properties the component reads**, without their dashes and sorted, so a reader can tell which components a token reaches. The CLI reads them from the component file and from the style sheets it imports by a relative path, one level deep: every `var(--name`, and in the component file a quoted `'--name'` inside a `var(${…})` template too, since `var(${tone ? '--a' : '--b'})` picks its property in a string; any other quoted `--name` is no read. A Vite query on the import, `?inline` for one, changes nothing, and a Vue component's `<style src>` counts as an import. A name the project declares as no token is listed all the same: matching it to a family is the reader's business. The field is absent when the component file cannot be read, and an empty list means it reads none. It is not folded into the fingerprint (4.6): it is the component's code, and a colour swapped in a component is not a changed story.

**A tokens entry is a family, not one token.** `path` places it under folders and `name` is its leaf, as for a story, except that a family has no component: every segment of its `path` is a folder. `tokens` is keyed by token name, so the value carries no `name` of its own. That is the same shape as `details` inside a story entry, and it is what keeps a catalogue of three hundred tokens from becoming three hundred entries.

**Every token is read per theme.** A single-theme project holds one key. Storing one value and adding themes later would change the shape of every token, which is a break; a project with one theme costs one extra key today.

**A theme missing from a token means the source says nothing there**, not that the value is the default one. A token written only under a dark selector carries `dark` and no `default`, and a reader drawing the default theme has nothing to draw for it, which is the truth. Inventing a value would be worse than showing none.

**`themes` holds at least one key, and that is the producer's guarantee rather than the type's.** A `Record` cannot be typed non-empty without making it painful to build, so this is the same arrangement as serialisation in 4.5: the type says what the shape is, and whoever writes the manifest is answerable for the rest. An empty `alias` is out for the same reason, since a chain that led nowhere is what an absent `alias` already says.

**A value is always a string, whatever its kind.** A `number` token carries `"1.5"`, a `dimension` carries `"4px"`. The kind says how to read it; the field says what was written. Parsing on the reader's side is one line, and a union of string and number would put that choice in every reader instead.

**`value` is always the literal, and `alias` is the chain that led to it.** A real token points at another token, sometimes through several hops. Whoever draws a swatch reads `value` alone and never resolves anything; whoever explains a token walks `alias`, ordered from the token towards the literal. A token that holds a literal itself has no `alias`.

**A page entry is a markdown file of the story folder (1.1), as written.** `path` holds its folders only and `name` its title, as a tokens family's do. `file` is project-relative, like `storyFile`. `body` is the markdown without the heading the title came from, so a reader drawing `name` above it does not draw the title twice. `storyFile` is set when the page belongs to that story file's component, and only when the file gave at least one story: a component page that does not exist cannot show it, so it stays a general page.

**A page's `id` comes from its file name, never its title**: `storyId([...path, stem], '')`, so `stories/Guides/Accessibilite.md` gives `guides/accessibilite`. Retitling a page keeps its address. With no name there is no `--`, so a page lands on a story's `id` only when that story's name normalises to nothing, `'…'` for one, which is then a collision like any other. Pages stay out of the fingerprint (4.6): the file itself is in the pull request diff.

**The core carries the shape, a plugin carries the reading.** No file format is part of this contract: CSS variables, DTCG, Tailwind and everything after them live in `@crypte/tokens`. Same split as props, where the core defines `ResolvedPropDetails` and the shell's docs page only draws a table from it.

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
| two entries read from the story folder, stories or pages | the catalogue cannot be built. Neither can be made to give way: both come from the author's own files |
| a contribution on a story's or a page's `id` | the contribution is refused and said, named by plugin. 6.3 has the rule and why the story wins |
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

```ts
interface Fingerprint {
  version: number
  entries: FingerprintEntry[]
  tokens?: FingerprintToken[] // absent: unknown, not empty
}

interface FingerprintEntry {
  id: string
  component: string // `file#export`
  status: string
  props: string[] // sorted
  rest: string // a digest of everything else
}

interface FingerprintToken {
  family: string
  key: string
  type: string
  themes: Record<string, string>
}

function compareFingerprints(before: Fingerprint, after: Fingerprint, from: { ref: string; commit: string }): Exclude<Changes, { reason: string }>
function readFingerprint(read: unknown): Fingerprint | { lacks: string }
```

`compareFingerprints` gives what moved between two of them, which the CLI reads from Git and a build's shell from GitHub: a `Change` per story that appeared, disappeared, or whose props or status moved, in manifest order, and a `TokenChange` per token that appeared, disappeared or changed value, or `null` for the tokens when `before` predates them. `Changes` is that, or the `reason` there is none to read, which the comparison itself never gives. `readFingerprint` reads a file someone may have edited, and names what it lacks rather than throwing.

**The manifest is the truth.** It is regenerated from the story files on every build, so when the two disagree it is the fingerprint that is out of date, never the other way round.

The fingerprint is not a smaller manifest and nothing reads it to render. `crypte dev` reads the version a commit holds, through Git, and serves its difference with the catalogue to the shell's versions view: `HEAD` by default, or a branch, a tag or a commit named in the route's query, or the last commit before a date. It exists so that Git holds the history of a catalogue: per **story** entry, the identifier, the component as `file#export`, the status, the sorted prop names, and one digest folding everything else but `component.tokens`. The digest reads `source` with its attributes sorted, so reordering props in a story file, which changes nothing rendered, leaves the fingerprint alone. That is enough to say what changed between two versions, and small enough to commit on every build. Measured on 500 stories: the full manifest is 706 KB raw and 83 KB gzipped, the fingerprint 131 KB and 9 KB, which is 268 bytes per story.

**Tokens have a section of their own**, beside the story entries: per token, its family's identifier, its key, its kind and the literal of each theme, sorted by family and key. The values themselves and not a digest, since the versions view shows a token before and after. A fingerprint committed before this section has no `tokens` at all, which reads as "unknown", not "empty": the token history starts with the next commit.

**`crypte build` writes both files too**, so the record is rewritten without a server, and it writes what the versions view reads beside the static folder: a static host cannot ask Git. The default comparison is the default branch, since the last commit of a deployed build compares with itself; then the tags and the two periods the view offers, counted in UTC days before the build, each in a file named by its point in hexadecimal, since a tag may hold a `/` or a `%` a host would decode. Any other point is read in the browser: the build publishes its own fingerprint and names its GitHub repository, its folder in it and the commit built, and the shell reads the fingerprint GitHub holds at that point.

**A missing or stale fingerprint is never fatal to a build.** It is a record, so the build writes it and moves on. Telling a project that its record is behind is the job of `crypte check`, which fails on it (1.2). The two are compared as data, so reformatting the file is not a change.

---

## 5. Channel protocol

### 5.1 Principle

The shell and the preview talk through `postMessage`, with JSON-serialisable messages. **The shell never reaches React, Vue, or the component instance.** The frame has the shell's origin, and two things go through its DOM, neither touching the framework nor the instance: the shell listens for `pagehide` on its window, and sets the CSS `zoom` of its root element to scale the story.

That constraint is what keeps the core framework-neutral. One exception reaching the framework would undo the whole architecture.

```ts
const PROTOCOL_VERSION = 1
type Overrides = Record<string, unknown>
```

The preview announces `PROTOCOL_VERSION` in its `ready` message. It is separate from `MANIFEST_VERSION`: the catalogue format and the message format move on their own.

**It is 1, and the work that wrote this chapter is that version 1.** The counter moves at the first breaking change *after* publication, when a preview and a shell of different versions can actually meet.

The channel never carries a story's props to the preview, which imports the modules itself. It carries the id of the entry to render, and the **overrides** coming from controls. What comes back is what the story rendered with, its primitive props only (5.3). An override is always a primitive edited in a panel, so it is always serialisable.

Each direction has its own type: `ShellMessage` goes to the iframe, `PreviewMessage` comes back.

### 5.2 Shell to preview

```ts
type ShellMessage =
  | { type: 'render'; id: string; overrides: Overrides; theme?: Theme; muted?: number[] }
  | MessagesOf<PluginShellMessages>

type Theme = 'light' | 'dark'
```

`render` mounts the entry that was asked for, with the shell's overrides applied on top of the story's props by 2.3's merge, shallow and prop by prop. A preview drops any message it does not know.

`theme` is the theme to draw in. Before rendering, the preview sets it as `data-theme` and as the `color-scheme` of its root element: a sheet reads the first through a `[data-theme="dark"]` selector, the one `@crypte/tokens` reads its themes from, and `light-dark()` follows the second. A `render` without `theme` changes nothing on the root: it keeps what the project or the last `theme` set there. The shell sends its own theme; to compare, it opens a second preview and sends `light` to one and `dark` to the other.

`muted` lists the wrappers to leave out, by their rank in the `wraps` of the last `rendered` (5.3), outermost first. The preview's entry drops them before `mount`, so no adapter knows of it: turning off a provider shows which context a component depends on without saying. The shell forgets what was turned off when the story changes, and keeps it out of the address, as the zoom.

**`update-overrides` and `set-globals` were here and are now in reserve**, section 7. Neither had a consumer, and `render` already carries overrides: what the first added was updating them *without remounting*. **`controls` settled it: nothing is remounted.** Measured in a browser, the node the React adapter rendered survives an edit, since the adapter renders again on the root it keeps; the Vue adapter does the same through Vue's `render`.

### 5.3 Preview to shell

```ts
type PreviewMessage =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'rendered'; id: string; durationMs: number; values: RenderedValues; wraps?: string[] }
  | { type: 'error'; id: string; message: string; stack?: string }
  | { type: 'plugin-error'; plugin: string; message: string }
  | MessagesOf<PluginPreviewMessages>
```

`ready` says the preview is up. `rendered` reports a finished render, how long it took, and what the story rendered with: its props after 2.3's merge, overrides included, keeping a string, a finite number or a boolean, as an override is (5.1). `wraps` names the story's wrappers of 2.5, outermost first, muted ones included so a rank stays the same: a component's `displayName`, a Vue file's `__name`, its `name`, or `anonymous`.

```ts
type RenderedValues = Record<string, string | number | boolean>
```

`error` reports a render that threw, and the shell shows it without falling over. `plugin-error` names a plugin whose preview module could not load or exported anything but its hooks, had a hook throw or reject, or sent a message under another name (6.2); the stories render all the same, and the shell shows each once, beside the plugins' panels. The time `rendered` carries is the render's alone: the plugins' hooks run once it is out.

### 5.4 Rules

- Every payload must survive a JSON round trip. No function, no class instance, no DOM node. `postMessage` enforces this by cloning: a function throws at send time.
- Both sides send to an exact origin, never `'*'`, and both drop a message that comes from another origin or another window.
- A render error comes back as `error` and must never take the shell down.
- **A plugin message's `type` starts with the plugin's name and a colon**, `a11y:run`, and a core message never carries one. That prefix is the whole routing: the preview hands the message to that plugin's `onMessage` (6.2), the shell to that plugin's panel (6.1). The names come from the project's configuration, never from a list in the core. One exception, in the shell and not the core: the health view's audit reads `a11y:results` itself, from the plugin named `a11y`, because an accessibility audit runs only in a browser. Its fields are therefore a promise of `@crypte/a11y` to the shell, and a second analysing plugin would reopen this through a contract.
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

While no plugin has declared anything, the union does not grow, and sending an unknown message through the core's channel, `@crypte/core/shell` and `/preview`, is a compile error. **A plugin's own calls are not typed by its declarations**: `ctx.send` (6.2), a panel's `send` and its `received` (6.1) carry `{ type: string }`, and the prefix is checked when the message is sent. Reopened if a plugin needs its messages checked at compile time: typing `ctx.send` by the declarations narrows what a plugin gives, a break under 6.5.

```ts
type PluginMessage<T extends { type: LiteralOnly<T['type']> }> = T
```

`PluginMessage` puts the constraint on its parameter, so a malformed message fails **on the line where it is declared**, with the reason in plain text. Two gaps remain: a plugin is free not to use it, and `skipLibCheck`, which is widespread, hides errors coming from a `.d.ts`. The protocol therefore filters on its own side: a value whose `type` field is missing or is not a literal is dropped from the union instead of joining it. Otherwise it would stop `message.type` from discriminating anything at all for the consumer.

---

## 6. Plugin contract

> **Frozen since v1.25.** Removing anything, narrowing what a plugin gives or widening what it is given is a break; an optional key, hook or event added is not. See 6.5.

### 6.1 Shape

A plugin is an object with a name, three optional surfaces, and an optional view.

```ts
interface CryptePlugin {
  name: string
  shell?: string
  preview?: string
  node?: NodeHooks
  view?: PluginView
}
```

| Surface | Runs in | Role |
| --- | --- | --- |
| `shell` | shell | panel, and the parts of a view |
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

The shell module exports a `ShellContribution` by default, the preview module a `PreviewHooks`. The configuration itself never reaches the browser: running it there would carry the `node` surface along, and `node:fs` with it. **A factory's options stay in Node too**: only the module's URL crosses, read as a file, so a query or a hash written on it is lost. A factory chooses which module it points at, and passes it nothing.

**A preview module goes through the project's Vite**, like a story file, so it imports what it needs. Once the plugin is installed, Vite pre-bundles nothing it imports: a CommonJS dependency has no default export there. `@crypte/a11y` imports axe-core's script for its side effect, which sets `window.axe`. **A shell module is served as is, never compiled**, since the shell is prebuilt. Its bare imports are `vue` and `@crypte/ui`, which the shell provides through an import map, so every panel runs on the shell's own Vue and draws with the shell's own components: `Field`, `Button`, `Input`, `Select`, `Checkbox`, `Tooltip`, `Alert`, and the parts the shell builds its own views with, which a plugin's view builds with too: `ColumnTitle`, `SidebarLink`, `Tree`, `ViewCanvas`, `SectionHeader`, `Badge`, `CardTable`, `EmptyNote`, `PanelSection`. Their styles are already in the shell's page. That Vue carries its template compiler: a module written by hand may use `template` rather than `h()`. A plugin declares `vue` and `@crypte/ui` as peer dependencies and keeps them out of its bundle: a panel running on a second copy of Vue never redraws its own state, and nothing warns.

**A surface that points nowhere is refused, with its reason**, the way 6.3 refuses a contribution: a pointer that is not a `file:` URL, or one that leads to no file. So are the browser surfaces of a plugin with no `name`, with a name an earlier plugin already has, or with a name that holds a colon, which ends the prefix of its messages (5.4): the shell keys a panel by its plugin's name. So is a key other than `name`, `shell`, `preview`, `node` and `view`, `toolbar` or the old `ui`: a plugin is installed compiled, and nothing else would say the key is ignored. So is a function, the factory written `plugins: [controls]` rather than called: it compiles, since a function has a `name`. Each refusal is said in the terminal, and in the shell beside the panels. A module that throws on import costs nothing else. The shell names it, or a shell module whose default export is neither an object nor a function, and shows the other panels; the preview renders its stories and names the module in the frame's console. Nor does a preview module that never finishes loading: the stories do not wait for it, and its hooks attach when it arrives, `afterMount` catching up on the story last drawn.

**A `ShellContribution` is a Vue component, which the shell mounts in a frame**, one per plugin, in the order `plugins` declares them. It receives the story on display as its `entry` prop, a `StoryEntry` or `null`. A panel with nothing to say about that story emits `inapplicable` with its reason, and the frame folds to one line holding it, rather than showing an empty panel or a greyed one. A click still opens it for that story, the reason kept above, and the panel shows what it renders, which may be nothing: what it offers once folded stays within reach, `a11y` analysing again what changed in the iframe without a render, a menu opened by hand. The last click on a story holds whatever the panel says after it, and is forgotten at the next one; only a click on a panel that is not folded is remembered.

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

**It is said story by story, never once.** The frame forgets it whenever it receives a new `entry`, another story or the same one read again after an edit, so a panel that does not say it again is open. `null` unfolds it without waiting for the next story: an analysis can find a violation on the story where it found none. Any other value that is not a non-empty string is ignored.

**A panel reads what the story on display rendered with** from its `values` prop, the `RenderedValues` of the last `rendered` for that story (5.3), `null` until it renders: `@crypte/controls` fills its fields with them, so a field shows what the component shows.

**A panel learns that the story on display could not be rendered** from its `failed` prop, the error's message, `null` otherwise: a panel waiting for that render, as `a11y` waits for its analysis, would wait for ever.

**A panel talks to its own preview module.** It emits `send` with a message, and receives, as its `received` prop, the last message its preview module sent. Both carry a `type` that starts with the plugin's name (5.4): the frame drops a message a panel sends under another name, and says so in the console. What crosses is a JSON copy, so a panel may send its reactive state; a message JSON cannot carry is dropped the same way, and so is one sent before the preview is ready, like a `render` would be, or before the plugin's preview module has arrived.

**A panel that edits the story emits `overrides`**, the values to render it with, primitives only (5.1). The shell sends them in `render`, keeps them while that story stays on display, a preview that says `ready` again included, and drops them when another story is shown. Anything but `null`, a boolean, a finite number or a string is refused, `undefined` included, named with its plugin and prop, and the whole edit dropped. Several panels may edit: each keeps its own values, and the render merges them in the order `plugins` declares, the later panel winning a prop both edit. A panel the CLI no longer lists, removed from `plugins` or its `shell` refused, takes its values with it. `@crypte/controls` is the panel that does. **A panel that edits reads its values back from its `overrides` prop**, what the shell holds for it, rather than keeping its own copy: the frame shows a **Reset all** in its head while they are not empty, and clears them there as it does when another story is shown. A panel that kept a copy would send it whole at its next edit, and the values cleared would come back.

**Only the module is loaded.** A style sheet built beside it never reaches the page, so a panel styles itself inline.

**A plugin may have a view of its own**, an entry in the activity bar under a separator after the shell's views, which changes the whole workspace: its sidebar, its canvas and its panel. The plugin object declares its label and icon, the shell module draws it from its `view` export:

```ts
interface PluginView {
  label: string | ViewLabel
  icon: ReadonlyArray<readonly [string, Readonly<Record<string, string | number>>]>
}

interface ViewLabel {
  en: string
  fr?: string
}

interface ShellView {
  canvas: ShellContribution
  sidebar?: ShellContribution
  panel?: ShellContribution
}
```

The label is 1 to 8 characters, the activity bar being 48 px wide, or one such label per language the shell speaks, English required: the shell shows the one of its language, or the English one; the icon is the Hugeicons object the plugin imports from `@hugeicons/core-free-icons`, a name would make the shell carry the whole set. No shortcut: ⌘1 to ⌘9 belong to the browser's tabs, a view opens by its entry and from ⌘K. **A view the CLI cannot draw is refused, with its reason**: a label too long, empty or not a string, or a label per language without English or with a language the shell does not speak, an icon that is not a list of `[tag, attributes]` pairs, or a plugin with no `shell` module to draw it. **The shell module exports `view`**, the components of the view, beside a default export that stays the story panel and may be absent: a plugin that has only a view adds no panel to the stories. A `view` export whose canvas, or whose sidebar or panel when given, is not a component is named beside the panels, and the view is not drawn.

Each part receives the item chosen in the view and emits `item` to choose another, `null` for none. The shell keeps it in the address, `?view=<plugin>&item=<key>`, so a link reopens the view on it. The shell writes the view's label as the sidebar's title, draws the canvas on the workspace's background, and the panel in a frame folded and remembered like the other panels, under a key of its own:

```ts
interface ViewProps {
  item: string | null
  locale?: Locale
}

interface ViewEvents {
  item: [key: string | null]
}
```

**Whether a panel is open is the shell's to remember**, under the plugin's name, never the plugin's. A panel that throws shows the error in its frame, and is mounted again at its next `entry`.

`NodeHooks` is specified in 6.3. The core declares `ShellContribution` opaque, the way it declares an adapter opaque: it knows no Vue, and cannot name a component. **It does type what a panel receives and emits**, without Vue, and `controls` and `a11y` declare their props and events with these, so a panel that strays from them does not compile:

```ts
interface PanelProps {
  entry: StoryEntry | null
  received: { type: string; [key: string]: unknown } | null
  failed?: string | null
  values?: RenderedValues | null
  overrides?: Overrides
  locale?: Locale
}

type Locale = 'en' | 'fr'

interface PanelEvents {
  inapplicable: [reason: string | null]
  overrides: [values: Overrides]
  send: [message: { type: string; [key: string]: unknown }]
}
```

A panel declares the part it uses: `defineProps<Pick<PanelProps, 'entry'>>()`, `defineEmits<Pick<PanelEvents, 'inapplicable' | 'overrides'>>()`.

**A panel and each part of a view receive `locale`**, the language the shell speaks, `en` or `fr`, and translate their own texts with it, in a dictionary of their own: no format is imposed, and a plugin that ignores it stays in its language. **A plugin falls back on English for a language it does not know**, so that a language the shell adds later breaks no plugin at run time; `Locale` widening is a type change a plugin's exhaustive dictionary follows, and comes with a minor version. It is optional, added to the frozen contract (6.5) without breaking a plugin written before it. `controls` and `a11y` translate their panels; what comes from the project or from axe keeps its language.

**A panel draws with the shell's design tokens.** It is mounted in the shell's document, not in an iframe, so it inherits the custom properties declared on the root, under the names of the design file's variables: `--text-primary`, `--text-muted`, `--background-raised`, `--border-light`, `--accent-base`, `--warning-text` and the other theme colors, the `--space-*` and `--radius-*` scales, `--font-sans` and `--font-mono`. The colors follow the shell's light or dark theme. A panel reads them with a fallback, `var(--text-muted, #57534d)`: a plugin cannot import `@crypte/ui`, which declares them, and its panel still renders where they are absent.

**`PreviewHooks` is specified in 6.2, and the core types it**: a hook receives the iframe DOM, never a framework, so the core can name everything it gets.

### 6.2 The golden rule

**A `preview` hook never touches framework internals.** It gets lifecycle events and access to the iframe DOM, never a React tree or a Vue instance.

```ts
interface PreviewHooks {
  afterMount?: (ctx: PreviewContext) => void | Promise<void>
  onMessage?: (
    ctx: PreviewContext,
    message: { type: string; [key: string]: unknown },
  ) => void | Promise<void>
}

interface PreviewContext {
  id: string
  props: Record<string, unknown>
  options: Record<string, unknown>
  root: HTMLElement
  send: (message: { type: string; [key: string]: unknown }) => void
}
```

```ts
export default {
  afterMount: (ctx) => ctx.send({ type: 'a11y:results', id: ctx.id, violations: analyse(ctx.root) }),
  onMessage: (ctx, message) => {
    if (message.type === 'a11y:run') ctx.send({ type: 'a11y:results', id: ctx.id, violations: analyse(ctx.root) })
  },
}
```

**Two hooks, because one consumer demands them**, and `@crypte/a11y` is that consumer. `afterMount` runs after every render that went through, with the story it drew, once `rendered` is sent. `onMessage` receives what the plugin's panel sent, against the story last drawn. Both are properties holding functions, like `NodeHooks`: the context comes as an argument. Either may be async, as an analysis is. `beforeMount`, `onPropsChange` and `beforeUnmount` wait in section 7 for the plugin that needs them.

**A preview module exports its hooks and nothing else.** Anything other than an object of those two keys, each a function or left `undefined` as the type allows, is refused, and so is anything exported by name beside the default export, as a `plugin-error` (5.3), and so is a hook that throws or rejects, or a message sent under another name: a hook exported and never called would otherwise fail in silence.

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

type ContributedEntry = Exclude<ManifestEntry, StoryEntry | PageEntry>

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

**In reserve with `beforeMount`, section 7**: what follows is the shape it will have when `actions` brings it. Inside `beforeMount`, a plugin may change `ctx.props`. That is the only moment props are mutable; everywhere else the context is read-only.

This exists for one demonstrated case: a function prop the story author did not declare. `PricingCard` expects `onSelect`, the story omits it, the component gets `undefined` and breaks on the first click. The `actions` plugin fills those props with logging functions inside `beforeMount`, using `details` to know which ones are functions.

The core knows nothing about this. With the `actions` plugin absent, the author declares the function themselves.

### 6.5 How this contract became stable

The contract was frozen once **two plugins with opposite needs** had used it, and it carries what they asked for rather than what was guessed:

- `controls`, which writes into the story.
- `a11y`, which only reads it.

Until then it changed without procedure. Since v1.25, removing anything, narrowing what a plugin gives or widening what it is given is a break: `received` turning `undefined` would break a panel that trusts its type. Adding is not, as long as what is added is optional: the hooks section 7 holds in reserve come back that way.

---

## 7. Out of scope

Left out on purpose. Some belong to a project brief, others wait for a demonstrated need.

**Belongs to a project brief:**

- How the sidebar, the search and the panels look and behave.
- Caching and start-up work.
- The storage format of `visual-tests` baselines.
- Editing a story from the shell. Planned as the `editor` plugin, which hands each change to a coding agent rather than writing the source itself (DCJ-343). There is no `crypte serve`.

**Out of reserve since 21 August 2026, and now planned:**

- Editing a `page` from the shell. The entry itself is built, as markdown files in the repository (1.1, 4.2) with no server at all. A designer editing those files goes through a coding agent like any other change (DCJ-343). Confusing the two stages is what made `page` look expensive and far away.

The reason `page` left reserve is not internal: the documentation tools this project is measured against all sell guidelines as the thing neither Figma nor a component workshop exposes. The `tokens` entry left reserve the same day, those tools all shipping a token manager too, and is built: 4.2 holds its shape and 8 what produces and draws it.

**Held in reserve, to add when a real case asks for it:**

- `update-overrides`, which would change a mounted entry's props without remounting it. `render` already does, measured with `controls` (5.2). Reopened by an adapter that remounts on every `render`, or a component that loses its state across an edit.
- `set-globals`, which would apply a locale to the preview. No consumer, and no shape a case has demonstrated. The theme travels with `render` since v1.40 (5.2).
- The preview hooks `beforeMount`, `onPropsChange` and `beforeUnmount` of 6.2. `beforeMount` returns with `actions`, which fills undeclared function props (6.4); the other two have no consumer.
- A `render` escape hatch on a story, to make a controlled component truly interactive. Left out of v1 for lack of a demonstrated case, see 2.7. Adding it later breaks nothing; shipping it now would create a use we could not take back.
- Documenting pass-through DOM attributes, see 3.4.
- Path aliases inside style sheets, see 1.5.

---

## 8. What is built today

This document is a contract. This section is the only place that says what exists, so that a reader never has to guess.

| Section | State |
| --- | --- |
| 1.1, story files | discovered and read, in the four extensions. The tree, the identifiers and the call code come out of them. Markdown pages are discovered beside them. The shell's docs view lists every component, with its page when it has one, and the general pages by path. A component's page carries a live example of its first story, its props and the tokens it reads, generated from the catalogue |
| 1.2, `crypte check` | built, all five problems. The component with no story is looked for in the folders the stories already point at, since no components root is declared anywhere |
| 1.5, project configuration | the config is read, and the declared style sheet is loaded by the preview. Two adapters exist, `@crypte/react` and `@crypte/vue`, and `apps/demo-vue` renders Vue stories in the same shell |
| 1.5, path aliases | built |
| 2 and 3, the types | built, and `defineStories` and `story` with them. Inference reads what a component file declares, and 3.2's merge completes it from the story file |
| 4, the manifest | built, and written by `crypte dev` at start-up, on every restart of the configuration and on every rebuild, so the file follows what is served. The CLI produces `story` and `page` entries and a plugin's `node` surface contributes `tokens` ones (6.3); the shell draws all three |
| 4.6, the fingerprint | built, written by `crypte build`, and by `crypte dev` whenever the catalogue served changes it: at start-up, on a restart of the configuration, and on a story change. So `crypte check` does not fail after a session, and trying a `stories` path then reverting rewrites the same bytes. `crypte dev` also reads the version a commit holds, `HEAD` or one named in the route's query, through Git, and serves the shell the stories that appeared, disappeared, or whose props or status moved, and the tokens that appeared, disappeared or changed value |
| 5, the channel | built and exercised on both sides |
| 6, plugin contract | the `node` surface is built, called by the producer, and used by `@crypte/tokens`. The `shell` and `preview` modules are loaded, and the shell mounts each shell module in a frame that folds when the panel is `inapplicable` and remembers whether it is open. A preview module's `afterMount` and `onMessage` are called, plugin messages cross the channel both ways, and a preview module that fails is named in the shell. `@crypte/controls` edits a story's props through `overrides`, `@crypte/a11y` analyses each render with axe-core and unfolds its panel with `null` when a violation appears, and the demonstration's `hello` and `status` plugins use the rest. `controls` does not add `min`, `max`, `step` or `control` to `PluginPropDetails` yet (3.3), so writing them is still a compile error. A panel's props and events are typed by `PanelProps` and `PanelEvents`, and a key a plugin does not have is refused. A plugin's `view` is built: its entry in the activity bar and in ⌘K, its sidebar, canvas and panel, typed by `PluginView`, `ShellView`, `ViewProps` and `ViewEvents`, and the demonstration's `i18n` plugin draws one. A project's own plugin imports them from `@crypte/cli`. **Frozen** since v1.25 (6.5) |

**The shell speaks English and French**: the browser's language, French when it is French and English otherwise, then the choice of a switch at the foot of the activity bar, kept from one visit to the next. What comes from the project, the CLI or Git, names, messages and reasons, keeps its own language. The panels of the official plugins follow it through `locale` (6.1).

**`dev`, `build`, `check`, `init` and `mcp` are built.** The dev server reads the project, writes both files, and serves two pages: the shell prebuilt inside the CLI, and a preview compiled in the project by the CLI's own Vite, with the plugins the project declares in `vite.plugins`. A story renders, switching story works, and a story that throws shows its error instead of an empty frame. `crypte build` writes the same two pages into `crypte-static/`, the preview compiled once, beside what the dev server's routes answer, read once; every address the shell and the preview ask for is relative, so the folder may be served below a path. Both commands also give `index.json` and `iframe.html?id=` in the shape a built Storybook publishes, so zeroheight, Supernova and Knapsack can list and embed the stories. `iframe.html` draws through the path a render from the shell takes, so the preview modules of the plugins follow it and an edit redraws it, and writes a failure beside the story. The ids are those of 4.3, which a nested path keeps with its `/`. A compatibility export, never Crypte's own format, which follows Storybook's if it changes. `crypte mcp` serves the catalogue to a coding agent in the repository, as a Model Context Protocol server over stdio: four tools, the components, one component with its props, its stories' call code and its guidelines, the tokens, and what changed since a point of the history, each read from the story files at the call. `crypte init` writes the configuration of 1.5 into a project that already has its components, with a skill for a coding agent, `.claude/skills/write-stories/SKILL.md`, which writes a component's stories from the places the application calls it rather than from its signature; a project already configured gets the skill alone, and one already there is never overwritten. It has no section of its own because the configuration it writes is 1.5 itself.

Twelve known gaps between this document and the code:

- **A build reads any other point from a public GitHub repository only.** The versions view of a static folder reads the default branch, the tags and the two periods `crypte build` wrote; a commit or a date typed in is read from GitHub, without a token, so a private repository or another host says why it cannot be read. The token a private repository needs waits for the `editor` plugin (DCJ-343).

- **A plugin's peer range checks the copies npm installs, never the ones its panel runs on.** `vue` and `@crypte/ui` reach a panel from the installed CLI's shell, through its import map (6.1). A plugin newer than that CLI, which imports a component its `@crypte/ui` does not have yet, fails to load, and the frame shows the import error in the panel's place. Pinning `@crypte/cli` instead would move the whole `fixed` group to a major version at every minor one, measured with `changeset status` (DCJ-352).
- **The preview is compiled by the CLI's Vite, and nothing checks the project's plugins against it.** A project on another major keeps its own Vite for its build, and its `vite.plugins` run in the CLI's anyway. Measured on a project on Vite 6: its React plugin warned about deprecated options and every story rendered. Resolving the project's own Vite instead would be a rework, not a fix.
- A path alias cannot replace an installed package. `"vue": ["shims/vue.js"]` has no effect while `vue` is installed, because the resolver runs after Vite's own. TypeScript would return the replacement file.
- **Inference reads what a file declares, never what a type it cannot resolve holds.** A type alias, an interface and a `cva(…)` call declared in the component file are followed. An imported type, a generic, a DOM part of an intersection, and an `extends` clause other than `VariantProps` of a local `cva` each leave only what the component file writes by hand, which for a DOM pass-through is the names in its destructuring pattern. Enumerating the rest needs the type checker, and inventing names is what 4.2 forbids.
- **`ShellContribution` is declared opaque by the core**, which knows no Vue and cannot name a component. The shell mounts a shell module's export without checking more than that it is an object or a function.
- The serialisation of 4.5 is guaranteed on **contributed** entries and merely true of the others. A plugin's entry is checked and refused with what offends named; everything the CLI reads itself comes from source text and is serialisable by construction, so nothing exercises the guarantee there.
- **`component.tokens` misses what a global style sheet gives a component.** A class written in a sheet the component does not import ties no custom property to it, since nothing in the component file names it. Reading which rules reach a component needs it rendered, which the producer never does. An imported sheet edited alone is not watched either, so its names follow at the next component change or restart.
- **A style sheet other than the declared one is not watched.** `crypte dev` rebuilds the catalogue when the `css` of 1.5 changes, as for a story or a component, and reloads the preview when its tokens moved. A sheet a plugin reads by its own option, `tokens({ files })` for one, is followed only at the next rebuild or restart.
- **A sheet that switches theme only under `@media (prefers-color-scheme: dark)` does not follow the `theme` of 5.2.** No page can force that media query on itself, so such a preview keeps the system's theme whatever the shell asks. Rewriting the sheet's media rules into `[data-theme]` ones would mean editing the project's CSS.
- **A global `wrap` (2.5) cannot be a `.vue` component.** `crypte.config.ts` is evaluated in Node, which does not load a `.vue` file, and the configuration fails to load. A story file's own `wrap` can, since only the preview runs it. Reopened by a project whose provider is a `.vue` file every story needs.
- `component.file` is resolved without Vite. The producer runs before any server exists, so it applies the project's `paths` and tries the usual extensions, with no plugin and no `exports` field. A component reached through a plugin keeps the identifier the story wrote. `crypte check` calls such an entry an orphan only when the project could have reached it itself, that is a relative path or an alias it declares; anything else it leaves alone.

---

## 9. Version log

**v1.54.** The shell passes its language to the plugins (6.1).

| Before | After |
| --- | --- |
| a plugin could not know the shell's language | panels and view parts receive `locale`, and a view's `label` may be one per language |

**v1.53.** The shell speaks English and French (8).

| Before | After |
| --- | --- |
| the shell was in English only | it follows the browser's language, French or English, and a switch in the activity bar |

**v1.52.** A test ties the manifest's shape to its version (4.2).

| Before | After |
| --- | --- |
| the version rule was prose, held by no test | `manifest-shape.v1.json` records the shape, and a shape that moves without being recorded fails |

**v1.51.** `crypte init` writes a skill that writes stories from usage (8).

| Before | After |
| --- | --- |
| the health view's prompt handed an agent a skeleton built from the component's signature | `crypte init` writes `write-stories`, which reads the calls in the application, and the prompt sends the agent to it |

**v1.50.** A coding agent can read the catalogue (8).

| Before | After |
| --- | --- |
| an agent read `.crypte/manifest.json` as a file, when it knew of it | `crypte mcp` gives it the components, a component's props and call code, the tokens and the changes, as MCP tools |

**v1.49.** The fingerprint's shape and its comparison move to the core, and a build compares with any point of a public GitHub repository (4.6, 8).

| Before | After |
| --- | --- |
| `Fingerprint` and the comparison lived in the CLI, and the shell copied the shape of `Changes` | `@crypte/core/protocol` exports them, with `compareFingerprints` and `readFingerprint` |
| a commit or a date typed in on a build said the build held no comparison from it | it is read from GitHub when the repository is there |

**v1.48.** The stories can be read in the shape of a built Storybook (8).

| Before | After |
| --- | --- |
| a tool that embeds Storybook stories had nothing to read | `crypte dev` and `crypte build` give `index.json` and `iframe.html?id=`, a page that renders one story with no shell |

**v1.47.** The workshop can be built as a static folder (4.6, 8).

| Before | After |
| --- | --- |
| the workshop existed while `crypte dev` ran, and only it wrote the fingerprint | `crypte build` writes `crypte-static/`, the shell, the compiled preview and what the routes answer, and writes the fingerprint without a server |

**v1.46.** A wrapper can be turned off from the shell (5.2, 5.3).

| Before | After |
| --- | --- |
| a story always rendered inside all its wrappers | `rendered` names them in `wraps`, `render` leaves out the ranks in `muted`, and the stories panels list them with a toggle each |

**v1.45.** The adapter type moves to the core, and a Vue adapter exists (1.4, 1.5).

| Before | After |
| --- | --- |
| `adapter` was `unknown`, and its shape lived in `@crypte/react` | `Adapter` is the core's, from `@crypte/core/preview`, re-exported by `@crypte/cli`, and `@crypte/vue` implements it too |

**v1.44.** Markdown pages in the story folder (1.1, 4.2).

| Before | After |
| --- | --- |
| `"page"` was a reserved `type` nothing produced | a `.md` of the story folder is a `page` entry, shown on its component's page or in the tree |

**v1.43.** A plugin may have a view of its own in the activity bar (6.1).

| Before | After |
| --- | --- |
| a plugin drew a panel beside the stories, nothing else | a plugin's `view` puts an entry in the activity bar, and its shell module's `view` export draws the sidebar, canvas and panel |

**v1.42.** The health view reads the a11y plugin's results (5.4).

| Before | After |
| --- | --- |
| a plugin message went only to that plugin's panel | the shell's accessibility audit reads `a11y:results` too |

**v1.41.** The components folder the health view counts (1.5).

| Before | After |
| --- | --- |
| nothing said how many components a project has, only which ones its stories reach | `components` names their folder, and the health view counts the components with a story against it |

**v1.40.** The theme a story is drawn in (5.2).

| Before | After |
| --- | --- |
| nothing told the preview which theme to draw in, and `set-globals` held that in reserve | `render` carries an optional `theme`, set as `data-theme` and `color-scheme` on the preview's root |

**v1.39.** Tokens in the fingerprint, and a comparison from any commit (4.6).

| Before | After |
| --- | --- |
| the fingerprint held story entries only, compared with `HEAD` | it holds the tokens too, each with the literal of each theme, and the comparison starts from `HEAD`, a branch, a tag, a commit or the last commit before a date |

**v1.38.** Which components a token reaches (4.2).

| Before | After |
| --- | --- |
| nothing tied a token to the components that read it | `component.tokens` lists the custom properties each component reads, from its file and the style sheets it imports |

**v1.37.** Where a story sits in the stage (2.4).

| Before | After |
| --- | --- |
| a story sat at the top left of the frame, with no option of the core | the core's `layout` option centres it by default, or pads it, or gives it the whole frame |

**v1.36.** The shell hands a panel back what it edited (6.1).

| Before | After |
| --- | --- |
| a panel kept its own copy of what it edited, and reset it itself | it reads it as its `overrides` prop, and the head's Reset all clears it |

**v1.35.** What a story rendered with reaches the panels (5.3, 6.1).

| Before | After |
| --- | --- |
| a panel knew a prop's type and default, never the value the story passed | `rendered` carries `values`, and a panel reads them as its `values` prop |

**v1.34.** A panel draws with the design system (6.1).

| Before | After |
| --- | --- |
| `vue` was the one bare import of a shell module, and a panel drew native controls | `@crypte/ui` joins it through the import map, and a panel draws with the shell's components |

**v1.33.** What the shell reaches outside the channel (5.1).

| Before | After |
| --- | --- |
| `postMessage` only | `postMessage`, plus `pagehide` on the frame's window and the `zoom` of its root element |

**v1.32.** What `status` drives in the sidebar (2.6).

| Before | After |
| --- | --- |
| a badge beside the component, and a filter | the filter alone, which greys the components without the chosen status |

**v1.31.** The shell's design tokens, which panels read (6.1).

| Before | After |
| --- | --- |
| a panel's colors were its own, and stayed light in a dark shell | the shell's tokens reach it as custom properties, and 6.1 names them |

**v1.30.** What a panel removed from the configuration leaves behind (6.1), from the second audit of the frozen contract.

| Before | After |
| --- | --- |
| its values stayed in the render with no panel to show them, and came back when the plugin returned | they leave with the panel |

**v1.29.** Writing a plugin from this document alone (1.4, 5.4, 6.1), from the audit of the frozen contract.

| Before | After |
| --- | --- |
| a project's own plugin could not type its panel or its hooks: the types lived in the core, which a project does not import | `@crypte/cli` re-exports them, and 1.4 says what such a plugin does not declare |
| an unknown message was said to be a compile error, which it never was in `ctx.send`, `send` or `received` | the declarations type the core's channel, and the text says so |
| nothing said a factory's options cannot reach its browser modules | only the module's URL crosses, and 6.1 says so |

**v1.28.** What panels edit (6.1), from the audit of the frozen contract.

| Before | After |
| --- | --- |
| an override that was not a primitive went on to `postMessage`, which threw without naming anyone | it is refused, named with its plugin and prop |
| a panel's edit replaced every other panel's | the render merges them in configuration order |

**v1.27.** What a plugin in trouble costs in the preview (6.1, 6.2), from the audit of the frozen contract.

| Before | After |
| --- | --- |
| the preview waited for every plugin module before the first story | a module attaches when it arrives, and one that never does costs nothing |
| a panel could not tell that the story on display failed to render | `failed` carries the error's message |
| a named export beside the default was never read, without a word | it is refused with its reason |

**v1.26.** Two corrections from the audit of the frozen contract (6.1, 6.2), neither a break.

| Before | After |
| --- | --- |
| a factory passed uncalled, `plugins: [controls]`, did nothing without a word | it is refused with its reason |
| a hook left `undefined` had its whole module refused | it counts as absent |

**v1.25.** Section 6 is frozen: `controls` and `a11y`, the two plugins 6.5 waited for, both use it (6.1, 6.5).

| Before | After |
| --- | --- |
| section 6 was provisional | removing anything, narrowing what a plugin gives or widening what it is given is a break |
| what a panel receives and emits was described in prose | `PanelProps` and `PanelEvents` type it, and both plugins declare with them |
| a key a plugin does not have was ignored | it is refused with its reason |
| a refusal was said in the terminal only | the shell names it beside the panels |

**v1.24.** A folded panel opens on a click (6.1).

| Before | After |
| --- | --- |
| a panel folded by `inapplicable` could not be opened | a click opens it for the story on display, its reason kept above |

**v1.23.** `@crypte/a11y`, the second plugin 6.5 waits for, and what it asked of the contract (6.1, 6.2).

| Before | After |
| --- | --- |
| a panel folded by `inapplicable` stayed folded until the next story | `null` unfolds it on the same story |
| 6.1 called `PreviewHooks` opaque, with no caller | the core types it, and `afterMount` and `onMessage` are called |
| 6.1 said a preview module imports what it needs | a CommonJS dependency is not pre-bundled once the plugin is installed |

**v1.22.** A preview module's hooks are called, and plugin messages cross the channel (5.3, 5.4, 6.2).

| Before | After |
| --- | --- |
| 6.2 specified four hooks and no preview called any | `afterMount` and `onMessage` are called; the other three wait in section 7 |
| `PreviewContext` could send and not receive | `onMessage` receives what the plugin's panel sent |
| a preview module that failed was said in the frame's console only | `plugin-error` names it in the shell |

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
