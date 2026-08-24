// Reads a project's CSS custom properties and contributes them to the manifest.
// See section 6.3 of docs/contracts.md.

import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import {
  storyId,
  type CryptePlugin,
  type NodeContext,
  type TokenInTheme,
  type TokenKind,
  type TokensEntry,
  type TokenValue,
} from '@crypte/core/protocol'

export interface TokensOptions {
  // The style sheets to read, project-relative. Defaults to the one the project
  // declared as `css`, which is the only file it has told Crypte about.
  files?: string[]
}

export default function tokens(options: TokensOptions = {}): CryptePlugin {
  return {
    name: 'tokens',
    node: { entries: (ctx) => entriesOf(ctx, options) },
  }
}

// The theme a `:root` with no qualifier writes into. Not `light`: nothing says
// the unqualified values are the light ones.
const DEFAULT_THEME = 'default'

// One entry per family, a family being the first segment of a name. Nothing at
// all when there is nothing to find: this plugin is on by default, so it runs on
// projects that never asked for it.
function entriesOf(ctx: NodeContext, options: TokensOptions): TokensEntry[] {
  const files = options.files ?? (ctx.css === undefined ? [] : [ctx.css])
  const declared = new Map<string, Map<string, string>>()

  for (const file of files) {
    let css: string
    try {
      css = readFileSync(resolvePath(ctx.root, file), 'utf8')
    } catch {
      // A declared style sheet that is not there is the project's business, and
      // `crypte dev` already fails on it elsewhere. Nothing to contribute.
      continue
    }

    for (const [theme, values] of readSheet(css)) {
      const into = declared.get(theme) ?? new Map<string, string>()
      for (const [name, value] of values) into.set(name, value)
      declared.set(theme, into)
    }
  }

  const families = new Map<string, Map<string, TokenValue>>()

  // The default first, then the rest by name, so the manifest does not depend on
  // which theme the sheet happened to declare first and neither does the kind.
  const themes = [...declared.keys()].sort((one, other) =>
    one === DEFAULT_THEME ? -1 : other === DEFAULT_THEME ? 1 : one.localeCompare(other, 'en'),
  )
  const base = declared.get(DEFAULT_THEME) ?? new Map<string, string>()
  const names = new Set([...declared.values()].flatMap((one) => [...one.keys()]))

  // Each theme's own declarations folded over the default's, so an alias written
  // once in `:root` still lands on what the theme redefined. Without it a token
  // aliasing a colour that changes in the dark had no dark value at all, and the
  // swatch had nothing to draw. Built once per theme: it does not vary by name.
  const folded = new Map(
    themes.map((theme) => [
      theme,
      theme === DEFAULT_THEME ? base : new Map([...base, ...(declared.get(theme) ?? [])]),
    ]),
  )

  for (const name of [...names].sort((one, other) => one.localeCompare(other, 'en'))) {
    const [family, key] = split(name)
    const tokens = families.get(family) ?? new Map<string, TokenValue>()
    const value: TokenValue = { type: 'unknown', themes: {} }

    // A token carries every theme that declares it, its own or the default's. A
    // theme is absent when the sheet says nothing there, which a token written
    // only under `[data-theme="dark"]` does: inventing a default would be worse.
    for (const theme of themes) {
      const values = folded.get(theme) ?? base
      const raw = values.get(name)
      if (raw === undefined) continue

      const resolved = resolve(raw, values)
      if (value.type === 'unknown') value.type = kindOf(resolved.value)
      value.themes[theme] = resolved
    }

    tokens.set(key, value)
    families.set(family, tokens)
  }

  return [...families]
    .map(([family, tokens]) => ({
      type: 'tokens' as const,
      id: storyId(['Tokens'], family),
      path: ['Tokens'],
      name: family,
      tokens: Object.fromEntries(tokens),
    }))
    .sort((one, other) => one.id.localeCompare(other.id, 'en'))
}

// `--color-brand-primary` gives the `color` family and the `brand-primary` key.
// A name with no separator is a family of one, which keeps a lone `--radius` in
// the tree instead of dropping it.
function split(name: string): [string, string] {
  const at = name.indexOf('-')

  return at === -1 ? [name, name] : [name.slice(0, at), name.slice(at + 1)]
}

// The declarations of one style sheet, by theme. Comments go first, so a
// property commented out is not read as one.
function readSheet(css: string): Map<string, Map<string, string>> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const { dark, rest } = liftDark(source)
  const found = new Map<string, Map<string, string>>()

  for (const [text, forced] of [
    [dark, 'dark'],
    [rest, undefined],
  ] as const) {
    for (const [selector, body] of blocks(text)) {
      const theme = forced ?? themeOf(selector)
      if (theme === undefined) continue

      const into = found.get(theme) ?? new Map<string, string>()
      for (const [name, value] of declarations(body)) into.set(name, value)
      if (into.size > 0) found.set(theme, into)
    }
  }

  return found
}

