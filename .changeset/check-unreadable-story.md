---
'@crypte/cli': minor
---

`crypte check` now names a story file it cannot read, with the reason, and fails on it like an orphan story, instead of reporting its component as having no story. An orphan story's component path now reads from the project root.
