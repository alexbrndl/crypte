<script setup lang="ts">
import type { Manifest, StoryEntry } from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/ui'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { recovered } from './recover'

// Le shell ne connaît aucun framework : il lit un manifeste et parle par le
// canal. C'est ce qui lui permet d'être construit à l'avance et livré dans le
// CLI, là où la preview est compilée chez l'utilisateur.
// Voir docs/decisions.md.

const MANIFEST = '/@crypte/manifest.json'

const frame = useTemplateRef<HTMLIFrameElement>('frame')
const entries = ref<StoryEntry[]>([])
const current = ref<string | null>(null)
const status = ref('chargement du catalogue')

// L'entrée affichée, pas seulement son identifiant : celui-ci vient du chemin et
// du nom, donc renommer une story le change et la sélection ne se retrouve plus.
// Son fichier et son rang y survivent.
let shown: StoryEntry | null | 'effacée' = null

// Une erreur de rendu s'affiche, elle ne se glisse pas dans une ligne d'état :
// une story qui ne rend rien laisse un cadre vide, et un cadre vide sans
// message ressemble à un outil cassé.
const failure = ref<{ id: string; message: string; stack?: string } | null>(null)

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
  shown = entries.value.find((entry) => entry.id === id) ?? shown
  failure.value = null
  // Rien ne part avant que la preview ait dit `ready` : un message envoyé à une
  // iframe qui n'écoute pas encore est perdu sans trace.
  if (ready) channel?.send({ type: 'render', id, overrides: {} })
}

// Relu à chaque `ready`, et pas seulement au montage : ce message est aussi ce
// que dit une preview rechargée parce que le catalogue a changé. Aucun message
// de plus n'a donc été ajouté au protocole.
async function refresh() {
  // Un catalogue illisible fige l'arbre sur son état d'avant : sans cette
  // ligne, rien ne dirait pourquoi il a cessé de suivre.
  let manifest: Manifest
  try {
    manifest = (await fetch(MANIFEST).then((answer) => answer.json())) as Manifest
  } catch (error) {
    status.value = `catalogue illisible : ${error instanceof Error ? error.message : String(error)}`
    return
  }

  const before = entries.value

  entries.value = manifest.entries
  status.value = `${manifest.entries.length} stories`

  const id = recovered(shown, before, manifest.entries)
  if (id === null) {
    current.value = null
    shown = 'effacée'
    if (manifest.entries.length > 0) status.value = 'la story affichée a disparu'
    return
  }

  show(id)
}

onMounted(() => {
  if (frame.value) {
    channel = createShellChannel(frame.value)
    channel.onMessage((message) => {
      if (message.type === 'ready') {
        ready = true
        status.value = `preview prête, protocole v${message.protocolVersion}`
        void refresh()
      }
      if (message.type === 'rendered') {
        failure.value = null
        status.value = `${message.id} rendu en ${message.durationMs.toFixed(1)} ms`
      }
      if (message.type === 'error') {
        failure.value = { id: message.id, message: message.message, stack: message.stack }
        status.value = 'erreur de rendu'
      }
    })
  }

  void refresh()
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
      <!-- L'erreur couvre la preview plutôt que de l'accompagner : ce qui reste
           affiché dessous appartient à la story d'avant, et le laisser voir
           ferait croire que celle-ci a rendu. -->
      <div v-if="failure" class="failure" role="alert">
        <h2>{{ failure.id }} n'a pas pu être rendue</h2>
        <p>{{ failure.message }}</p>
        <pre v-if="failure.stack">{{ failure.stack }}</pre>
      </div>
      <iframe v-show="!failure" ref="frame" src="/preview.html" title="preview"></iframe>
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

.failure {
  border: 1px solid #fca5a5;
  background: #fef2f2;
  padding: 12px 16px;
  min-height: 70vh;
  box-sizing: border-box;
}

.failure pre {
  white-space: pre-wrap;
  font-size: 12px;
  color: #7f1d1d;
}
</style>
