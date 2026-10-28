<script setup lang="ts">
import { useId } from 'vue'
import Chevron from './chevron.vue'

// The header that folds a panel of the right-hand column, in every view. The
// whole header folds it, but the action. The parent remembers the fold, being
// the one to know under which key. The rows of a panel, `panel/row` of the
// Figma file, are drawn here: `.rows` holds them, `.row`, `.caption`,
// `.link`, `.label` and `.meta` make them.
// `locked` keeps it folded with no toggle: a plugin panel with nothing to say,
// whose body stays mounted so it can say otherwise.
defineProps<{ title: string; open: boolean; locked?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const slots = defineSlots<{
  default?(): unknown
  // What describes the folded panel, read with the button.
  note?(): unknown
  action?(): unknown
  // Shown folded or not, in place of the body: what a panel threw.
  alert?(): unknown
}>()

const bodyId = useId()
const noteId = useId()
</script>

<template>
  <section class="panel">
    <div class="head">
      <h3>
        <span v-if="locked" class="toggle locked"
          ><span class="title">{{ title }}</span></span
        >
        <button
          v-else
          type="button"
          class="toggle"
          :aria-expanded="open"
          :aria-controls="slots.default ? bodyId : undefined"
          :aria-describedby="slots.note ? noteId : undefined"
          @click="emit('toggle')"
        >
          <Chevron :open="open" />
          <span class="title">{{ title }}</span>
        </button>
      </h3>
      <span v-if="slots.note" :id="noteId" class="note" @click="locked || emit('toggle')"
        ><slot name="note"
      /></span>
      <span v-if="slots.action" class="action"><slot name="action" /></span>
    </div>
    <slot name="alert" />
    <div v-if="slots.default" v-show="open" :id="bodyId" class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  /* A border: folded, the opaque head would cover an inset one. */
  border-bottom: var(--stroke-hairline) solid var(--border-base);
}

.head {
  display: flex;
  align-items: center;
  background: var(--background-subtle);
}

/* The note takes what the title and the action leave, from nothing, and wraps:
   sized by its text, it squeezed the title out of sight beside a button,
   measured on a folded a11y panel. The title still shrinks last, or a long one
   pushed its button out of the column. */
h3 {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
}

/* 40 px, the Figma panel header with its action. */
.toggle {
  display: flex;
  box-sizing: border-box;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  letter-spacing: var(--tracking-wider);
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
}

/* Its title where the others have theirs, after the chevron and its gap. */
.toggle.locked {
  padding-left: calc(var(--space-3) + 16px + var(--space-2));
  cursor: default;
}

.head:has(.locked) .note {
  cursor: default;
}

.toggle:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.toggle .icon {
  flex: none;
  color: var(--text-subtle);
}

.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note {
  flex: 1000 1 0;
  min-width: 0;
  padding-right: var(--space-3);
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-align: right;
  cursor: pointer;
}

/* The sm button of the Figma panel header, 24 px high, by the button's custom
   properties, which its children inherit. */
.action {
  --button-height: 24px;
  --button-padding: var(--space-0-5) var(--space-2);
  display: flex;
  flex: none;
  gap: var(--space-1);
  padding-right: var(--space-3);
}

.body {
  --empty-note-padding: var(--space-1) var(--space-3);
}

:slotted(.rows) {
  padding: var(--space-1) 0 var(--space-2-5);
}

:slotted(.row) {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

:slotted(.caption) {
  margin: 0;
  padding: var(--space-2-5) var(--space-3) var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

:slotted(.link) {
  min-height: 28px;
  box-sizing: border-box;
  color: var(--text-primary);
  text-decoration: none;
}

:slotted(.link:hover) {
  background: var(--background-hover);
}

:slotted(.link:focus-visible) {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

:slotted(.label) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:slotted(.meta) {
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
