export interface BoomProps {
  /** Ce que le composant refuse de rendre. */
  reason: string
}

// Un composant qui échoue, exprès. Un outil qui montre des composants doit
// montrer aussi ce qu'il fait quand l'un d'eux ne rend pas.
export function Boom({ reason }: BoomProps): never {
  throw new Error(reason)
}
