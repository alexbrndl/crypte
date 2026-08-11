// Composant codé en dur : le lot 1 ne découvre aucun fichier.
export function Badge({ label = 'Nouveau' }: { label?: string }) {
  return <span>{label}</span>
}
