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

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g

// What declares the props: the type of `defineProps<T>()`, or the value of
// `defineProps({ … })` or of a component's `props` option, plus the defaults of
// `withDefaults` or of a destructured `defineProps`.
interface Declared {
  typed?: Node
  runtime?: Node
  defaults?: Node
  pattern?: Node
}

export function vuePropsOf(file: string, source: string): PropsRead {
  const blocks = [...source.matchAll(SCRIPT)].map((one) => ({
    attributes: one[1] ?? '',
    content: one[2] ?? '',
  }))
  const setup = blocks.find((one) => /\bsetup\b/.test(one.attributes))
  const block = setup ?? blocks[0]
  // A template alone takes no props, and that is a reading.
  if (!block) return { details: {} }

  const ts = /\blang\s*=\s*["']tsx?["']/.test(block.attributes)
  const parsed = parseSync(`${file}.${ts ? 'ts' : 'js'}`, block.content)
  if (parsed.errors.length > 0) return { details: {}, unread: 'its script block does not parse' }

  const body = parsed.program.body as unknown as Node[]
  const comments = parsed.comments as unknown as Comment[]
  const declared = setup ? definePropsOf(body) : optionsOf(body)
  // No `defineProps`, an empty one, or no `props` option: the component takes none.
  if (!declared || (!declared.typed && !declared.runtime)) return { details: {} }

  const members = declared.typed
    ? typeMembers(body, declared.typed)
    : declared.runtime
      ? runtimeMembers(declared.runtime, body)
      : undefined
  if (!members) {
    return {
      details: {},
      unread: declared.typed
        ? 'nothing the reader follows types its props'
        : 'its props are declared through a value the reader does not follow',
    }
  }

  const fromPattern = declared.pattern
    ? defaultsOf(declared.pattern)
    : { named: new Set<string>(), values: {} }
  const fromObject = defaultsIn(declared.defaults)
  const details: Record<string, ResolvedPropDetails> = {}

  for (const { name, optional, method, annotation, at, read, preset } of members) {
    const described = describe(block.content, comments, at)
    const kind = method
      ? { type: 'function' as PropKind }
      : (read ?? (annotation ? kindOf(annotation, body) : { type: 'unknown' as PropKind }))
    const defaulted = fromPattern.named.has(name) || fromObject.named.has(name)
    const fallback = fromPattern.values[name] ?? fromObject.values[name] ?? preset

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

// The `props` option of `export default { … }` or `defineComponent({ … })`.
function optionsOf(body: Node[]): Declared | undefined {
  const exported = body.find((node) => node.type === 'ExportDefaultDeclaration')?.[
    'declaration'
  ] as Node | undefined
  const object =
    exported?.type === 'CallExpression' &&
    (exported['callee'] as Node)['name'] === 'defineComponent'
      ? (exported['arguments'] as Node[])[0]
      : exported
  const props = object?.type === 'ObjectExpression' ? propertyOf(object, 'props') : null
  return props ? { runtime: props } : undefined
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
    // A factory is a default whose value cannot be read, but a default all the
    // same: the prop is optional for whoever calls the component.
    const written = object ? propertyOf(object, 'default') : null
    const preset = written ? (literalOf(written)?.value ?? FACTORY) : undefined

    return [
      {
        name,
        optional: !required,
        annotation: undefined,
        at: one.start,
        read: constructorKind(type, body),
        ...(preset === undefined || preset === FACTORY ? {} : { preset }),
      },
    ]
  })
}

const FACTORY = Symbol('a default the reader cannot read')

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
