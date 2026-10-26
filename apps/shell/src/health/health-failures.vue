<script setup lang="ts">
import type { StoryEntry } from '@crypte/core/protocol'
import { Button, CardTable, EmptyNote, SectionHeader, ViewCanvas } from '@crypte/ui'
import { storyName } from './health'
import type { Failure } from './audit'
import { texts } from '../i18n'

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
const t = texts({
  en: {
    region: 'Health, render errors',
    title: 'render errors',
    note: 'every story, light and dark',
    again: 'Run again',
    run: 'Run the audit',
    failed: 'The audit could not run: {reason}.',
    running: 'Rendering every story, {done} of {total} renders.',
    notYet: 'The audit has not run yet.',
    allRender: 'Every story renders.',
    story: 'story',
    error: 'error',
    themes: 'themes',
    both: 'light and dark',
    light: 'light',
    dark: 'dark',
  },
  fr: {
    region: 'Santé, erreurs de rendu',
    title: 'erreurs de rendu',
    note: 'chaque story, clair et sombre',
    again: 'Relancer',
    run: "Lancer l'audit",
    failed: "L'audit n'a pas pu tourner : {reason}.",
    running: 'Rendu de chaque story, {done} sur {total} rendus.',
    notYet: "L'audit n'a pas encore tourné.",
    allRender: 'Chaque story rend.',
    story: 'story',
    error: 'erreur',
    themes: 'thèmes',
    both: 'clair et sombre',
    light: 'clair',
    dark: 'sombre',
  },
})

const themesOf = (themes: string[]) =>
  themes.length === 2 ? t('both') : t(themes[0] === 'dark' ? 'dark' : 'light')
</script>

<template>
  <ViewCanvas class="health-view" :aria-label="t('region')">
    <SectionHeader :title="t('title')" :count="failures?.length" :note="t('note')">
      <template v-if="!running" #action>
        <Button class="run" @click="emit('run')">{{ failures ? t('again') : t('run') }}</Button>
      </template>
    </SectionHeader>
    <EmptyNote v-if="failed && !running" failed role="alert">
      {{ t('failed', { reason: failed }) }}
    </EmptyNote>
    <EmptyNote v-if="running" role="status">
      {{ t('running', { done: running.done, total: running.total }) }}
    </EmptyNote>
    <EmptyNote v-else-if="failures === null">{{ t('notYet') }}</EmptyNote>
    <EmptyNote v-else-if="failures.length === 0">{{ t('allRender') }}</EmptyNote>
    <CardTable v-else>
      <thead>
        <tr>
          <th scope="col">{{ t('story') }}</th>
          <th scope="col" class="grow">{{ t('error') }}</th>
          <th scope="col">{{ t('themes') }}</th>
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
