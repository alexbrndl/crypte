<script setup lang="ts">
import { useId } from 'vue'
import { ArrowDown01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import Icon from '../ui/icon.vue'

// L'en-tête repliable d'un panneau de la colonne de droite, dans toutes les
// vues. Tout l'en-tête plie le panneau, sauf l'action. Le repli se retient chez
// le parent, qui seul sait sous quelle clé.
defineProps<{ title: string; open: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const slots = defineSlots<{
  default?(): unknown
  // Ce qui décrit le panneau replié, lu avec le bouton.
  note?(): unknown
  action?(): unknown
  // Montré replié ou non, à la place du corps : ce qu'un panneau a levé.
  alert?(): unknown
}>()

const bodyId = useId()
const noteId = useId()
</script>

<template>
  <section class="panel">
    <div class="head">
      <h3>
        <button
          type="button"
          class="toggle"
          :aria-expanded="open"
          :aria-controls="slots.default ? bodyId : undefined"
          :aria-describedby="slots.note ? noteId : undefined"
          @click="emit('toggle')"
        >
          <Icon :icon="open ? ArrowDown01Icon : ArrowRight01Icon" />
          <span class="title">{{ title }}</span>
        </button>
      </h3>
      <span v-if="slots.note" :id="noteId" class="note" @click="emit('toggle')"
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

h3 {
  flex: 1;
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
  padding-right: var(--space-3);
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  text-align: right;
  cursor: pointer;
}

.action {
  display: flex;
  padding-right: var(--space-3);
}
</style>
