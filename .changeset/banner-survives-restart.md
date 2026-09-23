---
'@crypte/cli': patch
---

A story file that produces nothing keeps its banner in the shell when `crypte.config.ts` is saved. It used to disappear at the restart, while the file was still broken.
