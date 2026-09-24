// `crypte check`: the three problems section 1.2 names. See docs/contracts.md.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseSync } from 'vite'
import type { Manifest } from '@crypte/core/protocol'
import { configWrappers } from './config-source'
import { FINGERPRINT, fingerprintOf } from './fingerprint'
import { componentFile, storiesOf, buildCatalogue } from './manifest'
import { best, isBareSpecifier, ordered } from './paths'
import { loadProject, type Project } from './project'
import type { Node } from './ast'
import { wrappersOf } from './stories'

export interface Problem {
  kind: 'orphan' | 'unstoried' | 'stale' | 'unreadable'
  // Project-relative for a component the producer resolved. An orphan carries
  // the identifier the story wrote instead, and a component outside the root
  // its absolute path: both read where a chain of `..` would not.
  file: string
  name: string
}

// Which files are opened, not which ones count: the parser refuses every other
// extension anyway. It is a read filter, and the tree it walks is a project's,
// so the measure is on a real one.
const READ = ['.tsx', '.jsx', '.ts', '.js']

// A story whose component is gone. The producer resolves `component.file`
// without Vite, so an unresolvable one keeps the identifier the story wrote:
// section 8. Not existing is therefore how a failed resolution shows.
export function orphans(project: Project, entries: ReturnType<typeof storiesOf>): Problem[] {
  return entries
    .filter((entry) => !existsSync(join(project.root, entry.component.file)))
    .filter((entry) => addressable(entry.component.file, project))
    .map((entry) => ({ kind: 'orphan' as const, file: shown(project, entry), name: entry.id }))
}

// Where an orphan's component was, read from the project root. The story wrote
// it relative to itself: `../src/components/Badge` from the root names nothing.
// An alias or a package name reads the same from anywhere, so it stays.
function shown(project: Project, entry: ReturnType<typeof storiesOf>[number]): string {
  const specifier = entry.component.file
  if (!specifier.startsWith('.')) return specifier

  return named(project.root, resolve(project.root, dirname(entry.storyFile), specifier))
}

// A bare specifier no alias resolves belongs to a package or a plugin: the
// identifier reaches here unchanged and looks like a deleted component.
// Without this filter, `crypte check` exits 1 on a correct project.
function addressable(specifier: string, project: Project): boolean {
  if (!isBareSpecifier(specifier)) return true

  const paths = project.paths

  return paths !== undefined && best(ordered(paths.paths), specifier) !== undefined
}

// Read from the components stories point at, never from a declared root. So a
// folder no story reaches is invisible here, deliberately: walking the project
// instead would warn about everything, which 1.2 forbids.
function componentFolders(project: Project, entries: ReturnType<typeof storiesOf>): string[] {
  const seen = new Set<string>()

  for (const entry of entries) {
    const file = join(project.root, entry.component.file)
    if (existsSync(file)) seen.add(dirname(file))
  }

  return [...seen].sort()
}

// An exported name that a story points at, as `file#export`, so two components
// of the same name in two files never cover for each other.
function storied(project: Project, entries: ReturnType<typeof storiesOf>): Set<string> {
  return new Set(
    entries.map((entry) => `${join(project.root, entry.component.file)}#${entry.component.export}`),
  )
}

// The components the project already declares as frames, by the `wrap` of its
// configuration or of a story file. They are context, not a component missing
// its story.
function wrappers(project: Project, entries: ReturnType<typeof storiesOf>): Set<string> {
  const config = join(project.root, 'crypte.config.ts')
  const declared = [
    ...configWrappers(project).map((one) => ({ ...one, from: config })),
    ...[...new Set(entries.map((entry) => join(project.root, entry.storyFile)))].flatMap((file) =>
      wrappersOf(file).map((one) => ({ ...one, from: file })),
    ),
  ]

  return new Set(
    declared.map(
      (one) => `${join(project.root, componentFile(one.file, one.from, project))}#${one.export}`,
    ),
  )
}

