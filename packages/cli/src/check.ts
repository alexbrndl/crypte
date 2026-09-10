// `crypte check`: the two problems section 1.2 names. See docs/contracts.md.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { parseSync } from 'vite'
import { storiesOf, buildCatalogue } from './manifest'
import { best, isBareSpecifier, ordered } from './paths'
import { loadProject, type Project } from './project'
import type { Node } from './stories'

export interface Problem {
  kind: 'orphan' | 'unstoried'
  // Project-relative for a component the producer resolved. An orphan carries
  // the identifier the story wrote instead, and a component outside the root
  // its absolute path: both read where a chain of `..` would not.
  file: string
  name: string
}

// Which files are opened, not which ones count: the parser refuses every other
// extension anyway. It is a read filter, and the tree it walks is a project's,
// so the measure is on a real one. See docs/internal/architecture.md.
const READ = ['.tsx', '.jsx', '.ts', '.js']

// A story whose component is gone. The producer resolves `component.file`
// without Vite, so an unresolvable one keeps the identifier the story wrote:
// section 8. Not existing is therefore how a failed resolution shows.
export function orphans(project: Project, entries: ReturnType<typeof storiesOf>): Problem[] {
  return entries
    .filter((entry) => !existsSync(join(project.root, entry.component.file)))
    .filter((entry) => addressable(entry.component.file, project))
    .map((entry) => ({ kind: 'orphan' as const, file: entry.component.file, name: entry.id }))
}

// Whether the project itself could have reached that identifier. A relative
// path could, and an alias it declares could; anything else is a package or a
// plugin's business, which is the doubt section 8 names and 1.2 says to keep
// quiet about.
export function addressable(specifier: string, project: Project): boolean {
  if (!isBareSpecifier(specifier)) return true

  const paths = project.paths

  return paths !== undefined && best(ordered(paths.paths), specifier) !== undefined
}

// Where components live, read from the ones stories already point at rather
// than declared a second time. Section 0: what a project already writes is
// read, and asking for a components root would be a source of truth that drifts
// from the imports.
//
// A consequence worth stating: a folder no story has reached yet is invisible
// here. That is the safe direction — the alternative is walking the project and
// warning about everything, which is the false-positive flood 1.2 forbids.
export function componentFolders(
  project: Project,
  entries: ReturnType<typeof storiesOf>,
): string[] {
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

// A capitalised export whose function returns an element. Both halves are
// required, and 1.2 says why: `stepFromProgress` exported beside a component is
// never a component, and a capitalised constant is not one either.
//
// One group per component, holding every name it can be imported under: a
// component exported twice, `export function Card` then `export default Card`,
// is one component, and a story on either name covers it.
//
// When in doubt, nothing is returned. A false warning teaches people to ignore
// the command, which costs more than a miss.
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
      if (inner && returnsElement(inner) && capitalised(nameOf(inner))) found.push(['default'])
      continue
    }

    if (node.type !== 'ExportNamedDeclaration') continue

    const declaration = node['declaration'] as Node | undefined
    if (!declaration) continue

    for (const one of declared(declaration)) {
      if (!capitalised(one.name) || !returnsElement(one.value)) continue

      found.push(also.has(one.name) ? [one.name, 'default'] : [one.name])
    }
  }

  return found
}

// The local names the file also exports as `default`. Both forms of it, and
// only within the file: `export { Card as default } from './card'` declares
// nothing here.
//
// A local name that is never exported on its own is not read: the component is
// then found under no name at all, which is a miss and not a false warning.
function synonyms(body: Node[]): Set<string> {
  const found = new Set<string>()

  for (const node of body) {
    if (node.type === 'ExportDefaultDeclaration') {
      const inner = node['declaration'] as Node | undefined
      if (inner?.type === 'Identifier') found.add(inner['name'] as string)
      continue
    }

    if (node.type !== 'ExportNamedDeclaration' || node['source'] != null) continue

    for (const one of node['specifiers'] as Node[]) {
      const local = one['local'] as Node | undefined
      const exported = one['exported'] as Node | undefined

      if (local?.type === 'Identifier' && exported?.['name'] === 'default') {
        found.add(local['name'] as string)
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

// Whether a function gives back an element. Read from the body, never from a
// type: a type would need the checker, and section 8 says what that costs.
//
// A wrapped component — `memo(Card)`, `forwardRef(…)` — gives nothing here, so
// it is never reported. That is the doubt 1.2 asks to leave alone.
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

// The two problems, in the order 1.2 lists them. Never throws: a project that
// cannot be read is the caller's message, not this function's.
export function problemsOf(project: Project): Problem[] {
  const entries = storiesOf(buildCatalogue(project).manifest)
  const known = storied(project, entries)
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

// Project-relative, except outside the root where that is a chain of `..`.
function named(root: string, file: string): string {
  const said = relative(root, file).split(sep).join('/')

  return said.startsWith('..') ? file : said
}

// What the user reads. The orphans decide the exit code; a component with no
// story is a warning and never fails, which 1.2 states.
export function linesOf(problems: Problem[]): string[] {
  const said = problems.map((one) =>
    one.kind === 'orphan'
      ? `${one.name}: its component is gone, ${one.file}`
      : `${one.file}: ${one.name} has no story`,
  )

  return said.length === 0 ? ['nothing to report'] : said
}

export async function check(
  input: string,
  log: (line: string) => void = console.log,
): Promise<number> {
  const problems = problemsOf(await loadProject(input))

  for (const line of linesOf(problems)) log(line)

  return problems.some((one) => one.kind === 'orphan') ? 1 : 0
}
