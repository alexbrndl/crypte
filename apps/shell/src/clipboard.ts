import { ref } from 'vue'

// Ce qu'un bouton a copié, sous une clé, le temps de le dire : « copied » sur
// le bon bouton, rien si le presse-papier refuse.
export function useCopy() {
  const copied = ref<string | null>(null)
  async function copy(text: string, key = '') {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = key
    } catch {
      copied.value = null
    }
  }
  return { copied, copy }
}
