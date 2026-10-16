---
'@crypte/cli': minor
---

The committed fingerprint gains a `tokens` section, each token with the literal of each theme, so a token change shows in the shell. Committed fingerprints are stale once: run `crypte dev` and commit `.crypte/fingerprint.json`. The changes the shell reads can start from a branch, a tag, a commit or a date, and the server lists the default branch and the tags.
