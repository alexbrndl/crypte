<script setup lang="ts">
import { Checkbox, PanelSection } from '@crypte/ui'
import { ref } from 'vue'
import { keep, kept } from '../storage'

// Les enrobages de la story affichée, celui de la configuration d'abord : en
// couper un montre de quel contexte le composant dépend sans le dire. Coché,
// l'enrobage est là ; la preview rend sans ceux qui ne le sont pas.
const props = defineProps<{ wraps: string[]; muted: number[] }>()
const emit = defineEmits<{ muted: [ranks: number[]] }>()

function toggle(at: number) {
  emit(
    'muted',
    props.muted.includes(at)
      ? props.muted.filter((one) => one !== at)
      : [...props.muted, at].sort((a, b) => a - b),
  )
}

const KEY = 'crypte:panel:shell:wrappers'
const open = ref(kept(KEY) !== false)
function fold() {
  open.value = !open.value
  keep(KEY, open.value ? undefined : false)
}
</script>

<template>
  <PanelSection title="Wrappers" :open="open" aria-label="Wrappers" @toggle="fold">
    <div class="rows">
      <label v-for="(name, at) of wraps" :key="at" class="row">
        <Checkbox :checked="!muted.includes(at)" @change="toggle(at)" />
        <code class="label">{{ name }}</code>
      </label>
    </div>
  </PanelSection>
</template>

<style scoped>
code.label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

label.row {
  cursor: pointer;
}
</style>
