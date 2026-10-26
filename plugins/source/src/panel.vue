<script setup lang="ts">
import type { PanelEvents, PanelProps } from '@crypte/core/protocol'
import { Button } from '@crypte/ui'
import { ref, watch, watchEffect } from 'vue'

const props = defineProps<Pick<PanelProps, 'entry' | 'locale'>>()

const emit = defineEmits<Pick<PanelEvents, 'inapplicable'>>()

// Its texts in each language the shell speaks, which it passes as `locale` (6.1).
const TEXTS = {
  en: {
    none: 'no story on display',
    copy: 'Copy',
    copied: 'Copied',
    failed: 'Copy failed',
    partial: 'Part of this call is missing:',
  },
  fr: {
    none: 'aucune story affichée',
    copy: 'Copier',
    copied: 'Copié',
    failed: 'Échec de la copie',
    partial: 'Une partie de cet appel manque :',
  },
} as const
// English for a language it does not know: the shell may speak more later.
const t = (key: keyof (typeof TEXTS)['en']) =>
  ((TEXTS as Record<string, Record<string, string>>)[props.locale ?? 'en'] ?? TEXTS.en)[key]

// Said again for every entry, section 6.1: the shell forgets it at each one.
watchEffect(() => {
  emit('inapplicable', props.entry ? null : t('none'))
})

// What the last copy did, until the next story.
const copied = ref<'copied' | 'failed' | null>(null)
watch(
  () => props.entry,
  () => (copied.value = null),
)

async function copy() {
  if (!props.entry) return
  try {
    await navigator.clipboard.writeText(props.entry.source)
    copied.value = 'copied'
  } catch {
    // Refused outside a secure context, or by the browser's permission.
    copied.value = 'failed'
  }
}
</script>

<!-- Styles inline, and no style block: the shell imports this module and
     nothing beside it, so a built style sheet would never load. -->
<template>
  <template v-if="entry">
    <p
      v-if="entry.partial"
      class="source-partial"
      style="margin: 0 0 var(--space-2, 8px); color: var(--warning-text, #b55200); font-size: 13px"
    >
      {{ t('partial') }} {{ entry.partial }}
    </p>
    <pre
      style="
        margin: 0;
        padding: var(--space-3, 12px);
        overflow-x: auto;
        border-radius: var(--radius-md, 6px);
        background: var(--background-sunken, #f5f5f4);
        font-family: var(--font-mono, monospace);
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
      "
    ><code>{{ entry.source }}</code></pre>
    <Button style="margin-top: var(--space-2, 8px)" @click="copy">
      {{ copied === 'copied' ? t('copied') : copied === 'failed' ? t('failed') : t('copy') }}
    </Button>
  </template>
</template>
