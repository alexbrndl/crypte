// `crypte mcp`: the catalogue for an agent working in the repository, Claude
// Code or Cursor, as a Model Context Protocol server over stdio. Read from the
// story files at each call, so it says what the code says now.
//
// Written by hand, not on `@modelcontextprotocol/sdk`: the SDK installs 91
// packages and 27 MB, express and hono among them, against a 38 MB budget for
// the whole CLI. Measured on 1.32.2. What is used of the protocol is four
// methods of JSON-RPC, one message per line. Reopened when a client needs more
// than tools: resources, prompts, or a transport other than stdio.

import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import type { Manifest, PageEntry, StoryEntry } from '@crypte/core/protocol'
import { changesSince } from '../catalogue/changes'
import { fingerprintOf } from '../catalogue/fingerprint'
import { buildCatalogue, storiesOf } from '../catalogue/manifest'
import { loadProject, type Project } from '../config/project'
import { reason } from '../errors'

// The newest first. A client asking for another one gets the newest, and
// decides whether it can work with it.
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

interface Request {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: unknown
  params?: Record<string, unknown>
}

interface Tool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  run: (args: Record<string, unknown>) => unknown
}

// What an agent writing code asks of a design system: what exists, how a
// component is called, which tokens to use, and what moved.
export function toolsOf(
  project: Project,
  read: () => Manifest = () => buildCatalogue(project).manifest,
): Tool[] {
  return [
    {
      name: 'components',
      description:
        'List the components of the design system, each with its file, its export and the names of its stories. Optionally filtered by a text found in the name or the file.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      run: ({ query }) => {
        const wanted = typeof query === 'string' ? query.toLowerCase() : ''
        return componentsOf(read()).flatMap(({ component, stories }) =>
          `${component.name} ${component.file}`.toLowerCase().includes(wanted)
            ? [{ ...component, stories: stories.map((one) => one.name) }]
            : [],
        )
      },
    },
    {
      name: 'component',
      description:
        'One component by its name: its props with their types and defaults, each story with the code that calls the component, its status, and the guidelines written beside its stories.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      run: ({ name }) => {
        const manifest = read()
        const found = componentsOf(manifest).filter(
          (one) => one.component.name.toLowerCase() === String(name).toLowerCase(),
        )
        if (found.length === 0) throw new Error(`no component named ${String(name)}`)
        return found.map(({ component, stories }) => ({
          ...component,
          props: stories[0]!.details,
          stories: stories.map((one) => ({
            id: one.id,
            name: one.name,
            ...(one.meta?.status ? { status: one.meta.status } : {}),
            source: one.source,
          })),
          guidelines:
            manifest.entries.find(
              (entry): entry is PageEntry =>
                entry.type === 'page' && entry.storyFile === stories[0]!.storyFile,
            )?.body ?? null,
        }))
      },
    },
    {
      name: 'tokens',
      description:
        'The design tokens read from the project style sheet, by family, with the value of each theme.',
      inputSchema: { type: 'object', properties: {} },
      run: () =>
        read().entries.flatMap((entry) =>
          entry.type === 'tokens' ? [{ family: entry.name, tokens: entry.tokens }] : [],
        ),
    },
    {
      name: 'changes',
      description:
        'What changed in the catalogue since a point of the Git history: the stories that appeared, disappeared, or whose props or status moved, and the tokens that changed. `from` names a branch, a tag or a commit, `before` a date; neither means the last commit.',
      inputSchema: {
        type: 'object',
        properties: { from: { type: 'string' }, before: { type: 'string' } },
      },
      run: ({ from, before }) =>
        changesSince(project.root, fingerprintOf(read()), {
          ...(typeof from === 'string' ? { ref: from } : {}),
          ...(typeof before === 'string' ? { before } : {}),
        }),
    },
  ]
}

// The stories by component, `file#export` identifying one, in manifest order.
function componentsOf(manifest: Manifest) {
  const by = new Map<string, { component: StoryEntry['component']; stories: StoryEntry[] }>()
  for (const story of storiesOf(manifest)) {
    const key = `${story.component.file}#${story.component.export}`
    const one = by.get(key) ?? { component: story.component, stories: [] }
    one.stories.push(story)
    by.set(key, one)
  }
  return [...by.values()]
}

// The answer to one line, or nothing for a notification. A tool that throws is
// a result the agent reads, `isError`, not a protocol error.
export function answer(line: string, tools: Tool[], version: string): object | undefined {
  let request: Request
  try {
    request = JSON.parse(line) as Request
  } catch {
    return failure(null, -32700, 'Parse error')
  }
  if (request?.jsonrpc !== '2.0' || typeof request.method !== 'string')
    return failure(request?.id ?? null, -32600, 'Invalid Request')
  if (request.id === undefined) return undefined

  const { id, method, params = {} } = request
  if (method === 'initialize') {
    const asked = params['protocolVersion']
    return result(id, {
      protocolVersion: VERSIONS.includes(String(asked)) ? asked : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'crypte', version },
    })
  }
  if (method === 'ping') return result(id, {})
  if (method === 'tools/list')
    return result(id, { tools: tools.map(({ run: _run, ...tool }) => tool) })
  if (method === 'tools/call') {
    const tool = tools.find((one) => one.name === params['name'])
    if (!tool) return failure(id, -32602, `Unknown tool: ${String(params['name'])}`)
    const args = (params['arguments'] ?? {}) as Record<string, unknown>
    try {
      return result(id, {
        content: [{ type: 'text', text: JSON.stringify(tool.run(args), null, 2) }],
      })
    } catch (error) {
      return result(id, { content: [{ type: 'text', text: reason(error) }], isError: true })
    }
  }
  return failure(id, -32601, `Method not found: ${method}`)
}

const result = (id: Request['id'], value: unknown) => ({ jsonrpc: '2.0', id, result: value })
const failure = (id: Request['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
})

export async function mcp(
  input: string,
  version: string,
  streams: { from: Readable; to: Writable } = { from: process.stdin, to: process.stdout },
): Promise<void> {
  // Standard output carries the protocol and nothing else: a line a plugin or
  // Vite prints there is a message the client cannot parse.
  console.log = console.error
  console.info = console.error

  const tools = toolsOf(await loadProject(input))
  const lines = createInterface({ input: streams.from })
  for await (const line of lines) {
    if (line.trim() === '') continue
    const said = answer(line, tools, version)
    if (said) streams.to.write(`${JSON.stringify(said)}\n`)
  }
}
