// Shows the code that calls the component the way the story on display does,
// ready to copy. Section 6.1 of docs/contracts.md.

import type { CryptePlugin } from '@crypte/core/protocol'

export default function source(): CryptePlugin {
  return {
    name: 'source',
    // The built panel, beside this file in `dist`.
    shell: new URL('./shell.js', import.meta.url).href,
  }
}