// Capitalised and returning an element, both: `stepFromProgress` is no
// component, and a capitalised constant is none either. One group per component
// holds every name the file exports it under, so a story on any covers it.
export function componentsIn(file: string): string[][] {
  let parsed: ReturnType<typeof parseSync>
  let source: string

  try {
    source = readFileSync(file, 'utf8')
    parsed = parseSync(file, source)
  } catch {
    return []
  }

  if (parsed.errors.length > 0) return []

  const body = parsed.program.body as Node[]
  // Read first: `export default Card` may come before or after the declaration
  // it names.
  const also = synonyms(body)
  const found: string[][] = []

  for (const node of body) {
    if (node.type === 'ExportDefaultDeclaration') {
      const inner = node['declaration'] as Node | undefined
      if (!inner || !returnsElement(inner) || !capitalised(nameOf(inner))) continue

      // `export default function Card` binds `Card` too, and the file may
      // export that binding again under another name.
      found.push(group('default', idOf(inner), also))
      continue
    }

    if (node.type !== 'ExportNamedDeclaration') continue

    const declaration = node['declaration'] as Node | undefined
    if (!declaration) continue

    for (const one of declared(declaration)) {
      if (!capitalised(one.name) || !returnsElement(one.value)) continue

      found.push(group(one.name, one.name, also))
    }
  }

  return found
}

// The names one component answers to, the one it is declared under first.
function group(primary: string, local: string | undefined, also: Map<string, string[]>): string[] {
  return [...new Set([primary, ...(local === undefined ? [] : (also.get(local) ?? []))])]
}

function idOf(node: Node): string | undefined {
  return (node['id'] as Node | undefined)?.['name'] as string | undefined
}

// The further names a local one is exported under, `default` included. A
// re-export, `export { Card as default } from './card'`, declares none here.
function synonyms(body: Node[]): Map<string, string[]> {
  const found = new Map<string, string[]>()
  const add = (local: string, exported: string) =>
    found.set(local, [...(found.get(local) ?? []), exported])

  for (const node of body) {
    if (node.type === 'ExportDefaultDeclaration') {
      const inner = node['declaration'] as Node | undefined
      if (inner?.type === 'Identifier') add(inner['name'] as string, 'default')
      continue
    }

    // A type-only export names nothing at run time, so a story could not point
    // at it. Both places it is written: on the statement and on the specifier.
    if (node.type !== 'ExportNamedDeclaration' || node['source'] != null) continue
    if (node['exportKind'] === 'type') continue

    for (const one of node['specifiers'] as Node[]) {
      if (one['exportKind'] === 'type') continue

      const local = one['local'] as Node | undefined
      const exported = one['exported'] as Node | undefined

      if (local?.type === 'Identifier' && typeof exported?.['name'] === 'string') {
        add(local['name'] as string, exported['name'])
      }
    }
  }

  return found
}

// The names an export declaration binds, with the expression behind each.
function declared(declaration: Node): { name: string; value: Node }[] {
  // A named `export function` always carries its identifier: the grammar
  // requires it, and the anonymous default goes through the other branch.
  if (declaration.type === 'FunctionDeclaration') {
    return [{ name: (declaration['id'] as Node)['name'] as string, value: declaration }]
  }

  if (declaration.type !== 'VariableDeclaration') return []

  return (declaration['declarations'] as Node[]).flatMap((one) => {
    const id = one['id'] as Node | undefined
    const name = id?.type === 'Identifier' ? (id['name'] as string) : undefined
    const value = one['init'] as Node | undefined

    return name === undefined || value === undefined ? [] : [{ name, value }]
  })
}

function nameOf(node: Node): string {
  return ((node['id'] as Node | undefined)?.['name'] as string | undefined) ?? 'Default'
}

// A name a component may carry. JSX itself uses the same rule to tell a
// component from an intrinsic element, so this is the language's own line.
function capitalised(name: string): boolean {
  const first = name.slice(0, 1)

  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase()
}

// Read from the body, never from a type: a type would need the checker. A
// wrapped `memo(Card)` gives nothing back here, so it is never reported.
function returnsElement(node: Node): boolean {
  const body = node['body'] as Node | undefined
  if (!body) return false

  // A concise arrow body is the expression itself.
  if (body.type !== 'BlockStatement') return isElement(body)

  return (body['body'] as Node[]).some((one) => statementReturnsElement(one))
}

// Only the statements a component's shape actually uses: a bare `return`, and
// the two branches of an early one. Going deeper would need control flow, and
// the answer would still be a guess.
function statementReturnsElement(node: Node): boolean {
  if (node.type === 'ReturnStatement') {
    const value = node['argument'] as Node | undefined

    return value !== undefined && value !== null && isElement(value)
  }

  if (node.type === 'IfStatement') {
    const then = node['consequent'] as Node | undefined
    const other = node['alternate'] as Node | undefined

    return (
      (then !== undefined && branchReturnsElement(then)) ||
      (other !== undefined && other !== null && branchReturnsElement(other))
    )
  }

  return false
}

function branchReturnsElement(node: Node): boolean {
  if (node.type === 'BlockStatement') {
    return (node['body'] as Node[]).some((one) => statementReturnsElement(one))
  }

  return statementReturnsElement(node)
}

