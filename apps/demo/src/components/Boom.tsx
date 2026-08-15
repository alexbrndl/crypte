export interface BoomProps {
  /** Ce que le composant refuse de rendre. */
  reason: string
  /** Mis à `false`, il rend au lieu de lever. */
  broken?: boolean
}

// Un composant qui échoue, exprès. Un outil qui montre des composants doit
// montrer aussi ce qu'il fait quand l'un d'eux ne rend pas, et ce qu'il fait
// quand on le répare.
export function Boom({ reason, broken = true }: BoomProps) {
  if (broken) throw new Error(reason)

  return <span>réparé</span>
}
