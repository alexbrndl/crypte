// What a `.vue` file declares about its props, read from its `<script>` block
// with the parser the rest of the reader uses, never the Vue compiler: it would
// weigh on every install for one framework. Section 3.2 of docs/contracts.md.

import type { PropKind, ResolvedPropDetails } from '@crypte/core/protocol'
import { parseSync } from 'vite'
import { literalOf, propertyOf, type Node } from './ast'
import {
  defaultsOf,
  describe,
  kindOf,
  nameOf,
  typeMembers,
  type Comment,
  type Member,
  type PropsRead,
} from './props'

// A comment or a block, in one pass: a commented-out block is skipped, and a
// `<!--` written inside a block's script is never taken for a comment. Attributes
// may hold a `>` between quotes: `generic="T extends Record<string, unknown>"`.
const SCRIPT = /<!--[\s\S]*?-->|<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/g

// An attribute's value, `''` when it has none, or `undefined` when the tag does
// not carry it. Whole names only: `data-setup` is not `setup`.
function attributeOf(attributes: string, name: string): string | undefined {
  const found = new RegExp(
    `(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?=\\s|$)`,
  ).exec(attributes)
  return found ? (found[1] ?? found[2] ?? found[3] ?? '') : undefined
}

// What declares the props: the type of `defineProps<T>()`, or the value of
// `defineProps({ … })` or of a component's `props` option, plus the defaults of
// `withDefaults` or of a destructured `defineProps`.
interface Declared {
  typed?: Node
  runtime?: Node
  defaults?: Node
  pattern?: Node
}

// The script block of a `.vue` file, parsed: the `setup` one, or the plain one
// without it. `undefined` for a template alone; a reason when it cannot be read.
export interface Script {
  content: string
  setup: boolean
  parsed: ReturnType<typeof parseSync>
}

export function scriptOf(file: string, source: string): Script | { unread: string } | undefined {
  const blocks = [...source.matchAll(SCRIPT)]
    .filter((one) => one[2] !== undefined)
    .map((one) => ({ attributes: one[1] ?? '', content: one[2] ?? '' }))
  const setup = blocks.find((one) => attributeOf(one.attributes, 'setup') !== undefined)
  const block = setup ?? blocks[0]
  if (!block) return undefined

  if (attributeOf(block.attributes, 'src') !== undefined)
    return { unread: 'its script block lives in another file' }

  const written = attributeOf(block.attributes, 'lang')
  const lang = written === 'ts' || written === 'tsx' || written === 'jsx' ? written : 'js'
  const parsed = parseSync(`${file}.${lang}`, block.content)
  if (parsed.errors.length > 0) return { unread: 'its script block does not parse' }

  return { content: block.content, setup: setup !== undefined, parsed }
}

export function vuePropsOf(file: string, source: string): PropsRead {
  const script = scriptOf(file, source)
  // A template alone takes no props, and that is a reading.
  if (!script) return { details: {} }
  if ('unread' in script) return { details: {}, unread: script.unread }
  const { parsed, setup } = script
  const block = script

  const body = parsed.program.body as unknown as Node[]
  const comments = parsed.comments as unknown as Comment[]
  const declared = setup ? definePropsOf(body) : optionsOf(body)
  if (declared === UNFOLLOWED)
    return {
      details: {},
      unread: 'the default export is not declared in a form the reader follows',
    }
  const models = setup ? modelsOf(body) : []

  const members = declared?.typed
    ? typeMembers(body, declared.typed)
    : declared?.runtime
      ? runtimeMembers(declared.runtime, body)
      : []
  if (!members) {
    return {
      details: {},
      unread: declared?.typed
        ? 'nothing the reader follows types its props'
        : 'its props are declared through a value the reader does not follow',
    }
  }

  const fromPattern = declared?.pattern
    ? defaultsOf(declared.pattern)
    : { named: new Set<string>(), values: {} }
  const fromObject = defaultsIn(declared?.defaults)
  const details: Record<string, ResolvedPropDetails> = {}

  // No `defineProps`, an empty one, no `props` option and no `defineModel`: the
  // component takes none, and that is a reading.
  for (const { name, optional, method, annotation, at, read, preset } of [...members, ...models]) {
    const described = describe(block.content, comments, at)
    const kind = method
      ? { type: 'function' as PropKind }
      : (read ?? (annotation ? kindOf(annotation, body) : { type: 'unknown' as PropKind }))
    const defaulted = fromPattern.named.has(name) || fromObject.named.has(name)
    // `in` and not `??`: `null` is a default a file writes.
    const fallback =
      name in fromPattern.values
        ? fromPattern.values[name]
        : name in fromObject.values
          ? fromObject.values[name]
          : preset

    details[name] = {
      ...kind,
      required: !optional && !defaulted,
      ...(described === undefined ? {} : { description: described }),
      ...(fallback === undefined ? {} : { default: fallback }),
    }
  }

  return { details }
}

