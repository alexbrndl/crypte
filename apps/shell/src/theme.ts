import { computed, onBeforeUnmount, ref, watchEffect } from 'vue'

// Le thème du shell : celui du système tant qu'on n'en a pas choisi un, puis le
// choix, retenu d'une session à l'autre. Posé en `data-theme` sur la racine, que
// `tokens.css` de `@crypte/ui` lit ; absent, le système décide seul.

export type Theme = 'light' | 'dark'

const KEY = 'crypte:theme'

export function useTheme() {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const stored = localStorage.getItem(KEY)
  const chosen = ref<Theme | null>(stored === 'light' || stored === 'dark' ? stored : null)
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
    localStorage.setItem(KEY, chosen.value)
  }

  return { theme, toggle }
}
