---
'@crypte/cli': minor
---

Editing keeps the story you are looking at.

`crypte dev` now follows the files. Editing a component or a story's props refreshes the preview in place, without reloading the frame and without losing your selection. Adding a story file makes it appear in the tree, removing one makes it disappear, and neither needs a restart.

Renaming a story changes its identifier, so the selection falls back to the same rank in the same file, which on a rename is the story you just renamed. If its file is gone, nothing is selected rather than something you never opened.

**What a rebuild cannot read, it says.** A story file the reader stops reading used to vanish from the tree with no line anywhere, and a rebuild that failed was swallowed whole. Both are printed now, once each, and a failed rebuild keeps the last good catalogue rather than stopping the server.

The preview server also gets its own dependency cache, `node_modules/.crypte`, so it no longer shares `node_modules/.vite` with the project's own `vite dev`.

Changing `crypte.config.ts` still needs a restart, and now prints a line saying so.
