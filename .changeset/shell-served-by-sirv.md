---
'@crypte/cli': patch
---

The dev server no longer builds the shell's page a second time: `sirv` already served it, and the branch that rebuilt it was never reached.
