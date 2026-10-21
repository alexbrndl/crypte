// The markdown pages of the story folder, section 4.2 of docs/contracts.md.

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { storyId, type PageEntry } from '@crypte/core/protocol'
import { posix } from './stories'

export const PAGE_EXTENSION = '.md'

// `stories` maps each story file that gave an entry, without its extension, to
// its path: `Badge.md` belongs to `Badge.tsx` only then. A story file that gives
// nothing has no component page to show it on, so its page stays in the tree.
export function pageOf(
  file: string,
  root: string,
  storiesRoot: string,
  stories: ReadonlyMap<string, string>,
): PageEntry {
  const path = posix(relative(storiesRoot, file)).split('/')
  const base = path.pop()!.slice(0, -PAGE_EXTENSION.length)
  const named = posix(relative(root, file))
  const { title, body } = titled(readFileSync(file, 'utf8'))
  const storyFile = stories.get(named.slice(0, -PAGE_EXTENSION.length))

  return {
    type: 'page',
    // From the file name and not the title, so retitling a page keeps its address.
    id: storyId([...path, base], ''),
    path,
    name: title ?? base,
    file: named,
    body,
    ...(storyFile === undefined ? {} : { storyFile }),
  }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/

// The first `# heading` outside a code fence, taken out of the body: a `# comment`
// in a shell snippet is no title.
export function titled(text: string): { title?: string; body: string } {
  const lines = text.split(/\r?\n/)
  let fence: string | undefined

  for (const [at, line] of lines.entries()) {
    const marker = FENCE.exec(line)?.[1]

    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length)
        fence = undefined
      continue
    }
    if (marker !== undefined) {
      fence = marker
      continue
    }

    const heading = HEADING.exec(line)?.[1]
    if (heading !== undefined) {
      const rest = [...lines.slice(0, at), ...lines.slice(at + 1)].join('\n')
      return { title: heading, body: rest.replace(/^\s*\n/, '') }
    }
  }

  return { body: text }
}
