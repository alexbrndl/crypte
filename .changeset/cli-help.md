---
'@crypte/cli': patch
'@crypte/core': patch
---

`crypte --help` lists the commands and their argument, `--help` anywhere after a command prints it instead of being read as a folder, and an unknown command, an unknown option or an extra argument now fails with exit code 1 on stderr. `@crypte/core` no longer declares `vue` as an optional peer dependency, which none of its files uses.
