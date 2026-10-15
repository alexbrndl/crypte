<!-- A list of choices, drawn as the text field, `input/text`, with a chevron: the
     Figma file has no select of its own. Reka's select, so the list is drawn
     rather than the system menu. Each option is a string value and its label;
     attributes and listeners go to the trigger, which `Field` labels by its id. -->
<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

defineOptions({ inheritAttrs: false })

defineProps<{
  options: readonly { value: string; label: string }[]
  placeholder?: string
}>()

const model = defineModel<string>()
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger class="trigger" v-bind="$attrs">
      <SelectValue :placeholder="placeholder" />
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 6C12 6 9.054 10 8 10C6.946 10 4 6 4 6" />
      </svg>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="crypte-select-content" position="popper" :side-offset="4">
        <SelectViewport>
          <SelectItem
            v-for="option of options"
            :key="option.value"
            :value="option.value"
            class="crypte-select-item"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="crypte-select-indicator">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3.5 8L6.5 11L12.5 5" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.trigger {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: var(--space-1-5) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-align: left;
  cursor: pointer;
}

.trigger:hover {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-strong);
}

.trigger:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.trigger[data-placeholder] {
  color: var(--text-muted);
}

.trigger svg {
  flex: none;
  color: var(--text-muted);
}
</style>

<!-- Not scoped: the list is teleported to the body, out of reach of the scope
     attribute, so a scoped rule never matched it. Measured in Chromium. -->
<style>
/* A real border: the highlighted option would cover an inset one. */
.crypte-select-content {
  z-index: 10;
  box-sizing: border-box;
  min-width: var(--reka-select-trigger-width);
  max-height: var(--reka-select-content-available-height);
  padding: var(--space-1);
  overflow: hidden;
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--stone-950) 14%, transparent);
  background: var(--background-raised);
  font-family: var(--font-sans);
}

.crypte-select-item {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  cursor: pointer;
  outline: none;
}

.crypte-select-item[data-highlighted] {
  background: var(--background-current);
  color: var(--text-current);
}

.crypte-select-indicator {
  display: flex;
}
</style>
