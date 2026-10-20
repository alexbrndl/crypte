// Ce que le shell retient d'une visite à l'autre, en JSON sous une clé
// `crypte:…`. `localStorage` peut lever, en navigation privée par exemple :
// rien n'est alors lu, et ce qui change dure le temps de la session.

export function kept(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : (JSON.parse(raw) as unknown)
  } catch {
    return undefined
  }
}

// `undefined` oublie la clé.
export function keep(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Stockage refusé.
  }
}
