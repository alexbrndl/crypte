import './tokens.css'

// What a plugin panel draws comes from here, even with one consumer: its own
// style sheet never reaches the shell's page, so a local component would lose its
// styles. Decided by the owner on 15 October 2026; reopened if panels get a way to
// ship CSS.
export { default as Alert } from './alert.vue'
export { default as Button } from './button.vue'
export { default as Checkbox } from './checkbox.vue'
export { default as Field } from './field.vue'
export { default as Input } from './input.vue'
export { default as Select } from './select.vue'
export { default as Tooltip } from './tooltip.vue'

// The parts of a view, the shell's own: what a plugin's view builds with, its
// sidebar, canvas and panel looking like the shell's views.
export { default as ColumnTitle } from './column-title.vue'
export { default as SidebarLink } from './sidebar-link.vue'
export { default as Tree } from './tree.vue'
export type { TreeNode } from './tree'
export { default as ViewCanvas } from './view-canvas.vue'
export { default as SectionHeader } from './section-header.vue'
export { default as Badge } from './badge.vue'
export { default as CardTable } from './card-table.vue'
export { default as EmptyNote } from './empty-note.vue'
export { default as PanelSection } from './panel-section.vue'
