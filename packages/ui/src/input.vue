<!-- The text field of the Figma file, `input/text`: 32 px high. A native input,
     every attribute and listener passed through, so it takes `type`, `value` and
     `@input` as the element would. -->
<template>
  <input class="input" />
</template>

<style scoped>
.input {
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
}

.input::placeholder {
  color: var(--text-muted);
}

.input:hover {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-strong);
}

.input:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}
</style>
