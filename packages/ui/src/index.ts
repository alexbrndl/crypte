import './tokens.css'

// What a plugin panel draws comes from here, even with one consumer: its own
// style sheet never reaches the shell's page, so a local component would lose its
// styles. Decided by the owner on 15 October 2026; reopened if panels get a way to
// ship CSS.
export { default as Alert } from './alert.vue'
export { default as Button } from './button.vue'
export { default as Checkbox } from './checkbox.vue'
export { default as Input } from './input.vue'
export { default as Select } from './select.vue'
