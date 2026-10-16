// The custom properties a component reads, section 4.2 of docs/contracts.md.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// A style sheet the component imports by a relative path: what a component
// file, a CSS module or a Vue single-file component holds beside it, with or
// without a Vite query such as `?inline`. A Vue component also links one by
// `<style src>`.
const SHEET =
  /\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?['"](\.{1,2}\/[^'"?]+\.(?:css|scss|sass|less|styl|pcss))(?:\?[^'"]*)?['"]/g
const STYLE_SRC = /<style\b[^>]*\bsrc\s*=\s*['"](\.{1,2}\/[^'"]+)['"]/g

// The name each `var(--name` reads, without its dashes, sorted. Read in the
// component file and in the style sheets it imports, one level deep. The
// component file also counts a quoted `'--name'` inside a `var(${…})` template:
// `var(${tone ? '--a' : '--b'})` picks its property in a string. Any other quoted
// `--name` is no read, a class or a command-line flag being written so too. A
// class of a global sheet is not tied to the component that uses it, so its
// custom properties are not here: that is section 8.
//
// `undefined` when the component file cannot be read: an empty list would say
// it reads none.
export function tokensOf(file: string): string[] | undefined {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }

  const found = new Set([...namesIn(text), ...quotedIn(text)])

  for (const match of [...text.matchAll(SHEET), ...text.matchAll(STYLE_SRC)]) {
    try {
      for (const name of namesIn(readFileSync(resolve(dirname(file), match[1]!), 'utf8')))
        found.add(name)
    } catch {
      // A sheet that is not there breaks the component's own build, which says so
      // better than a missing token here would.
    }
  }

  return [...found].sort()
}

function quotedIn(text: string): string[] {
  return [...text.matchAll(/var\(\$\{([^}]*)\}/g)].flatMap((one) =>
    [...one[1]!.matchAll(/['"]--([\w-]+)['"]/g)].map((quoted) => quoted[1]!),
  )
}

function namesIn(text: string): string[] {
  return [...text.matchAll(/var\(\s*--([\w-]+)/g)].map((one) => one[1]!)
}
