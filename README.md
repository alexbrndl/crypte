<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg" />
    <img src="brand/logo.svg" alt="Crypte" width="204" />
  </picture>
</h1>

[![CI](https://github.com/alexbrndl/crypte/actions/workflows/ci.yml/badge.svg)](https://github.com/alexbrndl/crypte/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Falexbrndl%2Fcrypte%2Fmain%2F.github%2Fcoverage.json)](https://github.com/alexbrndl/crypte/actions/workflows/ci.yml)

**A design system workshop that stays light.**

A framework-neutral core, one adapter per framework, three plugins on by default and the others added one at a time. Nothing you have not installed is ever loaded.

> **Status: in progress.** Three of the four contracts are settled, the plugin one is still provisional. `crypte dev` serves the workshop: it reads a project's configuration, resolves its path aliases, discovers stories, renders them in a preview, and follows the files while it runs. `crypte build` writes the same workshop as a static folder, which any host serves, and `crypte mcp` serves the catalogue to a coding agent. **Nothing is published to npm yet.** Section 8 of [`docs/contracts.md`](docs/contracts.md) says exactly what exists.

## Why

Storybook is mature but heavy: the configuration costs time, the start-up is slow, and most of what it can do goes unused. The light alternatives are fast because they serve a single framework.

Crypte takes the other bet: layers from the start, so that it stays light without giving up on more than one framework.

## Principles

**Never read a project's `vite.config`.** Crypte reads standard, framework-neutral formats, plus what the project declares to it. That is what makes the promise hold across projects.

**Only cover what real use has shown.** A mechanism added just in case creates a use you can no longer take back. A mechanism added after a real need breaks nothing.

**The shell knows no framework.** It talks to the preview through `postMessage`. That boundary is what keeps the core neutral, and no exception will be made to it.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/contracts.md`](docs/contracts.md) | story format, manifest, channel protocol, plugin contract, and what is built |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | install, checks, and how a change gets in |

Why a mechanism exists, and what breaks without it, is a comment beside that mechanism. There is no separate design document.

## Roadmap

**Now.** The core, the CLI and two adapters, React and Vue, which is what `crypte dev` already runs on: the second proves the core holds nothing React-specific. Then the shell it serves: a three-level tree, search, a component page, the `tokens` that `@crypte/tokens` reads from the project's style sheet, markdown pages written beside the stories, what changed in the catalogue since the last commit, `crypte build`, the same workshop as a static folder, and `crypte mcp`, the catalogue for a coding agent. Then the plugin contract, frozen since its two plugins with opposite needs exist: `controls`, which writes into a story, and `a11y`, which only reads it.

**Next.** The everyday plugins: `theme`, `actions`, `visual-tests`, `coverage`. And what makes Crypte installable by someone who has never heard of it: npm, and a build deployed on every change.

**Later.** An `editor` plugin, on `crypte dev` and on a deployed build alike: pick any element of a story, try a value from the tokens, and hand the change to a coding agent as a GitHub issue. A Figma plugin that shows a designer a selective diff of the tokens.

Each of these is a project in the tracker, with its own issues.

## Licence

**Everything is MIT, and nothing is for sale.** That covers the CLI, the shell, the adapters and every plugin, including the ones still to come. There is no paid edition and no licence key.

**No telemetry in the CLI.** Not now, not later.

