import { describe, expect, it } from 'vitest'
import { titled } from '../src/catalogue/pages'

// Le titre d'une page : le premier `# titre` hors d'un bloc de code, retiré du
// corps. Voir docs/contracts.md § 1.1.

describe('the title of a page', () => {
  it('takes the first level-one heading and leaves the rest', () => {
    expect(titled('# Badge\n\n## Usage\n\n# Second\n')).toEqual({
      title: 'Badge',
      body: '## Usage\n\n# Second\n',
    })
  })

  it('reads a closing sequence and a CRLF file', () => {
    expect(titled('# Badge ##\r\nTexte\r\n')).toEqual({ title: 'Badge', body: 'Texte\n' })
  })

  it('skips a heading inside a backtick or tilde fence', () => {
    const body = '```sh\n# install\n```\n~~~\n# not either\n~~~\n'
    expect(titled(`${body}# Titre\n`)).toEqual({ title: 'Titre', body })
  })

  it('does not close a fence on a shorter or other marker', () => {
    const text = '````\n```\n~~~\n# inside\n````\n'
    expect(titled(text)).toEqual({ body: text })
  })

  it('refuses what is not a level-one heading', () => {
    for (const text of ['## Two\n', '#NoSpace\n', '    # indented code\n', '#\n', 'Para\n'])
      expect(titled(text)).toEqual({ body: text })
  })
})
