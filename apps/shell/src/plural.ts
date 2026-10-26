import { locale } from './i18n'

// Si un compte prend le singulier : un seul en anglais, zéro ou un en français.
export const singular = (count: number) => (locale.value === 'fr' ? count < 2 : count === 1)

// Un compte et son nom accordé : « 1 story », « 3 stories ».
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${singular(count) ? one : many}`
