// L'état d'un projet qui installe le noyau seul, compilé sans
// `test/plugin-simulation.d.ts`. Voir architecture.md.
//
// Chaque `@ts-expect-error` doit être consommé : une directive inutilisée est
// elle-même une erreur, donc la compilation échoue dans les deux sens.

import type { ShellMessage } from '../../src/protocol/channel'
import type { PropDetails } from '../../src/protocol/prop'
import type { StoryOptions } from '../../src/protocol/story'

// @ts-expect-error `min` appartient au plugin controls, pas au noyau
export const borne = { min: 0 } satisfies PropDetails

// @ts-expect-error aucun plugin n'a déclaré `responsive`
export const option = { responsive: 'mobile' } satisfies StoryOptions

// @ts-expect-error aucune option n'existe sans plugin
export const quelconque = { nimportequoi: 42 } satisfies StoryOptions

// @ts-expect-error aucun plugin n'a déclaré ce message
export const message = { type: 'controls:open', open: true } satisfies ShellMessage

// Ce que le noyau accepte seul.
export const noyau = { description: 'Une prop', options: ['a'] } satisfies PropDetails
export const vide = {} satisfies StoryOptions
export const rendu = {
  type: 'render',
  id: 'badge--par-defaut',
  overrides: {},
} satisfies ShellMessage
