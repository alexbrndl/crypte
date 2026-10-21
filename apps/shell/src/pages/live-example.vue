<script setup lang="ts">
import type { StoryEntry, Theme } from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/shell'
import { ComponentIcon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import Icon from '../ui/icon.vue'
import { sameTab } from '../navigation/url'

// L'exemple vivant d'une page Docs : une preview à part, qui rend la story donnée
// sans ses panneaux. Elle lit `ready`, et l'erreur de sa story, qu'elle dit à la
// place du cadre : la preview du canvas est masquée sous la page.
const props = defineProps<{ story: StoryEntry; theme: Theme; href: string }>()
const emit = defineEmits<{ show: [id: string] }>()

const frame = useTemplateRef<HTMLIFrameElement>('frame')
let channel: { send: ReturnType<typeof createShellChannel>['send']; ready: boolean } | null = null
let stop = () => {}

const failure = ref<string | null>(null)

const render = () => {
  if (!channel?.ready) return
  failure.value = null
  channel.send({ type: 'render', id: props.story.id, overrides: {}, theme: props.theme })
}

watch(frame, (element) => {
  stop()
  channel = null
  if (!element) return
  const opened = createShellChannel(element)
  const one = { send: opened.send, ready: false }
  stop = opened.onMessage((message) => {
    if (message.type === 'error' && message.id === props.story.id) failure.value = message.message
    if (message.type !== 'ready') return
    one.ready = true
    render()
  })
  channel = one
})
watch(() => [props.story.id, props.theme], render)
onBeforeUnmount(() => stop())

function follow(event: MouseEvent) {
  if (!sameTab(event)) return
  event.preventDefault()
  emit('show', props.story.id)
}
</script>

<template>
  <figure class="live-example">
    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
    <iframe
      v-show="!failure"
      ref="frame"
      src="/preview.html"
      :title="`example, ${story.name}`"
      :data-scheme="theme"
    ></iframe>
    <figcaption>
      <Icon :icon="ComponentIcon" />
      <code class="name">story · {{ story.name }}</code>
      <a :href="href" @click="follow">Open in stories</a>
      <Icon :icon="LinkSquare02Icon" />
    </figcaption>
  </figure>
</template>

<style scoped>
.live-example {
  margin: 0;
  overflow: hidden;
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-md);
}

/* Le fond à points de la preview, écrit comme dans le shell : `light-dark()` se
   résoudrait sur la racine du shell, pas sur la frame. */
iframe {
  display: block;
  width: 100%;
  height: 160px;
  border: 0;
}

iframe[data-scheme='light'] {
  color-scheme: light;
  background-color: var(--stone-100);
  background-image: radial-gradient(var(--stone-200) 1px, transparent 1px);
  background-size: 12px 12px;
}

iframe[data-scheme='dark'] {
  color-scheme: dark;
  background-color: var(--stone-700);
  background-image: radial-gradient(var(--stone-950) 1px, transparent 1px);
  background-size: 12px 12px;
}

.failure {
  margin: 0;
  padding: var(--space-3);
  background: var(--background-subtle);
  color: var(--error-text);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

figcaption {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-top: var(--stroke-hairline) solid var(--border-base);
  color: var(--text-subtle);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

a {
  color: var(--text-current);
  text-decoration: none;
}

a:hover {
  color: var(--text-current-hover);
}
</style>
