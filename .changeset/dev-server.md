---
'@crypte/cli': minor
'@crypte/react': minor
'@crypte/core': minor
---

`crypte dev` starts a server, and a story renders.

The command reads the project, writes the manifest and its fingerprint, then serves two pages. The shell ships prebuilt inside the CLI and knows no framework: it reads the catalogue and talks over the channel. The preview is compiled by the project's own Vite, because it imports the adapter you installed and your story modules, so it belongs to your bundle and not to ours.

`@crypte/react` gains `defineStories` and `story`, the two functions a story file calls, with the types that infer a component's props. A story file needs no type alias and no `satisfies`.

**A story that throws shows its error** instead of an empty frame: the name, the message and the stack, in place of the preview. The React adapter now passes `onUncaughtError` to its root, without which React 19 reports a failing component as an unhandled error and hands control back as if it had rendered.

What a story file could not be read from is printed at start-up, one line per file. Nothing reloads yet: editing a component still needs a restart.
