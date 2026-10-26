import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import { answer, mcp, toolsOf } from '../src/commands/mcp'
import { loadProject } from '../src/config/project'

// `crypte mcp` : le catalogue pour un agent qui écrit du code, en JSON-RPC sur
// stdio, une ligne par message.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

const outils = [
  {
    name: 'echo',
    description: 'renvoie ses arguments',
    inputSchema: { type: 'object' as const, properties: {} },
    run: (args: Record<string, unknown>) => {
      if (args['boom']) throw new Error('raté')
      return args
    },
  },
]
const dit = (message: object) =>
  answer(JSON.stringify({ jsonrpc: '2.0', ...message }), outils, '1.2.3')

describe('the protocol', () => {
  test('answers initialize with the version asked when it knows it, or its newest', () => {
    expect(dit({ id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })).toEqual(
      {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'crypte', version: '1.2.3' },
        },
      },
    )
    expect(
      dit({ id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }),
    ).toMatchObject({
      result: { protocolVersion: '2025-06-18' },
    })
  })

  test('lists its tools without their code, and answers ping', () => {
    expect(dit({ id: 1, method: 'tools/list' })).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'renvoie ses arguments',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      },
    })
    expect(dit({ id: 'p', method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 'p', result: {} })
  })

  // Un outil qui lève est un résultat que l'agent lit, pas une erreur du protocole.
  test('calls a tool, and gives its failure as a result marked as an error', () => {
    expect(
      dit({ id: 1, method: 'tools/call', params: { name: 'echo', arguments: { a: 1 } } }),
    ).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: '{\n  "a": 1\n}' }] },
    })
    expect(
      dit({ id: 2, method: 'tools/call', params: { name: 'echo', arguments: { boom: true } } }),
    ).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: { content: [{ type: 'text', text: 'raté' }], isError: true },
    })
  })

  test.for([
    [{ id: 1, method: 'tools/call', params: { name: 'nope' } }, -32602, 'Unknown tool: nope'],
    [{ id: 1, method: 'resources/list' }, -32601, 'Method not found: resources/list'],
    [{ id: 1 }, -32600, 'Invalid Request'],
  ] as const)('refuses %j', ([message, code, texte]) => {
    expect(dit(message)).toEqual({ jsonrpc: '2.0', id: 1, error: { code, message: texte } })
  })

  test('refuses a line that is not JSON, and stays silent on a notification', () => {
    expect(answer('{pas du json', outils, '1')).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
    expect(dit({ method: 'notifications/initialized' })).toBeUndefined()
  })
})

describe('the tools, on a project', () => {
  const outil = async (name: string, args: Record<string, unknown> = {}) =>
    toolsOf(await loadProject(fixture))
      .find((one) => one.name === name)!
      .run(args)

  test('lists the components with their stories, filtered by a text', async () => {
    const tous = (await outil('components')) as { name: string; stories: string[] }[]
    const filtrés = (await outil('components', { query: 'order' })) as { name: string }[]

    expect(tous.length).toBeGreaterThan(1)
    expect(tous.every((one) => one.stories.length > 0)).toBe(true)
    expect(filtrés.map((one) => one.name)).toEqual(['OrderSummary'])
  })

  test('gives a component by its name, whatever the case, with its stories and their code', async () => {
    const [badge] = (await outil('component', { name: 'badge' })) as {
      name: string
      stories: { id: string; source: string }[]
      guidelines: string | null
    }[]

    expect(badge!.name).toBe('Badge')
    expect(badge!.stories.length).toBeGreaterThan(0)
    expect(badge!.stories.every((one) => one.source.includes('Badge'))).toBe(true)
  })

  test('names a component it does not know', async () => {
    await expect(outil('component', { name: 'nope' })).rejects.toThrow('no component named nope')
  })

  test('reads the tokens, and what changed since a point', async () => {
    expect(Array.isArray(await outil('tokens'))).toBe(true)
    expect(await outil('changes', { from: '-x' })).toEqual({ reason: '"-x" is not a revision' })
  })
})

describe('the command', () => {
  const avant = { log: console.log, info: console.info }
  afterEach(() => {
    console.log = avant.log
    console.info = avant.info
  })

  // La sortie standard ne porte que le protocole : ce qu'un plugin y écrirait
  // part sur la sortie d'erreur.
  test('answers each line on its own, and keeps standard output for the protocol', async () => {
    const from = new PassThrough()
    const to = new PassThrough()
    const lignes: string[] = []
    to.on('data', (chunk: Buffer) => lignes.push(...chunk.toString().split('\n').filter(Boolean)))

    const fini = mcp(fixture, '9.9.9', { from, to })
    from.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n\n')
    from.end('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    await fini

    expect(lignes).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}'])
    expect(console.log).toBe(console.error)
  })
})
