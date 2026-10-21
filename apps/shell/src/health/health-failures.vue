<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { Button, CardTable, EmptyNote, SectionHeader, ViewCanvas } from '@crypte/ui'
import { storyName } from './health'
import type { Failure } from './audit'

// La page des rendus en échec : les stories qui lèvent quand on les rend, une
// ligne chacune, ses thèmes ensemble. Rien avant le premier audit.
const props = defineProps<{
  failures: Failure[] | null
  running: { done: number; total: number } | null
  // Pourquoi le dernier audit n'a pas tourné.
  failed: string | null
  stories: StoryEntry[]
  selected: string | null
  hrefOf: (key: string) => string
}>()
const emit = defineEmits<{ run: []; select: [key: string, event: MouseEvent] }>()

const nameOf = (id: string) => storyName(props.stories, id)
const themesOf = (themes: string[]) => (themes.length === 2 ? 'light and dark' : themes[0])
</script>

<template>
  <ViewCanvas class="health-view" aria-label="Health, render errors">
    <SectionHeader
      title="render errors"
      :count="failures?.length"
      note="every story, light and dark"
    >
      <template v-if="!running" #action>
        <Button class="run" @click="emit('run')">{{
          failures ? 'Run again' : 'Run the audit'
        }}</Button>
      </template>
    </SectionHeader>
    <EmptyNote v-if="failed && !running" failed role="alert">
      The audit could not run: {{ failed }}.
    </EmptyNote>
    <EmptyNote v-if="running" role="status">
      Rendering every story, {{ running.done }} of {{ running.total }} renders.
    </EmptyNote>
    <EmptyNote v-else-if="failures === null">The audit has not run yet.</EmptyNote>
    <EmptyNote v-else-if="failures.length === 0">Every story renders.</EmptyNote>
    <CardTable v-else>
      <thead>
        <tr>
          <th scope="col">story</th>
          <th scope="col" class="grow">error</th>
          <th scope="col">themes</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="one of failures"
          :key="one.key"
          :data-selected="one.key === selected || undefined"
          @click="emit('select', one.key, $event)"
        >
          <th scope="row">
            <a
              :href="hrefOf(one.key)"
              :aria-current="one.key === selected ? 'true' : undefined"
              @click.stop="emit('select', one.key, $event)"
              >{{ nameOf(one.id) }}</a
            >
          </th>
          <td class="grow" data-ink="error">{{ one.message }}</td>
          <td class="code">{{ themesOf(one.themes) }}</td>
        </tr>
      </tbody>
    </CardTable>
  </ViewCanvas>
</template>
