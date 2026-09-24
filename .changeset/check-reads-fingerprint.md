---
'@crypte/cli': minor
---

`crypte check` now fails when `.crypte/fingerprint.json` is missing or behind the stories, so a CI running it refuses a branch that did not update the committed fingerprint. Run `crypte dev` and commit the file to fix it.
