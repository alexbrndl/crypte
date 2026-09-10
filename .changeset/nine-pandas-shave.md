---
'@crypte/cli': patch
---

Adds the `crypte check` and `crypte init` commands. `check` reports a story whose component is gone, which fails the command, and an exported component with no story, which is a warning. `init` writes a `crypte.config.ts` into a project that already has its components.
