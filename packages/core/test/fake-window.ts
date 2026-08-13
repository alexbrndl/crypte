// Deux contextes qui s'envoient de vrais messages, sans DOM ni dépendance.
//
// Reproduit la seule règle du navigateur dont le canal dépend : un message n'est
// livré que si `targetOrigin` désigne l'origine du destinataire. Voir
// architecture.md.

type Listener = (event: MessageEvent) => void

export interface FakeWindow {
  location: { origin: string }
  parent: FakeWindow
  // Qui écrit dans ce contexte, donc ce que le destinataire lira dans
  // `event.origin` et `event.source`.
  sender: FakeWindow
  addEventListener(type: string, listener: Listener): void
  removeEventListener(type: string, listener: Listener): void
  postMessage(data: unknown, targetOrigin: string): void
  // Un message forgé, pour les cas qu'un émetteur honnête ne produit pas.
  deliver(event: { data: unknown; origin: string; source: unknown }, targetOrigin: string): void
  listenerCount(): number
}

export function windowAt(origin: string): FakeWindow {
  const listeners = new Set<Listener>()

  const self: FakeWindow = {
    location: { origin },
    // Une fenêtre sans parent est son propre parent, comme dans un navigateur.
    parent: undefined as unknown as FakeWindow,
    sender: undefined as unknown as FakeWindow,

    addEventListener(type, listener) {
      if (type === 'message') listeners.add(listener)
    },

    removeEventListener(type, listener) {
      if (type === 'message') listeners.delete(listener)
    },

    postMessage(data, targetOrigin) {
      self.deliver({ data, origin: self.sender.location.origin, source: self.sender }, targetOrigin)
    },

    deliver(event, targetOrigin) {
      // La règle du navigateur, et la raison d'être des deux `postMessage` du
      // canal : `'*'` ne refuse rien, une origine exacte refuse tout le reste.
      if (targetOrigin !== '*' && targetOrigin !== origin) return

      // Copie : un écouteur qui se retire pendant la distribution ne doit pas
      // décaler les autres.
      for (const listener of [...listeners]) listener(event as unknown as MessageEvent)
    },

    listenerCount: () => listeners.size,
  }

  self.parent = self
  self.sender = self

  return self
}

// Ce qu'un contexte a reçu, dans l'ordre.
export function collect(target: FakeWindow): unknown[] {
  const received: unknown[] = []
  target.addEventListener('message', (event) => received.push(event.data))

  return received
}
