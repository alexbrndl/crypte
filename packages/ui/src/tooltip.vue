<!-- A tooltip on hover and focus, drawn rather than left to the system's `title`.
     The trigger is the one element of the default slot; `content` keeps its line
     breaks, `detail` follows it in a quieter ink, and `keys` is the shortcut, drawn
     as the inverse keycap of the Figma file. `side` places it, above by default. Reka's, its own provider so that a lone tooltip needs nothing around it. -->
<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

// `keys`, `detail` and `side` have one consumer, the shell, against the placement
// rule: kept by the owner on 16 and 17 October 2026, all three being part of the
// Figma tooltip (label, optional detail, optional shortcut), which the activity
// bar places to its right. Reopened if the design system drops them.
withDefaults(
  defineProps<{
    content: string
    detail?: string
    keys?: string
    side?: 'top' | 'right' | 'bottom' | 'left'
  }>(),
  { side: 'top' },
)
</script>

<template>
  <TooltipProvider :delay-duration="400">
    <!-- On keyboard focus only: a menu that hands the focus back to its trigger
         reopened its tooltip after every choice. -->
    <TooltipRoot ignore-non-keyboard-focus>
      <TooltipTrigger as-child><slot /></TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="crypte-tooltip" :side="side" :side-offset="4">
          <!-- The space is what a screen reader reads between the two: the gap
               draws it, and the flex box ignores it. -->
          <span class="crypte-tooltip-label">{{ content }}</span>
          <template v-if="detail"
            >{{ ' ' }}<span class="crypte-tooltip-detail">{{ detail }}</span></template
          >
          <template v-if="keys"
            >{{ ' ' }}<kbd class="crypte-tooltip-keys">{{ keys }}</kbd></template
          >
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<!-- Not scoped: the tooltip is teleported to the body, out of reach of the scope
     attribute, as the select's list is. -->
<style>
/* 30 px high with its keycap, as the Figma tooltip: 5 px around a 20 px key. */
.crypte-tooltip {
  z-index: 20;
  display: flex;
  gap: var(--space-2);
  align-items: center;
  max-width: 280px;
  padding: calc(var(--space-1) + var(--stroke-hairline)) var(--space-2);
  border-radius: var(--radius-md);
  background: var(--background-inverse);
  color: var(--text-inverse);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
}

.crypte-tooltip-label {
  white-space: pre-line;
}

/* The detail of the Figma tooltip: regular weight, the inverse ink dimmed. */
.crypte-tooltip-detail {
  color: color-mix(in srgb, var(--text-inverse) 60%, transparent);
  font-weight: var(--weight-normal);
}

.crypte-tooltip-keys {
  padding: var(--space-0-5) var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--background-inverse-hover);
  color: var(--text-inverse);
  font-family: var(--font-mono);
  font-weight: var(--weight-normal);
}
</style>
