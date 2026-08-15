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
  // Why the manifest and the fingerprint could not be written, when they could
  // not. Serving does not depend on them.
  written: string | undefined
}

// Assembled from the pieces the earlier lots left: `loadProject` for the
// configuration and the aliases, `buildCatalogue` for the stories, and the
// serve plugin for the two pages.
export async function startDev(input: string): Promise<Started> {
  const project = await loadProject(input)
  const catalogue = buildCatalogue(project)

  // Written before the server starts. They are artefacts, so a failure to write
  // them is not a reason to refuse to serve: a read-only checkout, or a folder
  // somebody's tooling holds, would otherwise stop the whole command on an
  // `EACCES` trace.
  const written = write(project.root, catalogue)

  // Only the files that produced an entry, so the preview never imports one the
  // reader set aside.
  const files = [...new Set(catalogue.manifest.entries.map((entry) => entry.storyFile))]

  const config = viteConfigOf(project)
  const server = await createServer({
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      servePlugin(project, JSON.stringify(catalogue.manifest), files),
    ],
  })

  return { server, project, catalogue, written }
}

// The two artefacts, and what stopped them. Reported rather than thrown: the
// shell reads the catalogue from memory, so a build that cannot write still
// serves everything.
function write(root: string, catalogue: Catalogue): string | undefined {
  try {
    writeCatalogue(root, catalogue.manifest)
    writeFingerprint(root, fingerprintOf(catalogue.manifest))
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

// What a story file did not produce, and why. One line each, before the
// server's address: a story its author wrote and the reader could not read must
// not vanish in silence. The in-app version is DCJ-217.
export function reported(catalogue: Catalogue): string[] {
  return catalogue.skipped.map(({ file, reason }) => `  ${file} : ${reason}`)
}

export async function dev(input: string, log = console.log): Promise<ViteDevServer> {
  const { server, catalogue, written } = await startDev(input)

  await server.listen()

  if (written) log(`neither manifest nor fingerprint could be written: ${written}`)

  const lines = reported(catalogue)
  if (lines.length > 0) {
    log(`${catalogue.skipped.length} story file(s) left out:`)
    for (const line of lines) log(line)
  }

  log(`${catalogue.manifest.entries.length} stories`)
  server.printUrls()

  return server
}
