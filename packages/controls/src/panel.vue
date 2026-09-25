<script setup lang="ts">
import type { Overrides, ResolvedPropDetails, StoryEntry } from '@crypte/core/protocol'
import { computed, ref, watch, watchEffect } from 'vue'

const props = defineProps<{ entry: StoryEntry | null }>()

const emit = defineEmits<{
  inapplicable: [reason: string]
  overrides: [values: Overrides]
}>()

// The kinds a field can edit. An override is always a primitive, section 5.1,
// so a function, a node, an object or an array has no field.
const EDITABLE = new Set(['string', 'number', 'boolean', 'enum'])

const fields = computed(() =>
  Object.entries(props.entry?.details ?? {}).filter(([, details]) => EDITABLE.has(details.type)),
)

// What was edited, and nothing else. The manifest does not carry a story's
// values, section 5.1, so a field starts empty and the story renders as it
// was written until one is edited.
const values = ref<Overrides>({})

// Another story starts from its own props: the shell drops the overrides then,
// and the fields follow.
watch(
  () => props.entry?.id,
  () => {
    values.value = {}
  },
)

// Said again for every entry, section 6.1: the shell forgets it at each one.
watchEffect(() => {
  const entry = props.entry
  if (!entry) return emit('inapplicable', 'aucune story affichée')
  if (fields.value.length > 0 || entry.propsUnread !== undefined) return

  emit(
    'inapplicable',
    Object.keys(entry.details).length === 0
      ? 'aucune prop sur ce composant'
      : 'aucune prop modifiable sur ce composant',
  )
})

function set(name: string, value: unknown) {
  values.value = { ...values.value, [name]: value }
  emit('overrides', values.value)
}

function unset(name: string) {
  const { [name]: _, ...rest } = values.value
  values.value = rest
  emit('overrides', rest)
}

function reset() {
  values.value = {}
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

// By index, since an option may be a number and a `<select>` only holds text.
function choose(name: string, options: unknown[], event: Event) {
  const at = (event.target as HTMLSelectElement).value
  if (at === '') unset(name)
  else set(name, options[Number(at)])
}

const hint = (details: ResolvedPropDetails) =>
  details.default === undefined ? '' : String(details.default)
</script>

<!-- Styles inline, and no style block: the shell imports this module and
     nothing beside it, so a built style sheet would never load. Measured. -->
<template>
  <p v-if="entry?.propsUnread !== undefined" class="unread" style="color: #92400e; font-size: 13px">
    Props non lues dans le fichier du composant : {{ entry.propsUnread }}. Seules celles déclarées
    dans <code>details</code> de la story apparaissent ici.
  </p>
  <form
    v-if="fields.length > 0"
    style="
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 12px;
      align-items: center;
      font-size: 13px;
    "
    @submit.prevent
  >
    <label
      v-for="[name, details] of fields"
      :key="name"
      :title="details.description"
      style="display: contents"
    >
      <span>{{ name }}</span>
      <input
        v-if="details.type === 'string'"
        type="text"
        :value="values[name] ?? ''"
        :placeholder="hint(details)"
        @input="text(name, $event)"
      />
      <input
        v-else-if="details.type === 'number'"
        type="number"
        :value="values[name] ?? ''"
        :placeholder="hint(details)"
        @input="number(name, $event)"
      />
      <input
        v-else-if="details.type === 'boolean'"
        type="checkbox"
        :checked="values[name] === true"
        :indeterminate="!(name in values)"
        @change="set(name, ($event.target as HTMLInputElement).checked)"
      />
      <select
        v-else
        :value="name in values ? String((details.options ?? []).indexOf(values[name])) : ''"
        @change="choose(name, details.options ?? [], $event)"
      >
        <option value="">— {{ hint(details) || 'valeur de la story' }}</option>
        <option v-for="(option, at) of details.options ?? []" :key="at" :value="String(at)">
          {{ String(option) }}
        </option>
      </select>
    </label>
    <button
      type="button"
      style="grid-column: 1 / -1; justify-self: start"
      :disabled="Object.keys(values).length === 0"
      @click="reset"
    >
      Revenir à la story
    </button>
  </form>
</template>
