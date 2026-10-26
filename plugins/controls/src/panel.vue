<script setup lang="ts">
import type { Overrides, PanelEvents, PanelProps, ResolvedPropDetails } from '@crypte/core/protocol'
import { Button, Checkbox, Field, Input, Select } from '@crypte/ui'
import { computed, watchEffect } from 'vue'

// `overrides` spelled out: picked from `PanelProps`, the SFC compiler could not
// resolve its runtime type and the panel did not compile.
const props = defineProps<
  Pick<PanelProps, 'entry' | 'values' | 'locale'> & { overrides?: Record<string, unknown> }
>()

// Its texts in each language the shell speaks, which it passes as `locale` (6.1).
const TEXTS = {
  en: {
    none: 'no story on display',
    noProp: 'no prop on this component',
    noEditable: 'no editable prop on this component',
    unread: 'Props not read from the component file:',
    only: 'Only those the story declares in',
    appear: 'appear here.',
    reset: 'Reset',
  },
  fr: {
    none: 'aucune story affichée',
    noProp: 'aucune prop sur ce composant',
    noEditable: 'aucune prop modifiable sur ce composant',
    unread: 'Props non lues dans le fichier du composant :',
    only: 'Seules celles que la story déclare dans',
    appear: 'apparaissent ici.',
    reset: 'Réinitialiser',
  },
} as const
const t = (key: keyof (typeof TEXTS)['en']) => TEXTS[props.locale ?? 'en'][key]

const emit = defineEmits<Pick<PanelEvents, 'inapplicable' | 'overrides'>>()

// The kinds a field can edit. An override is always a primitive, section 5.1,
// so a function, a node, an object or an array has no field.
const EDITABLE = new Set(['string', 'number', 'boolean', 'enum'])

const fields = computed(() =>
  Object.entries(props.entry?.details ?? {}).filter(([, details]) => EDITABLE.has(details.type)),
)

// What was edited, and nothing else, as the shell holds it (6.1): it drops it
// with the story and on the head's Reset all, and the fields follow. What the
// story renders with comes from the `values` prop, and is not an override until
// it is edited.
const edited = computed<Overrides>(() => props.overrides ?? {})

// Said again for every entry, section 6.1: the shell forgets it at each one.
watchEffect(() => {
  const entry = props.entry
  if (!entry) return emit('inapplicable', t('none'))
  if (fields.value.length > 0 || entry.propsUnread !== undefined) return

  emit('inapplicable', Object.keys(entry.details).length === 0 ? t('noProp') : t('noEditable'))
})

function set(name: string, value: unknown) {
  emit('overrides', { ...edited.value, [name]: value })
}

function unset(name: string) {
  const { [name]: _, ...rest } = edited.value
  emit('overrides', rest)
}

// An emptied text field goes back to the story's value rather than to `''`:
// the field started empty for that value, and an empty string cannot be told
// apart from it on screen.
function text(name: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (value === '') unset(name)
  else set(name, value)
}

function number(name: string, event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isNaN(value)) unset(name)
  else set(name, value)
}

// By index, since an option may be a number or `null` and a select holds text.
// A value the options do not hold, or none, shows the placeholder.
const optionsOf = (details: ResolvedPropDetails) =>
  choices(details).map((option, at) => ({ value: String(at), label: String(option) }))
const selected = (name: string, details: ResolvedPropDetails) => {
  const at = choices(details).indexOf(shown(name, details))
  return at === -1 ? undefined : String(at)
}

// Primitives only, section 5.1: a story's `details` may list an object, which
// would reach `postMessage` and be refused there. Measured.
const choices = (details: ResolvedPropDetails) =>
  (details.options ?? []).filter((one) => typeof one !== 'object' || one === null)

// What the component shows for a prop: what was edited, else what the story
// rendered with (6.1), else the declared default, for a prop the story leaves
// out. A text field shows the last two as its placeholder, greyed: typing
// replaces them, and emptying the field brings them back.
const inherited = (name: string, details: ResolvedPropDetails) =>
  props.values?.[name] ?? details.default
const shown = (name: string, details: ResolvedPropDetails) =>
  name in edited.value ? edited.value[name] : inherited(name, details)
const hint = (name: string, details: ResolvedPropDetails) => {
  const value = inherited(name, details)
  return value === undefined ? '' : String(value)
}
</script>

<!-- Styles inline, and no style block: the shell imports this module and
     nothing beside it, so a built style sheet would never load. Measured. -->
<template>
  <p
    v-if="entry?.propsUnread !== undefined"
    class="unread"
    style="color: var(--warning-text, #b55200); font-size: 13px"
  >
    {{ t('unread') }} {{ entry.propsUnread }}. {{ t('only') }} <code>details</code>
    {{ t('appear') }}
  </p>
  <form
    v-if="fields.length > 0"
    style="display: flex; flex-direction: column; gap: var(--space-2)"
    @submit.prevent
  >
    <Field
      v-for="[name, details] of fields"
      :key="name"
      :label="name"
      :overridden="name in edited"
      :description="details.description"
    >
      <template #action>
        <Button v-if="name in edited" @click="unset(name)">{{ t('reset') }}</Button>
      </template>
      <template #default="{ id, describedBy }">
        <Input
          v-if="details.type === 'string'"
          :id="id"
          :aria-describedby="describedBy"
          type="text"
          :value="edited[name] ?? ''"
          :placeholder="hint(name, details)"
          @input="text(name, $event)"
        />
        <Input
          v-else-if="details.type === 'number'"
          :id="id"
          :aria-describedby="describedBy"
          type="number"
          :value="edited[name] ?? ''"
          :placeholder="hint(name, details)"
          @input="number(name, $event)"
        />
        <Checkbox
          v-else-if="details.type === 'boolean'"
          :id="id"
          :aria-describedby="describedBy"
          :checked="shown(name, details) === true"
          :indeterminate="shown(name, details) === undefined"
          @change="set(name, ($event.target as HTMLInputElement).checked)"
        />
        <Select
          v-else
          :id="id"
          :aria-describedby="describedBy"
          :options="optionsOf(details)"
          :model-value="selected(name, details)"
          placeholder="—"
          @update:model-value="(at) => set(name, choices(details)[Number(at)])"
        />
      </template>
    </Field>
  </form>
</template>
