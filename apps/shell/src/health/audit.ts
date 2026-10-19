import type { PreviewMessage, Theme } from '@crypte/core/protocol'
import { createShellChannel } from '@crypte/core/shell'

// L'audit d'accessibilité de la vue santé : chaque story rendue dans une preview
// cachée, en light puis en dark, et ce que le plugin a11y en dit. Le shell lit
// donc le message d'un plugin précis, `a11y:results`, décision du 19 oct. 2026 :
// l'audit ne peut tourner que dans un navigateur. Rouvert si un second plugin
// d'analyse demande la même chose, alors par un contrat.

// La forme de `a11y:results`, `plugins/a11y/src/results.ts`, que le shell ne
// peut pas importer : tenue par le cas qui audite.
export interface Violation {
  rule: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor'
  help: string
  helpUrl: string
  targets: string[]
}

export type AuditResult =
  | { id: string; theme: Theme; passes: number; violations: Violation[] }
  | { id: string; theme: Theme; error: string }

export const THEMES: Theme[] = ['light', 'dark']

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
        Array.isArray(one.targets),
    )
  )
}

// Les stories une à une : axe refuse deux analyses à la fois, et un résultat se
// rattache à la story qui vient d'être demandée.
export async function audit(
  frame: HTMLIFrameElement,
  stories: string[],
  progress: (done: number) => void,
  // Ce qui recharge la preview cachée ; remplacé par les tests, que jsdom ne
  // laisse pas recharger une frame.
  reload: () => void = () => frame.contentWindow?.location.reload(),
): Promise<AuditResult[]> {
  const channel = createShellChannel(frame)
  let answer: ((message: PreviewMessage) => void) | null = null
  const stop = channel.onMessage((message) => answer?.(message))
  const next = (accept: (message: PreviewMessage) => boolean) =>
    new Promise<PreviewMessage | null>((resolve) => {
      const timer = setTimeout(() => {
        answer = null
        resolve(null)
      }, WAIT)
      answer = (message) => {
        if (!accept(message)) return
        clearTimeout(timer)
        answer = null
        resolve(message)
      }
    })
  const ready = async () => {
    if ((await next((message) => message.type === 'ready')) === null)
      throw new Error('the preview never said it was ready')
  }

  try {
    await ready()
    const results: AuditResult[] = []
    for (const id of stories) {
      for (const theme of THEMES) {
        const said = next(
          (message) =>
            (message.type === 'error' && message.id === id) ||
            (message.type === 'plugin-error' && message.plugin === 'a11y') ||
            ((message.type as string) === 'a11y:results' && (message as { id?: string }).id === id),
        )
        channel.send({ type: 'render', id, overrides: {}, theme })
        const message = await said
        if (message === null) {
          results.push({ id, theme, error: 'no answer from the a11y plugin' })
          // Une réponse qui arriverait après l'attente passerait pour celle du
          // rendu suivant, d'un autre thème ou d'une autre story : la preview
          // rechargée jette tout ce qu'elle avait en cours.
          const reloaded = ready()
          reload()
          await reloaded
        } else if (message.type === 'error' || message.type === 'plugin-error')
          results.push({ id, theme, error: message.message })
        else if (!shaped(message))
          results.push({
            id,
            theme,
            error: 'the a11y plugin answered in a shape the shell does not read',
          })
        else results.push({ id, theme, passes: message.passes, violations: message.violations })
        progress(results.length)
      }
    }
    return results
  } finally {
    stop()
  }
}

// Une ligne par story et par règle, ses thèmes ensemble : la même violation en
// light et en dark se lit une fois.
export interface Finding {
  key: string
  id: string
  violation: Violation
  themes: Theme[]
}

export function findingsOf(results: AuditResult[]): Finding[] {
  const found = new Map<string, Finding>()
  for (const result of results) {
    if (!('violations' in result)) continue
    for (const violation of result.violations) {
      const key = `${result.id}:${violation.rule}`
      const held = found.get(key)
      if (held) held.themes.push(result.theme)
      else found.set(key, { key, id: result.id, violation, themes: [result.theme] })
    }
  }
  const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 }
  return [...found.values()].sort(
    (one, other) =>
      rank[one.violation.impact] - rank[other.violation.impact] || one.key.localeCompare(other.key),
  )
}

// Les stories auditées sans violation ni erreur, dans aucun des deux thèmes.
export function cleanOf(results: AuditResult[]): { clean: number; audited: number } {
  const stories = new Map<string, boolean>()
  for (const result of results) {
    const clean = 'violations' in result && result.violations.length === 0
    stories.set(result.id, (stories.get(result.id) ?? true) && clean)
  }
  return { clean: [...stories.values()].filter(Boolean).length, audited: stories.size }
}
