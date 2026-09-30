declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

// The script axe ships beside its CommonJS entry, imported for what it sets on
// `window`: nothing to type.
declare module 'axe-core/axe.min.js' {}
