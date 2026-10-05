<script setup lang="ts">
import type { PanelEvents, PanelProps } from '@crypte/core/protocol'
import { computed, ref, watch, watchEffect } from 'vue'
import type { Impact, Results, Violation } from './results'

const props = defineProps<PanelProps>()

const emit = defineEmits<Pick<PanelEvents, 'inapplicable' | 'send'>>()

const IMPACTS: [Impact, string][] = [
  ['critical', 'Critical'],
  ['serious', 'Serious'],
  ['moderate', 'Moderate'],
  ['minor', 'Minor'],
]

// Only the analysis of the story on display: the shell hands over the last
// message whatever story it was about.
const results = computed(() => {
  const message = props.received
  if (message?.type !== 'a11y:results' || message.id !== props.entry?.id) return null
  return message as unknown as Results
})

const groupsOf = (found: Results) =>
  IMPACTS.map(([impact, label]) => ({
    impact,
    label,
    violations: found.violations.filter((one) => one.impact === impact),
  })).filter((group) => group.violations.length > 0)

// From the click to the next result, which may be the same as before, or to
// the next story.
const running = ref(false)

watch([() => props.received, () => props.entry], () => {
  running.value = false
})

// Said again for every entry and every result, section 6.1: a story with no
// violation folds, and folds no longer once an edit of its props adds one.
watchEffect(() => {
  if (!props.entry) return emit('inapplicable', 'no story on display')
  // No render, so no analysis will come: waiting would be for ever.
  if (typeof props.failed === 'string')
    return emit('inapplicable', 'the story could not be rendered')

  const found = results.value
  if (found && found.violations.length === 0) {
    // Nothing read, not nothing wrong: a render that threw leaves the root
    // empty, and "Relancer l'analyse" analyses it all the same.
    if (found.passes === 0) return emit('inapplicable', 'no automatic rule applies to this render')

    const rules = found.passes === 1 ? 'automatic rule passed' : 'automatic rules passed'
    return emit('inapplicable', `${found.passes} ${rules}, no violation`)
  }

  emit('inapplicable', null)
})

function rerun() {
  running.value = true
  emit('send', { type: 'a11y:run' })
}

const count = (violations: Violation[]) =>
  violations.length === 1 ? '1 violation' : `${violations.length} violations`
</script>

<template>
  <p v-if="!results || running" role="status" style="margin: 0; font-size: 13px">
    Waiting for an analysis…
  </p>
  <div v-else style="display: grid; gap: 12px">
    <section v-for="group in groupsOf(results)" :key="group.impact">
      <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600">
        {{ group.label }} · {{ count(group.violations) }}
      </p>
      <ul style="margin: 0; padding-left: 18px; display: grid; gap: 8px">
        <li v-for="violation in group.violations" :key="violation.rule">
          <a :href="violation.helpUrl" target="_blank" rel="noreferrer">{{ violation.help }}</a>
          <code style="margin-left: 6px; font-size: 12px">{{ violation.rule }}</code>
          <ul style="margin: 4px 0 0; padding-left: 18px">
            <li v-for="target in violation.targets" :key="target">
              <code style="font-size: 12px">{{ target }}</code>
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </div>
  <button type="button" style="margin-top: 12px" @click="rerun">Run the analysis again</button>
</template>
