// Logs every call a component makes to one of its function props, and lists
// them in a panel. Section 6.4 of docs/contracts.md.

import type { CryptePlugin } from '@crypte/core/protocol'

export default function actions(): CryptePlugin {
  return {
    name: 'actions',
    // The built panel and hooks, beside this file in `dist`.
    shell: new URL('./shell.js', import.meta.url).href,
    preview: new URL('./preview.js', import.meta.url).href,
  }
}
