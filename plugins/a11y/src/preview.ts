// The hooks: an axe-core analysis of the story's root after each render, and
// again when the panel asks. Section 6.2 of docs/contracts.md.

// The script, not `import axe from 'axe-core'`, which finds no default export
// once the plugin is installed: axe is CommonJS, and Vite pre-bundles nothing
// imported from `node_modules`. The script sets `window.axe` wherever it runs.
// Measured in the repository, installed flat, and installed by pnpm.
//
// With the module, not at the first analysis: the preview no longer waits for
// plugin modules before the first story, so its 580 kB hold nothing back.
// Measured: cold start 870 ms, against 877 loaded at the first analysis.
// Reopened if the preview waits for plugin modules again.
import 'axe-core/axe.min.js'
import type { PreviewContext, PreviewHooks } from '@crypte/core/protocol'
import type axe from 'axe-core'
import type { Results } from './results'

declare global {
  interface Window {
    axe: typeof axe
  }
}

// axe refuses a run while another is going, and a render can land during an
// analysis: each waits for the one before, failed or not.
let last: Promise<unknown> = Promise.resolve()

// Returned, so a failed analysis rejects the hook and the shell names it.
function analyse(ctx: PreviewContext): Promise<void> {
  const run = last.then(async () => {
    const found = await window.axe.run(ctx.root)
    const results: Results = {
      type: 'a11y:results',
      id: ctx.id,
      passes: found.passes.length,
      violations: found.violations.map((one) => ({
        rule: one.id,
        // Always set on a violation; the type allows none for a pass.
        impact: one.impact ?? 'minor',
        help: one.help,
        helpUrl: one.helpUrl,
        targets: one.nodes.map((node) => node.target.flat().join(' ')),
      })),
    }
    ctx.send(results)
  })

  last = run.catch(() => {})
  return run
}

const hooks: PreviewHooks = {
  afterMount: analyse,
  onMessage: (ctx, message) => (message.type === 'a11y:run' ? analyse(ctx) : undefined),
}

export default hooks
