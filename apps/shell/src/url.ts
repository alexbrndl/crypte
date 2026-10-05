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
  | { mode: 'changes' }

// Un mode par adresse, lu dans cet ordre. Une valeur vide ne nomme rien, et tout
// autre paramètre appartient à quelqu'un d'autre : les deux passent au suivant.
export function readPlace(search: string): Place {
  const query = new URLSearchParams(search)
  const id = query.get('id')
  if (id) return { mode: 'entry', id }
  const component = query.get('component')
  if (component) return { mode: 'component', id: component }
  if (query.has('changes')) return { mode: 'changes' }
  return { mode: 'home' }
}

export function placeSearch(place: Place): string {
  if (place.mode === 'entry') return `?id=${encoded(place.id)}`
  if (place.mode === 'component') return `?component=${encoded(place.id)}`
  if (place.mode === 'changes') return '?changes'
  return ''
}

// La barre oblique reste lisible : une requête l'admet telle quelle, et
// `checkout%2Fordersummary` dans un lien collé ne se lit plus.
const encoded = (id: string) => encodeURIComponent(id).replaceAll('%2F', '/')
