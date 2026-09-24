---
'@crypte/cli': patch
---

`crypte check` now names a story file that gave no story, with the reason, instead of reporting its component as having no story; it stays a warning. An orphan story's component path now reads from the project root.
