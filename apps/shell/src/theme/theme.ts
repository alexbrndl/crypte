import { computed, onBeforeUnmount, ref, watchEffect } from 'vue'

// Le thème du shell : celui du système à chaque lancement, puis la bascule, pour
// la page seulement. Non retenu, à la demande du propriétaire (17 oct. 2026) :
// on lance dans le thème de sa machine. Rouvert si l'on veut garder un choix.
// Posé en `data-theme` sur la racine, que `tokens.css` de `@crypte/ui` lit ;
// absent, le système décide seul.

export type Theme = 'light' | 'dark'

export function useTheme() {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const chosen = ref<Theme | null>(null)
  const system = ref<Theme>(query.matches ? 'dark' : 'light')

  // Suivi pour le libellé de la bascule : la page, elle, suit le système seule.
  const follow = (event: MediaQueryListEvent) => (system.value = event.matches ? 'dark' : 'light')
  query.addEventListener('change', follow)
  onBeforeUnmount(() => query.removeEventListener('change', follow))

  watchEffect(() => {
    if (chosen.value === null) delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = chosen.value
  })

  const theme = computed(() => chosen.value ?? system.value)

  function toggle() {
    chosen.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, toggle }
}
