<script setup lang="ts">
import type { Overrides, PanelEvents, PanelProps, ResolvedPropDetails } from '@crypte/core/protocol'
import { Button, Checkbox, Field, Input, Select } from '@crypte/ui'
import { computed, ref, watch, watchEffect } from 'vue'

const props = defineProps<Pick<PanelProps, 'entry' | 'values'>>()

const emit = defineEmits<Pick<PanelEvents, 'inapplicable' | 'overrides'>>()

// The kinds a field can edit. An override is always a primitive, section 5.1,
// so a function, a node, an object or an array has no field.
const EDITABLE = new Set(['string', 'number', 'boolean', 'enum'])

const fields = computed(() =>
  Object.entries(props.entry?.details ?? {}).filter(([, details]) => EDITABLE.has(details.type)),
)

// What was edited, and nothing else: what the story renders with comes from
// the `values` prop, and is not an override until it is edited.
const edited = ref<Overrides>({})

// Another story starts from its own props: the shell drops the overrides then,
// and the fields follow.
watch(
  () => props.entry?.id,
  () => {
    edited.value = {}
  },
)

// Said again for every entry, section 6.1: the shell forgets it at each one.
watchEffect(() => {
  const entry = props.entry
  if (!entry) return emit('inapplicable', 'no story on display')
  if (fields.value.length > 0 || entry.propsUnread !== undefined) return

  emit(
    'inapplicable',
    Object.keys(entry.details).length === 0
      ? 'no prop on this component'
      : 'no editable prop on this component',
  )
})

function set(name: string, value: unknown) {
  edited.value = { ...edited.value, [name]: value }
  emit('overrides', edited.value)
}

function unset(name: string) {
  const { [name]: _, ...rest } = edited.value
  edited.value = rest
  emit('overrides', rest)
}

function reset() {
  edited.value = {}
  emit('overrides', {})
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
    Props not read from the component file: {{ entry.propsUnread }}. Only those the story declares
    in <code>details</code> appear here.
  </p>
  <form
    v-if="fields.length > 0"
    style="display: flex; flex-direction: column; gap: var(--space-3)"
    @submit.prevent
  >
    <Field
      v-for="[name, details] of fields"
      :key="name"
      :label="name"
      :overridden="name in edited"
      :title="details.description"
    >
      <template #action>
        <Button v-if="name in edited" @click="unset(name)">Reset</Button>
      </template>
      <template #default="{ id }">
        <Input
          v-if="details.type === 'string'"
          :id="id"
          type="text"
          :value="edited[name] ?? ''"
          :placeholder="hint(name, details)"
          @input="text(name, $event)"
        />
        <Input
          v-else-if="details.type === 'number'"
          :id="id"
          type="number"
          :value="edited[name] ?? ''"
          :placeholder="hint(name, details)"
          @input="number(name, $event)"
        />
        <Checkbox
          v-else-if="details.type === 'boolean'"
          :id="id"
          :checked="shown(name, details) === true"
          :indeterminate="shown(name, details) === undefined"
          @change="set(name, ($event.target as HTMLInputElement).checked)"
        />
        <Select
          v-else
          :id="id"
          :options="optionsOf(details)"
          :model-value="selected(name, details)"
          placeholder="—"
          @update:model-value="(at) => set(name, choices(details)[Number(at)])"
        />
      </template>
    </Field>
    <Button
      style="align-self: flex-start"
      :disabled="Object.keys(edited).length === 0"
      @click="reset"
    >
      Back to the story
    </Button>
  </form>
</template>
