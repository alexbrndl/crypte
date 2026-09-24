import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'

// `sideEffects: false` laisse un bundler retirer un import dont il ne voit pas
// l'usage. Fausse, la déclaration retire chez l'utilisateur du code qui agissait
// à l'import. Ce garde lit l'arbre de chaque fichier du noyau : trois tours de
// revue ont montré qu'une expression régulière ne voit pas la syntaxe TypeScript.

interface Node {
  type: string
  [key: string]: unknown
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Ce qu'une déclaration du niveau supérieur exécute à l'import. Le corps d'une
// fonction ne s'exécute qu'appelé, donc on n'y descend pas.
const RUNS = new Set([
  'CallExpression',
  'NewExpression',
  'TaggedTemplateExpression',
  'ImportExpression',
  'AwaitExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'Decorator',
])
const DEFERRED = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'])

function runs(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(runs)
  if (node === null || typeof node !== 'object') return false

  const one = node as Node
  if (DEFERRED.has(one.type)) return false
  if (RUNS.has(one.type)) return true
  // Le corps d'une méthode et la valeur d'un champ d'instance attendent l'appel
  // ou l'instance ; leur clé calculée et leurs décorateurs s'exécutent à la
  // définition de la classe, comme un bloc statique.
  if (one.type === 'StaticBlock') return true
  if (
    one.type === 'MethodDefinition' ||
    (one.type === 'PropertyDefinition' && one['static'] !== true)
  )
    return (
      runs(one['decorators']) ||
      (one['computed'] === true && runs(one['key'])) ||
      // Les décorateurs de ses paramètres aussi, mais pas leurs valeurs par
      // défaut, qui attendent l'appel.
      (((one['value'] as Node | undefined)?.['params'] as Node[] | undefined) ?? []).some((param) =>
        runs(param['decorators']),
      )
    )

  return Object.entries(one).some(([key, value]) => key !== 'typeAnnotation' && runs(value))
}

// Les déclarations qui n'exécutent rien par nature. Tout le reste est signalé,
// y compris ce qu'on ne connaît pas : une forme nouvelle rougit plutôt que de
// passer.
const INERT = new Set([
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSDeclareFunction',
  'FunctionDeclaration',
  'ExportAllDeclaration',
])

function statementRuns(node: Node): boolean {
  if (INERT.has(node.type)) return false
  // `import './x'` n'importe rien, il exécute `x`.
  if (node.type === 'ImportDeclaration') return (node['specifiers'] as unknown[]).length === 0
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
    const inner = node['declaration'] as Node | null
    if (inner === null) return false
    // `export default Badge` exporte une expression, qui ne se lit pas comme une
    // instruction.
    return inner.type.endsWith('Declaration') ? statementRuns(inner) : runs(inner)
  }
  if (node.type === 'VariableDeclaration') return runs(node['declarations'])
  if (node.type === 'ClassDeclaration') return runs(node)
  // `declare module` augmente un type ; un espace de noms réel s'exécute.
  if (node.type === 'TSModuleDeclaration') return node['declare'] !== true
  if (node.type === 'TSEnumDeclaration') return node['const'] !== true

  return true
}

function effectsOf(file: string, source: string): string[] {
  const parsed = parseSync(file, source)
  if (parsed.errors.length > 0) return [`${file} ne se lit pas`]

  return (parsed.program.body as unknown as Node[])
    .filter(statementRuns)
    .map((node) => source.slice(node['start'] as number, node['end'] as number))
}

describe('what a core file runs on import', () => {
  // `packages/*/src` ne rend rien comme pathspec : le dossier parent, filtré.
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((one) => one.endsWith('.ts'))

  it('reads files', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('finds nothing in core', () => {
    const found = files.flatMap((one) =>
      effectsOf(one, readFileSync(join(root, one), 'utf8')).map((effect) => `${one}: ${effect}`),
    )

    expect(found).toEqual([])
  })

  // Les formes qu'un critère ligne à ligne a laissées passer, tour après tour.
  it.for([
    'const x = f()',
    'const a = f(() => 1)',
    'const r = { c: make() }',
    'const a = [init()]',
    'const q = `${compute()}`',
    'const t = -Date.now()',
    'export const s = new Set()',
    'register()',
    "import './polyfill'",
    'export default class A { static { boot() } }',
    'export abstract class B { static x = make() }',
    'export default make()',
    'if (ready) start()',
    'namespace N { export const a = 1 }',
    'enum E { A }',
    'while (true) {}',
    'ready',
    'export class A { @log m() {} }',
    'export class A { [key()]() {} }',
    'export class A { [key()] = 1 }',
    "import x = require('./y')",
    'export class A { m(@log x) {} }',
    'export class A { constructor(@inj private y) {} }',
  ])('flags %s', (source) => {
    // L'instruction elle-même, pas seulement « quelque chose » : un fragment qui
    // ne se lit pas serait signalé aussi.
    expect(effectsOf('x.ts', source)).toEqual([source])
  })

  // Et ce qui n'exécute rien, sans quoi le garde passerait à l'identique sur
  // un critère qui signale tout.
  it.for([
    'export async function f() { await g() }',
    'export const h = () => make()',
    'export const f = (a: string): Kind => a',
    'export const g = <T,>(x: T) => x',
    "export const k = ['a', 'b'] as const",
    'export default class C { m() { return make() } }',
    'export abstract class D { x = 1 }',
    'export type T = { a: string }',
    'export interface I { a: string }',
    "export { a } from './a'",
    "import { b } from './b'",
    "declare module './m' { interface P {} }",
    'const enum F { A }',
    'export default Badge',
    'declare function f(): void',
    "export class A { ['a']() {} }",
    'export class A { m(x = make()) {} }',
  ])('does not flag %s', (source) => {
    expect(effectsOf('x.ts', source)).toEqual([])
  })

  // La limite du garde, constatée plutôt que découverte : oxc lit le décorateur
  // d'un paramètre rest sans erreur et ne le met nulle part dans l'arbre, donc
  // rien ici ne peut le voir. Le jour où ce cas rougit, oxc le garde, et il
  // rejoint la table « signale ».
  it('misses a rest parameter decorator, which the parser drops', () => {
    expect(effectsOf('x.ts', 'export class A { m(@log ...r) {} }')).toEqual([])
  })
})
