import type { ComponentProps } from 'react'

// Le pass-through DOM, la forme qu'une lecture syntaxique ne peut pas ouvrir :
// `ComponentProps<'span'>` demande le vérificateur de types. Seul ce que le
// fichier écrit à la main remonte. Voir docs/internal/architecture.md.
export function Tag({ className, ...rest }: ComponentProps<'span'>) {
  return <span className={className} data-tag {...rest} />
}
