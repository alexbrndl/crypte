// Analyses each render of a story with axe-core, and lists in a panel what it
// breaks. Section 6 of docs/contracts.md.

import type { CryptePlugin } from '@crypte/core/protocol'

export default function a11y(): CryptePlugin {
  return {
    name: 'a11y',
    // The built panel and hooks, beside this file in `dist`.
    shell: new URL('./shell.js', import.meta.url).href,
    preview: new URL('./preview.js', import.meta.url).href,
  }
}
