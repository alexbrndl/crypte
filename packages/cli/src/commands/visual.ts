// `crypte visual`: every story rendered in Chromium and compared with its
// baseline, one PNG per story under `.crypte/visual`. See docs/contracts.md,
// section 8.

import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { FingerprintEntry, StoryEntry } from '@crypte/core/protocol'
import sirv from 'sirv'
import { committedFingerprint } from '../catalogue/changes'
import { fingerprintOf } from '../catalogue/fingerprint'
import { storiesOf } from '../catalogue/manifest'
import { ConfigError } from '../errors'
import { STORYBOOK_IFRAME } from '../catalogue/storybook'
import { MANIFEST_ROUTE } from '../server/serve'
import { build, BUILD_OUTPUT } from './build'

// Committed: the CI that compares is the one that writes them, since another
// system's fonts draw other pixels.
export const BASELINES = join('.crypte', 'visual')
// What differs, beside the baselines rather than over them: the capture taken,
// under the story's id, for the CI to keep.
export const DIFFERENT = 'crypte-visual'

// A fixed frame and scale, so two runs of one machine draw the same pixels.
const VIEWPORT = { width: 1280, height: 720 }

interface Chromium {
  launch(): Promise<{
    newPage(options: object): Promise<Page>
    close(): Promise<void>
  }>
}

interface Page {
  goto(url: string, options: object): Promise<unknown>
  waitForFunction(expression: string, arg: undefined, options: object): Promise<unknown>
  evaluate(expression: string): Promise<unknown>
  screenshot(options: object): Promise<Buffer>
}

