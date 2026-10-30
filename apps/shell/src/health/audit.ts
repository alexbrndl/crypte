import type { PreviewMessage, Theme } from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/shell'
import { texts } from '../i18n'

// L'audit de la vue santé : chaque story rendue dans une preview cachée, en
// light puis en dark. Il dit lesquelles ne rendent pas et, avec le plugin a11y,
// ce qu'elles enfreignent. Le shell lit donc le message d'un plugin précis,
// `a11y:results`, décision du 19 oct. 2026 : l'audit ne peut tourner que dans un
// navigateur. Rouvert si un second plugin d'analyse demande la même chose, alors
// par un contrat.

// La forme de `a11y:results`, `plugins/a11y/src/results.ts`, que le shell ne
// peut pas importer : tenue par le cas qui audite.
export interface Violation {
  rule: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor'
  help: string
  helpUrl: string
  targets: string[]
  // Les couleurs mesurées d'un défaut de contraste.
  colors?: string[]
}

// Une story analysée par axe ; rendue sans analyse, faute de plugin ou parce que
// son analyse a échoué (`error`) ; en échec de rendu ; ou restée sans réponse,
// dont on ne sait rien.
export type AuditResult =
  | { id: string; theme: Theme; passes: number; violations: Violation[] }
  | { id: string; theme: Theme; drawn: true }
  | { id: string; theme: Theme; error: string }
  | { id: string; theme: Theme; broken: string; stack?: string }
  | { id: string; theme: Theme; silent: true }

export const THEMES: Theme[] = ['light', 'dark']

// Ce que l'audit dit lui-même de son échec : un texte lu à l'affichage, qui suit
// la langue choisie après coup.
export class AuditFailure extends Error {
  constructor(readonly text: () => string) {
    super(text())
  }
}

const t = texts({
  en: {
    neverReady: 'the preview never said it was ready',
    neverBack: 'the preview never came back after a reload',
  },
  fr: {
    neverReady: "l'aperçu n'a jamais dit qu'il était prêt",
    neverBack: "l'aperçu n'est jamais revenu après un rechargement",
  },
})

// Une story qui ne rend pas, ou un plugin muet, n'arrête pas l'audit.
const WAIT = 8000

const IMPACTS = ['critical', 'serious', 'moderate', 'minor']

// Une réponse qui n'a pas la forme lue ici est une erreur de la story, nommée,
// plutôt que des clés `undefined` et un panneau qui lève.
function shaped(message: unknown): message is { passes: number; violations: Violation[] } {
  const { passes, violations } = message as { passes?: unknown; violations?: unknown }
  return (
    typeof passes === 'number' &&
    Array.isArray(violations) &&
    violations.every(
      (one: Partial<Violation>) =>
        typeof one.rule === 'string' &&
        IMPACTS.includes(one.impact as string) &&
        typeof one.help === 'string' &&
        typeof one.helpUrl === 'string' &&
        Array.isArray(one.targets) &&
        (one.colors === undefined ||
          (Array.isArray(one.colors) && one.colors.every((color) => typeof color === 'string'))),
    )
  )
}

export interface AuditOptions {
  progress?: (done: number) => void
  // Sans le plugin, l'audit attend le rendu seul.
  a11y?: boolean
  // Arrête l'audit, le shell démonté : ce qui est déjà rendu est rendu.
  signal?: AbortSignal
  // Ce qui recharge la preview cachée ; remplacé par les tests, que jsdom ne
  // laisse pas recharger une frame.
  reload?: () => void
}

