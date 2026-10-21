// Ce qui relie une page de la vue docs au reste : une page cite un composant quand
// son texte porte son nom en mot entier, casse comprise. `Tag` ne cite pas `Tags`,
// et un nom courant écrit en minuscules, `badge`, ne compte pas.

import type { PageEntry } from '@crypte/core/protocol'

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const cites = (body: string, name: string) =>
  name !== '' &&
  new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(name)}(?![\\p{L}\\p{N}_])`, 'u').test(body)

// Les pages qui citent un composant, la sienne exceptée.
export const citing = (pages: readonly PageEntry[], name: string, own?: PageEntry) =>
  pages.filter((page) => page !== own && cites(page.body, name))
