<!-- A tooltip on hover and focus, drawn rather than left to the system's `title`.
     The trigger is the one element of the default slot; `content` keeps its line
     breaks. Reka's, its own provider so that a lone tooltip needs nothing around it. -->
<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

defineProps<{ content: string }>()
</script>

<template>
  <TooltipProvider :delay-duration="400">
    <!-- On keyboard focus only: a menu that hands the focus back to its trigger
         reopened its tooltip after every choice. -->
    <TooltipRoot ignore-non-keyboard-focus>
      <TooltipTrigger as-child><slot /></TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="crypte-tooltip" :side-offset="4">{{ content }}</TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<!-- Not scoped: the tooltip is teleported to the body, out of reach of the scope
     attribute, as the select's list is. -->
<style>
.crypte-tooltip {
  z-index: 20;
  max-width: 280px;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--background-inverse);
  color: var(--text-inverse);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  white-space: pre-line;
}
</style>
