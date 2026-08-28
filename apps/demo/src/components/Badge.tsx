export interface BadgeProps {
  /** Ce que le badge annonce. */
  label: string
  /** Neutre par défaut, `warning` pour attirer l'œil. */
  tone?: 'neutral' | 'warning'
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <span
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
