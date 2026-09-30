// The hooks: an axe-core analysis of the story's root after each render, and
// again when the panel asks. Section 6.2 of docs/contracts.md.

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

// Loaded at the first analysis, never with this module: the preview waits for
// every plugin's module before the first story, and axe's 580 kB pushed the
// cold start past its budget. Measured: 1261 ms against 863 without the
// plugin, 870 loaded here.
//
// The script, not `import axe from 'axe-core'`, which finds no default export
// once the plugin is installed: axe is CommonJS, and Vite pre-bundles nothing
// imported from `node_modules`. The script sets `window.axe` wherever it runs.
// Measured in the repository, installed flat, and installed by pnpm.
let loaded: Promise<unknown> | undefined

async function loadAxe(): Promise<typeof axe> {
  loaded ??= import('axe-core/axe.min.js')
  await loaded
  return window.axe
}

// Returned, so a failed analysis rejects the hook and the shell names it.
function analyse(ctx: PreviewContext): Promise<void> {
  const run = last.then(async () => {
    const found = await (await loadAxe()).run(ctx.root)
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
