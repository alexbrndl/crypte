// Les flèches dans une grille de boutons, une seule case dans l'ordre de
// tabulation (roving tabindex). Par la géométrie, la grille des composants
// s'enroulant par lignes et celle des tokens par colonnes : la case voisine est
// la plus proche dans la direction, et rien au bord. Début et Fin vont aux
// extrémités. Rend l'index visé, ou `null` pour une autre touche : le composant
// garde l'entrée dans son état, que Vue repatche.

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function arrowTarget(event: KeyboardEvent, buttons: HTMLElement[]): number | null {
  const from = buttons.indexOf(event.target as HTMLElement)
  if (from === -1) return null
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    return event.key === 'Home' ? 0 : buttons.length - 1
  }
  const direction = DIRECTIONS[event.key]
  if (!direction) return null
  event.preventDefault()
  return neighbourOf(buttons, from, direction)
}

function neighbourOf(buttons: HTMLElement[], from: number, [dx, dy]: [number, number]): number {
  const boxes = buttons.map(centre)
  // Sans géométrie, dans jsdom par exemple : l'ordre des cases.
  if (boxes.every((one) => one.width === 0)) {
    return Math.min(buttons.length - 1, Math.max(0, from + dx + dy))
  }
  const here = boxes[from]!
  let best = from
  let distance = Number.POSITIVE_INFINITY
  boxes.forEach((there, at) => {
    if (at === from) return
    const along = (there.x - here.x) * dx + (there.y - here.y) * dy
    if (along <= 0) return
    // Rester sur sa ligne ou sa colonne coûte moins que de la quitter.
    const across = Math.abs((there.x - here.x) * dy) + Math.abs((there.y - here.y) * dx)
    const score = along + across * 4
    if (score < distance) {
      distance = score
      best = at
    }
  })
  return best
}

function centre(button: HTMLElement) {
  const box = button.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width }
}
