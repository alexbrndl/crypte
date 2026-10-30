// Les flèches dans une grille de boutons, une seule case dans l'ordre de
// tabulation (roving tabindex). Par la géométrie, la grille des composants
// s'enroulant par lignes et celle des tokens par colonnes : la case voisine est
// la plus proche dans la direction. Début et Fin vont aux extrémités.

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']

export function moveFocus(event: KeyboardEvent, container: HTMLElement): void {
  if (!KEYS.includes(event.key)) return
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
  const from = buttons.indexOf(event.target as HTMLButtonElement)
  if (from === -1) return
  event.preventDefault()
  const to = targetOf(buttons, from, event.key)
  if (to === from) return
  buttons[from]!.tabIndex = -1
  buttons[to]!.tabIndex = 0
  buttons[to]!.focus()
}

function targetOf(buttons: HTMLButtonElement[], from: number, key: string): number {
  if (key === 'Home') return 0
  if (key === 'End') return buttons.length - 1
  const here = centre(buttons[from]!)
  const DIRECTIONS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const [dx, dy] = DIRECTIONS[key] ?? [0, 0]
  let best = -1
  let distance = Number.POSITIVE_INFINITY
  buttons.forEach((button, at) => {
    if (at === from) return
    const there = centre(button)
    const along = (there.x - here.x) * dx + (there.y - here.y) * dy
    if (along <= 0) return
    const across = Math.abs((there.x - here.x) * dy) + Math.abs((there.y - here.y) * dx)
    const score = along + across * 4
    if (score < distance) {
      distance = score
      best = at
    }
  })
  // Sans géométrie, dans jsdom par exemple : l'ordre des cases.
  if (best !== -1) return best
  const step = dx + dy
  return Math.min(buttons.length - 1, Math.max(0, from + step))
}

function centre(button: HTMLElement) {
  const box = button.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}
