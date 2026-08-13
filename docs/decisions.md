# Decisions

What we chose, what we turned down, and why. Newest first.

A decision is written here when it is made. `architecture.md` explains how a mechanism works, and it is written once the code exists. `suivi.md` holds review findings we chose not to fix yet. Neither of them says what else was on the table.

Each entry has four parts. The last one matters most: it says what would make the decision wrong.

An entry is never deleted. A decision that no longer holds gets a new entry that replaces it, and the old one stays, so the change of mind is readable.

---

## The manifest is a build artefact, and a small fingerprint is committed

_2026-08-13_

**Decided.** `crypte` writes two files. The full manifest is generated on every build and ignored by Git. A reduced fingerprint sits next to it and **is** committed: per entry, the identifier, the component file and export, the status, the sorted list of prop names, and a hash of the rest.

**Rejected.** Committing the full manifest, and committing nothing at all.

**Why.** Three features need the history of a catalogue: the "what changed" screen, a component's timeline, and a stable anchor for comments. Git is already a history, so writing a second one would be work for nothing.

Committing the full manifest does not hold. Measured with `test/manifest-size.mjs`: 626 KB raw and 71 KB gzipped for 500 stories, so a hundred versions of such a project weigh 6.9 MB and five hundred weigh 34 MB. The file also changes on every build, including when nothing meaningful moved.

Committing nothing loses the three features, and leaves nothing to compare a build against.

The fingerprint measures 198 bytes per story, 97 KB raw for 500 stories, and it only changes when something meaningful does.

**How it stays true.** Like a lockfile: the build writes it, and continuous integration fails when the committed one does not match, with a message saying what to run. Anything that depends on a person remembering ends up not being done.

**What would reopen it.** A project whose fingerprint changes on every build anyway, which would mean the reduced form keeps something it should not. Or a manifest small enough for the raw file to be committed without noise, which the measurements do not suggest.

---

## A line-comment change to published code needs no version note

_2026-08-13_

**Decided.** `require-changeset` reads the patch of each published file. When every changed line is a `//` comment or blank, the file does not ask for a note. A block comment still asks for one.

**Rejected.** Writing a note for such a change, dropping the file from the criterion, and treating every comment alike.

**Why.** The control asked for a note the first time it ran for real, on two comments where a documentation path had moved. A note would have added a changelog line that says nothing, which is what the `/changeset` skill exists to prevent. Dropping the file from the criterion would have lost the real case, where the code itself changes.

The split between the two kinds of comment is measured, not assumed. A `//` comment is stripped from the published `.d.ts`. A `/** */` block placed on an exported type is emitted into it, so it does reach the user and it does deserve a note.

A file with no patch still asks for a note. The API stops sending patches past a certain size, and blocking is the safe direction.

**What would reopen it.** A build that stops emitting declarations from source, or one that starts keeping line comments in them. Both would move the line between what ships and what does not.

---

## Public text is written in English

_2026-08-13_

**Decided.** Everything a user or a contributor reads goes to English: `README.md`, `CONTRIBUTING.md`, the contracts, the user guide, this file, the error messages of the CLI, and the comments in published source.

Everything on that list has moved, and `test/published-english.test.mjs` now refuses an accented character in `packages/*/src` outside a short backquoted example. What is left in French is the design notes, on purpose, the test names, tracked in DCJ-210, and whatever French carries no accent, which no check can see.

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