// The first `defineProps` of the setup block, bare, under `withDefaults`, or
// destructured: `const { tone = 'neutral' } = defineProps<P>()`.
function definePropsOf(body: Node[]): Declared | undefined {
  for (const node of body) {
    const candidates: { call: Node; pattern?: Node }[] =
      node.type === 'ExpressionStatement'
        ? [{ call: node['expression'] as Node }]
        : node.type === 'VariableDeclaration'
          ? (node['declarations'] as Node[]).map((one) => ({
              call: one['init'] as Node,
              pattern: one['id'] as Node,
            }))
          : []

    for (const { call, pattern } of candidates) {
      if (call?.type !== 'CallExpression') continue
      const callee = (call['callee'] as Node)['name']
      const [first, second] = call['arguments'] as Node[]
      const define =
        callee === 'defineProps'
          ? call
          : callee === 'withDefaults' && first?.type === 'CallExpression'
            ? first
            : undefined
      if ((define?.['callee'] as Node | undefined)?.['name'] !== 'defineProps') continue

      const typed = (define?.['typeArguments'] as Node | null)?.['params'] as Node[] | undefined
      const runtime = (define?.['arguments'] as Node[])[0]
      return {
        ...(typed?.[0] ? { typed: typed[0] } : runtime ? { runtime } : {}),
        ...(callee === 'withDefaults' && second ? { defaults: second } : {}),
        ...(pattern?.type === 'ObjectPattern' ? { pattern } : {}),
      }
    }
  }
  return undefined
}

// What the reader cannot follow: told apart from a component with no props.
const UNFOLLOWED = Symbol('unfollowed')

// The `props` option of `export default { … }` or `defineComponent({ … })`. No
// default export at all is a component with no options. Any other form, a name
// or a `satisfies`, holds props the reader cannot see.
function optionsOf(body: Node[]): Declared | undefined | typeof UNFOLLOWED {
  const node = body.find((one) => one.type === 'ExportDefaultDeclaration')
  if (!node) return undefined
  const exported = node['declaration'] as Node
  const object =
    exported.type === 'CallExpression' && (exported['callee'] as Node)['name'] === 'defineComponent'
      ? (exported['arguments'] as Node[])[0]
      : exported
  if (object?.type !== 'ObjectExpression') return UNFOLLOWED
  const props = propertyOf(object, 'props')
  return props ? { runtime: props } : undefined
}

