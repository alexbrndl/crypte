import { afterEach, describe, expect, test, vi } from 'vitest'
import { audit, cleanOf, findingsOf, type AuditResult } from '../src/health/audit'

// L'audit d'accessibilité : ce qu'il retient de chaque rendu, et ce qu'il fait
// d'une story qui échoue ou d'un plugin muet.

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

function cadre() {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const dit = (data: unknown) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
  return { frame, dit }
}

describe('the audit', () => {
  // Une story qui lève est notée, l'audit continue ; une story dont le plugin ne
  // répond pas aussi, au bout de l'attente.
  test('notes a story that fails or that the plugin leaves unanswered, and goes on', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      if (id === 'a--b') setTimeout(() => dit({ type: 'error', id, message: 'boum' }))
      if (id === 'c--d')
        setTimeout(() => dit({ type: 'a11y:results', id: 'autre--x', passes: 0, violations: [] }))
    })
    const fini = audit(frame, ['a--b', 'c--d'], () => {})
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(await fini).toEqual([
      { id: 'a--b', theme: 'light', error: 'boum' },
      { id: 'a--b', theme: 'dark', error: 'boum' },
      { id: 'c--d', theme: 'light', error: 'no answer from the a11y plugin' },
      { id: 'c--d', theme: 'dark', error: 'no answer from the a11y plugin' },
    ])
  })

  test('gives up when the preview never says ready', async () => {
    vi.useFakeTimers()
    const { frame } = cadre()
    const fini = audit(frame, ['a--b'], () => {})
    const refus = expect(fini).rejects.toThrow('no preview')
    await vi.runAllTimersAsync()
    await refus
  })
})

describe('what the audit says', () => {
  const résultats: AuditResult[] = [
    { id: 'a--b', theme: 'light', passes: 2, violations: [] },
    { id: 'a--b', theme: 'dark', passes: 2, violations: [] },
    {
      id: 'c--d',
      theme: 'light',
      passes: 1,
      violations: [{ rule: 'x', impact: 'minor', help: 'X', helpUrl: '', targets: [] }],
    },
    { id: 'c--d', theme: 'dark', passes: 1, violations: [] },
    { id: 'e--f', theme: 'light', error: 'boum' },
    { id: 'e--f', theme: 'dark', error: 'boum' },
  ]

  // Une erreur n'est pas une story propre : rien ne dit qu'elle est accessible.
  test('counts as clean only a story without violation or error in both themes', () => {
    expect(cleanOf(résultats)).toEqual({ clean: 1, audited: 3 })
  })

  test('lists one finding per story and rule, with its themes', () => {
    expect(findingsOf(résultats).map((one) => [one.key, one.themes])).toEqual([
      ['c--d:x', ['light']],
    ])
  })
})
