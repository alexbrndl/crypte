# Contributing

Thanks for your interest. This document says how to install the project, how to check it, and how a change gets in.

## Requirements

Node 22.18 or newer, and [Vite+](https://viteplus.dev), which provides the `vp` command and picks the project's package manager and Node version for you. Nothing else to install.

## Install

```bash
vp install
```

## Check

```bash
vp check          # formatting, lint and types
vp run -r pack    # builds the three packages
vp test           # tests
```

Or the whole chain, in the order it expects:

```bash
vp run ready
```

**The order matters.** The build has to come before the tests: the isolation test of `@crypte/core` reads built artefacts, not sources. Run without a build, it fails loudly instead of passing while checking nothing.

## Layout

```
packages/core     @crypte/core    the core, three entries: protocol, ui, preview
packages/cli      @crypte/cli     the `crypte` binary
packages/react    @crypte/react   the React adapter
docs/                             public documents, in English
docs/internal/                    maintainer notes, in French
```

`docs/contracts.md` is the reference for the story format, the manifest, the protocol and the plugin contract. `docs/internal/architecture.md` explains what each mechanism is for and what breaks without it.

**Design notes stay in French.** What you read to use Crypte, or to propose a change, is in English. What is written for the maintainer is not: those are precise rules, and a loose translation would lose more than it gains. The choice, what was turned down, and what would reopen it are in `docs/decisions.md`.

## Module format

The packages ship **ESM only**. No CommonJS.

That is a deliberate choice for a development tool: Node has supported ESM for a long time, the build tooling has moved, and keeping two formats doubles the surface to test for a shrinking benefit. Adding CommonJS later stays possible without a break. Removing it would not.

## Commits

The project follows [Conventional Commits](https://www.conventionalcommits.org). Messages are in English, in the imperative.

```
feat: add story discovery
fix: resolve aliases from jsconfig
docs: document the isolation test
chore: bump actions
```

This format serves the history. It does not decide version numbers: those come from notes dropped on purpose, never from commit messages.

## Branches and pull requests

One branch per change, named in kebab-case.

**A pull request title follows the same format as a commit message.** Pull requests are squash-merged, so the title becomes the commit message on `main` and the intermediate commits disappear. The title is what stays in the history.

Before opening a pull request, check that `vp check`, `vp run -r pack` and `vp test` pass locally. Continuous integration replays all three on Node 22 and 24, and also checks that the committed generated exports are up to date.

**If your change adds a moving part** — a workflow, a script, a configuration that encodes a decision, or a test whose assertion is not obvious — update `docs/internal/architecture.md` with three answers: what it does, why it exists, and what breaks if you remove it.

The other way round: do not document code that reads by itself.

## Reporting a problem

Open an issue with the behaviour you expected, the behaviour you got, and a small reproducible case if you can.
