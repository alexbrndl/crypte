---
'@crypte/cli': patch
---

A story file that throws when it is imported no longer takes the whole preview down. The failure is reported as that story's error, named in the shell, and every other story still renders.
