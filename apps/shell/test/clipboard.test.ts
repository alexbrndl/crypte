import { afterEach, describe, expect, test, vi } from 'vitest'
import { useCopy } from '../src/clipboard'

// La copie dit « copied » sur le bon bouton, et rien quand le presse-papier refuse.

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a copy', () => {
  test('remembers the key of what it copied, and forgets it on a refusal', async () => {
    const écrit = vi.fn(async (_texte: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText: écrit } })
    const { copied, copy } = useCopy()

    await copy('le prompt', 'prompt')
    expect(écrit).toHaveBeenCalledWith('le prompt')
    expect(copied.value).toBe('prompt')

    écrit.mockRejectedValueOnce(new Error('denied'))
    await copy('le squelette', 'skeleton')
    expect(copied.value).toBeNull()
  })
})
