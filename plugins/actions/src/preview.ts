// The hook: every function prop of the story, logged when the component calls
// it. One the story leaves out gets a logger, one it declares is wrapped and
// still called. Section 6.4 of docs/contracts.md.

import type { MountContext, PreviewHooks } from '@crypte/core/protocol'
import { summaryOf, type Called } from './called'

export default {
  beforeMount: (ctx: MountContext) => {
    for (const [prop, details] of Object.entries(ctx.details)) {
      if (details.type !== 'function') continue

      // `null` is the author saying there is none: left as written.
      const own = ctx.props[prop]
      if (own !== undefined && typeof own !== 'function') continue

      ctx.props[prop] = (...args: unknown[]) => {
        const called: Called = {
          type: 'actions:called',
          id: ctx.id,
          prop,
          args: args.map(summaryOf),
        }
        ctx.send({ ...called })
        return typeof own === 'function'
          ? (own as (...args: unknown[]) => unknown)(...args)
          : undefined
      }
    }
  },
} satisfies PreviewHooks
