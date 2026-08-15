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
        background: tone === 'warning' ? '#fde68a' : '#e5e7eb',
        borderRadius: '999px',
        padding: '2px 10px',
        fontSize: '13px',
      }}
    >
      {label}
    </span>
  )
}
