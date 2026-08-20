---
'@crypte/cli': patch
'@crypte/core': patch
---

The shell says what the catalogue could not read.

A story file is read without being run, so what cannot be read without running it is set aside. Until now only the terminal said so, which is not where somebody looks for a story they cannot find: a file whose story key is computed lost that story silently, and a props table with a spread in it presented itself as complete.

The manifest carries both halves. `Manifest.skipped` names a file, with the reason, and the shell counts what the file did give by matching it against the entries: "1 story lue, il en manque" rather than a flat "ignored", which would be false of a file that gave three stories out of four. `StoryEntry.partial` names one entry whose record is incomplete, quoting what the file wrote, since the missing prop names are precisely what cannot be read.

Both fields are optional, so a manifest written before them stays valid and its version does not move. Neither is ever fatal: a file being written must not cost the catalogue.

Three losses were silent and are now said: a spread in the definition deciding the shared props block, another deciding `meta`, and what a props block itself could not give up.
