<script setup lang="ts">
import type { Manifest, StoryEntry } from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/ui'
import { computed, onMounted, ref, useTemplateRef } from 'vue'

// Le shell ne connaît aucun framework : il lit un manifeste et parle par le
// canal. C'est ce qui lui permet d'être construit à l'avance et livré dans le
// CLI, là où la preview est compilée chez l'utilisateur.
// Voir docs/decisions.md.

const MANIFEST = '/@crypte/manifest.json'

const frame = useTemplateRef<HTMLIFrameElement>('frame')
const entries = ref<StoryEntry[]>([])
const current = ref<string | null>(null)
const status = ref('chargement du catalogue')

let channel: ReturnType<typeof createShellChannel> | null = null
let ready = false

// Groupées par dossier, dans l'ordre du manifeste : l'arbre vient du chemin, et
// aucun titre n'est déclaré nulle part. Section 1.1 des contrats.
const groups = computed(() => {
  const byPath = new Map<string, StoryEntry[]>()

  for (const entry of entries.value) {
    const key = entry.path.join(' / ')
    byPath.set(key, [...(byPath.get(key) ?? []), entry])
  }

  return [...byPath]
})

function show(id: string) {
  current.value = id
  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  if (ready) channel?.send({ type: 'render', id, overrides: {} })
}

onMounted(async () => {
  if (frame.value) {
    channel = createShellChannel(frame.value)
    channel.onMessage((message) => {
      if (message.type === 'ready') {
        ready = true
        status.value = `preview prête, protocole v${message.protocolVersion}`
        if (current.value) show(current.value)
      }
      if (message.type === 'rendered')
        status.value = `${message.id} rendu en ${message.durationMs.toFixed(1)} ms`
      if (message.type === 'error') status.value = `erreur : ${message.message}`
    })
  }

  const manifest = (await fetch(MANIFEST).then((answer) => answer.json())) as Manifest
  entries.value = manifest.entries
  status.value = `${manifest.entries.length} stories`

  const first = manifest.entries[0]
  if (first) show(first.id)
})
</script>

<template>
  <main>
    <nav>
      <h1>Crypte</h1>
      <section v-for="[path, stories] of groups" :key="path">
        <h2>{{ path }}</h2>
        <button
          v-for="entry of stories"
          :key="entry.id"
          type="button"
          :aria-current="entry.id === current"
          @click="show(entry.id)"
        >
          {{ entry.name }}
        </button>
      </section>
      <p v-if="entries.length === 0">aucune story</p>
    </nav>
    <div>
      <iframe ref="frame" src="/preview.html" title="preview"></iframe>
      <p>{{ status }}</p>
    </div>
  </main>
</template>

<style scoped>
main {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  font-family: system-ui, sans-serif;
}

nav button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  padding: 4px 8px;
  cursor: pointer;
}

nav button[aria-current='true'] {
  background: #e5e7eb;
  font-weight: 600;
}

iframe {
  width: 100%;
  height: 70vh;
  border: 1px solid #e5e7eb;
}
</style>