// `@media (prefers-color-scheme: dark)` blocks, taken out with their braces
// balanced. Without this the `:root` inside would read as a second helping of
// the default theme, and its values would overwrite the first.
function liftDark(css: string): { dark: string; rest: string } {
  const opening = /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/g
  let dark = ''
  let rest = ''
  let from = 0
  let match: RegExpExecArray | null

  while ((match = opening.exec(css)) !== null) {
    const start = match.index + match[0].length
    // Unclosed, the block runs to the end of the sheet, which is what a browser
    // does with it. Leaving it in `rest` instead would put its `:root` back in
    // the default theme and overwrite it, the very failure this prevents.
    const end = closing(css, start)
    const to = end === -1 ? css.length : end

    rest += css.slice(from, match.index)
    dark += `${css.slice(start, to)}\n`
    from = to + 1
    opening.lastIndex = from
  }

  return { dark, rest: rest + css.slice(from) }
}

// Where the block opened at `from` closes, or -1 when the sheet never closes it.
function closing(css: string, from: number): number {
  let depth = 1

  for (let at = from; at < css.length; at += 1) {
    if (css[at] === '{') depth += 1
    else if (css[at] === '}') {
      depth -= 1
      if (depth === 0) return at
    }
  }

  return -1
}

// Selector and body of each innermost block. A body holding no brace is what
// `[^{}]` asks for, so a rule nested in an at-rule is read on its own.
function blocks(css: string): [string, string][] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((one) => [
    (one[1] ?? '').trim(),
    one[2] ?? '',
  ])
}

// The theme a selector writes into, or nothing when it is not one this reads.
// Narrow on purpose: a class or an attribute nobody declared as a theme would be
// a guess, and a wrong theme is worse than a missing one.
function themeOf(selector: string): string | undefined {
  const attribute = /\[data-theme\s*=\s*["']?([\w-]+)["']?\]/.exec(selector)
  if (attribute?.[1]) return attribute[1]

  return selector.split(',').some((one) => one.trim() === ':root') ? DEFAULT_THEME : undefined
}

function declarations(body: string): [string, string][] {
  return [...body.matchAll(/--([\w-]+)\s*:\s*([^;]+)(?:;|$)/g)].map((one) => [
    one[1] ?? '',
    (one[2] ?? '').trim(),
  ])
}

// The literal a name ends on, and the chain walked to reach it. `value` is
// always set: a swatch renders from it alone, so an unresolvable `var()` keeps
// its own text rather than leaving the field empty.
function resolve(raw: string, values: Map<string, string>): TokenInTheme {
  const alias: string[] = []
  const seen = new Set<string>()
  let value = raw

  for (;;) {
    const pointed = aliasOf(value)
    // A name already walked is a cycle, and stopping leaves `value` on the
    // `var()` text that closed the loop, which is what the reader will see.
    if (pointed === undefined || seen.has(pointed.name)) break

    seen.add(pointed.name)
    alias.push(pointed.name)

    const next = values.get(pointed.name) ?? pointed.fallback
    if (next === undefined) break
    value = next
  }

  return alias.length === 0 ? { value } : { value, alias }
}

// The name a value points at, when the **whole** value is one `var()`. Balanced
// parentheses and nothing after the closing one: `var(--a, 1ms) var(--b, ease)`
// is a composite, not an alias, and reading it as one dropped everything past
// the first parenthesis. Measured.
function aliasOf(value: string): { name: string; fallback?: string } | undefined {
  if (!value.startsWith('var(') || !value.endsWith(')')) return undefined

  let depth = 1

  for (let at = 4; at < value.length; at += 1) {
    if (value[at] === '(') depth += 1
    else if (value[at] === ')') {
      depth -= 1
      if (depth === 0 && at !== value.length - 1) return undefined
    }
  }

  // The fallback of `var(--x, y)` is part of the form and is used when nothing
  // declares `--x`, which is exactly what an author writes it for.
  const inside = value.slice(4, -1)
  const comma = inside.indexOf(',')
  const named = (comma === -1 ? inside : inside.slice(0, comma)).trim()
  if (!/^--[\w-]+$/.test(named)) return undefined

  const name = named.slice(2)

  return comma === -1 ? { name } : { name, fallback: inside.slice(comma + 1).trim() }
}

// Four kinds are read from the value itself. `fontFamily` and `fontWeight` are
// not: telling them apart from a string or a number needs the property they are
// used on, which a variable does not carry. They land on `unknown`, which keeps
// the token documented and rendering.
function kindOf(value: string): TokenKind {
  if (/^(#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\()/i.test(value)) return 'color'
  if (/^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|cm|mm|in)$/i.test(value))
    return 'dimension'
  if (/^-?\d*\.?\d+$/.test(value)) return 'number'

  return 'unknown'
}
