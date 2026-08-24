// Reads a project's CSS custom properties and contributes them to the manifest.
// See section 6.3 of docs/contracts.md.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
      css = readFileSync(join(ctx.root, file), 'utf8')
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

  for (const [theme, values] of declared) {
    for (const [name, raw] of values) {
      const [family, key] = split(name)
      const tokens = families.get(family) ?? new Map<string, TokenValue>()
      const resolved = resolve(raw, values)
      const value = tokens.get(key) ?? { type: 'unknown' as TokenKind, themes: {} }

      // The first theme that says something. A `var()` nobody declared reads as
      // `unknown`, and another theme resolving properly should still name it.
      if (value.type === 'unknown') value.type = kindOf(resolved.value)
      value.themes[theme] = resolved
      tokens.set(key, value)
      families.set(family, tokens)
    }
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
    const end = closing(css, start)
    if (end === -1) break

    rest += css.slice(from, match.index)
    dark += `${css.slice(start, end)}\n`
    from = end + 1
    opening.lastIndex = from
  }

  return { dark, rest: rest + css.slice(from) }
}

// Where the block opened at `from` closes, or -1 on an unbalanced sheet.
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
    const name = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)?.[1]
    // A name already walked is a cycle, and stopping leaves `value` on the
    // `var()` text that closed the loop, which is what the reader will see.
    if (name === undefined || seen.has(name)) break

    seen.add(name)
    alias.push(name)

    const next = values.get(name)
    if (next === undefined) break
    value = next
  }

  return alias.length === 0 ? { value } : { value, alias }
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
