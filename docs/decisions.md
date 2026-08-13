# Decisions

What we chose, what we turned down, and why. Newest first.

A decision is written here when it is made. `architecture.md` explains how a mechanism works, and it is written once the code exists. `suivi.md` holds review findings we chose not to fix yet. Neither of them says what else was on the table.

Each entry has four parts. The last one matters most: it says what would make the decision wrong.

An entry is never deleted. A decision that no longer holds gets a new entry that replaces it, and the old one stays, so the change of mind is readable.

---

## Public text is written in English

_2026-08-13_

**Decided.** Everything a user or a contributor reads is in English: `README.md`, `CONTRIBUTING.md`, the contracts, the user guide, this file, the error messages of the CLI, and the comments in published source.

Notes written for the maintainer stay in French: `architecture.md`, `suivi.md`, `arborescence.md`, the planning documents, `CLAUDE.md`, and the skills under `.claude/`.

**Rejected.** Two options. Translating the whole repository, and keeping everything in French.

**Why.** Crypte is a public tool, and French text leaves out most of its readers. Agent instructions have no such audience: one person and one agent read them, and they carry rules that cost many review rounds to learn. Translating those rules loosely would lose more than it gains.

Test names are a third case, tracked in DCJ-210. There are 183 of them, and 18 are quoted by `test/mutations.json`, so renaming one without the other turns a guarantee mute.

**What would reopen it.** An outside contributor. Published source points at `architecture.md` twice today, and the tests of the packages eight more times: English code that sends its reader to a French document does not hold for long.

---

## Documentation is split by audience, not by language

_2026-08-13_

**Decided.** `docs/` holds what a user or a contributor reads, in English. `docs/internal/` holds maintainer notes, in French. The move itself is DCJ-207.

**Rejected.** `docs/fr/`.

**Why.** By convention, `fr/` holds the French translation of the English documentation. There is no English version of these files, so a reader would look for `docs/internal/architecture.md` and never find it.

A split by language would also be incomplete. `CLAUDE.md` and `.claude/skills/` cannot move, because the tooling reads them at a fixed place, so French would sit both at the root and under `docs/fr/`.

The real difference is who reads a document. The language follows from that.

**What would reopen it.** A genuine translation of one document into a second language. Then `fr/` means what it usually means, and both rules can live side by side.
