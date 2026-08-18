# Crypte

[![CI](https://github.com/alexbrndl/crypte/actions/workflows/ci.yml/badge.svg)](https://github.com/alexbrndl/crypte/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Falexbrndl%2Fcrypte%2Fmain%2F.github%2Fcoverage.json)](https://github.com/alexbrndl/crypte/actions/workflows/ci.yml)

A component workshop for design systems, built to stay light and to work with more than one framework.

A framework-neutral core, one adapter per framework, and plugins you add one at a time. Nothing you have not installed is ever loaded.

> **Status: in progress.** Three of the four contracts are settled, the plugin one is still provisional. `crypte dev` serves the workshop: it reads a project's configuration, resolves its path aliases, discovers stories, renders them in a preview, and follows the files while it runs. **Nothing is published to npm yet.** Section 8 of [`docs/contracts.md`](docs/contracts.md) says exactly what exists.

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
| [`docs/decisions.md`](docs/decisions.md) | what we chose, what we turned down, and what would reopen it |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | install, checks, and how a change gets in |

Design notes live in `docs/internal/` and are written in French. See `docs/decisions.md` for why.

## Roadmap

**Phase 1.** Core, React adapter, `controls` plugin, Vue adapter, static build deployed on every change.

**Phase 2.** `visual-tests`, `docs`, `source`, `responsive`, `theme`, `actions`.

**Phase 3.** `crypte serve`: comments and guideline editing, writing back through a pull request.

Each plugin is its own project, with its own brief and issues.

## Licence

MIT