// Each `defineModel` declares a prop, `modelValue` or the name it is given, typed
// by its type argument or its `type` option.
function modelsOf(body: Node[]): Member[] {
  const calls = body.flatMap((node) =>
    node.type === 'ExpressionStatement'
      ? [node['expression'] as Node]
      : node.type === 'VariableDeclaration'
        ? (node['declarations'] as Node[]).map((one) => one['init'] as Node)
        : [],
  )

  return calls.flatMap((call): Member[] => {
    if (call?.type !== 'CallExpression' || (call['callee'] as Node)['name'] !== 'defineModel')
      return []
    const args = call['arguments'] as Node[]
    const named = literalOf(args[0])?.value
    const options = args.find((one) => one.type === 'ObjectExpression')
    const typed = ((call['typeArguments'] as Node | null)?.['params'] as Node[] | undefined)?.[0]
    const written = options ? propertyOf(options, 'default') : null
    const preset = written ? literalOf(written) : undefined

    return [
      {
        name: typeof named === 'string' ? named : 'modelValue',
        optional: !(options && literalOf(propertyOf(options, 'required'))?.value === true),
        annotation: typed,
        at: call.start,
        ...(typed
          ? {}
          : { read: constructorKind(options ? propertyOf(options, 'type') : null, body) }),
        ...(preset ? { preset: preset.value } : {}),
      },
    ]
  })
}

// `['label', 'tone']`, or `{ label: String, tone: { type: String, default: 'x' } }`.
function runtimeMembers(value: Node, body: Node[]): Member[] | undefined {
  if (value.type === 'ArrayExpression') {
    const names = (value['elements'] as Node[]).map((one) => literalOf(one)?.value)
    if (names.some((one) => typeof one !== 'string')) return undefined
    return (names as string[]).map((name) => ({
      name,
      optional: true,
      annotation: undefined,
      at: value.start,
      read: { type: 'unknown' },
    }))
  }
  if (value.type !== 'ObjectExpression') return undefined

  return (value['properties'] as Node[]).flatMap((one): Member[] => {
    if (one.type !== 'Property') return []
    const name = nameOf(one['key'] as Node, one['computed'] === true)
    if (name === undefined) return []

    const option = one['value'] as Node
    const object = option.type === 'ObjectExpression' ? option : undefined
    const type = object ? propertyOf(object, 'type') : option
    const required = object ? literalOf(propertyOf(object, 'required'))?.value === true : false
    // A factory has no value to show: the prop is optional through `required`.
    const written = object ? propertyOf(object, 'default') : null
    const preset = written ? literalOf(written) : undefined

    return [
      {
        name,
        optional: !required,
        annotation: undefined,
        at: one.start,
        read: constructorKind(type, body),
        ...(preset ? { preset: preset.value } : {}),
      },
    ]
  })
}

// `String`, or `String as PropType<'a' | 'b'>`, whose type argument is read like
// a TypeScript annotation.
function constructorKind(node: Node | null, body: Node[]): { type: PropKind; options?: unknown[] } {
  if (node?.type === 'TSAsExpression') {
    const annotation = node['typeAnnotation'] as Node
    const argument = ((annotation['typeArguments'] as Node | null)?.['params'] as Node[])?.[0]
    if (argument) return kindOf(argument, body)
    return constructorKind(node['expression'] as Node, body)
  }
  const name = node?.type === 'Identifier' ? node['name'] : undefined
  return { type: CONSTRUCTORS[String(name)] ?? 'unknown' }
}

const CONSTRUCTORS: Record<string, PropKind> = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Array: 'array',
  Object: 'object',
  Function: 'function',
}

// The object `withDefaults` takes. A factory or a computed value makes the prop
// optional without a value to show, as in `defaultsOf`.
function defaultsIn(object: Node | undefined): {
  named: Set<string>
  values: Record<string, unknown>
} {
  const named = new Set<string>()
  const values: Record<string, unknown> = {}
  if (object?.type !== 'ObjectExpression') return { named, values }

  for (const one of object['properties'] as Node[]) {
    if (one.type !== 'Property') continue
    const name = nameOf(one['key'] as Node, one['computed'] === true)
    if (name === undefined) continue
    named.add(name)
    const read = literalOf(one['value'] as Node)
    if (read) values[name] = read.value
  }
  return { named, values }
}
