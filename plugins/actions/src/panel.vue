<script setup lang="ts">
import type { PanelEvents, PanelProps } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { computed, shallowRef, watch, watchEffect } from 'vue'
import type { Called } from './called'

const props = defineProps<Pick<PanelProps, 'entry' | 'received' | 'locale' | 'actions'>>()

const emit = defineEmits<Pick<PanelEvents, 'inapplicable'>>()

// Its texts in each language the shell speaks, which it passes as `locale`
// (6.1). English for a language it does not know.
const TEXTS = {
  en: {
    none: 'no story on display',
    noFunction: 'no function prop',
    waiting: 'Use the component to call:',
    clear: 'Clear',
  },
  fr: {
    none: 'aucune story affichée',
    noFunction: 'aucune prop fonction',
    waiting: 'Utilisez le composant pour appeler :',
    clear: 'Effacer',
  },
} as const
const t = (key: keyof (typeof TEXTS)['en']) =>
  ((TEXTS as Record<string, Record<string, string>>)[props.locale ?? 'en'] ?? TEXTS.en)[key]

// The props the preview watches: those `details` types as functions.
const functions = computed(() =>
  Object.entries(props.entry?.details ?? {}).filter(([, details]) => details.type === 'function'),
)

// Said again for every entry, section 6.1: the shell forgets it at each one.
watchEffect(() => {
  if (!props.entry) return emit('inapplicable', t('none'))
  emit('inapplicable', functions.value.length === 0 ? t('noFunction') : null)
})

// The last call of each prop, for the story on display only: its row is updated
// in place, where a log grew with every move of a handler. A Map, since a prop
// may be named `constructor`.
const last = shallowRef(new Map<string, { count: number; args: string[] }>())

watch(
  () => props.entry?.id,
  () => (last.value = new Map()),
)

watch(
  () => props.received,
  (message) => {
    if (message?.type !== 'actions:called') return
    const called = message as unknown as Called
    if (called.id !== props.entry?.id) return
    const count = (last.value.get(called.prop)?.count ?? 0) + 1
    last.value = new Map(last.value).set(called.prop, { count, args: called.args })
  },
)

// The function props, then any other prop called: `details` may miss one.
const rows = computed(() => [
  ...functions.value.map(([name, details]) => ({ name, description: details.description })),
  ...[...last.value.keys()]
    .filter((name) => !functions.value.some(([one]) => one === name))
    .map((name) => ({ name, description: undefined })),
])
</script>

<!-- Styles inline, and no style block: the shell imports this module and
     nothing beside it, so a built style sheet would never load. -->
<template>
  <p role="status" style="margin: 0 0 4px; font-size: 13px">{{ t('waiting') }}</p>
  <ul
    class="actions-props"
    style="margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 12px"
  >
    <li v-for="row of rows" :key="row.name">
      <div style="display: flex; gap: 8px">
        <code style="font-family: var(--font-mono, monospace)">{{ row.name }}</code>
        <span v-if="row.description" style="color: var(--text-muted, #78716c)">{{
          row.description
        }}</span>
        <strong v-if="last.has(row.name)" class="actions-count" style="margin-left: auto"
          >×{{ last.get(row.name)?.count }}</strong
        >
      </div>
      <code
        v-if="last.has(row.name)"
        class="actions-args"
        style="font-family: var(--font-mono, monospace); color: var(--text-muted, #78716c)"
        >({{ last.get(row.name)?.args.join(', ') }})</code
      >
    </li>
  </ul>
  <!-- In the panel's header, beside "Reset all" (6.1). -->
  <Teleport v-if="actions && last.size > 0" :to="actions">
    <Button variant="ghost" class="actions-clear" @click="last = new Map()">{{
      t('clear')
    }}</Button>
  </Teleport>
</template>
