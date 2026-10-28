<script setup lang="ts">
import type { PanelEvents, PanelProps } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { computed, ref, watch, watchEffect } from 'vue'
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

// The props the preview logs: those `details` types as functions.
const functions = computed(() =>
  Object.entries(props.entry?.details ?? {}).filter(([, details]) => details.type === 'function'),
)

// Said again for every entry, section 6.1: the shell forgets it at each one.
watchEffect(() => {
  if (!props.entry) return emit('inapplicable', t('none'))
  emit('inapplicable', functions.value.length === 0 ? t('noFunction') : null)
})

// Newest first, for the story on display only, and kept to the last hundred:
// a handler called on every move would otherwise grow the list for ever.
const calls = ref<{ prop: string; args: string[]; at: string }[]>([])

watch(
  () => props.entry?.id,
  () => (calls.value = []),
)

watch(
  () => props.received,
  (message) => {
    if (message?.type !== 'actions:called') return
    const called = message as unknown as Called
    if (called.id !== props.entry?.id) return
    const at = new Date().toLocaleTimeString(props.locale ?? 'en', { hour12: false })
    calls.value = [{ prop: called.prop, args: called.args, at }, ...calls.value].slice(0, 100)
  },
)
</script>

<!-- Styles inline, and no style block: the shell imports this module and
     nothing beside it, so a built style sheet would never load. -->
<template>
  <template v-if="calls.length === 0">
    <p role="status" style="margin: 0 0 4px; font-size: 13px">{{ t('waiting') }}</p>
    <ul class="actions-props" style="margin: 0; padding: 0; list-style: none; font-size: 12px">
      <li v-for="[name, details] of functions" :key="name" style="display: flex; gap: 8px">
        <code style="font-family: var(--font-mono, monospace)">{{ name }}</code>
        <span v-if="details.description" style="color: var(--text-muted, #78716c)">{{
          details.description
        }}</span>
      </li>
    </ul>
  </template>
  <template v-else>
    <ol
      class="actions-calls"
      style="margin: 0; padding: 0; list-style: none; display: grid; gap: 4px"
    >
      <li
        v-for="(call, at) of calls"
        :key="calls.length - at"
        style="display: flex; gap: 8px; font-size: 12px; font-family: var(--font-mono, monospace)"
      >
        <span style="color: var(--text-muted, #78716c)">{{ call.at }}</span>
        <span
          ><strong>{{ call.prop }}</strong
          >({{ call.args.join(', ') }})</span
        >
      </li>
    </ol>
    <!-- In the panel's header, beside "Reset all" (6.1). -->
    <Teleport v-if="actions" :to="actions">
      <Button variant="ghost" class="actions-clear" @click="calls = []">{{ t('clear') }}</Button>
    </Teleport>
  </template>
</template>
