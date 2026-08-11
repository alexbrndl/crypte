<script setup lang="ts">
import { createShellChannel } from '@crypte/core/ui'
import { onMounted, ref, useTemplateRef } from 'vue'

const frame = useTemplateRef<HTMLIFrameElement>('frame')
const status = ref('en attente de la preview')

let channel: ReturnType<typeof createShellChannel> | null = null

onMounted(() => {
  if (!frame.value) return
  channel = createShellChannel(frame.value)
  channel.onMessage((message) => {
    if (message.type === 'ready')
      status.value = `preview prête, protocole v${message.manifestVersion}`
    if (message.type === 'rendered')
      status.value = `rendu de ${message.id} en ${message.durationMs.toFixed(1)} ms`
    if (message.type === 'error') status.value = `erreur : ${message.message}`
  })
})

function render() {
  channel?.send({ type: 'render', id: 'demo/badge--par-defaut', overrides: {} })
}
</script>

<template>
  <main>
    <h1>Crypte</h1>
    <button type="button" @click="render">Rendre le composant</button>
    <p>{{ status }}</p>
    <iframe ref="frame" src="/preview.html" title="preview"></iframe>
  </main>
</template>
