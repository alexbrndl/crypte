---
'@crypte/core': minor
'@crypte/cli': minor
---

A plugin can contribute entries to the manifest.

`CryptePlugin` is a real type in the protocol now, where it was `unknown` in the CLI's config. `@crypte/cli` re-exports it rather than declaring its own: the contract spans three surfaces, so it does not belong to one consumer.

`NodeHooks` carries one hook, `entries`, because one use demands it. It takes a context holding the project root and returns entries. Stories are not among them: they come from story files, and a plugin injecting one would bypass discovery.

**Hooks are synchronous, and they run after the stories in the order `plugins` declares.** No `order` field, which every plugin would set to zero. Being last means a contribution landing on an identifier a story already owns is the one that gives way.

**Nothing a plugin does is fatal, and nothing is silent.** A hook that throws, returns something other than entries, lands on a taken identifier, or produces a value that would not survive JSON has that contribution refused, and `crypte dev` prints which plugin it came from and why. A broken plugin costs a panel, never the server.

That last case is where section 4.5 stops being free: everything else the CLI writes is read from source text and serialisable by construction, so a contributed entry is the first input it has to check rather than trust.

`UIContribution` and `PreviewHooks` stay opaque. Neither has a caller yet.
