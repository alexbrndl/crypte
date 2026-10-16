<!-- Le guide d'une vue vide, gabarit des cas limites du fichier Figma : ce qui
     manque et où Crypte a cherché, la règle, le plus court fichier qui marche, et
     ce qui se passera une fois écrit. -->
<script setup lang="ts">
import { Button } from '@crypte/ui'
import { ref } from 'vue'

const props = defineProps<{
  title: string
  // Où Crypte a cherché, `null` quand il ne le sait pas.
  path: string | null
  rule: string
  mapping: string
  snippet: string
  note: string
  outcome: string
}>()

const copied = ref<'yes' | 'failed' | null>(null)
let clearing: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.snippet)
    copied.value = 'yes'
  } catch {
    copied.value = 'failed'
  }
  clearTimeout(clearing)
  clearing = setTimeout(() => (copied.value = null), 1500)
}
</script>

<template>
  <section class="guide" role="status">
    <div class="identity">
      <h2>{{ title }}</h2>
      <code v-if="path" class="path">{{ path }}</code>
    </div>
    <hr />
    <div class="block">
      <p>{{ rule }}</p>
      <code class="mapping">{{ mapping }}</code>
    </div>
    <div class="block">
      <div class="head">
        <h3>The shortest that works</h3>
        <Button variant="ghost" class="copy" @click="copy">
          {{ copied === 'yes' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy' }}
        </Button>
      </div>
      <pre><code>{{ snippet }}</code></pre>
      <p class="note">{{ note }}</p>
    </div>
    <hr />
    <p class="outcome"><span class="dot" aria-hidden="true" />{{ outcome }}</p>
  </section>
</template>

<style scoped>
.guide {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  margin: auto;
  color: var(--text-primary);
}

.identity,
.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.block {
  gap: var(--space-2);
}

h2 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xl);
  letter-spacing: var(--tracking-tight);
}

.path,
.mapping {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

hr {
  width: 100%;
  margin: 0;
  border: 0;
  border-top: var(--stroke-hairline) solid var(--border-base);
}

p {
  margin: 0;
  font-size: var(--text-base);
  line-height: var(--leading-base);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* The xs button of the Figma file, 20 px high. */
.copy {
  --button-height: 20px;
  --button-padding: var(--space-0-5) var(--space-2);
}

h3 {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

pre {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--background-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  white-space: pre-wrap;
}

.note {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.outcome {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

.dot {
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-full);
  background: var(--success-solid);
}
</style>
