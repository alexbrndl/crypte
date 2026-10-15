<!-- A list of choices drawn as the text field, `input/text`, with a chevron: the
     Figma file has no select of its own. A native select, its options in the slot,
     every attribute and listener passed to it rather than to the wrapper. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>

<template>
  <span class="select">
    <select v-bind="$attrs">
      <slot />
    </select>
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
  </span>
</template>

<style scoped>
.select {
  position: relative;
  display: flex;
  min-width: 0;
  color: var(--text-muted);
}

select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: var(--space-1-5) calc(var(--space-2) + 16px + var(--space-2)) var(--space-1-5)
    var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  appearance: none;
  cursor: pointer;
}

select:hover {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-strong);
}

select:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

svg {
  position: absolute;
  top: 8px;
  right: var(--space-2);
  pointer-events: none;
}
</style>
