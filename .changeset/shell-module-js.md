---
'@crypte/cli': patch
---

A plugin's `shell` module that is not a .js or .mjs file is refused at start-up, with the reason: the shell serves it as is, never compiled.
