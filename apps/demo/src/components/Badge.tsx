export interface BadgeProps {
  /** Ce que le badge annonce. */
  label: string
  /** Neutre par défaut, `warning` pour attirer l'œil. */
  tone?: 'neutral' | 'warning'
  /** Au clic, ce que le panneau de `actions` journalise. */
  onClick?: () => void
}

export function Badge({ label, tone = 'neutral', onClick }: BadgeProps) {
  return (
    <span
      onClick={onClick}
      style={{
        background: `var(${tone === 'warning' ? '--color-warning' : '--color-badge-background'})`,
        color: 'var(--color-text)',
        borderRadius: 'var(--radius-pill)',
        padding: 'var(--space-badge)',
        fontSize: 'var(--size-label)',
      }}
    >
      {label}
    </span>
  )
}