// Les stories une à une : axe refuse deux analyses à la fois, et un résultat se
// rattache à la story qui vient d'être demandée.
export async function audit(
  frame: HTMLIFrameElement,
  stories: string[],
  {
    progress = () => {},
    a11y = true,
    signal,
    reload = () => frame.contentWindow?.location.reload(),
  }: AuditOptions = {},
): Promise<AuditResult[]> {
  const channel = createShellChannel(frame)
  let answer: ((message: PreviewMessage | null) => void) | null = null
  const stop = channel.onMessage((message) => answer?.(message))
  const abort = () => answer?.(null)
  signal?.addEventListener('abort', abort)
  const next = (accept: (message: PreviewMessage) => boolean) =>
    new Promise<PreviewMessage | null>((resolve) => {
      const timer = setTimeout(() => {
        answer = null
        resolve(null)
      }, WAIT)
      answer = (message) => {
        if (message !== null && !accept(message)) return
        clearTimeout(timer)
        answer = null
        resolve(message)
      }
    })
  const ready = async (reason: () => string) => {
    const message = await next((one) => one.type === 'ready')
    if (message === null && !signal?.aborted) throw new AuditFailure(reason)
  }

  const results: AuditResult[] = []
  try {
    await ready(() => t('neverReady'))
    for (const id of stories) {
      for (const theme of THEMES) {
        if (signal?.aborted) return results
        const said = next(
          (message) =>
            (message.type === 'error' && message.id === id) ||
            (a11y
              ? (message.type === 'plugin-error' && message.plugin === 'a11y') ||
                ((message.type as string) === 'a11y:results' &&
                  (message as { id?: string }).id === id)
              : message.type === 'rendered' && message.id === id),
        )
        channel.send({ type: 'render', id, overrides: {}, theme })
        const message = await said
        if (signal?.aborted) return results
        if (message === null) {
          results.push({ id, theme, silent: true })
          // Une réponse qui arriverait après l'attente passerait pour celle du
          // rendu suivant, d'un autre thème ou d'une autre story : la preview
          // rechargée jette tout ce qu'elle avait en cours.
          const reloaded = ready(() => t('neverBack'))
          reload()
          await reloaded
        } else if (message.type === 'error')
          results.push({
            id,
            theme,
            broken: message.message,
            ...(message.stack ? { stack: message.stack } : {}),
          })
        else if (message.type === 'plugin-error')
          results.push({ id, theme, error: message.message })
        else if (message.type === 'rendered') results.push({ id, theme, drawn: true })
        else if (!shaped(message))
          results.push({
            id,
            theme,
            // Jamais affiché : seule l'identité de la story compte, sur la page
            // accessibilité. En anglais, comme un diagnostic.
            error: 'the a11y plugin answered in a shape the shell does not read',
          })
        else results.push({ id, theme, passes: message.passes, violations: message.violations })
        progress(results.length)
      }
    }
    return results
  } finally {
    signal?.removeEventListener('abort', abort)
    stop()
  }
}

// Une ligne par story et par règle, ses thèmes ensemble : la même violation en
// light et en dark se lit une fois.
export interface Finding {
  key: string
  id: string
  // Celle du premier thème : la règle, l'aide et la gravité ne changent pas d'un
  // thème à l'autre, les couleurs mesurées si.
  violation: Violation
  themes: Theme[]
  // Les couleurs mesurées dans chaque thème, quand axe en a mesuré.
  colors: Partial<Record<Theme, string[]>>
}

export function findingsOf(results: AuditResult[]): Finding[] {
  const found = new Map<string, Finding>()
  for (const result of results) {
    if (!('violations' in result)) continue
    for (const violation of result.violations) {
      const key = `${result.id}:${violation.rule}`
      const held = found.get(key)
      const colors = violation.colors ? { [result.theme]: violation.colors } : {}
      if (held) {
        held.themes.push(result.theme)
        Object.assign(held.colors, colors)
      } else found.set(key, { key, id: result.id, violation, themes: [result.theme], colors })
    }
  }
  const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 }
  return [...found.values()].sort(
    (one, other) =>
      rank[one.violation.impact] - rank[other.violation.impact] || one.key.localeCompare(other.key),
  )
}

// Une story qui ne rend pas, une ligne, ses thèmes ensemble.
export interface Failure {
  key: string
  id: string
  message: string
  stack?: string
  themes: Theme[]
}

export function failuresOf(results: AuditResult[]): Failure[] {
  const found = new Map<string, Failure>()
  for (const result of results) {
    if (!('broken' in result)) continue
    const held = found.get(result.id)
    if (held) held.themes.push(result.theme)
    else
      found.set(result.id, {
        key: result.id,
        id: result.id,
        message: result.broken,
        ...(result.stack ? { stack: result.stack } : {}),
        themes: [result.theme],
      })
  }
  return [...found.values()].sort((one, other) => one.key.localeCompare(other.key))
}
