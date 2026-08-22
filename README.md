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

**Now.** The core, the CLI and the React adapter, which is what `crypte dev` already runs on. Then the shell it serves: a three-level tree, search, a component page. Then the plugin contract, the only one of the four that is not settled, frozen by two plugins with opposite needs: `controls`, which writes into a story, and `a11y`, which only reads it.

**Next.** The Vue adapter, which is the only thing that can prove the core holds nothing React-specific. The everyday plugins: `docs`, `source`, `theme`, `responsive`, `actions`, `visual-tests`, `coverage`. Two more kinds of manifest entry, `tokens` read from the project and `page` written as markdown in the repository. And what makes Crypte installable by someone who has never heard of it: npm, a local MCP server, a static build deployed on every change.

**Later.** `crypte serve`, which turns a read into a pull request: token editing first, comments next, guideline editing last. A Figma plugin that shows a designer a selective diff of the tokens.

Each of these is a project in the tracker, with its own issues.

## Licence, and what will cost money

**Everything in this repository is MIT**, and none of it is for sale. That covers `crypte dev`, `crypte build`, and every plugin published from here.

**Nothing is for sale today at all.** No package is published, so there is no key to buy and nowhere to buy it. What follows is written before the first publish rather than left to be discovered at install time.

**What will be paid.** `crypte serve` in multi-user mode, and a set of plugins that have never been published and are therefore not covered by the licence above. Neither will live in this repository.

**The line is one editor against many, not local against deployed.** Whether a server listens on `0.0.0.0`, owns a domain or runs in a container is one line away from changing, which makes a poor boundary. The number of people who write is not. And a single-identity `serve` does not answer a team's need in the first place: every contribution would be signed by the same person, so there is nothing there anybody would want unlocked.

**No telemetry in the CLI.** Not now, not later. Whatever `serve` reports in its paid mode will be documented before it exists rather than after.

[`docs/decisions.md`](docs/decisions.md) carries the reasoning and what was turned down. `docs/internal/plugins.md` carries the status of each plugin, one line each.