export async function visual(
  input: string,
  update: boolean,
  log: (line: string) => void = console.log,
): Promise<number> {
  const chromium = await chromiumOf()
  await build(input, () => {})

  const root = resolve(input)
  const out = join(root, BUILD_OUTPUT)
  const manifest: unknown = JSON.parse(readFileSync(join(out, MANIFEST_ROUTE.slice(1)), 'utf8'))
  const stories = storiesOf(manifest as Parameters<typeof storiesOf>[0])
  const now = fingerprintOf(manifest as Parameters<typeof fingerprintOf>[0]).entries

  const serve = sirv(out, { dev: true })
  const server = createServer((request, response) => serve(request, response))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`

  const baselines = join(root, BASELINES)
  const different = join(root, DIFFERENT)
  rmSync(different, { recursive: true, force: true })

  const changed: string[] = []
  const missing: string[] = []
  let browser
  try {
    let page
    try {
      browser = await chromium.launch()
      page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    } catch (cause) {
      throw new ConfigError(`crypte visual could not start Chromium: ${(cause as Error).message}`, {
        cause,
      })
    }
    for (const story of stories) {
      const shot = await captureOf(page, origin, story)
      // An id holds a `/` for a story in a folder (4.3): a folder here too.
      const file = join(baselines, `${story.id}.png`)
      if (update) write(file, shot)
      else if (!existsSync(file)) missing.push(story.id)
      else if (!readFileSync(file).equals(shot)) {
        changed.push(story.id)
        write(join(different, `${story.id}.png`), shot)
      }
    }
  } finally {
    await browser?.close()
    server.close()
  }

  // A story renamed or removed leaves its baseline behind, kept until an update.
  const ids = new Set(stories.map((story) => story.id))
  const stale = existsSync(baselines)
    ? readdirSync(baselines, { recursive: true, encoding: 'utf8' })
        .map((name) => name.split(sep).join('/'))
        .filter((name) => name.endsWith('.png') && !ids.has(name.slice(0, -4)))
    : []

  if (update) {
    for (const name of stale) {
      rmSync(join(baselines, name))
      // The folder of a story in a folder, once empty, goes with it.
      for (let at = dirname(join(baselines, name)); at !== baselines; at = dirname(at)) {
        if (readdirSync(at).length > 0) break
        rmSync(at, { recursive: true })
      }
    }
    log(`${stories.length} baselines written to ${BASELINES}`)
    return 0
  }

  const renames = renamesOf(
    missing,
    stale.map((name) => name.slice(0, -4)),
    // Nothing to pair without a story missing its baseline: no Git run then.
    missing.length === 0 ? [] : storiesBefore(root, stale),
    now,
  )
  const taken = new Set(renames.values())

  for (const id of changed) log(`  ${id}: differs from its baseline, see ${DIFFERENT}/${id}.png`)
  for (const id of missing) {
    const before = renames.get(id)
    log(
      before === undefined
        ? `  ${id}: no baseline`
        : `  ${id}: no baseline, probably ${before} renamed: ${moveOf(before, id)} keeps its baseline`,
    )
  }
  for (const name of stale)
    if (!taken.has(name.slice(0, -4))) log(`  ${name.slice(0, -4)}: a baseline with no story`)
  if (changed.length + missing.length === 0) {
    log(`${stories.length} stories match their baselines`)
    return 0
  }
  log(
    `${changed.length + missing.length} of ${stories.length} stories differ: crypte visual --update writes them`,
  )
  return 1
}

// The story alone, by the page Storybook's readers embed, once it has drawn or
// said why not, its fonts loaded and the page quiet.
// A story that never says either is named, and stops the run.
async function captureOf(page: Page, origin: string, story: StoryEntry): Promise<Buffer> {
  try {
    await page.goto(`${origin}${STORYBOOK_IFRAME}?id=${encodeURIComponent(story.id)}`, {
      waitUntil: 'networkidle',
    })
    // As text: they run in the page, and this package is typed for Node.
    await page.waitForFunction(
      `document.documentElement.dataset.rendered === ${JSON.stringify(story.id)} || document.getElementById('crypte-failure') !== null`,
      undefined,
      { timeout: 10_000 },
    )
    await page.evaluate('document.fonts.ready')
    return await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' })
  } catch (cause) {
    throw new ConfigError(
      `crypte visual: ${story.id} could not be captured: ${(cause as Error).message}`,
      {
        cause,
      },
    )
  }
}

function write(file: string, shot: Buffer) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, shot)
}

// Playwright, which the project installs: Crypte does not ship a browser.
async function chromiumOf(): Promise<Chromium> {
  try {
    const playwright = (await import('playwright')) as unknown as { chromium: Chromium }
    return playwright.chromium
  } catch (cause) {
    throw new ConfigError(
      'crypte visual drives Chromium through Playwright: npm install --save-dev playwright, then npx playwright install chromium.',
      { cause },
    )
  }
}

// The story each baseline left over was taken of, from the fingerprint of the
// commit that last wrote it: `HEAD` holds the new id once the rename is
// committed, which is when the CI compares. Outside Git, or for a baseline
// never committed, there is nothing to read.
function storiesBefore(root: string, stale: string[]): FingerprintEntry[] {
  // One read per commit: one `--update` writes many baselines at once.
  const read = new Map<string, ReturnType<typeof committedFingerprint>>()
  return stale.flatMap((name) => {
    let commit: string
    try {
      commit = execFileSync('git', ['log', '-1', '--format=%H', '--', join(BASELINES, name)], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return []
    }
    if (commit === '') return []
    if (!read.has(commit)) read.set(commit, committedFingerprint(root, commit))
    const fingerprint = read.get(commit)!
    if (typeof fingerprint === 'string') return []
    return fingerprint.entries.filter((entry) => `${entry.id}.png` === name)
  })
}

// The command that keeps the baseline: `git mv` creates no folder, and an id
// that moves to a folder of its own needs one (4.3).
export function moveOf(before: string, id: string): string {
  const from = `${BASELINES}/${before}.png`
  const to = `${BASELINES}/${id}.png`
  const folder = dirname(to)
  return dirname(from) === folder
    ? `git mv ${from} ${to}`
    : `mkdir -p ${folder} && git mv ${from} ${to}`
}

// A story with no baseline, and a baseline whose story, in the fingerprint of
// the commit that last wrote it, had the same component, props and status:
// probably one renamed. Not `rest`, which folds in the name a rename changes. Said, never done, and only when each side has one match: a guess
// between two would take the wrong baseline as often as the right one.
export function renamesOf(
  missing: string[],
  stale: string[],
  before: FingerprintEntry[],
  now: FingerprintEntry[],
): Map<string, string> {
  const same = (one: FingerprintEntry, other: FingerprintEntry) =>
    one.component === other.component &&
    one.status === other.status &&
    one.props.join() === other.props.join()
  const old = before.filter((entry) => stale.includes(entry.id))
  const fresh = now.filter((entry) => missing.includes(entry.id))

  const found = new Map<string, string>()
  for (const entry of fresh) {
    const matches = old.filter((one) => same(one, entry))
    if (matches.length !== 1) continue
    const [match] = matches
    if (fresh.filter((one) => same(match!, one)).length === 1) found.set(entry.id, match!.id)
  }
  return found
}
