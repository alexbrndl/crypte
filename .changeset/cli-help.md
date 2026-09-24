---
'@crypte/cli': patch
---

`crypte --help` lists the commands and their argument, `--help` after a command prints it instead of being read as a folder, and an unknown command or option now fails with exit code 1.
