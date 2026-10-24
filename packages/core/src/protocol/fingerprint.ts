// The committed shape of a catalogue, and what changed between two of them:
// section 4.6 of docs/contracts.md. Here rather than in the CLI because the
// shell compares too, a build reading a fingerprint from GitHub (DCJ-386).

export interface FingerprintEntry {
  id: string
  // `file#export`, one string: the pair is what identifies a component, and
  // splitting it here would let one half move without the other.
  component: string
  status: string
  // Sorted, so reordering a story file changes nothing.
  props: string[]
  // Everything else, folded into one value. What it holds does not matter to a
  // reader; that it changes when the entry changes does.
  rest: string
}

// One token: its family by identifier, its key, its kind, and the literal of
// each theme. The values themselves and not a digest: the versions view shows a
// token before and after.
export interface FingerprintToken {
  family: string
  key: string
  type: string
  themes: Record<string, string>
}

export interface Fingerprint {
  version: number
  entries: FingerprintEntry[]
  // Absent from a fingerprint committed before tokens had a history: its tokens
  // are unknown, not empty.
  tokens?: FingerprintToken[]
}

export type Change =
  | { kind: 'appeared'; id: string }
  | {
      kind: 'changed'
      id: string
      // Only what moved; a story whose props and status stayed is not listed,
      // whatever else its digest folds.
      props?: { before: string[]; after: string[] }
      status?: { before: string; after: string }
    }
  | { kind: 'disappeared'; id: string }

// A token by its family's identifier and its key, with the literal of each theme
// on either side.
export type TokenChange =
  | { kind: 'appeared'; family: string; key: string; after: Record<string, string> }
  | {
      kind: 'changed'
      family: string
      key: string
      before: Record<string, string>
      after: Record<string, string>
    }
  | { kind: 'disappeared'; family: string; key: string; before: Record<string, string> }

// The changes, or why there are none to read. A reason is said rather than an
// empty list, which would read as "nothing changed". `tokens` is `null` when the
// commit predates tokens in the fingerprint: their history starts after it.
export type Changes =
  | {
      from: { ref: string; commit: string }
      changes: Change[]
      tokens: TokenChange[] | null
    }
  | { reason: string }

// What changed from `before` to `after`, `from` naming where `before` was read.
export function compareFingerprints(
  before: Fingerprint,
  after: Fingerprint,
  from: { ref: string; commit: string },
): Exclude<Changes, { reason: string }> {
  return {
    from,
    changes: changesOf(before, after),
    tokens: before.tokens === undefined ? null : tokenChangesOf(before.tokens, after.tokens ?? []),
  }
}

// A fingerprint read from a file someone may have edited, truncated or written
// with another version, or what it lacks, named rather than thrown on (DCJ-278).
export function readFingerprint(read: unknown): Fingerprint | { lacks: string } {
  return fingerprintIn(read) ?? { lacks: missing(read) }
}

// Each token compared on its family and key, theme by theme.
function tokenChangesOf(before: FingerprintToken[], after: FingerprintToken[]): TokenChange[] {
  const id = (one: FingerprintToken) => `${one.family}\u0000${one.key}`
  const old = new Map(before.map((one) => [id(one), one]))
  const now = new Set(after.map(id))
  const changes: TokenChange[] = []

  for (const one of after) {
    const was = old.get(id(one))
    if (!was)
      changes.push({ kind: 'appeared', family: one.family, key: one.key, after: one.themes })
    else if (JSON.stringify(was.themes) !== JSON.stringify(one.themes))
      changes.push({
        kind: 'changed',
        family: one.family,
        key: one.key,
        before: was.themes,
        after: one.themes,
      })
  }
  for (const one of before) {
    if (!now.has(id(one)))
      changes.push({ kind: 'disappeared', family: one.family, key: one.key, before: one.themes })
  }

  return changes
}

// In manifest order: what appeared and changed in the order the catalogue
// holds it now, what disappeared in the order the commit held it.
function changesOf(before: Fingerprint, after: Fingerprint): Change[] {
  const old = new Map(before.entries.map((entry) => [entry.id, entry]))
  const ids = new Set(after.entries.map((entry) => entry.id))
  const changes: Change[] = []

  for (const entry of after.entries) {
    const was = old.get(entry.id)
    if (!was) {
      changes.push({ kind: 'appeared', id: entry.id })
      continue
    }
    const props = same(was.props, entry.props)
      ? undefined
      : { before: was.props, after: entry.props }
    const status =
      was.status === entry.status ? undefined : { before: was.status, after: entry.status }
    if (props || status)
      changes.push({
        kind: 'changed',
        id: entry.id,
        ...(props && { props }),
        ...(status && { status }),
      })
  }

  for (const entry of before.entries) {
    if (!ids.has(entry.id)) changes.push({ kind: 'disappeared', id: entry.id })
  }

  return changes
}

// Sorted on both sides by the producer, so equal lists hold the same order.
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((one, at) => one === b[at])

function fingerprintIn(read: unknown): Fingerprint | null {
  if (!isObject(read) || !Array.isArray(read['entries'])) return null
  if (!read['entries'].every(isEntry)) return null
  // Absent, the tokens are unknown; present, each one must read.
  if ('tokens' in read && !(Array.isArray(read['tokens']) && read['tokens'].every(isToken)))
    return null
  return read as unknown as Fingerprint
}

function missing(read: unknown): string {
  if (!isObject(read) || !Array.isArray(read['entries'])) return 'no `entries` list'
  const at = read['entries'].findIndex((one) => !isEntry(one))
  if (at !== -1) return `entry ${at} lacks a string \`id\`, a string \`status\` or a \`props\` list`
  if (!Array.isArray(read['tokens'])) return '`tokens` is not a list'
  return `token ${read['tokens'].findIndex((one) => !isToken(one))} lacks a string \`family\`, \`key\` or \`type\`, or \`themes\` of strings`
}

const isToken = (value: unknown): value is FingerprintToken =>
  isObject(value) &&
  typeof value['family'] === 'string' &&
  typeof value['key'] === 'string' &&
  typeof value['type'] === 'string' &&
  isObject(value['themes']) &&
  Object.values(value['themes']).every((one) => typeof one === 'string')

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isEntry = (value: unknown): value is FingerprintEntry =>
  isObject(value) &&
  typeof value['id'] === 'string' &&
  typeof value['status'] === 'string' &&
  Array.isArray(value['props']) &&
  value['props'].every((one) => typeof one === 'string')
