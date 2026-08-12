// Le chemin que la spécification recommande à un plugin : augmenter la porte
// d'entrée publique, et non un module interne. Aucun autre test ne l'emprunte.
//
// Ce que ça éprouve et que la simulation du noyau ne peut pas : la fusion à
// travers le `.d.ts` publié, où les points d'extension vivent dans un chunk et
// ne sont que réexportés. Un changement de découpage ou un réexport sous alias
// casserait la fonctionnalité phare du lot sans qu'aucun test ne bronche.

import type { PropDetails, PreviewMessage, StoryOptions } from '@crypte/core/protocol'

declare module '@crypte/core/protocol' {
  interface PluginPropDetails {
    min?: number
  }

  interface PluginStoryOptions {
    responsive?: 'mobile' | 'desktop'
  }

  interface PluginPreviewMessages {
    a11y: { type: 'a11y:report'; violations: string[] }
  }
}

export const detail = { min: 0, description: 'Prix' } satisfies PropDetails
export const option = { responsive: 'mobile' } satisfies StoryOptions
export const message = { type: 'a11y:report', violations: [] } satisfies PreviewMessage

// @ts-expect-error aucun plugin n'a déclaré `mni`
export const faute = { mni: 0 } satisfies PropDetails

// La discrimination survit à l'élargissement de l'union.
export function versionOf(received: PreviewMessage): number | undefined {
  return received.type === 'ready' ? received.protocolVersion : undefined
}
