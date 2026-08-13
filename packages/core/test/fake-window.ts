// Deux contextes qui s'envoient de vrais messages, sans DOM ni dépendance.
//
// Reproduit les deux règles du navigateur dont le canal dépend : un message
// n'est livré que si `targetOrigin` désigne l'origine du destinataire, et il est
// cloné, donc rien de non sérialisable ne traverse. Voir architecture.md.

type Listener = (event: MessageEvent) => void

const global = globalThis as unknown as { window?: unknown }

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
      // Le clonage a lieu à l'envoi, avant tout examen de `targetOrigin` : une
      // fonction ou une instance de composant lève chez l'émetteur, même quand
      // le message n'aurait été livré à personne. C'est la promesse du canal.
      const copie = structuredClone(data)

      self.deliver(
        { data: copie, origin: self.sender.location.origin, source: self.sender },
        targetOrigin,
      )
    },

    deliver(event, targetOrigin) {
      // La règle du navigateur, et la raison d'être des deux `postMessage` du
      // canal : `'*'` ne refuse rien, une origine exacte refuse tout le reste.
      // Lue sur `self`, comme le canal la lit, et non sur la variable reçue à la
      // construction : les deux divergeraient dès qu'un test change l'origine.
      if (targetOrigin !== '*' && targetOrigin !== self.location.origin) return

      // Un écouteur s'exécute dans la fenêtre qui reçoit : pendant la
      // distribution, `window` désigne celle-ci et non celle qui a émis. Sans
      // ce passage, les deux canaux d'un même test liraient le même `parent` et
      // la même origine, et l'appariement des deux côtés ne serait pas éprouvé.
      const precedent = global.window
      global.window = self

      try {
        // Copie de la liste : un écouteur qui se retire pendant la distribution
        // ne doit pas décaler les autres.
        for (const listener of [...listeners]) listener(event as unknown as MessageEvent)
      } finally {
        global.window = precedent
      }
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
