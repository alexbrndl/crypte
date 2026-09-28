// Edits a story's props from the shell, one field per prop the manifest
// describes. Section 6.1 of docs/contracts.md.

import type { CryptePlugin } from '@crypte/core/protocol'

export default function controls(): CryptePlugin {
  return {
    name: 'controls',
    // The built panel, beside this file in `dist`.
    shell: new URL('./shell.js', import.meta.url).href,
  }
}
