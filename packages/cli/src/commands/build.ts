// `crypte build`: the workshop as a static folder, which any host serves. The
// shell, the compiled preview, and what `crypte dev` answers on request, read
// once and written beside them.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { build as viteBuild } from 'vite'
import type { Changes, Fingerprint } from '@crypte/core/protocol'
import { changesSince } from '../catalogue/changes'
import { fingerprintOf, writeFingerprint } from '../catalogue/fingerprint'
import { githubOf } from '../catalogue/github'
import { healthOf } from '../catalogue/health'
import { buildCatalogue, storiesOf, writeCatalogue } from '../catalogue/manifest'
import { STORYBOOK_IFRAME, STORYBOOK_INDEX, storybookIndexOf } from '../catalogue/storybook'
import { versionsOf, type Versions } from '../catalogue/versions'
import { loadProject, viteConfigOf } from '../config/project'
import { ConfigError, reason } from '../errors'
import {
  CHANGES_ROUTE,
  FINGERPRINT_ROUTE,
  HEALTH_ROUTE,
  MANIFEST_ROUTE,
  PLUGIN_FILES,
  PLUGINS_ROUTE,
  PREVIEW_PAGE,
  PROJECT_ROUTE,
  VERSIONS_ROUTE,
  pluginsOf,
  previewBuildPlugin,
  projectOf,
  shellAssets,
  shellModulesOf,
} from '../server/serve'
import { shellFiles } from '../server/weight'

// One name, not an option: a host is told which folder to publish.
export const BUILD_OUTPUT = 'crypte-static'

// The periods the versions view offers, in days before the build.
const PERIODS = [7, 30]

export async function build(input: string, log: (line: string) => void = console.log) {
  const project = await loadProject(input)
  const catalogue = buildCatalogue(project)
  const { manifest } = catalogue
  const fingerprint = fingerprintOf(manifest)

  // The record `crypte check` compares, written without a server.
  writeCatalogue(project.root, manifest)
  writeFingerprint(project.root, fingerprint)

  const out = join(project.root, BUILD_OUTPUT)
  const config = viteConfigOf(project)

  // First, since Vite empties the folder. Relative, like every URL the shell
  // asks for, so the folder may be served below a path. What fails here is the
  // project's, a story or a style sheet, and `crypte dev` would only say it on
  // screen: said as a configuration error, without the bundler's stack.
  await viteBuild({
    ...config,
    base: './',
    logLevel: 'warn',
    plugins: [...config.plugins, previewBuildPlugin(project, catalogue)],
    build: {
      outDir: out,
      emptyOutDir: true,
      // Beside the shell's `assets/`, never inside it.
      assetsDir: 'preview',
      // The preview carries every plugin's preview module, axe-core alone above the
      // limit: a warning the project can do nothing about.
      chunkSizeWarningLimit: Number.POSITIVE_INFINITY,
      rolldownOptions: {
        input: [PREVIEW_PAGE, STORYBOOK_IFRAME].map((page) => join(project.root, page.slice(1))),
        // The wrappers panel names each wrapper by its function: minified, `i` and `a`.
        output: { keepNames: true },
      },
    },
  }).catch((cause: unknown) => {
    // Without Vite's colours, which a CI log prints as escape codes.
    throw new ConfigError(
      `The preview could not be built: ${stripVTControlCharacters(reason(cause))}`,
      {
        cause,
      },
    )
  })

  cpSync(shellAssets(), out, { recursive: true })

  const data = (route: string, value: unknown) => {
    const file = join(out, ...route.slice(1).split('/'))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(value))
  }

  const versions = versionsOf(project.root)
  const built = new Date()

  data(MANIFEST_ROUTE, manifest)
  data(STORYBOOK_INDEX, storybookIndexOf(manifest))
  data(PLUGINS_ROUTE, await pluginsOf(project, catalogue, PLUGIN_FILES.slice(1)))
  data(VERSIONS_ROUTE, versions)
  data(HEALTH_ROUTE, healthOf(project, storiesOf(manifest)))
  data(PROJECT_ROUTE, await projectOf(project, null, built.toISOString(), githubOf(project.root)))
  // What the shell compares a commit or a date typed in with, read from GitHub.
  data(FINGERPRINT_ROUTE, fingerprint)

  for (const [route, changes] of changesOf(project.root, fingerprint, versions, built))
    data(route, changes)

  for (const { folder, file } of shellModulesOf(project)) {
    for (const one of await shellFiles(file)) {
      cpSync(
        one,
        join(out, ...PLUGIN_FILES.slice(1).split('/'), folder, relative(dirname(file), one)),
      )
    }
  }

  for (const { file, reason } of catalogue.skipped) log(`  ${file} : ${reason}`)
  log(`${storiesOf(manifest).length} stories, written to ${BUILD_OUTPUT}`)
}

// Every point the versions view offers, computed here since a static host
// cannot ask Git. The default one, without a point, is the default branch.
// Each point is a file named by its key in hexadecimal: a tag may hold a `/`,
// which a host decodes, or a `%`, which it reads as an escape.
export function changesOf(
  root: string,
  fingerprint: Fingerprint,
  versions: Versions,
  built: Date,
): [string, Changes][] {
  const points = [
    ...(versions.branch ? [`ref:${versions.branch}`] : []),
    ...PERIODS.map((days) => `before:${dayBefore(built, days)}`),
    ...versions.tags.map((one) => `ref:${one.name}`),
  ]

  const compared = points.map((key): [string, Changes] => {
    const [kind, ...rest] = key.split(':')
    const point = rest.join(':')
    return [
      `${CHANGES_ROUTE.replace(/\.json$/, '')}/${pointFile(key)}`,
      changesSince(root, fingerprint, kind === 'before' ? { before: point } : { ref: point }),
    ]
  })

  return [
    [
      CHANGES_ROUTE,
      versions.branch
        ? changesSince(root, fingerprint, { ref: versions.branch })
        : { reason: 'Git names no default branch to compare this build with' },
    ],
    ...compared,
  ]
}

// The day N days before the build, in UTC, the way the shell reads it back.
export function dayBefore(at: Date, days: number): string {
  return new Date(at.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

export function pointFile(key: string): string {
  return `${Buffer.from(key, 'utf8').toString('hex')}.json`
}