// An element, or a conditional whose sides are elements. `null` on one side is
// how a component says it renders nothing, and it stays a component.
function isElement(node: Node): boolean {
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true
  if (node.type === 'ParenthesizedExpression') return isElement(node['expression'] as Node)

  if (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression') {
    const left = (node['consequent'] ?? node['left']) as Node | undefined
    const right = (node['alternate'] ?? node['right']) as Node | undefined

    return (left !== undefined && isElement(left)) || (right !== undefined && isElement(right))
  }

  return false
}

// The problems read from the stories, in the order 1.2 lists them; the
// fingerprint is `staleOf`'s. Never throws: a project that
// cannot be read is the caller's message, not this function's.
export function problemsOf(
  project: Project,
  manifest: Manifest = buildCatalogue(project).manifest,
): Problem[] {
  const entries = storiesOf(manifest)

  // A story file meant as one and not read is a broken story, like an orphan.
  // While one exists, nobody knows which component it covers, so the components
  // with no story are not listed: accusing its component sent the reader to the
  // wrong file. When in doubt, report nothing, which 1.2 asks.
  const unreadable = (manifest.skipped ?? []).map((one) => ({
    kind: 'unreadable' as const,
    file: one.file,
    name: one.reason,
  }))
  if (unreadable.length > 0) return [...orphans(project, entries), ...unreadable]

  const known = new Set([...storied(project, entries), ...wrappers(project, entries)])
  const unstoried: Problem[] = []

  for (const folder of componentFolders(project, entries)) {
    for (const name of readdirSync(folder, { withFileTypes: true })) {
      if (!name.isFile() || !READ.some((one) => name.name.endsWith(one))) continue

      const file = join(folder, name.name)

      for (const group of componentsIn(file)) {
        if (group.some((one) => known.has(`${file}#${one}`))) continue

        unstoried.push({ kind: 'unstoried', file: named(project.root, file), name: group[0]! })
      }
    }
  }

  return [...orphans(project, entries), ...unstoried]
}

// The committed fingerprint against the one the stories give today, section 4.6.
// Behind or missing fails the command: the file is committed so that a pull
// request shows what its catalogue changed, and a CI running `crypte check` is
// what refuses a branch that forgot to update it. Reopened if projects commit
// stories without ever running `crypte dev`.
export function staleOf(project: Project, manifest: Manifest): Problem[] {
  const file = join(project.root, FINGERPRINT)
  if (!existsSync(file)) return [{ kind: 'stale', file: FINGERPRINT, name: 'missing' }]

  // Compared as data, never as text: whitespace in the committed file is not a
  // change of catalogue.
  let committed: unknown
  try {
    committed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // Conflict markers left by a merge, most often.
    return [{ kind: 'stale', file: FINGERPRINT, name: 'unreadable' }]
  }

  return JSON.stringify(committed) === JSON.stringify(fingerprintOf(manifest))
    ? []
    : [{ kind: 'stale', file: FINGERPRINT, name: 'behind' }]
}

// Project-relative, except outside the root where that is a chain of `..`.
function named(root: string, file: string): string {
  const said = relative(root, file).split(sep).join('/')

  return said.startsWith('..') ? file : said
}

// How each state of a stale fingerprint reads in a sentence.
const STALE: Record<string, string> = {
  missing: 'missing',
  unreadable: 'unreadable',
  behind: 'behind the stories',
}

// What the user reads. Orphans, unreadable story files and a stale fingerprint
// decide the exit code; a component with no story is a warning and never
// fails, which 1.2 states.
export function linesOf(problems: Problem[]): string[] {
  const said = problems.map((one) =>
    one.kind === 'orphan'
      ? `${one.name}: its component is gone, ${one.file}`
      : one.kind === 'stale'
        ? `${one.file} is ${STALE[one.name] ?? one.name}: run crypte dev and commit it`
        : one.kind === 'unreadable'
          ? `${one.file}: this story file cannot be read, ${one.name}`
          : `${one.file}: ${one.name} has no story`,
  )

  if (problems.some((one) => one.kind === 'unreadable')) {
    said.push('components with no story are not listed while a story file cannot be read')
  }

  return said.length === 0 ? ['nothing to report'] : said
}

export async function check(
  input: string,
  log: (line: string) => void = console.log,
): Promise<number> {
  const project = await loadProject(input)
  const { manifest } = buildCatalogue(project)
  const problems = [...problemsOf(project, manifest), ...staleOf(project, manifest)]

  for (const line of linesOf(problems)) log(line)

  return problems.some((one) => one.kind !== 'unstoried') ? 1 : 0
}
