<!-- The checkbox of the Figma file: 16 px, its tick in the inverse text color. A
     native checkbox, every attribute and listener passed through; `indeterminate`
     draws a dash. -->
<template>
  <input type="checkbox" class="checkbox" />
</template>

<style scoped>
.checkbox {
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  border-radius: var(--radius-xs);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-strong);
  background: var(--background-raised);
  appearance: none;
  cursor: pointer;
}

.checkbox:hover {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--accent-base);
}

/* An outline rather than a shadow: forced colors drop shadows. */
.checkbox:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.checkbox:checked,
.checkbox:indeterminate {
  box-shadow: none;
  background: var(--accent-base);
}

/* The thicker inner stroke of Figma would vanish on the accent fill, the same
   color as the focus: a checked box keeps a ring outside instead. */
.checkbox:checked:focus-visible,
.checkbox:indeterminate:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-hairline);
}

.checkbox:checked:hover,
.checkbox:indeterminate:hover {
  background: var(--accent-hover);
}

.checkbox:checked::before,
.checkbox:indeterminate::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--text-inverse);
  mask: var(--checkbox-mark) center / 16px 16px no-repeat;
}

.checkbox:checked::before {
  --checkbox-mark: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.25' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8L6.5 11L12.5 5'/%3E%3C/svg%3E");
}

.checkbox:indeterminate::before {
  --checkbox-mark: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.25' stroke-linecap='round'%3E%3Cpath d='M4 8H12'/%3E%3C/svg%3E");
}
</style>
