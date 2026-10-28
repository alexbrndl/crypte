<script setup lang="ts">
import type { PanelEvents, PanelProps } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { computed, shallowRef, watch, watchEffect } from 'vue'
import { isEvent, type Called } from './called'

const props = defineProps<Pick<PanelProps, 'entry' | 'received' | 'locale' | 'actions'>>()

const emit = defineEmits<Pick<PanelEvents, 'inapplicable'>>()

// Its texts in each language the shell speaks, which it passes as `locale`
// (6.1). English for a language it does not know.
const TEXTS = {
  en: {
    none: 'no story on display',
    noFunction: 'no function prop',
    prop: 'prop',
    calls: 'calls',
    clear: 'Clear',
  },
  fr: {
    none: 'aucune story affichée',
    noFunction: 'aucune prop fonction',
    prop: 'prop',
    calls: 'appels',
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
// `args` keeps what is not an event, and is empty before the first call.
const rows = computed(() =>
  [
    ...functions.value.map(([name, details]) => ({ name, description: details.description })),
    ...[...last.value.keys()]
      .filter((name) => !functions.value.some(([one]) => one === name))
      .map((name) => ({ name, description: undefined })),
  ].map((row) => {
    const call = last.value.get(row.name)
    return { ...row, count: call?.count, args: call?.args.filter((one) => !isEvent(one)) ?? [] }
  }),
)
</script>

<!-- Styles inline, and no style block: the shell imports this module and
     nothing beside it, so a built style sheet would never load. -->
<template>
  <table class="actions-props" style="width: 100%; border-collapse: collapse; font-size: 13px">
    <thead>
      <tr style="color: var(--text-muted, #78716c); font-size: 12px">
        <th style="padding: 0 0 4px; font-weight: normal; text-align: left">{{ t('prop') }}</th>
        <th style="padding: 0 0 4px; font-weight: normal; text-align: right">
          {{ t('calls') }}
        </th>
      </tr>
    </thead>
    <tbody style="font-family: var(--font-mono, monospace)">
      <template v-for="row of rows" :key="row.name">
        <tr class="actions-row" :title="row.description">
          <td class="actions-name" style="padding: 4px 0">{{ row.name }}</td>
          <td
            class="actions-count"
            style="padding: 4px 0; text-align: right"
            :style="row.count === undefined ? { color: 'var(--text-muted, #78716c)' } : {}"
          >
            {{ row.count ?? '–' }}
          </td>
        </tr>
        <tr v-if="row.args.length > 0">
          <td
            class="actions-args"
            colspan="2"
            style="padding: 0 0 4px 12px; color: var(--text-muted, #78716c); font-size: 12px"
          >
            {{ row.args.join(', ') }}
          </td>
        </tr>
      </template>
    </tbody>
  </table>
  <!-- In the panel's header, beside "Reset all" (6.1). -->
  <Teleport v-if="actions && last.size > 0" :to="actions">
    <Button variant="ghost" class="actions-clear" @click="last = new Map()">{{
      t('clear')
    }}</Button>
  </Teleport>
</template>
