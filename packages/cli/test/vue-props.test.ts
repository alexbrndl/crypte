import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { propsOf } from '../src/catalogue/props'

// Ce qu'un fichier `.vue` déclare de ses props, lu depuis son bloc `<script>`
// sans le compilateur de Vue, et ce que la lecture refuse de deviner.
// Section 3.2 de docs/contracts.md.

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function read(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'crypte-vue-props-'))
  roots.push(root)
  const file = join(root, 'Badge.vue')
  writeFileSync(file, source)
  return propsOf(file, 'default')
}

const sfc = (script: string, attributes = 'setup lang="ts"') =>
  `<script ${attributes}>\n${script}\n</script>\n\n<template><span /></template>\n`

describe('a script setup typed by defineProps<T>()', () => {
  it('reads a type literal, its optional members and their JSDoc', () => {
    expect(
      read(
        sfc(`defineProps<{
  /** Ce que le badge annonce. */
  label: string
  tone?: 'neutral' | 'warning'
  count?: number
  onClose?: () => void
}>()`),
      ),
    ).toEqual({
      details: {
        label: { type: 'string', required: true, description: 'Ce que le badge annonce.' },
        tone: { type: 'enum', options: ['neutral', 'warning'], required: false },
        count: { type: 'number', required: false },
        onClose: { type: 'function', required: false },
      },
    })
  })

  it('reads a local interface, and the defaults of withDefaults', () => {
    expect(
      read(
        sfc(`interface Props { label: string; tone?: 'neutral' | 'warning'; items?: string[] }
const props = withDefaults(defineProps<Props>(), { tone: 'neutral', items: () => [] })`),
      ).details,
    ).toEqual({
      label: { type: 'string', required: true },
      tone: { type: 'enum', options: ['neutral', 'warning'], required: false, default: 'neutral' },
      items: { type: 'array', required: false },
    })
  })

  // Une valeur par défaut rend la prop facultative pour qui appelle le composant,
  // même si le type l'exige : la règle de la lecture React.
  it('makes a required member optional once it has a default', () => {
    expect(
      read(sfc(`withDefaults(defineProps<{ label: string; size: number }>(), { label: 'Neuf' })`))
        .details,
    ).toEqual({
      label: { type: 'string', required: false, default: 'Neuf' },
      size: { type: 'number', required: true },
    })
  })

  // Vue 3.5 : les valeurs par défaut se donnent en déstructurant.
  it('reads the defaults of a destructured defineProps', () => {
    expect(
      read(sfc(`const { start = 0, step } = defineProps<{ start?: number; step: number }>()`))
        .details,
    ).toEqual({
      start: { type: 'number', required: false, default: 0 },
      step: { type: 'number', required: true },
    })
  })

  it('says it follows nothing for an imported type', () => {
    expect(read(sfc(`import type { Props } from './props'\ndefineProps<Props>()`))).toEqual({
      details: {},
      unread: 'nothing the reader follows types its props',
    })
  })
})

describe('props declared as values', () => {
  it('reads constructors, options objects and PropType', () => {
    expect(
      read(
        sfc(
          `import type { PropType } from 'vue'
defineProps({
  label: { type: String, required: true },
  tone: { type: String as PropType<'neutral' | 'warning'>, default: 'neutral' },
  count: Number,
  items: { type: Array, default: () => [] },
  either: [String, Number],
})`,
        ),
      ).details,
    ).toEqual({
      label: { type: 'string', required: true },
      tone: { type: 'enum', options: ['neutral', 'warning'], required: false, default: 'neutral' },
      count: { type: 'number', required: false },
      items: { type: 'array', required: false },
      either: { type: 'unknown', required: false },
    })
  })

  // Un alias local se lit comme écrit en place, et un `as` sans argument de type
  // laisse le constructeur parler.
  it('reads a PropType through a local alias, and a cast without a type argument', () => {
    expect(
      read(
        sfc(`type Tone = 'neutral' | 'warning'
defineProps({ tone: String as PropType<Tone>, count: Number as unknown })`),
      ).details,
    ).toEqual({
      tone: { type: 'enum', options: ['neutral', 'warning'], required: false },
      count: { type: 'number', required: false },
    })
  })

  it('reads an array of names', () => {
    expect(read(sfc(`defineProps(['label', 'tone'])`, 'setup')).details).toEqual({
      label: { type: 'unknown', required: false },
      tone: { type: 'unknown', required: false },
    })
  })

  // L'API options, sans `setup` : le `props` de l'export par défaut.
  it('reads the props option of a component without script setup', () => {
    expect(
      read(sfc(`export default defineComponent({ props: { label: String } })`, 'lang="ts"'))
        .details,
    ).toEqual({ label: { type: 'string', required: false } })
    expect(read(sfc(`export default { props: ['label'] }`, '')).details).toEqual({
      label: { type: 'unknown', required: false },
    })
  })

  it('says it follows nothing for props held in a variable', () => {
    expect(read(sfc(`const shape = { label: String }\ndefineProps(shape)`))).toEqual({
      details: {},
      unread: 'its props are declared through a value the reader does not follow',
    })
  })
})

// Ce qui distingue un composant sans props d'un composant que la lecture n'a pas
// suivi : seul le second porte `unread`.
describe('what reading says when it reads nothing', () => {
  it('reads no props, without a reason, where the component takes none', () => {
    expect(read('<template><span /></template>')).toEqual({ details: {} })
    expect(read(sfc(`const n = 1`))).toEqual({ details: {} })
    expect(read(sfc(`defineProps()`))).toEqual({ details: {} })
    expect(read(sfc(`export default { name: 'Badge' }`, ''))).toEqual({ details: {} })
  })

  it('says when its script block does not parse', () => {
    expect(read(sfc(`defineProps<{ label: string }>(`))).toEqual({
      details: {},
      unread: 'its script block does not parse',
    })
  })

  // Le bloc `setup` gagne sur un `<script>` ordinaire posé à côté.
  it('reads the setup block when a plain script sits beside it', () => {
    expect(
      read(
        `<script lang="ts">export const shared = 1</script>\n${sfc(`defineProps<{ label: string }>()`)}`,
      ).details,
    ).toEqual({ label: { type: 'string', required: true } })
  })
})
