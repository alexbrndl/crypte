// `crypte dev`: reads the project, writes the catalogue, serves both pages.
// See docs/internal/architecture.md.

import { createServer, type ViteDevServer } from 'vite'
import { fingerprintOf, writeFingerprint } from './fingerprint'
import { buildCatalogue, writeCatalogue, type Catalogue } from './manifest'
import { loadProject, viteConfigOf, type Project } from './project'
import { servePlugin } from './serve'

export interface Started {
  server: ViteDevServer
  project: Project
  catalogue: Catalogue
}

// Assembled from the pieces the earlier lots left: `loadProject` for the
// configuration and the aliases, `buildCatalogue` for the stories, and the
// serve plugin for the two pages.
export async function startDev(input: string): Promise<Started> {
  const project = await loadProject(input)
  const catalogue = buildCatalogue(project)

  // Written before the server starts. They are artefacts, so a failure to write
  // them is not a reason to refuse to serve, but they belong to the same run.
  writeCatalogue(project.root, catalogue.manifest)
  writeFingerprint(project.root, fingerprintOf(catalogue.manifest))

  const config = viteConfigOf(project)
  const server = await createServer({
    ...config,
    plugins: [...(config.plugins ?? []), servePlugin(project, JSON.stringify(catalogue.manifest))],
  })

  return { server, project, catalogue }
}

// What a story file did not produce, and why. One line each, before the
// server's address: a story its author wrote and the reader could not read must
// not vanish in silence. The in-app version is DCJ-217.
export function reported(catalogue: Catalogue): string[] {
  return catalogue.skipped.map(({ file, reason }) => `  ${file} : ${reason}`)
}

export async function dev(input: string, log = console.log): Promise<ViteDevServer> {
  const { server, catalogue } = await startDev(input)

  await server.listen()

  const lines = reported(catalogue)
  if (lines.length > 0) {
    log(`${catalogue.skipped.length} fichier(s) de story laissé(s) de côté :`)
    for (const line of lines) log(line)
  }

  log(`${catalogue.manifest.entries.length} stories`)
  server.printUrls()

  return server
}
