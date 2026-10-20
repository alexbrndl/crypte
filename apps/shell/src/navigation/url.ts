// Où se tient le shell, lu dans son adresse et écrit dans son adresse.
//
// Ces noms finissent dans des liens collés en pull request et en ticket. En
// renommer un casse tous les liens déjà collés : une fois une version publiée
// (DCJ-178), ils ne bougent plus. Un paramètre de requête et pas un segment de
// chemin, qu'un serveur statique ne réécrit pas vers `index.html` ; et pas un
// hash, dont les ancres des pages markdown auront besoin.

export type Place =
  | { mode: 'home' }
  // Une story, une famille de tokens ou une page : un seul espace de noms pour
  // toutes les natures, donc l'adresse n'a jamais à dire laquelle (§4.3).
  | { mode: 'entry'; id: string }
  // `storyId(path, '')`, le préfixe que partagent toutes les stories du composant.
  | { mode: 'component'; id: string }
  // La vue versions : son point de départ, une révision ou une date, et l'écart
  // choisi, `story:<id>` ou `token:<famille>/<clé>`.
  | { mode: 'changes'; from?: string; before?: string; change?: string }
  // Une catégorie de la vue tokens, et le token choisi dedans. Les catégories
  // viennent du shell et non du manifeste : elles n'entrent pas dans `id`.
  | { mode: 'tokens'; category: string; token?: string }
  // Une page de la vue santé, et le composant choisi dedans, `fichier:export`.
  | { mode: 'health'; page: string; item?: string }
  // La vue d'un plugin, sous son nom, et l'élément qu'elle a choisi.
  | { mode: 'view'; plugin: string; item?: string }

// Un mode par adresse, lu dans cet ordre. Une valeur vide ne nomme rien, et tout
// autre paramètre est ignoré : les deux passent au suivant. L'adresse que le
// shell écrit ensuite ne garde que la sienne, sans eux ni hash.
export function readPlace(search: string): Place {
  const query = new URLSearchParams(search)
  const id = query.get('id')
  if (id) return { mode: 'entry', id }
  const component = query.get('component')
  if (component) return { mode: 'component', id: component }
  const category = query.get('tokens')
  const token = query.get('token')
  if (category) return token ? { mode: 'tokens', category, token } : { mode: 'tokens', category }
  const health = query.get('health')
  const item = query.get('item')
  if (health)
    return item ? { mode: 'health', page: health, item } : { mode: 'health', page: health }
  const plugin = query.get('view')
  if (plugin) return item ? { mode: 'view', plugin, item } : { mode: 'view', plugin }
  if (query.has('changes')) {
    const at: { mode: 'changes'; from?: string; before?: string; change?: string } = {
      mode: 'changes',
    }
    for (const key of ['from', 'before', 'change'] as const) {
      const value = query.get(key)
      if (value) at[key] = value
    }
    return at
  }
  return { mode: 'home' }
}

export function placeSearch(place: Place): string {
  if (place.mode === 'entry') return `?id=${encoded(place.id)}`
  if (place.mode === 'component') return `?component=${encoded(place.id)}`
  if (place.mode === 'tokens')
    return `?tokens=${encoded(place.category)}${place.token ? `&token=${encoded(place.token)}` : ''}`
  if (place.mode === 'health')
    return `?health=${encoded(place.page)}${place.item ? `&item=${encoded(place.item)}` : ''}`
  if (place.mode === 'view')
    return `?view=${encoded(place.plugin)}${place.item ? `&item=${encoded(place.item)}` : ''}`
  if (place.mode === 'changes')
    return `?changes${(['from', 'before', 'change'] as const)
      .filter((key) => place[key])
      .map((key) => `&${key}=${encoded(place[key]!)}`)
      .join('')}`
  return ''
}

// La barre oblique et les deux-points restent lisibles : une requête les admet
// tels quels, et `checkout%2Fordersummary` dans un lien collé ne se lit plus.
const encoded = (id: string) => encodeURIComponent(id).replaceAll('%2F', '/').replaceAll('%3A', ':')

// Un clic simple sur un lien du shell navigue sans recharger ; un clic du milieu
// ou avec une touche de modification laisse le navigateur l'ouvrir ailleurs.
export const sameTab = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
