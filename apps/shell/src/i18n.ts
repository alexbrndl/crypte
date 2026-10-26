import { ref, watchEffect } from 'vue'
import { keep, kept } from './storage'

// La langue du shell : celle du navigateur, français s'il est en français, anglais
// sinon, puis le choix du sélecteur, retenu d'une visite à l'autre (DCJ-378).
// Chaque composant porte ses textes dans les deux langues, à côté de son gabarit :
// pas de fichier central où deux composants se disputeraient une clé.

export type Locale = 'en' | 'fr'
export const LOCALES: readonly Locale[] = ['en', 'fr']

const KEY = 'crypte:locale'

function initial(): Locale {
  const chosen = kept(KEY)
  if (chosen === 'en' || chosen === 'fr') return chosen
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export const locale = ref<Locale>(initial())

export function setLocale(next: Locale): void {
  locale.value = next
  keep(KEY, next)
}

// La langue de la page, pour un lecteur d'écran et la césure.
watchEffect(() => {
  document.documentElement.lang = locale.value
})

// Les paramètres d'un texte : `{count}` dans `'{count} à faire'`.
type Params<S> = S extends `${string}{${infer P}}${infer R}` ? P | Params<R> : never

// Deux ensembles de paramètres égaux, sans quoi la traduction en perdrait un.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

// Les textes d'un composant, dans les deux langues, chacun une chaîne et ses
// paramètres entre accolades : de la donnée, pas du code. Le français porte les
// mêmes clés et les mêmes paramètres que l'anglais, sinon ça ne compile pas. Lu à
// chaque rendu, ce qui rend chaque texte réactif à la langue.
export function texts<
  const M extends Record<string, string>,
  const F extends { [K in keyof M]: string },
>(dictionary: {
  en: M
  fr: F & { [K in keyof M]: Same<Params<F[K]>, Params<M[K]>> extends true ? unknown : never }
}) {
  return <K extends keyof M>(
    key: K,
    ...values: [Params<M[K]>] extends [never] ? [] : [Record<Params<M[K]>, string | number>]
  ): string => {
    const text: string = dictionary[locale.value][key]
    const [given] = values
    // Une fonction de remplacement : une valeur qui porte `$&` ou `$1` est
    // écrite telle quelle, ce qu'une chaîne de remplacement ne ferait pas.
    return given
      ? text.replace(/\{(\w+)\}/g, (_, name: string) =>
          String((given as Record<string, unknown>)[name]),
        )
      : text
  }
}
