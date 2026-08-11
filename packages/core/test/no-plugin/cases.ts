// Compilé à part, sans `test/plugin-simulation.d.ts` : c'est l'état d'un projet
// qui installe le noyau seul. Une augmentation de module vaut pour tout le
// programme, donc l'état « aucun plugin » est inatteignable depuis les autres
// tests, et ce que le noyau refuse par lui-même ne s'y vérifie pas.
//
// Chaque `@ts-expect-error` ci-dessous doit être consommé. Si le noyau cesse de
// refuser l'un de ces cas, la directive devient inutilisée, ce que TypeScript
// signale comme une erreur : la compilation échoue dans les deux sens.

import type { PropDetailsInput, StoryOptions } from '../../src/protocol/story'

// Les bornes d'un curseur appartiennent au plugin `controls`.
// @ts-expect-error `min` n'est déclaré par aucun plugin installé
export const borne = { min: 0 } satisfies PropDetailsInput

// Le cas que l'aiguillage de `StoryOptions` existe pour tenir. Un point
// d'extension vide, laissé tel quel, accepterait cet objet sans rien dire.
// @ts-expect-error `responsive` n'est déclaré par aucun plugin installé
export const option = { responsive: 'mobile' } satisfies StoryOptions

// Aucune clé, quelle qu'elle soit, tant que rien n'est déclaré.
// @ts-expect-error aucune option n'existe sans plugin
export const quelconque = { nimportequoi: 42 } satisfies StoryOptions

// Ce que le noyau accepte seul : ses propres champs, et l'objet vide.
export const noyau = { description: 'Une prop', options: ['a'] } satisfies PropDetailsInput
export const vide = {} satisfies StoryOptions
