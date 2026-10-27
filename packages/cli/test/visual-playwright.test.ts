// Sans Playwright installé, `crypte visual` dit quoi installer, avant de
// construire quoi que ce soit.

import { expect, test, vi } from 'vitest'
import { visual } from '../src/commands/visual'
import { ConfigError } from '../src/errors'

vi.mock('playwright', () => {
  throw new Error('Cannot find package playwright')
})

// Une erreur de configuration : le CLI la dit sans trace de pile, et sort en 1.
test('names what to install when Playwright is missing', async () => {
  await expect(visual('/nulle/part', false)).rejects.toBeInstanceOf(ConfigError)
  await expect(visual('/nulle/part', false)).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: crypte visual drives Chromium through Playwright: npm install --save-dev playwright, then npx playwright install chromium.]`,
  )
})
